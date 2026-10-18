/**
 * The quick check: the chapter's questions in order — one or two multiple
 * choice ones (graded locally, revealed the moment they are submitted) and the
 * free-response one that closes the set. All Gemini data arrives as props; the
 * loop pauses the video before this appears.
 *
 * It renders over the video (the player-attached overlay host) and falls back
 * to the panel if no player is available — so the card is one surface with one
 * job, sized for reading a question and picking or typing an answer. The card
 * never grows past its container: the body scrolls, the actions stay pinned in
 * the footer, so "Submit"/"Next question"/"Resume video" is always reachable
 * on a short player.
 */
import { useState, type ReactNode } from 'react'
import { formatTimestamp } from '../lib/format'
import type { GeminiError, JudgeResult, JudgeVerdict, QuizQuestion } from '../lib/types'
import {
  AlertIcon,
  ArrowRightIcon,
  BoltIcon,
  CheckIcon,
  ChevronDown,
  LightbulbIcon,
  PlayIcon,
  RefreshIcon,
  XIcon,
} from './icons'
import { Button, Spinner } from './primitives'

export type QuizView =
  | { kind: 'loading' }
  | { kind: 'quiz' }
  | { kind: 'judging' }
  | { kind: 'judged'; judge: JudgeResult }
  /** A multiple-choice answer was submitted; the options show right/wrong. */
  | { kind: 'revealed'; selectedIndex: number }
  | { kind: 'error'; stage: 'quiz' | 'judge'; error: GeminiError }

export interface QuizCardProps {
  chapterTitle: string
  chapterStartSec: number
  chapterIndex: number
  chapterCount: number
  /** 0-based position of the question being asked within the chapter's set. */
  questionIndex: number
  /** Questions in this chapter's set (0 until the set has loaded). */
  questionTotal: number
  /** True while unanswered questions follow this one (Next vs Resume). */
  hasNext: boolean
  view: QuizView
  question: QuizQuestion | null
  onSubmit: (answer: string) => void
  onSubmitChoice: (index: number) => void
  /** Next unanswered question, or back to the video when this was the last. */
  onAdvance: () => void
  /** Jump the video to the moment this question's answer is explained. */
  onJump: (atSec: number) => void
  /** Leave the rest of the set for later (progress is kept). */
  onSkip: () => void
  /** Retry after a failed load or a failed judging call. */
  onRetry: () => void
  /** Start the same free-response question over with a blank answer box. */
  onRetryAnswer: () => void
}

const VERDICT: Record<JudgeVerdict, { label: string; className: string; icon: ReactNode }> = {
  correct: {
    label: 'Correct',
    className: 'border-positive/35 bg-positive/10 text-positive',
    icon: <CheckIcon className="size-3.5" />,
  },
  partial: {
    label: 'Partly correct',
    className: 'border-warning/35 bg-warning/10 text-warning',
    icon: <AlertIcon className="size-3.5" />,
  },
  incorrect: {
    label: 'Not quite',
    className: 'border-danger/35 bg-danger/10 text-danger',
    icon: <XIcon className="size-3.5" />,
  },
}

/**
 * Option looks: neutral while choosing (green stays reserved for "correct"),
 * positive/danger only once the answer is revealed.
 */
type ChoiceState = 'idle' | 'selected' | 'correct' | 'wrong' | 'muted'

const CHOICE_CLASS: Record<ChoiceState, string> = {
  idle: 'border-line bg-surface-2 hover:border-ink/25 hover:bg-surface-3',
  selected: 'border-ink/30 bg-surface-3',
  correct: 'border-positive/50 bg-positive/10',
  wrong: 'border-danger/50 bg-danger/10',
  muted: 'border-line bg-surface-2 opacity-55',
}

/** The little round mark before a choice: a radio, a tick or a cross. */
function ChoiceMark({ state, selected }: { state: ChoiceState; selected: boolean }) {
  if (state === 'correct') return <CheckIcon className="mt-0.5 size-4 shrink-0 text-positive" />
  if (state === 'wrong') return <XIcon className="mt-0.5 size-4 shrink-0 text-danger" />
  return (
    <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-ink/25">
      {selected && <span className="size-2 rounded-full bg-ink" />}
    </span>
  )
}

