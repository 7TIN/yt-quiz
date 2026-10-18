import { useCallback, useState } from 'react'
import { sendToBackground } from '../content/messaging'
import type {
  LlSettings,
  OverviewData,
  PanelPlacement,
  ThemeMode,
  Transcript,
  VideoId,
} from '../lib/types'
import { OverviewCard, type OverviewCardStatus } from './OverviewCard'
import { QuizLoop } from './QuizLoop'
import { StartCard, type StartCardState } from './StartCard'
import { TranscriptCard, type TranscriptCardStatus } from './TranscriptCard'
import { ChevronDown, LogoMark } from './icons'

interface PanelAppProps {
  videoId: VideoId
  placement: PanelPlacement
  theme: ThemeMode
}

const BODY_ID = 'learning-loop-panel-body'

/**
 * The panel: header with collapse, the transcript card, the Gemini-backed
 * overview with the chapter rail, and — when switched on — the learning loop
 * that pauses playback at chapter ends for a quick question.
 */
export function PanelApp({ videoId, placement, theme }: PanelAppProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <section
      data-ll-panel
      aria-label="Learning Loop"
      className="font-sans text-[13px] leading-5 text-ink"
      style={{ colorScheme: theme }}
    >
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
        <header className="flex items-center gap-2.5 px-3.5 py-3">
          <LogoMark className="size-7 shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold">Learning Loop</h2>
            <p className="truncate text-xs text-muted">
              Video <span className="font-mono">{videoId}</span>
            </p>
          </div>
          <button
            type="button"
            data-ll-collapse
            aria-expanded={!collapsed}
            aria-controls={BODY_ID}
            aria-label={collapsed ? 'Expand Learning Loop panel' : 'Collapse Learning Loop panel'}
            onClick={() => setCollapsed((value) => !value)}
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 motion-safe:transition-colors motion-safe:duration-150"
          >
            <ChevronDown
              className={`size-4 motion-safe:transition-transform motion-safe:duration-150 ${
                collapsed ? '-rotate-90' : ''
              }`}
            />
          </button>
        </header>

        <div
          id={BODY_ID}
          hidden={collapsed}
          className="border-t border-line px-3.5 pt-3 pb-3.5"
        >
          <LearningSection key={videoId} videoId={videoId} />
          <ul className="mt-2 flex flex-wrap gap-1.5 text-[11px] leading-4 text-muted">
            <li className="rounded-full border border-line bg-surface px-2 py-0.5">
              placement: {placement}
            </li>
            <li className="rounded-full border border-line bg-surface px-2 py-0.5">
              theme: {theme}
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}

/**
 * Keyed by video so all learning state resets on SPA navigation. The overview
 * card only mounts after the transcript is ready, which keeps the cost story
 * simple: nothing reaches Gemini before the user asks for it — and the
 * one-click Start button is exactly that ask. The quiz loop mounts only while
 * it is switched on; collapsing the panel keeps it mounted (hidden) so a quiz
 * moment is never lost to a collapsed panel.
 */
function LearningSection({ videoId }: { videoId: VideoId }) {
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [overview, setOverview] = useState<OverviewData | null>(null)
  /** The loop is on because the user toggled it directly (OverviewCard). */
  const [loopOn, setLoopOn] = useState(false)

  /** True once the one-click Start has been pressed and not stopped. */
  const [startRequested, setStartRequested] = useState(false)
  /** A Start that failed on the missing API key; cleared by the next Start. */
  const [keyMissing, setKeyMissing] = useState(false)
  /** Bumped to tell the cards "run now" (transcript read → overview build). */
  const [startSignal, setStartSignal] = useState(0)

  const [transcriptStatus, setTranscriptStatus] = useState<TranscriptCardStatus>('idle')
  const [transcriptError, setTranscriptError] = useState<string | null>(null)
  const [overviewStatus, setOverviewStatus] = useState<OverviewCardStatus>('loading')
  const [overviewError, setOverviewError] = useState<string | null>(null)

  const handleTranscriptState = useCallback((status: TranscriptCardStatus, message?: string) => {
    setTranscriptStatus(status)
    setTranscriptError(message ?? null)
  }, [])

  const handleOverviewState = useCallback((status: OverviewCardStatus, message?: string) => {
    setOverviewStatus(status)
    setOverviewError(message ?? null)
  }, [])

  const startLearning = useCallback(async () => {
    const res = await sendToBackground<LlSettings>({ type: 'll:settings:get' })
    if (!res.ok || !res.data.hasKey) {
      setKeyMissing(true)
      setStartRequested(true)
      return
    }
    setKeyMissing(false)
    setStartRequested(true)
    setStartSignal((value) => value + 1)
  }, [])

  const openSettings = useCallback(() => {
    void sendToBackground({ type: 'll:open-options' })
  }, [])

  const stopLearning = useCallback(() => {
    setStartRequested(false)
    setLoopOn(false)
  }, [])

  const toggleLoop = useCallback(() => {
    setStartRequested(false)
    setLoopOn((value) => !value)
  }, [])

  // The flow is derived, so it cannot get stuck: a start request plus both
  // artifacts in memory *is* an armed loop; a failure while requested is the
  // blocked card. Children report their status; nothing more to synchronize.
  const loopActive = loopOn || (startRequested && transcript !== null && overview !== null)
  const blocked: { message: string; canOpenSettings: boolean } | null = (() => {
    if (!startRequested || loopActive) return null
    if (keyMissing) {
      return {
        message:
          'Summaries, quizzes and Q&A run on your own Gemini API key. Add it once, then press Start again.',
        canOpenSettings: true,
      }
    }
    if (transcriptStatus === 'error') {
      return {
        message: transcriptError ?? 'The transcript could not be read.',
        canOpenSettings: false,
      }
    }
    if (overviewStatus === 'no-key') {
      return {
        message: 'Gemini needs an API key — add it once, then press Start again.',
        canOpenSettings: true,
      }
    }
    if (overviewStatus === 'error') {
      return {
        message: overviewError ?? 'Gemini could not build the overview.',
        canOpenSettings: false,
      }
    }
    return null
  })()

  const startState: StartCardState = loopActive
    ? 'active'
    : blocked
      ? 'blocked'
      : startRequested
        ? 'preparing'
        : 'idle'
  const preparingStep = !transcript
    ? 'Reading this video’s transcript…'
    : !overview
      ? 'Building the chapter overview with Gemini…'
      : 'Arming the learning loop…'

  return (
    <>
      {loopActive && transcript && overview && (
        <QuizLoop videoId={videoId} transcript={transcript} overview={overview} />
      )}
      <StartCard
        state={startState}
        step={preparingStep}
        message={blocked?.message}
        canOpenSettings={blocked?.canOpenSettings}
        onStart={() => void startLearning()}
        onStop={stopLearning}
        onOpenSettings={openSettings}
      />
      <div data-ll-card className="mt-2.5 rounded-xl border border-line bg-surface-2 p-3">
        <TranscriptCard
          videoId={videoId}
          onReady={setTranscript}
          onStateChange={handleTranscriptState}
          startSignal={startSignal}
        />
      </div>
      {transcript && (
        <div data-ll-card className="mt-2.5 rounded-xl border border-line bg-surface-2 p-3">
          <OverviewCard
            videoId={videoId}
            transcript={transcript}
            loopActive={loopActive}
            onLoopToggle={toggleLoop}
            onReady={setOverview}
            onStateChange={handleOverviewState}
            startSignal={startSignal}
          />
        </div>
      )}
    </>
  )
}

