/**
 * How many questions a chapter's check gets, and of which kind.
 *
 * A pure function of the chapter's length, so the service worker (prompt +
 * validation), the cache and the UI all agree without a round trip:
 *
 *   under 4 minutes  → [multiple choice, free response]
 *   4 to 8 minutes   → [multiple choice ×2, free response]
 *   over 8 minutes   → [multiple choice ×3, free response]
 *
 * A bigger part of the video holds more worth checking, and multiple choice is
 * cheap to answer — grading is local, no API call. The deep free-response
 * question stays exactly one per chapter, as it always was: it is the one that
 * reaches Gemini.
 */
import type { QuizQuestionKind } from './types'

/** One multiple-choice question per ~4 minutes of chapter, capped at three. */
const MCQ_SECONDS = 240
const MCQ_MAX = 3

export function planChapterQuestions(chapterDurationSec: number): QuizQuestionKind[] {
  const perLength = Math.ceil(chapterDurationSec / MCQ_SECONDS)
  const mcqCount = Math.min(Math.max(perLength, 1), MCQ_MAX)
  return [...Array.from({ length: mcqCount }, (): QuizQuestionKind => 'mcq'), 'free-text']
}
