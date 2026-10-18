/**
 * The in-between facts: short "did you know" pop-ups that appear over the video
 * while a chapter plays.
 *
 * Design decisions worth keeping in mind:
 *  - Non-blocking: a pop-up never pauses the video and never takes keys. It sits
 *    just above the player's control bar and one OK closes it.
 *  - Time-windowed: a fact shows while playback is inside [atSec, atSec+WINDOW) —
 *    the stretch of video it belongs to — and nowhere else. Watching past the
 *    window closes it; rewinding back into that stretch offers it again.
 *  - OK means closed: a dismissed fact stays dismissed for the session. The
 *    window passing simply hides it, and nothing here ever counts as progress.
 *  - Facts arrive chapter by chapter (cached in the worker, prefetched just
 *    before the chapter starts). A failed call is silent — the video plays on
 *    without pop-ups, because they are a bonus, not part of the check.
 *  - It hides while the question card is open and comes back afterwards, if its
 *    window in the video is still running.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { sendToBackground } from '../content/messaging'
import { getVideoElement, isAdShowing } from '../content/video'
import { formatTimestamp } from '../lib/format'
import type {
  FactKind,
  FactsGenerateInput,
  FactSet,
  OverviewChapter,
  VideoFact,
} from '../lib/types'
import { LightbulbIcon } from './icons'

interface FactPopupsProps {
  /** Builds one chapter's context exactly the way the quiz path does. */
  contextFor: (chapterIndex: number) => FactsGenerateInput
  chapters: OverviewChapter[]
  /** True while the question card is open: a fact must never sit under it. */
  quizOpen: boolean
}

const TICK_MS = 500
/** How long a pop-up stays on screen, measured in video seconds. */
const WINDOW_SEC = 75
/** Warm the next chapter's facts this early, so they are ready when it starts. */
const PREFETCH_LEAD_SEC = 45
/** How long to wait before trying a chapter again after a failed call. */
const RETRY_AFTER_MS = 90_000

const FACT_KIND_LABEL: Record<FactKind, string> = {
  fact: 'Fun fact',
  history: 'History',
  trend: 'Trend',
  idea: 'Idea',
  context: 'Context',
}

interface ShownFact {
  chapterIndex: number
  fact: VideoFact
}

function factIdentity(chapterIndex: number, fact: VideoFact): string {
  return `${chapterIndex}@${Math.round(fact.atSec)}:${fact.title}`
}

/** The chapter a playback position falls in: the last one that starts by then. */
function chapterIndexAt(chapters: OverviewChapter[], timeSec: number): number {
  let index = 0
  for (let candidate = 0; candidate < chapters.length; candidate++) {
    if (chapters[candidate]!.startSec <= timeSec) index = candidate
    else break
  }
  return index
}

