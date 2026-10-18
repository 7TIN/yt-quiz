/**
 * The learning loop: watches playback, and at each chapter boundary pauses the
 * video and runs that chapter's check — one or two multiple-choice questions
 * (graded locally, so they cost no API call) and the free-response one that
 * closes the chapter.
 *
 * Progress is per spot, not per session: a spot is done only once every
 * question is answered. A half-finished one stays amber on the timeline, gets a
 * Continue row in the panel, and reopens exactly where it left off — after a
 * reload too, because progress lives in chrome.storage.local.
 *
 * Design decisions worth keeping in mind:
 *  - The loop only exists while the user has it switched on; unmounting it
 *    (switching off, SPA navigation) cleans up listeners and gives playback
 *    back if the quiz had paused it.
 *  - Boundary detection is delta-based: natural crossings quiz, forward scrubs
 *    (chapter-rail clicks) silently skip a spot, and big backward jumps (a
 *    rewind, or an ad taking over the video element) never advance the clock.
 *  - Ads: ticks during an ad are ignored because the ad runs on its own
 *    timeline; the crossing fires as soon as the real video resumes.
 *  - Sets are prefetched ~45s early, cached forever, never regenerated.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  chapterKey,
  emptyMomentProgress,
  progressKeyFor,
  readLoopProgress,
  writeLoopProgress,
} from '../content/loop-progress'
import { sendToBackground } from '../content/messaging'
import {
  clearPlayerOverlay,
  ensureQuizOverlayMount,
  refreshPlayerOverlay,
  setQuizMarkers,
  type QuizMarkerState,
} from '../content/player-overlay'
import { computeQuizMoments, type QuizMoment } from '../content/quiz-schedule'
import { getVideoElement, isAdShowing, seekVideoTo } from '../content/video'
import { readVideoMeta } from '../content/video-meta'
import { formatTimestamp } from '../lib/format'
import type {
  GeminiError,
  JudgeResult,
  LlResponse,
  LlSettings,
  LoopProgress,
  MomentProgress,
  OverviewData,
  QuizGenerateInput,
  QuizQuestion,
  QuizSet,
  Transcript,
  VideoId,
} from '../lib/types'
import { QuizCard, type QuizView } from './QuizCard'
import { BoltIcon, XIcon } from './icons'
import { Button, IconButton } from './primitives'

interface QuizLoopProps {
  videoId: VideoId
  transcript: Transcript
  overview: OverviewData
}

type LoopPhase =
  | { kind: 'watch' }
  | { kind: 'loading'; moment: QuizMoment }
  | { kind: 'asking'; moment: QuizMoment; set: QuizSet; index: number }
  | { kind: 'judging'; moment: QuizMoment; set: QuizSet; index: number; answer: string }
  | {
      kind: 'judged'
      moment: QuizMoment
      set: QuizSet
      index: number
      answer: string
      judge: JudgeResult
    }
  | { kind: 'revealed'; moment: QuizMoment; set: QuizSet; index: number; selected: number }
  | {
      kind: 'error'
      moment: QuizMoment
      set: QuizSet | null
      index: number
      answer: string
      stage: 'set' | 'judge'
      error: GeminiError
    }

const TICK_MS = 400
const PREFETCH_LEAD_SEC = 45
const SEEK_JUMP_SEC = 5
/**
 * A jump larger than SEEK_JUMP_SEC was a real seek (scrub, rail click) only if
 * our clock kept up with it: the wall-clock gap between two samples is small.
 * If the clock moved far too, playback advanced while our timers were throttled
 * (background tab, minimized window) — that is a natural crossing, and the
 * viewer must still get the question when they come back.
 */
const STALLED_SAMPLE_MS = 3_000
const MAX_CHAPTER_TRANSCRIPT_CHARS = 12_000

/** First question of the set this viewer has not answered yet, or -1. */
function firstUnanswered(total: number, answered: number[]): number {
  for (let index = 0; index < total; index++) {
    if (!answered.includes(index)) return index
  }
  return -1
}

