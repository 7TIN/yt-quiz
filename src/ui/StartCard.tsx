/**
 * The one-click start card: transcript → overview → learning loop, all from a
 * single button. The card is presentational; PanelApp's LearningSection owns
 * the flow and tells this card what to show.
 */
export type StartCardState = 'idle' | 'preparing' | 'blocked' | 'active'

interface StartCardProps {
  state: StartCardState
  /** Which step the one-click flow is on while preparing. */
  step?: string
  /** Why the flow stopped (blocked). */
  message?: string
  /** Show "Open settings" when a trip there can fix the block. */
  canOpenSettings?: boolean
  onStart: () => void
  onStop: () => void
  onOpenSettings: () => void
}

const HERO_CLASS =
  'rounded-xl border border-indigo-300 bg-indigo-50/60 p-3 dark:border-indigo-500/40 dark:bg-indigo-500/10'

const PRIMARY_BUTTON_CLASS =
  'inline-flex h-8 items-center rounded-full bg-indigo-600 px-3.5 font-medium text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 motion-safe:transition-colors motion-safe:duration-150'

const SECONDARY_BUTTON_CLASS =
  'inline-flex h-8 items-center rounded-full border border-line px-3.5 font-medium hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 motion-safe:transition-colors motion-safe:duration-150'

export function StartCard({
  state,
  step,
  message,
  canOpenSettings,
  onStart,
  onStop,
  onOpenSettings,
}: StartCardProps) {
  if (state === 'active') {
    return (
      <div data-ll-card data-ll-start-state="active" className={HERO_CLASS}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold">Learning loop is on</p>
            <p className="mt-0.5 text-[11px] leading-4 text-muted">
              The video pauses at every dot on the player timeline; answer in this panel to
              continue.
            </p>
          </div>
          <button type="button" data-ll-stop onClick={onStop} className={`shrink-0 ${SECONDARY_BUTTON_CLASS}`}>
            Stop
          </button>
        </div>
      </div>
    )
  }

  if (state === 'preparing') {
    return (
      <div data-ll-card data-ll-start-state="preparing" aria-busy="true" className={HERO_CLASS}>
        <p className="text-xs font-semibold">Getting everything ready</p>
        <p role="status" className="mt-0.5 text-[11px] leading-4 text-muted">
          {step ?? 'Working…'}
        </p>
        <div className="mt-2 motion-safe:animate-pulse space-y-1.5">
          <div className="h-2 w-2/3 rounded-full bg-line" />
          <div className="h-2 w-1/3 rounded-full bg-line" />
        </div>
      </div>
    )
  }

  if (state === 'blocked') {
    return (
      <div data-ll-card data-ll-start-state="blocked" className={HERO_CLASS}>
        <p className="text-xs text-muted">{message ?? 'Something went wrong — try again.'}</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" data-ll-start onClick={onStart} className={PRIMARY_BUTTON_CLASS}>
            Try again
          </button>
          {canOpenSettings && (
            <button
              type="button"
              data-ll-open-settings
              onClick={onOpenSettings}
              className={SECONDARY_BUTTON_CLASS}
            >
              Open settings
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div data-ll-card data-ll-start-state="idle" className={HERO_CLASS}>
      <p className="text-xs font-semibold">Learn this video — one click</p>
      <p className="mt-0.5 text-[11px] leading-4 text-muted">
        Reads the transcript, builds the chapter overview, then starts the learning loop: the
        video pauses at every dotted mark on the player timeline for one short question.
      </p>
      <button
        type="button"
        data-ll-start
        onClick={onStart}
        className={`mt-2.5 ${PRIMARY_BUTTON_CLASS}`}
      >
        Start learning
      </button>
    </div>
  )
}
