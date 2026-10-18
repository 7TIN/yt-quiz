/**
 * The one-click start card — the panel's only visible control.
 *
 *   idle       → explains the loop and offers one button
 *   preparing  → one calm status line while transcript + questions load
 *   active     → "Learning loop is on" with Stop
 *   blocked    → why the flow stopped, and how to fix it
 *
 * The card is presentational; PanelApp's LearningSection owns the flow.
 */
import { AlertIcon, PlayIcon, RefreshIcon, SettingsIcon, StopIcon } from './icons'
import { Button, Spinner } from './primitives'

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

const CARD = 'rounded-xl border border-line bg-surface-2 p-4'

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
      <div data-ll-card data-ll-start-state="active" className={CARD}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full bg-positive ring-4 ring-positive/15"
              />
              Learning loop is on
            </p>
            <p className="mt-1.5 text-sm text-muted">
              The video pauses at each dot on the timeline for a short set of questions.
            </p>
          </div>
          <Button
            data-ll-stop
            variant="secondary"
            onClick={onStop}
            leftIcon={<StopIcon className="size-3" />}
          >
            Stop
          </Button>
        </div>
      </div>
    )
  }

  if (state === 'preparing') {
    return (
      <div data-ll-card data-ll-start-state="preparing" aria-busy="true" className={CARD}>
        <p role="status" className="flex items-center gap-2.5 text-sm font-medium text-ink">
          <Spinner />
          {step ?? 'Getting this video ready…'}
        </p>
      </div>
    )
  }

  if (state === 'blocked') {
    return (
      <div data-ll-card data-ll-start-state="blocked" className={CARD}>
        <p className="flex items-start gap-2.5 text-sm text-ink">
          <AlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />
          <span className="min-w-0">{message ?? 'Something went wrong — try again.'}</span>
        </p>
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <Button data-ll-start onClick={onStart} leftIcon={<RefreshIcon className="size-3.5" />}>
            Try again
          </Button>
          {canOpenSettings && (
            <Button
              data-ll-open-settings
              variant="secondary"
              onClick={onOpenSettings}
              leftIcon={<SettingsIcon className="size-3.5" />}
            >
              Open settings
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div data-ll-card data-ll-start-state="idle" className={CARD}>
      <h3 className="text-lg font-semibold tracking-[-0.01em] text-ink">
        Learn this video, not just watch it
      </h3>
      <p className="mt-1.5 text-sm text-muted">
        One quick question at every chapter, asked over the video and answered in your own words.
      </p>
      <Button
        data-ll-start
        size="lg"
        className="mt-3.5 w-full"
        onClick={onStart}
        leftIcon={<PlayIcon className="size-3.5" />}
      >
        Start learning
      </Button>
    </div>
  )
}
