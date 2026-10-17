import { useState } from 'react'
import type { PanelPlacement, ThemeMode, VideoId } from '../lib/types'
import { TranscriptCard } from './TranscriptCard'
import { ChevronDown, LogoMark } from './icons'

interface PanelAppProps {
  videoId: VideoId
  placement: PanelPlacement
  theme: ThemeMode
}

const BODY_ID = 'learning-loop-panel-body'

/**
 * Phase-1 skeleton panel: header with collapse, plus a status card proving the
 * mount pipeline works. Chapter rail, quizzes and Q&A replace the status card
 * in later phases.
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

        {!collapsed && (
          <div id={BODY_ID} className="border-t border-line px-3.5 pt-3 pb-3.5">
            <div data-ll-card className="rounded-xl border border-line bg-surface-2 p-3">
              <TranscriptCard key={videoId} videoId={videoId} />
            </div>
            <ul className="mt-2 flex flex-wrap gap-1.5 text-[11px] leading-4 text-muted">
              <li className="rounded-full border border-line bg-surface px-2 py-0.5">
                placement: {placement}
              </li>
              <li className="rounded-full border border-line bg-surface px-2 py-0.5">
                theme: {theme}
              </li>
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
