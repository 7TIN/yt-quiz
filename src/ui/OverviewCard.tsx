import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import { sendToBackground } from '../content/messaging'
import { seekVideoTo } from '../content/video'
import { readVideoMeta } from '../content/video-meta'
import { describeCadence, formatTimestamp } from '../lib/format'
import type {
  GeminiError,
  Level,
  LlSettings,
  OverviewData,
  OverviewGenerateInput,
  OverviewGetInput,
  Transcript,
  VideoId,
} from '../lib/types'

interface OverviewCardProps {
  videoId: VideoId
  transcript: Transcript
  /** True while the learning loop is running for this video. */
  loopActive: boolean
  onLoopToggle: () => void
  /** Fires once the overview is ready (cached or freshly generated). */
  onReady?: (overview: OverviewData) => void
  /** Reports the card status up (drives the one-click start flow). */
  onStateChange?: (status: OverviewCardStatus, message?: string) => void
  /** Incremented by the one-click start: generate now if idle or after an error. */
  startSignal?: number
}

type CardState =
  | { status: 'loading' }
  | { status: 'no-key' }
  | { status: 'idle'; settings: LlSettings }
  | { status: 'generating'; settings: LlSettings }
  | { status: 'ready'; settings: LlSettings; overview: OverviewData }
  | { status: 'error'; settings: LlSettings | null; error: GeminiError }

export type OverviewCardStatus = CardState['status']

function toGetInput(videoId: VideoId, transcript: Transcript, level: Level): OverviewGetInput {
  return {
    videoId,
    languageCode: transcript.languageCode,
    languageLabel: transcript.language,
    level,
  }
}

/** Error codes that a trip to the options page can actually fix. */
function fixableInSettings(code: GeminiError['code']): boolean {
  return code === 'no-key' || code === 'invalid-key' || code === 'model-not-found'
}