export function QuizLoop({ videoId, transcript, overview }: QuizLoopProps) {
  const [phase, setPhase] = useState<LoopPhase>({ kind: 'watch' })
  const [settings, setSettings] = useState<LlSettings | null>(null)
  /** Per-spot progress; the timeline dots and the Continue row read it. */
  const [progress, setProgress] = useState<LoopProgress>({})
  /** Bumped by "Try again" so the card's local state resets. */
  const [attempt, setAttempt] = useState(0)
  /** Bumped when a spot's state changes so the timeline dots re-render. */
  const [markersVersion, setMarkersVersion] = useState(0)
  /**
   * Portal target inside the player: the question shows up over the video.
   * Resolved during the first render — a loop only exists once a transcript
   * has been read, so the player is already there. The watcher retries below
   * should the player render late anyway.
   */
  const [overlayTarget, setOverlayTarget] = useState<HTMLDivElement | null>(() =>
    ensureQuizOverlayMount(),
  )
  const overlayTargetRef = useRef(overlayTarget)
  useEffect(() => {
    overlayTargetRef.current = overlayTarget
  }, [overlayTarget])

  const phaseRef = useRef(phase)
  const setSessionRef = useRef(new Map<number, QuizSet>())
  const pendingRef = useRef(new Map<number, Promise<LlResponse<QuizSet>>>())
  const pausedByUsRef = useRef(false)
  const lastSampleRef = useRef({ time: 0, at: 0 })
  /** Mirrors `progress` so callbacks never read a stale render's value. */
  const progressRef = useRef<LoopProgress>({})

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const res = await sendToBackground<LlSettings>({ type: 'll:settings:get' })
      if (!cancelled && res.ok) setSettings(res.data)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  // Switching the loop off (or navigating) gives playback back and clears the
  // player-level affordances (timeline dots, the question overlay host).
  useEffect(
    () => () => {
      clearPlayerOverlay()
      const video = getVideoElement()
      if (pausedByUsRef.current && video && !video.ended) {
        void video.play().catch(() => undefined)
      }
      pausedByUsRef.current = false
    },
    [],
  )

  const level = settings?.level ?? 'intermediate'
  const progressKey = useMemo(
    () => progressKeyFor(videoId, transcript.languageCode, transcript.language, level),
    [videoId, transcript.languageCode, transcript.language, level],
  )

  // What the viewer already did here (a previous session included).
  useEffect(() => {
    let cancelled = false
    void readLoopProgress(progressKey).then((stored) => {
      if (cancelled) return
      progressRef.current = stored
      setProgress(stored)
      setMarkersVersion((value) => value + 1)
    })
    return () => {
      cancelled = true
    }
  }, [progressKey])

  const cadence = settings?.quizEvery ?? 1
  const moments = useMemo(
    () => computeQuizMoments(overview.chapters, transcript.durationSec, cadence),
    [overview.chapters, transcript.durationSec, cadence],
  )
  const momentsRef = useRef(moments)
  useEffect(() => {
    momentsRef.current = moments
  }, [moments])

  const chapterStartFor = useCallback(
    (moment: QuizMoment) => overview.chapters[moment.chapterIndex]?.startSec ?? 0,
    [overview.chapters],
  )

  const chapterTitleFor = useCallback(
    (moment: QuizMoment) =>
      overview.chapters[moment.chapterIndex]?.title ?? `Chapter ${moment.chapterIndex + 1}`,
    [overview.chapters],
  )

  const progressFor = useCallback(
    (source: LoopProgress, moment: QuizMoment): MomentProgress | undefined =>
      source[chapterKey(moment.chapterIndex, chapterStartFor(moment))],
    [chapterStartFor],
  )

  /** Done = every question answered, or the viewer deliberately skipped it. */
  const isMomentDone = useCallback(
    (moment: QuizMoment): boolean => {
      const entry = progressFor(progressRef.current, moment)
      if (!entry) return false
      return entry.skipped || (entry.total > 0 && entry.answered.length >= entry.total)
    },
    [progressFor],
  )

  const markerStateFor = useCallback(
    (source: LoopProgress, moment: QuizMoment): QuizMarkerState => {
      const entry = progressFor(source, moment)
      if (!entry) return 'pending'
      if (entry.skipped || (entry.total > 0 && entry.answered.length >= entry.total)) return 'done'
      return entry.answered.length > 0 ? 'partial' : 'pending'
    },
    [progressFor],
  )

  const persistProgress = useCallback(
    (next: LoopProgress) => {
      progressRef.current = next
      setProgress(next)
      setMarkersVersion((value) => value + 1)
      void writeLoopProgress(progressKey, next)
    },
    [progressKey],
  )

  const updateMoments = useCallback(
    (targets: QuizMoment[], update: (entry: MomentProgress) => MomentProgress) => {
      const next = { ...progressRef.current }
      for (const moment of targets) {
        const key = chapterKey(moment.chapterIndex, chapterStartFor(moment))
        next[key] = update(next[key] ?? emptyMomentProgress())
      }
      persistProgress(next)
    },
    [chapterStartFor, persistProgress],
  )

  const markAnswered = useCallback(
    (moment: QuizMoment, index: number, total: number) => {
      updateMoments([moment], (entry) => ({
        total: Math.max(entry.total, total),
        answered: entry.answered.includes(index)
          ? entry.answered
          : [...entry.answered, index].sort((a, b) => a - b),
        skipped: entry.skipped,
      }))
    },
    [updateMoments],
  )

  /**
   * A regenerated set may hold a different number of questions; stale answers
   * from the old set would point at the wrong ones, so they reset.
   */
  const syncSetTotal = useCallback(
    (moment: QuizMoment, total: number) => {
      updateMoments([moment], (entry) =>
        entry.total === total
          ? entry
          : { total, answered: [], skipped: entry.skipped },
      )
    },
    [updateMoments],
  )

  /** Scrubbing past a spot is a deliberate skip: it stops asking there. */
  const markSkipped = useCallback(
    (targets: QuizMoment[]) => {
      updateMoments(targets, (entry) => ({ ...entry, skipped: true }))
    },
    [updateMoments],
  )

  // Timeline dots: show *on the player* where the questions are coming.
  useEffect(() => {
    const duration = getVideoElement()?.duration
    setQuizMarkers(
      moments.map((moment) => ({
        atSec: moment.atSec,
        chapterIndex: moment.chapterIndex,
        state: markerStateFor(progress, moment),
      })),
      typeof duration === 'number' && Number.isFinite(duration) && duration > 0
        ? duration
        : transcript.durationSec,
    )
  }, [moments, progress, markersVersion, markerStateFor, transcript.durationSec])

  const buildQuizInput = useCallback(
    (moment: QuizMoment): QuizGenerateInput => {
      const chapter = overview.chapters[moment.chapterIndex]
      const next = overview.chapters[moment.chapterIndex + 1]
      const from = chapter?.startSec ?? 0
      const to = next ? next.startSec : transcript.durationSec
      const chapterTranscript = transcript.segments
        .filter((segment) => segment.startSec >= from && segment.startSec < to)
        .map((segment) => `[${formatTimestamp(segment.startSec)}] ${segment.text}`)
        .join('\n')
        .slice(0, MAX_CHAPTER_TRANSCRIPT_CHARS)
      return {
        videoId,
        languageCode: transcript.languageCode,
        languageLabel: transcript.language,
        level,
        chapterIndex: moment.chapterIndex,
        chapterStartSec: from,
        chapterDurationSec: Math.max(0, to - from),
        videoTitle: readVideoMeta(transcript.durationSec, transcript.language).title,
        chapterTitle: chapter?.title ?? `Chapter ${moment.chapterIndex + 1}`,
        chapterTranscript,
      }
    },
    [level, overview.chapters, transcript, videoId],
  )

  /** Cache-first set fetch: session map → in-flight promise → worker. */
  const ensureQuizSet = useCallback(
    (moment: QuizMoment): Promise<LlResponse<QuizSet>> => {
      const index = moment.chapterIndex
      const session = setSessionRef.current.get(index)
      if (session) return Promise.resolve({ ok: true, data: session })
      const pending = pendingRef.current.get(index)
      if (pending) return pending

      const promise = (async () => {
        const res = await sendToBackground<QuizSet>({
          type: 'll:quiz:generate',
          input: buildQuizInput(moment),
        })
        if (res.ok) setSessionRef.current.set(index, res.data)
        return res
      })()
      pendingRef.current.set(index, promise)
      void promise.finally(() => pendingRef.current.delete(index))
      return promise
    },
    [buildQuizInput],
  )

  const resume = useCallback(() => {
    const video = getVideoElement()
    if (pausedByUsRef.current && video) {
      pausedByUsRef.current = false
      if (!video.ended) void video.play().catch(() => undefined)
    }
    if (video) lastSampleRef.current = { time: video.currentTime, at: Date.now() }
    setPhase({ kind: 'watch' })
  }, [])

  /** Opens a loaded set, continuing at the first question left unanswered. */
  const openSet = useCallback(
    (moment: QuizMoment, set: QuizSet) => {
      const total = set.questions.length
      const key = chapterKey(moment.chapterIndex, chapterStartFor(moment))
      const entry = progressRef.current[key]
      const answered = entry && entry.total === total ? entry.answered : []
      syncSetTotal(moment, total)

      const index = firstUnanswered(total, answered)
      if (index === -1) {
        resume() // Everything here is answered already: nothing to ask.
        return
      }
      setPhase({ kind: 'asking', moment, set, index })
    },
    [chapterStartFor, resume, syncSetTotal],
  )

  const startQuiz = useCallback(
    async (moment: QuizMoment) => {
      if (isMomentDone(moment)) return

      const video = getVideoElement()
      pausedByUsRef.current = Boolean(video && !video.paused && !video.ended)
      if (pausedByUsRef.current) video?.pause()

      const session = setSessionRef.current.get(moment.chapterIndex)
      if (session) {
        openSet(moment, session)
        return
      }

      setPhase({ kind: 'loading', moment })
      const res = await ensureQuizSet(moment)
      if (res.ok) openSet(moment, res.data)
      else {
        setPhase({
          kind: 'error',
          moment,
          set: null,
          index: 0,
          answer: '',
          stage: 'set',
          error: res.error,
        })
      }
    },
    [ensureQuizSet, isMomentDone, openSet],
  )

  /** Only the free-response question reaches the judge; MCQs grade locally. */
  const judge = useCallback(
    async (moment: QuizMoment, set: QuizSet, index: number, answer: string) => {
      const question = set.questions[index]
      if (!question || question.kind !== 'free-text') return
      const res = await sendToBackground<JudgeResult>({
        type: 'll:answer:judge',
        input: {
          videoId,
          level,
          chapterIndex: moment.chapterIndex,
          chapterStartSec: chapterStartFor(moment),
          question: question.question,
          expectedAnswer: question.expectedAnswer,
          acceptablePoints: question.acceptablePoints,
          userAnswer: answer,
        },
      })
      if (res.ok) {
        markAnswered(moment, index, set.questions.length)
        setPhase({ kind: 'judged', moment, set, index, answer, judge: res.data })
      } else {
        setPhase({ kind: 'error', moment, set, index, answer, stage: 'judge', error: res.error })
      }
    },
    [chapterStartFor, level, markAnswered, videoId],
  )

  const submitAnswer = useCallback(
    (answer: string) => {
      const current = phaseRef.current
      if (current.kind !== 'asking') return
      const userAnswer = answer.trim()
      setPhase({
        kind: 'judging',
        moment: current.moment,
        set: current.set,
        index: current.index,
        answer: userAnswer,
      })
      void judge(current.moment, current.set, current.index, userAnswer)
    },
    [judge],
  )

  const submitChoice = useCallback(
    (selected: number) => {
      const current = phaseRef.current
      if (current.kind !== 'asking') return
      const question = current.set.questions[current.index]
      if (!question || question.kind !== 'mcq') return
      if (selected < 0 || selected >= question.choices.length) return
      markAnswered(current.moment, current.index, current.set.questions.length)
      setPhase({
        kind: 'revealed',
        moment: current.moment,
        set: current.set,
        index: current.index,
        selected,
      })
    },
    [markAnswered],
  )

  /** "Next question" — and "Resume video" once nothing is left unanswered. */
  const advance = useCallback(() => {
    const current = phaseRef.current
    if (current.kind !== 'judged' && current.kind !== 'revealed') return
    const key = chapterKey(current.moment.chapterIndex, chapterStartFor(current.moment))
    const answered = progressRef.current[key]?.answered ?? []
    const next = current.set.questions.findIndex(
      (_, index) => index > current.index && !answered.includes(index),
    )
    if (next === -1) {
      resume()
      return
    }
    setPhase({ kind: 'asking', moment: current.moment, set: current.set, index: next })
  }, [chapterStartFor, resume])

  /** Rewatch: jumps to the moment the answer is explained and gives play back. */
  const jumpTo = useCallback((atSec: number) => {
    seekVideoTo(atSec)
    pausedByUsRef.current = false
    const video = getVideoElement()
    if (video && !video.ended) void video.play().catch(() => undefined)
    if (video) lastSampleRef.current = { time: video.currentTime, at: Date.now() }
    setPhase({ kind: 'watch' })
  }, [])

  const retry = useCallback(() => {
    const current = phaseRef.current
    if (current.kind !== 'error') return
    if (current.stage === 'set' || !current.set) {
      void startQuiz(current.moment)
      return
    }
    setPhase({
      kind: 'judging',
      moment: current.moment,
      set: current.set,
      index: current.index,
      answer: current.answer,
    })
    void judge(current.moment, current.set, current.index, current.answer)
  }, [judge, startQuiz])

  const retryAnswer = useCallback(() => {
    const current = phaseRef.current
    if (current.kind !== 'judged') return
    setAttempt((value) => value + 1)
    setPhase({ kind: 'asking', moment: current.moment, set: current.set, index: current.index })
  }, [])

  // The playback watcher. `timeupdate` gives ~4 samples/s while playing; the
  // interval keeps working when playback is paused or the video element was
  // swapped underneath us (we re-attach whenever the element changes).
  useEffect(() => {
    const sample = () => {
      const video = getVideoElement()
      if (!video) return
      refreshPlayerOverlay()

      // The overlay host lives inside the player; create it as soon as one is
      // there (a question must not lose its home because it rendered late).
      if (!overlayTargetRef.current) {
        const target = ensureQuizOverlayMount()
        if (target) {
          overlayTargetRef.current = target
          setOverlayTarget(target)
        }
      }

      const now = Date.now()
      if (phaseRef.current.kind !== 'watch') {
        // Keep the clock fresh while a quiz is open so an in-quiz seek is not
        // mistaken for a natural crossing afterwards.
        lastSampleRef.current = { time: video.currentTime, at: now }
        return
      }
      // Ad time runs on its own timeline; keep the last content position.
      if (isAdShowing()) return

      const time = video.currentTime
      const previous = lastSampleRef.current.time

      if (time > previous) {
        const delta = time - previous
        const wallGapMs = now - lastSampleRef.current.at
        lastSampleRef.current = { time, at: now }

        const crossed = momentsRef.current.filter(
          (moment) =>
            moment.atSec > previous && moment.atSec <= time && !isMomentDone(moment),
        )
        if (crossed.length > 0) {
          // A jump is a scrub (progress bar, chapter rail) only when our clock
          // kept up with it. If the wall clock moved far too, playback simply
          // continued while our timers were throttled — nothing was skipped
          // visually, so the question must still fire.
          const scrub = delta > SEEK_JUMP_SEC && wallGapMs < STALLED_SAMPLE_MS
          if (scrub) {
            markSkipped(crossed)
          } else {
            // Several boundaries crossed at once: quiz the freshest one and
            // close the spots that flew by — one question set at a time.
            if (crossed.length > 1) markSkipped(crossed.slice(0, -1))
            void startQuiz(crossed[crossed.length - 1]!)
            return
          }
        }
      } else if (time < previous - SEEK_JUMP_SEC) {
        // Big backward jump: a rewind or an ad taking over. Don't lower the
        // stored position — a real rewind is re-detected on the way back up.
        return
      } else {
        lastSampleRef.current = { time, at: now }
      }

      if (video.ended) {
        const last = [...momentsRef.current]
          .reverse()
          .find((moment) => !isMomentDone(moment))
        if (last) void startQuiz(last)
        return
      }

      // Warm the next set while the viewer is still watching.
      if (!video.paused) {
        const next = momentsRef.current.find(
          (moment) =>
            !isMomentDone(moment) &&
            moment.atSec > time &&
            moment.atSec - time <= PREFETCH_LEAD_SEC,
        )
        if (next) void ensureQuizSet(next)
      }
    }

    let watched: HTMLVideoElement | null = null
    const watchCurrent = () => {
      const video = getVideoElement()
      if (!video || video === watched) return
      watched?.removeEventListener('timeupdate', sample)
      watched = video
      watched.addEventListener('timeupdate', sample)
    }
    const tick = () => {
      watchCurrent()
      sample()
    }

    const initial = getVideoElement()
    if (initial) {
      watched = initial
      watched.addEventListener('timeupdate', sample)
    }
    lastSampleRef.current = { time: initial?.currentTime ?? 0, at: Date.now() }

    const timer = window.setInterval(tick, TICK_MS)
    return () => {
      window.clearInterval(timer)
      watched?.removeEventListener('timeupdate', sample)
    }
  }, [ensureQuizSet, isMomentDone, markSkipped, startQuiz])

  // Idle: offer a way back into any spot that was left unfinished.
  if (phase.kind === 'watch') {
    const unfinished = moments.filter((moment) => {
      const entry = progressFor(progress, moment)
      return Boolean(
        entry && !entry.skipped && entry.total > 0 && entry.answered.length > 0 && entry.answered.length < entry.total,
      )
    })
    if (unfinished.length === 0) return null
    return (
      <div data-ll-progress-list className="space-y-2">
        {unfinished.map((moment) => {
          const entry = progressFor(progress, moment)!
          return (
            <div
              key={moment.chapterIndex}
              data-ll-progress-row
              className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3.5 py-3"
            >
              <BoltIcon className="size-4 shrink-0 text-warning" />
              <p className="min-w-0 flex-1 text-xs text-muted">
                <span className="font-medium text-ink">{chapterTitleFor(moment)}</span>
                {` — ${entry.answered.length}/${entry.total} answered`}
              </p>
              <Button
                data-ll-progress-resume
                size="sm"
                variant="secondary"
                onClick={() => void startQuiz(moment)}
              >
                Continue
              </Button>
              <IconButton
                data-ll-progress-dismiss
                label="Don't ask again for this chapter"
                size="sm"
                onClick={() => markSkipped([moment])}
              >
                <XIcon className="size-4" />
              </IconButton>
            </div>
          )
        })}
      </div>
    )
  }

  const moment = phase.moment
  const set = phase.kind === 'loading' ? null : phase.set
  const index = phase.kind === 'loading' ? 0 : phase.index
  const question: QuizQuestion | null = set?.questions[index] ?? null
  const answered =
    progress[chapterKey(moment.chapterIndex, chapterStartFor(moment))]?.answered ?? []
  const hasNext = Boolean(
    set && set.questions.some((_, questionIndex) => questionIndex > index && !answered.includes(questionIndex)),
  )

  const view: QuizView =
    phase.kind === 'loading'
      ? { kind: 'loading' }
      : phase.kind === 'asking'
        ? { kind: 'quiz' }
        : phase.kind === 'judging'
          ? { kind: 'judging' }
          : phase.kind === 'judged'
            ? { kind: 'judged', judge: phase.judge }
            : phase.kind === 'revealed'
              ? { kind: 'revealed', selectedIndex: phase.selected }
              : { kind: 'error', stage: phase.stage === 'judge' ? 'judge' : 'quiz', error: phase.error }

  const card = (
    <QuizCard
      key={`${moment.chapterIndex}:${index}:${attempt}`}
      chapterTitle={chapterTitleFor(moment)}
      chapterStartSec={chapterStartFor(moment)}
      chapterIndex={moment.chapterIndex}
      chapterCount={overview.chapters.length}
      questionIndex={index}
      questionTotal={set?.questions.length ?? 0}
      hasNext={hasNext}
      view={view}
      question={question}
      onSubmit={submitAnswer}
      onSubmitChoice={submitChoice}
      onAdvance={advance}
      onJump={jumpTo}
      onSkip={resume}
      onRetry={retry}
      onRetryAnswer={retryAnswer}
    />
  )

  // Prefer over the video; the panel only keeps a small pointer to it. If the
  // player host is unavailable (odd layout), the same card renders inline.
  if (overlayTarget) {
    return (
      <>
        {createPortal(
          <div
            data-ll-quiz-overlay-scrim
            // Keep typing focus where it is when the user clicks the dark
            // background: focus leaving the card would hand keys back to the
            // player. (Only for clicks on the scrim itself.)
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) event.preventDefault()
            }}
            // The card is a direct child so its max-h-full resolves against
            // this box (= the player area); my-auto centers it while it fits
            // and lets the scrim scroll when it cannot.
            className="pointer-events-auto absolute inset-0 flex flex-col overflow-y-auto bg-black/60 p-3"
          >
            {card}
          </div>,
          overlayTarget,
        )}
        <div
          data-ll-quiz-panel-note
          className="mb-3 flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3.5 py-3"
        >
          <BoltIcon className="size-4 shrink-0 text-accent" />
          <p className="min-w-0 text-xs text-muted">
            A quick check is open over the video — answer it there to continue.
          </p>
        </div>
      </>
    )
  }

  return card
}
