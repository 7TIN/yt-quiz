/**
 * The learning loop: watches playback, and at each chapter boundary pauses the
 * video and asks a free-text question about the chapter that just ended.
 *
 * Design decisions worth keeping in mind:
 *  - The loop only exists while the user has it switched on; unmounting it
 *    (switching off, SPA navigation) cleans up listeners and gives playback
 *    back if the quiz had paused it.
 *  - Boundary detection is delta-based: natural crossing quizzers, forward
 *    scrubs (chapter-rail clicks) silently skip, and big backward jumps (a
 *    rewind, or an ad taking over the video element) never advance the clock.
 *  - Ads: ticks during an ad are ignored because the ad runs on its own
 *    timeline; the crossing fires as soon as the real video resumes.
 *  - One question per chapter: prefetched ~45s early, cached forever, never
 *    regenerated. Judging is cached per distinct answer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sendToBackground } from '../content/messaging'
import { computeQuizMoments, type QuizMoment } from '../content/quiz-schedule'
import { getVideoElement, isAdShowing } from '../content/video'
import { readVideoMeta } from '../content/video-meta'
import type {
  GeminiError,
  JudgeResult,
  LlResponse,
  LlSettings,
  OverviewData,
  QuizGenerateInput,
  QuizQuestion,
  Transcript,
  VideoId,
} from '../lib/types'
import { QuizCard, type QuizView } from './QuizCard'

interface QuizLoopProps {
  videoId: VideoId
  transcript: Transcript
  overview: OverviewData
}

type LoopPhase =
  | { kind: 'watch' }
  | { kind: 'loading'; moment: QuizMoment }
  | { kind: 'quiz'; moment: QuizMoment; quiz: QuizQuestion }
  | { kind: 'judging'; moment: QuizMoment; quiz: QuizQuestion; userAnswer: string }
  | { kind: 'judged'; moment: QuizMoment; quiz: QuizQuestion; userAnswer: string; judge: JudgeResult }
  | {
      kind: 'error'
      moment: QuizMoment
      quiz: QuizQuestion | null
      userAnswer: string
      stage: 'quiz' | 'judge'
      error: GeminiError
    }

const TICK_MS = 400
const PREFETCH_LEAD_SEC = 45
const SEEK_JUMP_SEC = 5
const MAX_CHAPTER_TEXT_CHARS = 12_000

export function QuizLoop({ videoId, transcript, overview }: QuizLoopProps) {
  const [phase, setPhase] = useState<LoopPhase>({ kind: 'watch' })
  const [settings, setSettings] = useState<LlSettings | null>(null)
  /** Bumped by "Try this question again" so the card's local state resets. */
  const [attempt, setAttempt] = useState(0)

  const phaseRef = useRef(phase)
  const handledRef = useRef(new Set<number>())
  const quizSessionRef = useRef(new Map<number, QuizQuestion>())
  const pendingRef = useRef(new Map<number, Promise<LlResponse<QuizQuestion>>>())
  const pausedByUsRef = useRef(false)
  const lastTimeRef = useRef(0)

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

  // Switching the loop off (or navigating) gives playback back.
  useEffect(
    () => () => {
      const video = getVideoElement()
      if (pausedByUsRef.current && video && !video.ended) {
        void video.play().catch(() => undefined)
      }
      pausedByUsRef.current = false
    },
    [],
  )

  const cadence = settings?.quizEvery ?? 1
  const moments = useMemo(
    () => computeQuizMoments(overview.chapters, transcript.durationSec, cadence),
    [overview.chapters, transcript.durationSec, cadence],
  )
  const momentsRef = useRef(moments)
  useEffect(() => {
    momentsRef.current = moments
  }, [moments])

  const chapterTitleFor = useCallback(
    (moment: QuizMoment) =>
      overview.chapters[moment.chapterIndex]?.title ?? `Chapter ${moment.chapterIndex + 1}`,
    [overview.chapters],
  )

  const buildQuizInput = useCallback(
    (moment: QuizMoment): QuizGenerateInput => {
      const chapter = overview.chapters[moment.chapterIndex]
      const next = overview.chapters[moment.chapterIndex + 1]
      const from = chapter?.startSec ?? 0
      const to = next ? next.startSec : transcript.durationSec
      const chapterText = transcript.segments
        .filter((segment) => segment.startSec >= from && segment.startSec < to)
        .map((segment) => segment.text)
        .join(' ')
        .slice(0, MAX_CHAPTER_TEXT_CHARS)
      return {
        videoId,
        languageCode: transcript.languageCode,
        languageLabel: transcript.language,
        level: settings?.level ?? 'intermediate',
        chapterIndex: moment.chapterIndex,
        chapterStartSec: from,
        videoTitle: readVideoMeta(transcript.durationSec, transcript.language).title,
        chapterTitle: chapter?.title ?? `Chapter ${moment.chapterIndex + 1}`,
        chapterText,
      }
    },
    [overview.chapters, settings, transcript, videoId],
  )

  /** Cache-first question fetch: session map → in-flight promise → worker. */
  const ensureQuiz = useCallback(
    (moment: QuizMoment): Promise<LlResponse<QuizQuestion>> => {
      const index = moment.chapterIndex
      const session = quizSessionRef.current.get(index)
      if (session) return Promise.resolve({ ok: true, data: session })
      const pending = pendingRef.current.get(index)
      if (pending) return pending

      const promise = (async () => {
        const res = await sendToBackground<QuizQuestion>({
          type: 'll:quiz:generate',
          input: buildQuizInput(moment),
        })
        if (res.ok) quizSessionRef.current.set(index, res.data)
        return res
      })()
      pendingRef.current.set(index, promise)
      void promise.finally(() => pendingRef.current.delete(index))
      return promise
    },
    [buildQuizInput],
  )

  const startQuiz = useCallback(
    async (moment: QuizMoment) => {
      handledRef.current.add(moment.chapterIndex)

      const video = getVideoElement()
      pausedByUsRef.current = Boolean(video && !video.paused && !video.ended)
      if (pausedByUsRef.current) video?.pause()

      const ready = quizSessionRef.current.get(moment.chapterIndex)
      if (ready) {
        setPhase({ kind: 'quiz', moment, quiz: ready })
        return
      }

      setPhase({ kind: 'loading', moment })
      const res = await ensureQuiz(moment)
      if (res.ok) setPhase({ kind: 'quiz', moment, quiz: res.data })
      else {
        setPhase({ kind: 'error', moment, quiz: null, userAnswer: '', stage: 'quiz', error: res.error })
      }
    },
    [ensureQuiz],
  )

  const judge = useCallback(
    async (moment: QuizMoment, quiz: QuizQuestion, userAnswer: string) => {
      const res = await sendToBackground<JudgeResult>({
        type: 'll:answer:judge',
        input: {
          videoId,
          level: settings?.level ?? 'intermediate',
          chapterIndex: moment.chapterIndex,
          chapterStartSec: overview.chapters[moment.chapterIndex]?.startSec ?? 0,
          question: quiz.question,
          expectedAnswer: quiz.expectedAnswer,
          acceptablePoints: quiz.acceptablePoints,
          userAnswer,
        },
      })
      if (res.ok) setPhase({ kind: 'judged', moment, quiz, userAnswer, judge: res.data })
      else setPhase({ kind: 'error', moment, quiz, userAnswer, stage: 'judge', error: res.error })
    },
    [overview.chapters, settings, videoId],
  )

  const resume = useCallback(() => {
    const video = getVideoElement()
    if (pausedByUsRef.current && video) {
      pausedByUsRef.current = false
      if (!video.ended) void video.play().catch(() => undefined)
      lastTimeRef.current = video.currentTime
    }
    setPhase({ kind: 'watch' })
  }, [])

  const submitAnswer = useCallback(
    (answer: string) => {
      const current = phaseRef.current
      if (current.kind !== 'quiz') return
      const userAnswer = answer.trim()
      setPhase({ kind: 'judging', moment: current.moment, quiz: current.quiz, userAnswer })
      void judge(current.moment, current.quiz, userAnswer)
    },
    [judge],
  )

  const retry = useCallback(() => {
    const current = phaseRef.current
    if (current.kind !== 'error') return
    if (current.stage === 'quiz') {
      void startQuiz(current.moment)
    } else if (current.quiz) {
      setPhase({ kind: 'judging', moment: current.moment, quiz: current.quiz, userAnswer: current.userAnswer })
      void judge(current.moment, current.quiz, current.userAnswer)
    }
  }, [judge, startQuiz])

  const retryAnswer = useCallback(() => {
    const current = phaseRef.current
    if (current.kind !== 'judged') return
    setAttempt((value) => value + 1)
    setPhase({ kind: 'quiz', moment: current.moment, quiz: current.quiz })
  }, [])

  // The playback watcher: a plain interval re-reading the live video element,
  // so a replaced element (SPA quirks) never leaves us with dead listeners.
  useEffect(() => {
    const tick = () => {
      const video = getVideoElement()
      if (!video) return

      if (phaseRef.current.kind !== 'watch') {
        // Keep the clock fresh while a quiz is open so an in-quiz seek is not
        // mistaken for a natural crossing afterwards.
        lastTimeRef.current = video.currentTime
        return
      }
      // Ad time runs on its own timeline; keep the last content position.
      if (isAdShowing()) return

      const time = video.currentTime
      const previous = lastTimeRef.current

      if (time > previous) {
        const delta = time - previous
        lastTimeRef.current = time
        for (const moment of momentsRef.current) {
          if (moment.atSec <= previous || moment.atSec > time) continue
          if (handledRef.current.has(moment.chapterIndex)) continue
          if (delta > SEEK_JUMP_SEC) {
            // Forward scrub (progress bar, chapter rail): silently skip.
            handledRef.current.add(moment.chapterIndex)
            continue
          }
          void startQuiz(moment)
          return
        }
      } else if (time < previous - SEEK_JUMP_SEC) {
        // Big backward jump: a rewind or an ad taking over. Don't lower the
        // stored position — a real rewind is re-detected on the way back up.
        return
      } else {
        lastTimeRef.current = time
      }

      if (video.ended) {
        const last = [...momentsRef.current]
          .reverse()
          .find((moment) => !handledRef.current.has(moment.chapterIndex))
        if (last) void startQuiz(last)
        return
      }

      // Warm the next question while the viewer is still watching.
      if (!video.paused) {
        const next = momentsRef.current.find(
          (moment) =>
            !handledRef.current.has(moment.chapterIndex) &&
            moment.atSec > time &&
            moment.atSec - time <= PREFETCH_LEAD_SEC,
        )
        if (next) void ensureQuiz(next)
      }
    }

    lastTimeRef.current = getVideoElement()?.currentTime ?? 0
    const timer = window.setInterval(tick, TICK_MS)
    return () => window.clearInterval(timer)
  }, [ensureQuiz, startQuiz])

  if (phase.kind === 'watch') return null

  const moment = phase.moment
  const view: QuizView =
    phase.kind === 'loading'
      ? { kind: 'loading' }
      : phase.kind === 'quiz'
        ? { kind: 'quiz' }
        : phase.kind === 'judging'
          ? { kind: 'judging' }
          : phase.kind === 'judged'
            ? { kind: 'judged', judge: phase.judge }
            : { kind: 'error', stage: phase.stage, error: phase.error }

  return (
    <QuizCard
      key={`${moment.chapterIndex}:${attempt}`}
      chapterTitle={chapterTitleFor(moment)}
      chapterStartSec={overview.chapters[moment.chapterIndex]?.startSec ?? 0}
      chapterIndex={moment.chapterIndex}
      chapterCount={overview.chapters.length}
      view={view}
      quiz={'quiz' in phase ? phase.quiz : null}
      onSubmit={submitAnswer}
      onSkip={resume}
      onResume={resume}
      onRetry={retry}
      onRetryAnswer={retryAnswer}
    />
  )
}