export function OverviewCard({
  videoId,
  transcript,
  loopActive,
  onLoopToggle,
  onReady,
  onStateChange,
  startSignal,
}: OverviewCardProps) {
  const [state, setState] = useState<CardState>({ status: 'loading' })
  const [elapsedSec, setElapsedSec] = useState(0)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  // Hand the overview up so the quiz loop can schedule against the chapters.
  const readyOverview = state.status === 'ready' ? state.overview : null
  useEffect(() => {
    if (readyOverview) onReady?.(readyOverview)
  }, [readyOverview, onReady])

  useEffect(() => {
    onStateChange?.(state.status, state.status === 'error' ? state.error.message : undefined)
  }, [state, onStateChange])

  // Settings → cache lookup. Nothing is generated until the user asks.
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const settingsRes = await sendToBackground<LlSettings>({ type: 'll:settings:get' })
      if (cancelled) return
      if (!settingsRes.ok) {
        setState({ status: 'error', settings: null, error: settingsRes.error })
        return
      }
      const settings = settingsRes.data
      if (!settings.hasKey) {
        setState({ status: 'no-key' })
        return
      }
      const cachedRes = await sendToBackground<OverviewData | null>({
        type: 'll:overview:get',
        input: toGetInput(videoId, transcript, settings.level),
      })
      if (cancelled) return
      if (!cachedRes.ok) {
        setState({ status: 'error', settings, error: cachedRes.error })
        return
      }
      setState(
        cachedRes.data
          ? { status: 'ready', settings, overview: cachedRes.data }
          : { status: 'idle', settings },
      )
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [videoId, transcript])

  // Elapsed counter while Gemini is working (started by generate()).
  useEffect(() => {
    if (state.status !== 'generating') return
    const timer = window.setInterval(() => setElapsedSec((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [state.status])

  const generate = useCallback(
    async (settings: LlSettings) => {
      setElapsedSec(0)
      setState({ status: 'generating', settings })
      const input: OverviewGenerateInput = {
        ...toGetInput(videoId, transcript, settings.level),
        meta: readVideoMeta(transcript.durationSec, transcript.language),
        chapters: transcript.chapters,
        segments: transcript.segments,
        truncated: transcript.truncated,
      }
      const res = await sendToBackground<OverviewData>({ type: 'll:overview:generate', input })
      if (!aliveRef.current) return
      setState(
        res.ok
          ? { status: 'ready', settings, overview: res.data }
          : { status: 'error', settings, error: res.error },
      )
    },
    [videoId, transcript],
  )

  // One-click start. Only a *new* signal acts, and only when the card has
  // settled (idle, or a failed attempt to retry) — an in-flight load or
  // generation is left alone, and a ready card has nothing to do. The kick-off
  // is deferred into a transition: the effect must not cascade a synchronous
  // render, and generating is exactly the kind of low-priority work that suits.
  const lastSignalRef = useRef(0)
  useEffect(() => {
    if (startSignal === undefined || startSignal === lastSignalRef.current) return
    if (state.status === 'loading' || state.status === 'generating' || state.status === 'no-key') return
    const settings = state.settings
    lastSignalRef.current = startSignal
    if ((state.status === 'idle' || state.status === 'error') && settings) {
      startTransition(() => {
        void generate(settings)
      })
    }
  }, [startSignal, state, generate])

  function openSettings() {
    void sendToBackground({ type: 'll:open-options' })
  }

  if (state.status === 'loading') {
    return (
      <div data-ll-overview-state="loading" aria-busy="true">
        <div className="motion-safe:animate-pulse space-y-1.5">
          <div className="h-2.5 w-1/3 rounded-full bg-line" />
          <div className="h-2.5 w-full rounded-full bg-line" />
          <div className="h-2.5 w-2/3 rounded-full bg-line" />
        </div>
        <p role="status" className="mt-2.5 text-xs text-muted">
          Checking for a cached overview…
        </p>
      </div>
    )
  }

  if (state.status === 'no-key') {
    return (
      <div data-ll-overview-state="no-key">
        <p className="text-xs text-muted">
          Summaries, quizzes and Q&amp;A run on your own Gemini API key. Add it once in the
          extension settings — it is stored only in this browser.
        </p>
        <button
          type="button"
          onClick={openSettings}
          className="mt-2.5 inline-flex h-8 items-center rounded-full bg-indigo-600 px-3.5 font-medium text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 motion-safe:transition-colors motion-safe:duration-150"
        >
          Open settings
        </button>
      </div>
    )
  }

  if (state.status === 'idle') {
    return (
      <div data-ll-overview-state="idle">
        <p className="text-xs text-muted">
          Generate a chapter-by-chapter overview with Gemini. It runs once per video and level,
          then it is cached — coming back to this video makes no new API calls.
        </p>
        <button
          type="button"
          data-ll-overview-generate
          onClick={() => void generate(state.settings)}
          className="mt-2.5 inline-flex h-8 items-center rounded-full bg-indigo-600 px-3.5 font-medium text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 motion-safe:transition-colors motion-safe:duration-150"
        >
          Generate overview
        </button>
        <SettingsChips settings={state.settings} />
      </div>
    )
  }

  if (state.status === 'generating') {
    return (
      <div data-ll-overview-state="generating" aria-busy="true">
        <div className="motion-safe:animate-pulse space-y-1.5">
          <div className="h-2.5 w-1/3 rounded-full bg-line" />
          <div className="h-2.5 w-full rounded-full bg-line" />
          <div className="h-2.5 w-2/3 rounded-full bg-line" />
        </div>
        <p role="status" className="mt-2.5 text-xs text-muted">
          Asking Gemini for the overview… {elapsedSec}s
        </p>
        <p className="mt-1 text-[11px] leading-4 text-muted">
          One API call for this video — it will be cached afterwards.
        </p>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div data-ll-overview-state="error">
        <p className="text-xs text-muted">{state.error.message}</p>
        {state.error.detail && (
          <p className="mt-1 text-[11px] leading-4 text-muted">({state.error.detail})</p>
        )}
        <div className="mt-2.5 flex flex-wrap gap-2">
          {state.settings && (
            <button
              type="button"
              data-ll-overview-retry
              onClick={() => void generate(state.settings!)}
              className="inline-flex h-8 items-center rounded-full border border-line px-3.5 font-medium hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 motion-safe:transition-colors motion-safe:duration-150"
            >
              Try again
            </button>
          )}
          {fixableInSettings(state.error.code) && (
            <button
              type="button"
              onClick={openSettings}
              className="inline-flex h-8 items-center rounded-full border border-line px-3.5 font-medium hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 motion-safe:transition-colors motion-safe:duration-150"
            >
              Open settings
            </button>
          )}
        </div>
      </div>
    )
  }

  const { overview, settings } = state
  return (
    <div data-ll-overview-state="ready">
      <h3 className="text-xs font-semibold">Overview</h3>
      <p data-ll-overview-text className="mt-1.5 text-xs leading-5 text-muted">
        {overview.overview}
      </p>

      <h3 className="mt-3 text-xs font-semibold">Key takeaways</h3>
      <ul data-ll-takeaways className="mt-1.5 space-y-1">
        {overview.takeaways.map((takeaway) => (
          <li key={takeaway} className="flex gap-1.5 text-xs leading-5 text-muted">
            <span aria-hidden="true" className="mt-px text-indigo-600 dark:text-indigo-400">
              •
            </span>
            <span className="min-w-0">{takeaway}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 rounded-lg border border-line bg-surface p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold">Learning loop</p>
            <p className="mt-0.5 text-[11px] leading-4 text-muted">
              {loopActive
                ? `Running — the video pauses ${describeCadence(settings.quizEvery)} and the dotted marks on the player timeline show exactly where.`
                : `Pause the video ${describeCadence(settings.quizEvery)} for one short question answered in your own words.`}
            </p>
          </div>
          <button
            type="button"
            data-ll-loop-toggle
            data-ll-loop-active={loopActive ? 'true' : 'false'}
            aria-pressed={loopActive}
            onClick={onLoopToggle}
            className={`inline-flex h-8 shrink-0 items-center rounded-full px-3.5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 motion-safe:transition-colors motion-safe:duration-150 ${
              loopActive
                ? 'border border-line hover:bg-surface-2'
                : 'bg-indigo-600 text-white hover:bg-indigo-500'
            }`}
          >
            {loopActive ? 'Stop' : 'Start'}
          </button>
        </div>
        {loopActive && (
          <p className="mt-1.5 text-[11px] leading-4 text-muted">
            Questions cost one Gemini call each, cached per chapter — asking again costs nothing.
          </p>
        )}
      </div>

      <h3 className="mt-3 text-xs font-semibold">Chapters</h3>
      <ol data-ll-chapters className="mt-1.5 space-y-1.5">
        {overview.chapters.map((chapter) => (
          <li key={`${chapter.startSec}-${chapter.title}`}>
            <button
              type="button"
              data-ll-chapter
              data-ll-chapter-start={chapter.startSec}
              onClick={() => seekVideoTo(chapter.startSec)}
              aria-label={`Play from ${formatTimestamp(chapter.startSec)} — ${chapter.title}`}
              className="flex w-full gap-2 rounded-lg border border-line bg-surface px-2 py-1.5 text-left hover:border-indigo-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 motion-safe:transition-colors motion-safe:duration-150 dark:hover:border-indigo-500/60"
            >
              <span className="mt-0.5 shrink-0 font-mono text-[11px] text-indigo-600 dark:text-indigo-400">
                {formatTimestamp(chapter.startSec)}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-ink">{chapter.title}</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-muted">
                  {chapter.summary}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <p className="mt-2.5 text-[11px] leading-4 text-muted">
        model: {settings.model} · level: {settings.level} · cached — no new API calls for this
        video.
      </p>
    </div>
  )
}

function SettingsChips({ settings }: { settings: LlSettings }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5 text-[11px] leading-4 text-muted">
      <li className="rounded-full border border-line bg-surface px-2 py-0.5">
        model: {settings.model}
      </li>
      <li className="rounded-full border border-line bg-surface px-2 py-0.5">
        level: {settings.level}
      </li>
      <li className="rounded-full border border-line bg-surface px-2 py-0.5">
        quizzes: {describeCadence(settings.quizEvery)}
      </li>
    </ul>
  )
}