export function FactPopups({ contextFor, chapters, quizOpen }: FactPopupsProps) {
  const [shown, setShown] = useState<ShownFact | null>(null)

  // Latest props/state for the ticker, which is set up once.
  const chaptersRef = useRef(chapters)
  const contextForRef = useRef(contextFor)
  const quizOpenRef = useRef(quizOpen)
  const factsRef = useRef(new Map<number, VideoFact[]>())
  const requestsRef = useRef(new Map<number, 'loading' | 'done' | 'failed'>())
  const failedAtRef = useRef(new Map<number, number>())
  const dismissedRef = useRef(new Set<string>())
  const shownRef = useRef<ShownFact | null>(null)

  useEffect(() => {
    chaptersRef.current = chapters
    contextForRef.current = contextFor
    quizOpenRef.current = quizOpen
  })

  /** Fetch one chapter's facts once, with a quiet retry after a failure. */
  const ensureFacts = useCallback(async (chapterIndex: number) => {
    if (chapterIndex < 0 || chapterIndex >= chaptersRef.current.length) return
    const state = requestsRef.current.get(chapterIndex)
    if (state === 'loading' || state === 'done') return
    if (state === 'failed') {
      const at = failedAtRef.current.get(chapterIndex) ?? 0
      if (Date.now() - at < RETRY_AFTER_MS) return
    }
    requestsRef.current.set(chapterIndex, 'loading')

    const res = await sendToBackground<FactSet>({
      type: 'll:facts:generate',
      input: contextForRef.current(chapterIndex),
    })
    if (res.ok && res.data.facts.length > 0) {
      requestsRef.current.set(chapterIndex, 'done')
      factsRef.current.set(chapterIndex, res.data.facts)
      return
    }
    requestsRef.current.set(chapterIndex, 'failed')
    failedAtRef.current.set(chapterIndex, Date.now())
  }, [])

  useEffect(() => {
    const tick = () => {
      const video = getVideoElement()
      if (!video) return
      const time = video.currentTime
      const chaptersNow = chaptersRef.current

      const chapterIndex = chapterIndexAt(chaptersNow, time)
      void ensureFacts(chapterIndex)
      const upcoming = chaptersNow[chapterIndex + 1]
      if (upcoming && upcoming.startSec - time <= PREFETCH_LEAD_SEC) void ensureFacts(chapterIndex + 1)

      const visible: ShownFact | null = (() => {
        if (quizOpenRef.current || isAdShowing()) return null
        for (const fact of factsRef.current.get(chapterIndex) ?? []) {
          if (dismissedRef.current.has(factIdentity(chapterIndex, fact))) continue
          if (time >= fact.atSec && time < fact.atSec + WINDOW_SEC) return { chapterIndex, fact }
        }
        return null
      })()

      // Same fact in, same reference out: this only re-renders on a change.
      if (shownRef.current?.fact !== visible?.fact) {
        shownRef.current = visible
        setShown(visible)
      }
    }

    tick()
    const timer = window.setInterval(tick, TICK_MS)
    return () => window.clearInterval(timer)
  }, [ensureFacts])

  const dismiss = useCallback(() => {
    const current = shownRef.current
    if (!current) return
    dismissedRef.current.add(factIdentity(current.chapterIndex, current.fact))
    shownRef.current = null
    setShown(null)
  }, [])

  // The question card hides the pop-up in the same commit it appears (the
  // ticker would take up to a tick), and it comes back with `shown` intact.
  if (!shown || quizOpen) return null
  const { fact } = shown

  return (
    <section
      data-ll-fact-card
      data-ll-fact-kind={fact.kind}
      role="status"
      // Capped to the player it sits in: a narrow or short player (mini player,
      // small embed) scrolls the body instead of spilling over the page, and
      // the OK stays pinned below the scroll area. Both offsets are px (the
      // panel's spacing scale is 4px steps, and rem would follow YouTube's
      // 10px root): the cap is 16px under the bottom inset, so the card can
      // never reach past the player's top edge.
      className="pointer-events-auto absolute bottom-16 left-3 z-10 flex max-h-[calc(100%_-_80px)] w-72 max-w-[calc(100%_-_16px)] flex-col rounded-2xl border border-white/15 bg-black/85 text-white shadow-[0_12px_32px_-8px_rgba(0,0,0,0.6)] backdrop-blur-sm motion-safe:animate-[ll-fade-in_180ms_ease-out]"
    >
      <div className="ll-scroll flex min-h-0 flex-1 items-start gap-2.5 overflow-y-auto p-3.5">
        <LightbulbIcon className="mt-0.5 size-4 shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-xs">
            <span
              data-ll-fact-badge
              className="font-medium tracking-wide text-white/60 uppercase"
            >
              {FACT_KIND_LABEL[fact.kind]}
            </span>
            <span className="font-mono text-white/40">{formatTimestamp(fact.atSec)}</span>
          </p>
          <p data-ll-fact-title className="mt-1 text-sm font-semibold">
            {fact.title}
          </p>
          <p data-ll-fact-body className="mt-1 text-sm text-white/85">
            {fact.body}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 justify-end border-t border-white/10 px-3.5 py-2.5">
        <button
          type="button"
          data-ll-fact-ok
          onClick={dismiss}
          className="inline-flex h-7 items-center rounded-md border border-white/20 bg-white/10 px-3 text-xs font-medium text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 motion-safe:transition-colors motion-safe:duration-150"
        >
          OK
        </button>
      </div>
    </section>
  )
}
