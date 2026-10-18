import { useCallback, useEffect, useState } from 'react'
import { sendToBackground } from '../content/messaging'
import type { LlSettings, QuizDensity, ThemeMode, VideoId } from '../lib/types'
import { QuizLoop } from './QuizLoop'
import { StartCard, type StartCardState } from './StartCard'
import { ChevronDown, LogoMark, SettingsIcon } from './icons'
import { useOverviewBuild, useTranscriptRead } from './learning-data'
import { IconButton } from './primitives'

interface PanelAppProps {
  videoId: VideoId
  theme: ThemeMode
}

const BODY_ID = 'learning-loop-panel-body'

/**
 * The panel: a header with collapse and exactly one card — the learning loop's
 * status. The transcript, the overview and the chapters all happen behind it
 * (see learning-data.ts); the questions themselves open over the video.
 */
export function PanelApp({ videoId, theme }: PanelAppProps) {
  const [collapsed, setCollapsed] = useState(false)
  /** The gear in the header: settings hold the API key, so it is never far. */
  const openSettings = useCallback(() => {
    void sendToBackground({ type: 'll:open-options' })
  }, [])

  return (
    <section
      data-ll-panel
      aria-label="Learning Loop"
      className="font-sans text-sm text-ink"
      style={{ colorScheme: theme }}
    >
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
        <header className="flex items-center gap-2.5 px-4 py-3">
          <LogoMark className="size-6 shrink-0" />
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">Learning Loop</h2>
          <IconButton
            data-ll-open-settings
            label="Open settings"
            onClick={openSettings}
          >
            <SettingsIcon className="size-4" />
          </IconButton>
          <IconButton
            data-ll-collapse
            aria-expanded={!collapsed}
            aria-controls={BODY_ID}
            label={collapsed ? 'Expand Learning Loop panel' : 'Collapse Learning Loop panel'}
            onClick={() => setCollapsed((value) => !value)}
          >
            <ChevronDown
              className={`size-4 motion-safe:transition-transform motion-safe:duration-150 ${
                collapsed ? '-rotate-90' : ''
              }`}
            />
          </IconButton>
        </header>

        <div id={BODY_ID} hidden={collapsed} className="border-t border-line p-4">
          <LearningSection key={videoId} videoId={videoId} onOpenSettings={openSettings} />
        </div>
      </div>
    </section>
  )
}

/**
 * Keyed by video so all learning state resets on SPA navigation. The one-click
 * Start button is the only thing that can reach Gemini: it reads the transcript,
 * builds the chapter overview (cached per video + level) and arms the loop.
 * Nothing here renders the intermediate steps — the card reports the flow, the
 * quiet work stays invisible.
 */
function LearningSection({
  videoId,
  onOpenSettings,
}: {
  videoId: VideoId
  /** Bubbled up to the header's gear; the blocked card uses the same call. */
  onOpenSettings: () => void
}) {
  /** True once Start has been pressed and not stopped. */
  const [startRequested, setStartRequested] = useState(false)
  /** A Start that failed on the missing API key; cleared by the next Start. */
  const [keyMissing, setKeyMissing] = useState(false)
  /** Bumped to tell the loaders "run now" (transcript read → overview build). */
  const [startSignal, setStartSignal] = useState(0)
  /** Public settings: the density switch lives here, so this card owns them. */
  const [settings, setSettings] = useState<LlSettings | null>(null)

  useEffect(() => {
    let cancelled = false
    void sendToBackground<LlSettings>({ type: 'll:settings:get' }).then((res) => {
      if (!cancelled && res.ok) setSettings(res.data)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const transcriptRead = useTranscriptRead(videoId, startSignal)
  const overviewBuild = useOverviewBuild(videoId, transcriptRead.transcript, startSignal)

  const transcript = transcriptRead.transcript
  const overview = overviewBuild.overview

  // The switches take effect immediately: the loop re-plans (and re-addresses its
  // cache + progress) from the next chapter on, and the worker stores each choice.
  const density: QuizDensity = settings?.density ?? 'fewer'
  const changeDensity = useCallback((next: QuizDensity) => {
    setSettings((current) => (current ? { ...current, density: next } : current))
    void sendToBackground({ type: 'll:settings:save', density: next })
  }, [])
  /** Facts default to the middle band (2–5 a chapter, 5–15 a video). */
  const factsDensity: QuizDensity = settings?.factsDensity ?? 'moderate'
  const changeFactsDensity = useCallback((next: QuizDensity) => {
    setSettings((current) => (current ? { ...current, factsDensity: next } : current))
    void sendToBackground({ type: 'll:settings:save', factsDensity: next })
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

  const stopLearning = useCallback(() => {
    setStartRequested(false)
  }, [])

  // The flow is derived, so it cannot get stuck: a start request plus both
  // artifacts in memory *is* an armed loop; a failure while requested is the
  // blocked card. The loaders report their status; nothing more to synchronize.
  const loopActive = startRequested && transcript !== null && overview !== null
  const blocked: { message: string; canOpenSettings: boolean } | null = (() => {
    if (!startRequested || loopActive) return null
    if (keyMissing) {
      return {
        message:
          'Learning runs on your own Gemini API key. Add it once in settings, then press Start again.',
        canOpenSettings: true,
      }
    }
    if (transcriptRead.status === 'error') {
      return {
        message: transcriptRead.message ?? 'The transcript could not be read.',
        canOpenSettings: false,
      }
    }
    if (overviewBuild.status === 'no-key') {
      return {
        message: 'Gemini needs an API key — add it in settings, then press Start again.',
        canOpenSettings: true,
      }
    }
    if (overviewBuild.status === 'error') {
      return {
        message: overviewBuild.message ?? 'Gemini could not write the questions.',
        canOpenSettings: overviewBuild.canOpenSettings,
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
    ? 'Getting this video ready…'
    : !overview
      ? 'Writing your questions…'
      : 'Starting the loop…'

  return (
    <>
      {loopActive && transcript && overview && (
        <QuizLoop
          videoId={videoId}
          transcript={transcript}
          overview={overview}
          density={density}
          factsDensity={factsDensity}
        />
      )}
      <StartCard
        state={startState}
        step={preparingStep}
        message={blocked?.message}
        canOpenSettings={blocked?.canOpenSettings}
        density={density}
        onDensityChange={changeDensity}
        factsDensity={factsDensity}
        onFactsDensityChange={changeFactsDensity}
        onStart={() => void startLearning()}
        onStop={stopLearning}
        onOpenSettings={onOpenSettings}
      />
    </>
  )
}
