import { useState } from 'react'
import type { OverviewData, PanelPlacement, ThemeMode, Transcript, VideoId } from '../lib/types'
import { OverviewCard } from './OverviewCard'
import { QuizLoop } from './QuizLoop'
import { TranscriptCard } from './TranscriptCard'
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
 * simple: nothing reaches Gemini before the user asks for it. The quiz loop
 * mounts only while it is switched on; collapsing the panel keeps it mounted
 * (hidden) so a quiz moment is never lost to a collapsed panel.
 */
function LearningSection({ videoId }: { videoId: VideoId }) {
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [loopActive, setLoopActive] = useState(false)

  return (
    <>
      {loopActive && transcript && overview && (
        <QuizLoop videoId={videoId} transcript={transcript} overview={overview} />
      )}
      <div data-ll-card className="rounded-xl border border-line bg-surface-2 p-3">
        <TranscriptCard videoId={videoId} onReady={setTranscript} />
      </div>
      {transcript && (
        <div data-ll-card className="mt-2.5 rounded-xl border border-line bg-surface-2 p-3">
          <OverviewCard
            videoId={videoId}
            transcript={transcript}
            loopActive={loopActive}
            onLoopToggle={() => setLoopActive((value) => !value)}
            onReady={setOverview}
          />
        </div>
      )}
    </>
  )
}
