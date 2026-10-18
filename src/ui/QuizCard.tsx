/**
 * Presentational quiz card: loading skeleton, question + free-text answer with
 * progressive hints, judging spinner, verdict with feedback + model answer,
 * and the error state. All Gemini data arrives as props; this file only
 * renders. The video is already paused by the loop when this appears.
 */
import { useState } from 'react'
import { formatTimestamp } from '../lib/format'
import type { GeminiError, JudgeResult, JudgeVerdict, QuizQuestion } from '../lib/types'
import { BoltIcon } from './icons'

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

const BUTTON_PRIMARY =
  'inline-flex h-8 items-center rounded-full bg-indigo-600 px-3.5 font-medium text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 motion-safe:transition-colors motion-safe:duration-150'
const BUTTON_SECONDARY =
  'inline-flex h-8 items-center rounded-full border border-line px-3.5 font-medium hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 motion-safe:transition-colors motion-safe:duration-150'
const BUTTON_LINK =
  'inline-flex h-8 items-center rounded-full px-2 font-medium text-muted underline-offset-2 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 motion-safe:transition-colors motion-safe:duration-150'

const VERDICT_STYLE: Record<JudgeVerdict, { label: string; className: string }> = {
  correct: {
    label: 'Correct',
    className:
      'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
  partial: {
    label: 'Partly correct',
    className:
      'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300',
  },
  incorrect: {
    label: 'Not quite',
    className:
      'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300',
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
      className="mb-2.5 rounded-xl border border-indigo-300 bg-surface p-3 shadow-xs motion-safe:animate-[ll-fade-in_200ms_ease-out] dark:border-indigo-500/50"
    >
      <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-indigo-600 uppercase dark:text-indigo-400">
        <BoltIcon className="size-3.5 shrink-0" />
        Quick check · chapter {chapterIndex + 1} of {chapterCount}
      </p>
      <h3 className="mt-1.5 text-sm font-semibold text-ink">
        {chapterTitle}
        <span className="ml-1.5 font-mono text-[11px] font-normal text-muted">
          {formatTimestamp(chapterStartSec)}
        </span>
      </h3>

      {view.kind === 'loading' && (
        <div aria-busy="true" className="mt-2.5">
          <div className="motion-safe:animate-pulse space-y-1.5">
            <div className="h-2.5 w-full rounded-full bg-line" />
            <div className="h-2.5 w-2/3 rounded-full bg-line" />
          </div>
          <p role="status" className="mt-2 text-xs text-muted">
            Writing a question about this chapter… the video is paused meanwhile.
          </p>
        </div>
      )}

      {view.kind === 'quiz' && quiz && (
        <>
          <p data-ll-quiz-question className="mt-2 text-xs leading-5 text-ink">
            {quiz.question}
          </p>
          <label className="mt-2.5 block">
            <span className="sr-only">Your answer</span>
            <textarea
              autoFocus
              data-ll-quiz-answer
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={3}
              placeholder="Answer in your own words — a sentence or two is enough."
              className="w-full resize-none rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-xs leading-5 text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            />
          </label>
          {hintsShown > 0 && (
            <ul data-ll-quiz-hints className="mt-1.5 space-y-1">
              {hints.slice(0, hintsShown).map((hint) => (
                <li
                  key={hint}
                  data-ll-quiz-hint-item
                  className="flex gap-1.5 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[11px] leading-4 text-muted"
                >
                  <span aria-hidden="true" className="text-amber-600 dark:text-amber-400">
                    ✦
                  </span>
                  <span className="min-w-0">{hint}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-ll-quiz-submit
              disabled={!canSubmit}
              onClick={() => onSubmit(answer)}
              className={BUTTON_PRIMARY}
            >
              Submit answer
            </button>
            <button
              type="button"
              data-ll-quiz-hint
              disabled={hintsShown >= hints.length}
              onClick={() => setHintsShown((count) => Math.min(count + 1, hints.length))}
              className={BUTTON_SECONDARY}
            >
              {hintsShown === 0 ? 'Hint' : `Hint ${hintsShown}/${hints.length}`}
            </button>
            <button type="button" data-ll-quiz-skip onClick={onSkip} className={BUTTON_LINK}>
              Skip quiz
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-muted">
            The video is paused — take your time. Answers are checked by your own Gemini key.
          </p>
        </>
      )}

      {view.kind === 'judging' && (
        <div aria-busy="true" className="mt-2.5">
          <div className="motion-safe:animate-pulse space-y-1.5">
            <div className="h-2.5 w-1/2 rounded-full bg-line" />
            <div className="h-2.5 w-full rounded-full bg-line" />
          </div>
          <p role="status" className="mt-2 text-xs text-muted">
            Checking your answer…
          </p>
        </div>
      )}

      {view.kind === 'judged' && (
        <>
          <p className="mt-2.5">
            <span
              data-ll-quiz-verdict={view.judge.verdict}
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${VERDICT_STYLE[view.judge.verdict].className}`}
            >
              {VERDICT_STYLE[view.judge.verdict].label}
            </span>
          </p>
          <p data-ll-quiz-feedback className="mt-2 text-xs leading-5 text-muted">
            {view.judge.feedback}
          </p>
          {quiz && (
            <>
              <p className="mt-2 text-[11px] leading-4 text-muted">{quiz.explanation}</p>
              <button
                type="button"
                onClick={() => setShowAnswer((value) => !value)}
                className={BUTTON_LINK}
              >
                {showAnswer ? 'Hide checkpoints' : 'Show checkpoints'}
              </button>
              {showAnswer && (
                <div className="mt-1 rounded-lg border border-line bg-surface-2 p-2 text-[11px] leading-4 text-muted">
                  <p>{quiz.expectedAnswer}</p>
                  {quiz.acceptablePoints.length > 0 && (
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                      {quiz.acceptablePoints.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" data-ll-quiz-resume onClick={onResume} className={BUTTON_PRIMARY}>
              Resume video
            </button>
            {view.judge.verdict !== 'correct' && (
              <button
                type="button"
                data-ll-quiz-retry-answer
                onClick={onRetryAnswer}
                className={BUTTON_SECONDARY}
              >
                Try this question again
              </button>
            )}
          </div>
        </>
      )}

      {view.kind === 'error' && (
        <>
          <p className="mt-2 text-xs leading-5 text-muted">{view.error.message}</p>
          {view.error.detail && (
            <p className="mt-1 text-[11px] leading-4 text-muted">({view.error.detail})</p>
          )}
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" data-ll-quiz-retry onClick={onRetry} className={BUTTON_SECONDARY}>
              Try again
            </button>
            <button type="button" data-ll-quiz-skip onClick={onSkip} className={BUTTON_LINK}>
              Skip quiz
            </button>
          </div>
        </>
      )}
    </div>
  )
}
