/**
 * How much one chapter's check asks, and how much of the in-between it fills.
 *
 * Both are pure functions of the chapter's length times the viewer's density
 * choice, so the service worker (prompt + validation), the cache key and the UI
 * all agree without a round trip:
 *
 *   fewer    1 choice question per ~4 min, capped at 2
 *   moderate 1 choice question per ~1.5 min, capped at 4
 *   more     1 choice question per ~1 min, capped at 6
 *
 * So a 4–5 minute chapter asks 2 / 4 / 6 questions respectively — and a longer
 * chapter asks for more at every setting. A bigger part of the video holds more
 * worth checking, and multiple choice is cheap to answer — grading is local, no
 * API call. The deep free-response question stays exactly one per chapter: it
 * is the one that reaches Gemini.
 *
 * Facts are the other half: short "did you know" pop-ups read *during* the
 * chapter rather than answered at its end, so their count scales more slowly —
 * one per ~3 minutes, one at least, three at most.
 */
import type { QuizDensity, QuizQuestionKind } from './types'

export const DENSITY_OPTIONS: QuizDensity[] = ['fewer', 'moderate', 'more']

/** Short labels for the switcher; no counts, the chapter length decides those. */
export const DENSITY_LABEL: Record<QuizDensity, string> = {
  fewer: 'Fewer',
  moderate: 'Moderate',
  more: 'More',
}

interface DensityPlan {
  /** Seconds of chapter per multiple-choice question. */
  secondsPerMcq: number
  minMcq: number
  maxMcq: number
}

const DENSITY_PLAN: Record<QuizDensity, DensityPlan> = {
  fewer: { secondsPerMcq: 240, minMcq: 1, maxMcq: 2 },
  moderate: { secondsPerMcq: 90, minMcq: 1, maxMcq: 4 },
  more: { secondsPerMcq: 60, minMcq: 2, maxMcq: 6 },
}

/** The questions a chapter's set holds, in the order they are asked. */
export function planChapterQuestions(
  chapterDurationSec: number,
  density: QuizDensity = 'fewer',
): QuizQuestionKind[] {
  const plan = DENSITY_PLAN[density]
  const perLength = Math.round(chapterDurationSec / plan.secondsPerMcq)
  const mcqCount = Math.min(Math.max(perLength, plan.minMcq), plan.maxMcq)
  return [
    ...Array.from({ length: mcqCount }, (): QuizQuestionKind => 'mcq'),
    // Always last: the free-response one closes the chapter.
    'free-text',
  ]
}

/** One fact per ~3 minutes of chapter, at least one and at most three. */
const FACT_SECONDS = 180
const FACT_MAX = 3

export function planChapterFacts(chapterDurationSec: number): number {
  const perLength = Math.round(chapterDurationSec / FACT_SECONDS)
  return Math.min(Math.max(perLength, 1), FACT_MAX)
}