export function QuizCard({
  chapterTitle,
  chapterStartSec,
  chapterIndex,
  chapterCount,
  questionIndex,
  questionTotal,
  hasNext,
  view,
  question,
  onSubmit,
  onSubmitChoice,
  onAdvance,
  onJump,
  onSkip,
  onRetry,
  onRetryAnswer,
}: QuizCardProps) {
  const [answer, setAnswer] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [hintsShown, setHintsShown] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)

  const answering = view.kind === 'quiz'
  const selectedIndex = view.kind === 'revealed' ? view.selectedIndex : null
  const revealed = selectedIndex !== null
  const mcq = question?.kind === 'mcq' ? question : null
  const freeText = question?.kind === 'free-text' ? question : null
  const hints = mcq ? (mcq.hint ? [mcq.hint] : []) : (freeText?.hints ?? [])
  const canSubmit = answering && (freeText ? answer.trim().length > 0 : selected !== null)
  const mcqCorrect = mcq && revealed ? selectedIndex === mcq.correctIndex : false

  const choiceState = (optionIndex: number): ChoiceState => {
    if (revealed && mcq) {
      if (optionIndex === mcq.correctIndex) return 'correct'
      if (optionIndex === selectedIndex) return 'wrong'
      return 'muted'
    }
    return selected === optionIndex ? 'selected' : 'idle'
  }

  const hintsBlock =
    hintsShown > 0 ? (
      <ul data-ll-quiz-hints className="mt-3 space-y-1.5">
        {hints.slice(0, hintsShown).map((hint) => (
          <li
            key={hint}
            data-ll-quiz-hint-item
            className="flex gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-muted"
          >
            <LightbulbIcon className="mt-px size-3.5 shrink-0 text-warning" />
            <span className="min-w-0">{hint}</span>
          </li>
        ))}
      </ul>
    ) : null

  const hintButton =
    hints.length > 0 ? (
      <Button
        data-ll-quiz-hint
        size="lg"
        variant="secondary"
        disabled={hintsShown >= hints.length}
        onClick={() => setHintsShown((count) => Math.min(count + 1, hints.length))}
        leftIcon={<LightbulbIcon className="size-4" />}
      >
        {hintsShown === 0 ? 'Hint' : `Hint ${hintsShown}/${hints.length}`}
      </Button>
    ) : null

  const stopButton = hasNext ? (
    <Button data-ll-quiz-skip size="lg" variant="ghost" className="ml-auto" onClick={onSkip}>
      Stop for now
    </Button>
  ) : null

  /** "Next question" while questions remain, "Resume video" on the last one. */
  const advanceButton = hasNext ? (
    <Button
      data-ll-quiz-next
      size="lg"
      onClick={onAdvance}
      leftIcon={<ArrowRightIcon className="size-4" />}
    >
      Next question
    </Button>
  ) : (
    <Button
      data-ll-quiz-resume
      size="lg"
      onClick={onAdvance}
      leftIcon={<PlayIcon className="size-3.5" />}
    >
      Resume video
    </Button>
  )

  const jumpButton = question ? (
    <Button
      data-ll-quiz-jump
      data-ll-quiz-jump-at={question.atSec}
      size="lg"
      variant="secondary"
      onClick={() => onJump(question.atSec)}
      leftIcon={<PlayIcon className="size-3.5" />}
    >
      Rewatch {formatTimestamp(question.atSec)}
    </Button>
  ) : null

  const submitAnswerButton = (
    <Button
      data-ll-quiz-submit
      size="lg"
      disabled={!canSubmit}
      onClick={() => {
        if (freeText) onSubmit(answer)
        else if (selected !== null) onSubmitChoice(selected)
      }}
      leftIcon={<ArrowRightIcon className="size-4" />}
    >
      Submit answer
    </Button>
  )

  // The footer: what the viewer can do right now, one row, never out of reach.
  const actions = (() => {
    if (view.kind === 'error') {
      return (
        <>
          <Button
            data-ll-quiz-retry
            variant="secondary"
            onClick={onRetry}
            leftIcon={<RefreshIcon className="size-3.5" />}
          >
            Try again
          </Button>
          <Button data-ll-quiz-skip variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
        </>
      )
    }
    if (answering && (mcq || freeText)) {
      return (
        <>
          {submitAnswerButton}
          {hintButton}
          {stopButton}
        </>
      )
    }
    if (revealed) {
      return (
        <>
          {advanceButton}
          {jumpButton}
          {stopButton}
        </>
      )
    }
    if (view.kind === 'judged') {
      return (
        <>
          {advanceButton}
          {view.judge.verdict !== 'correct' && (
            <Button
              data-ll-quiz-retry-answer
              size="lg"
              variant="secondary"
              onClick={onRetryAnswer}
            >
              Try again
            </Button>
          )}
          {jumpButton}
          {stopButton}
        </>
      )
    }
    return null
  })()

  return (
    <div
      data-ll-quiz-card
      data-ll-quiz-state={view.kind}
      role="group"
      aria-label="Quick check"
      // Typing an answer must never drive YouTube's player shortcuts (k, j, l,
      // f, t, c, digits…). Key events stop at this card's boundary: React
      // delegates at the root container *inside* our shadow root, so
      // stopPropagation here keeps them from ever reaching the page.
      onKeyDown={(event) => {
        event.stopPropagation()
        if (!answering || !(event.metaKey || event.ctrlKey) || event.key !== 'Enter') return
        if (freeText && answer.trim().length > 0) onSubmit(answer)
        else if (mcq && selected !== null) onSubmitChoice(selected)
      }}
      onKeyUp={(event) => event.stopPropagation()}
      onKeyPress={(event) => event.stopPropagation()}
      // my-auto centers the card inside the overlay scrim (a flex column) and
      // keeps it reachable when the player is shorter than the card.
      className="font-sans text-sm mx-auto my-auto flex max-h-full w-full max-w-[540px] flex-col rounded-2xl border border-line bg-surface shadow-[0_24px_64px_-16px_rgba(0,0,0,0.55)] motion-safe:animate-[ll-fade-in_200ms_ease-out]"
    >
      {/* Body: the only part that scrolls, so the footer stays reachable. */}
      <div className="ll-scroll min-h-0 flex-1 overflow-y-auto p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-2xs font-semibold tracking-[0.1em] text-muted uppercase">
            <BoltIcon className="size-3.5 shrink-0 text-accent" />
            Quick check
          </p>
          <p data-ll-quiz-progress className="shrink-0 font-mono text-2xs text-faint">
            {questionTotal > 1
              ? `${questionIndex + 1}/${questionTotal}`
              : `${chapterIndex + 1}/${chapterCount} · ${formatTimestamp(chapterStartSec)}`}
          </p>
        </div>
        <h3 className="mt-2.5 text-base font-semibold text-ink">{chapterTitle}</h3>

        {view.kind === 'loading' && (
          <p role="status" aria-busy="true" className="mt-4 flex items-center gap-2.5 text-sm text-muted">
            <Spinner />
            Writing your questions about this chapter…
          </p>
        )}

        {/* Multiple choice: answering and revealed share the option list; only
            the marks and the footer change. */}
        {(answering || revealed) && mcq && (
          <>
            <p data-ll-quiz-question className="mt-3.5 text-base leading-6 text-ink">
              {mcq.question}
            </p>
            <div role="radiogroup" aria-label="Answer choices" className="mt-3.5 space-y-2">
              {mcq.choices.map((choice, optionIndex) => {
                const state = choiceState(optionIndex)
                return (
                  <button
                    key={choice}
                    type="button"
                    role="radio"
                    aria-checked={
                      revealed ? optionIndex === mcq.correctIndex : selected === optionIndex
                    }
                    autoFocus={answering && optionIndex === 0}
                    disabled={revealed}
                    data-ll-quiz-choice={optionIndex}
                    data-ll-quiz-choice-state={state}
                    onClick={() => {
                      if (!revealed) setSelected(optionIndex)
                    }}
                    className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm text-ink disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40 motion-safe:transition-colors motion-safe:duration-150 ${CHOICE_CLASS[state]}`}
                  >
                    <ChoiceMark state={state} selected={selected === optionIndex} />
                    <span className="min-w-0">{choice}</span>
                  </button>
                )
              })}
            </div>

            {answering && (
              <>
                {hintsBlock}
                <p className="mt-3 text-2xs text-faint">
                  Paused — take your time. Ctrl/Cmd + Enter submits.
                </p>
              </>
            )}

            {revealed && (
              <>
                <p className="mt-3.5">
                  <span
                    data-ll-quiz-verdict={mcqCorrect ? 'correct' : 'incorrect'}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-semibold ${
                      mcqCorrect ? VERDICT.correct.className : VERDICT.incorrect.className
                    }`}
                  >
                    {mcqCorrect ? VERDICT.correct.icon : VERDICT.incorrect.icon}
                    {mcqCorrect ? VERDICT.correct.label : VERDICT.incorrect.label}
                  </span>
                </p>
                {mcq.explanation && (
                  <p data-ll-quiz-feedback className="mt-2.5 text-sm leading-5 text-ink">
                    {mcq.explanation}
                  </p>
                )}
              </>
            )}
          </>
        )}

        {answering && freeText && (
          <>
            <p data-ll-quiz-question className="mt-3.5 text-base leading-6 text-ink">
              {freeText.question}
            </p>
            <label className="mt-3.5 block">
              <span className="sr-only">Your answer</span>
              <textarea
                autoFocus
                data-ll-quiz-answer
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                rows={3}
                placeholder="Answer in your own words — a sentence or two is enough."
                className="w-full resize-none rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-sm text-ink placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
              />
            </label>
            {hintsBlock}
            <p className="mt-3 text-2xs text-faint">
              Paused — take your time. Ctrl/Cmd + Enter submits.
            </p>
          </>
        )}

        {view.kind === 'judging' && (
          <p role="status" aria-busy="true" className="mt-4 flex items-center gap-2.5 text-sm text-muted">
            <Spinner />
            Checking your answer…
          </p>
        )}

        {view.kind === 'judged' && freeText && (
          <>
            <p data-ll-quiz-question className="mt-3.5 text-base leading-6 text-ink">
              {freeText.question}
            </p>
            <p className="mt-3.5">
              <span
                data-ll-quiz-verdict={view.judge.verdict}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-semibold ${VERDICT[view.judge.verdict].className}`}
              >
                {VERDICT[view.judge.verdict].icon}
                {VERDICT[view.judge.verdict].label}
              </span>
            </p>
            <p data-ll-quiz-feedback className="mt-2.5 text-sm leading-5 text-ink">
              {view.judge.feedback}
            </p>
            {freeText.explanation && (
              <p className="mt-2 text-xs text-muted">{freeText.explanation}</p>
            )}
            <button
              type="button"
              onClick={() => setShowAnswer((value) => !value)}
              className="mt-2.5 inline-flex items-center gap-1 rounded text-xs font-medium text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-safe:transition-colors motion-safe:duration-150"
            >
              <ChevronDown
                className={`size-3.5 motion-safe:transition-transform motion-safe:duration-150 ${
                  showAnswer ? 'rotate-180' : ''
                }`}
              />
              {showAnswer ? 'Hide checkpoints' : 'Show checkpoints'}
            </button>
            {showAnswer && (
              <div className="mt-2.5 rounded-xl border border-line bg-surface-2 p-3 text-xs leading-5 text-muted">
                <p>{freeText.expectedAnswer}</p>
                {freeText.acceptablePoints.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    {freeText.acceptablePoints.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}

        {view.kind === 'error' && (
          <>
            <p className="mt-3.5 text-sm leading-5 text-ink">{view.error.message}</p>
            {view.error.detail && <p className="mt-1 text-2xs text-faint">{view.error.detail}</p>}
          </>
        )}
      </div>

      {actions && (
        <div
          data-ll-quiz-actions
          className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line px-5 py-3.5"
        >
          {actions}
        </div>
      )}
    </div>
  )
}
