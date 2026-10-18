/**
 * The one-click start card — the panel's only visible control.
 *
 *   idle       → explains the loop, offers one button, sets both densities
 *   preparing  → one calm status line while transcript + questions load
 *   active     → "Learning loop is on" with the two density switchers and Stop
 *   blocked    → why the flow stopped, and how to fix it
 *
 * The card is presentational; PanelApp's LearningSection owns the flow.
 */
import { DENSITY_LABEL, DENSITY_OPTIONS } from '../lib/quiz-plan'
import type { QuizDensity } from '../lib/types'
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
  /** The viewer's questions-per-chapter choice, shown in the idle/active card. */
  density?: QuizDensity
  onDensityChange?: (next: QuizDensity) => void
  /** The viewer's facts-per-chapter choice, right below the questions one. */
  factsDensity?: QuizDensity
  onFactsDensityChange?: (next: QuizDensity) => void
  onStart: () => void
  onStop: () => void
  onOpenSettings: () => void
}

const CARD = 'rounded-xl border border-line bg-surface-2 p-4'

/**
 * Three plain choices, no counts: the chapter's length decides how many
 * questions (or pop-ups) each one actually buys (see src/lib/quiz-plan.ts), so a
 * number here would be a lie for every video but the current one. The two
 * switchers share the control but not the data hooks — `facts` namespaces them.
 */
function DensitySwitch({
  label,
  note,
  value,
  onChange,
  facts = false,
}: {
  label: string
  note: string
  value: QuizDensity
  onChange: (next: QuizDensity) => void
  facts?: boolean
}) {
  const labelId = facts ? 'll-facts-density-label' : 'll-density-label'
  return (
    <div
      className="mt-3.5"
      {...(facts ? { 'data-ll-facts-density': 'true' } : { 'data-ll-density': 'true' })}
    >
      <p id={labelId} className="text-xs font-medium text-muted">
        {label}
      </p>
      <div
        role="group"
        aria-labelledby={labelId}
        className="mt-1.5 grid grid-cols-3 gap-1 rounded-lg border border-line bg-surface p-1"
      >
        {DENSITY_OPTIONS.map((option) => {
          const active = value === option
          return (
            <button
              key={option}
              type="button"
              {...(facts
                ? { 'data-ll-facts-density-option': option }
                : { 'data-ll-density-option': option })}
              aria-pressed={active}
              onClick={() => onChange(option)}
              className={`h-7 rounded-md text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-safe:transition-colors motion-safe:duration-150 ${
                active ? 'bg-accent/15 text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink'
              }`}
            >
              {DENSITY_LABEL[option]}
            </button>
          )
        })}
      </div>
      <p className="mt-1.5 text-xs text-muted">{note}</p>
    </div>
  )
}

export function StartCard({
  state,
  step,
  message,
  canOpenSettings,
  density,
  onDensityChange,
  factsDensity,
  onFactsDensityChange,
  onStart,
  onStop,
  onOpenSettings,
}: StartCardProps) {
  const switches = (
    <>
      {density && onDensityChange ? (
        <DensitySwitch
          label="Questions per chapter"
          note="Longer chapters ask more; each one is generated once and cached."
          value={density}
          onChange={onDensityChange}
        />
      ) : null}
      {factsDensity && onFactsDensityChange ? (
        <DensitySwitch
          facts
          label="Facts per chapter"
          note="Little “did you know” pop-ups while the video plays. Starred on the timeline; generated once and cached."
          value={factsDensity}
          onChange={onFactsDensityChange}
        />
      ) : null}
    </>
  )

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
        {switches}
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
        A short check at every chapter, asked over the video — multiple choice first, then one
        answer in your own words — plus quick “did you know” pop-ups as you watch.
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
      {switches}
    </div>
  )
}
