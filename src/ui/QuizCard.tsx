/**
 * The quick check: question + free-text answer with progressive hints, a
 * judging spinner, the verdict with feedback, and the error states. All Gemini
 * data arrives as props; the loop pauses the video before this appears.
 *
 * It renders over the video (the player-attached overlay host) and falls back
 * to the panel if no player is available — so the card is one surface with one
 * job, sized for reading a question and typing two sentences.
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
  | { kind: 'error'; stage: 'quiz' | 'judge'; error: GeminiError }

export interface QuizCardProps {
  chapterTitle: string
  chapterStartSec: number
  chapterIndex: number
  chapterCount: number
  view: QuizView
  quiz: QuizQuestion | null
  onSubmit: (answer: string) => void
  onSkip: () => void
  onResume: () => void
  /** Retry after a failed load or a failed judging call. */
  onRetry: () => void
  /** Start the same question over with a blank answer box. */
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

export function QuizCard({
  chapterTitle,
  chapterStartSec,
  chapterIndex,
  chapterCount,
  view,
  quiz,
  onSubmit,
  onSkip,
  onResume,
  onRetry,
  onRetryAnswer,
}: QuizCardProps) {
  const [answer, setAnswer] = useState('')
  const [hintsShown, setHintsShown] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)

  const hints = quiz?.hints ?? []
  const canSubmit = view.kind === 'quiz' && answer.trim().length > 0

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
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key === 'Enter' &&
          view.kind === 'quiz' &&
          answer.trim().length > 0
        ) {
          onSubmit(answer)
        }
      }}
      onKeyUp={(event) => event.stopPropagation()}
      onKeyPress={(event) => event.stopPropagation()}
      className="text-sm rounded-2xl border border-line bg-surface p-5 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.55)] motion-safe:animate-[ll-fade-in_200ms_ease-out]"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-2xs font-semibold tracking-[0.1em] text-muted uppercase">
          <BoltIcon className="size-3.5 shrink-0 text-accent" />
          Quick check
        </p>
        <p className="shrink-0 font-mono text-2xs text-faint">
          {chapterIndex + 1}/{chapterCount} · {formatTimestamp(chapterStartSec)}
        </p>
      </div>
      <h3 className="mt-2.5 text-base font-semibold text-ink">{chapterTitle}</h3>

      {view.kind === 'loading' && (
        <p role="status" aria-busy="true" className="mt-4 flex items-center gap-2.5 text-sm text-muted">
          <Spinner />
          Writing a question about this chapter…
        </p>
      )}

      {view.kind === 'quiz' && quiz && (
        <>
          <p data-ll-quiz-question className="mt-4 text-base leading-6 text-ink">
            {quiz.question}
          </p>
          <label className="mt-4 block">
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
          {hintsShown > 0 && (
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
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              data-ll-quiz-submit
              size="lg"
              disabled={!canSubmit}
              onClick={() => onSubmit(answer)}
              leftIcon={<ArrowRightIcon className="size-4" />}
            >
              Submit answer
            </Button>
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
            <Button data-ll-quiz-skip size="lg" variant="ghost" className="ml-auto" onClick={onSkip}>
              Skip quiz
            </Button>
          </div>
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

      {view.kind === 'judged' && (
        <>
          <p className="mt-4">
            <span
              data-ll-quiz-verdict={view.judge.verdict}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-semibold ${VERDICT[view.judge.verdict].className}`}
            >
              {VERDICT[view.judge.verdict].icon}
              {VERDICT[view.judge.verdict].label}
            </span>
          </p>
          <p data-ll-quiz-feedback className="mt-3 text-sm leading-5 text-ink">
            {view.judge.feedback}
          </p>
          {quiz && (
            <>
              <p className="mt-2.5 text-xs text-muted">{quiz.explanation}</p>
              <button
                type="button"
                onClick={() => setShowAnswer((value) => !value)}
                className="mt-3 inline-flex items-center gap-1 rounded text-xs font-medium text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-safe:transition-colors motion-safe:duration-150"
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
                  <p>{quiz.expectedAnswer}</p>
                  {quiz.acceptablePoints.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-4">
                      {quiz.acceptablePoints.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              data-ll-quiz-resume
              size="lg"
              onClick={onResume}
              leftIcon={<PlayIcon className="size-3.5" />}
            >
              Resume video
            </Button>
            {view.judge.verdict !== 'correct' && (
              <Button data-ll-quiz-retry-answer size="lg" variant="secondary" onClick={onRetryAnswer}>
                Try again
              </Button>
            )}
          </div>
        </>
      )}

      {view.kind === 'error' && (
        <>
          <p className="mt-4 text-sm leading-5 text-ink">{view.error.message}</p>
          {view.error.detail && <p className="mt-1 text-2xs text-faint">{view.error.detail}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              data-ll-quiz-retry
              variant="secondary"
              onClick={onRetry}
              leftIcon={<RefreshIcon className="size-3.5" />}
            >
              Try again
            </Button>
            <Button data-ll-quiz-skip variant="ghost" onClick={onSkip}>
              Skip quiz
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
