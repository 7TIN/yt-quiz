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
 * chapter rather than answered at its end. They are planned over the whole
 * video instead of one chapter at a time: 5 to 15 for the video, scaled by its
 * length, shared out so no chapter gets fewer than 2 or more than 5. The
 * viewer's "facts per chapter" choice scales that envelope (see FACTS_PLAN).
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

interface FactsPlan {
  /** Seconds of video per pop-up: where the video's overall budget comes from. */
  secondsPerFact: number
  /** Bounds for the whole video. */
  minVideo: number
  maxVideo: number
  /** The most one chapter may get at this density. */
  maxChapter: number
}

/** The chapter floor that holds at every density: the spec's own minimum. */
const FACTS_CHAPTER_MIN = 2

/**
 * Fewer / Moderate / More for facts. Moderate is the envelope the feature was
 * specified with (2–5 a chapter, 5–15 a video); Fewer thins each chapter out,
 * More spends the video's whole budget. The chapter floor of two holds at every
 * density — a video cut into many chapters keeps two a chapter even though the
 * video's total then runs past fifteen, because "every chapter gets something"
 * is the rule that has to give way last.
 */
const FACTS_PLAN: Record<QuizDensity, FactsPlan> = {
  fewer: { secondsPerFact: 180, minVideo: 5, maxVideo: 8, maxChapter: 3 },
  moderate: { secondsPerFact: 90, minVideo: 5, maxVideo: 15, maxChapter: 5 },
  more: { secondsPerFact: 60, minVideo: 5, maxVideo: 15, maxChapter: 5 },
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high)
}

/** What the whole video is worth at this density: a short one still gets five. */
export function planVideoFacts(videoDurationSec: number, density: QuizDensity = 'moderate'): number {
  const plan = FACTS_PLAN[density]
  return clamp(Math.round(videoDurationSec / plan.secondsPerFact), plan.minVideo, plan.maxVideo)
}

/**
 * One chapter's share of the video's pop-ups, weighted by how much of the video
 * it is and held inside the chapter band. A short video rounds up so its
 * chapters reach the video's five; a longer one rounds down so a video with a
 * handful of chapters stays inside its fifteen. A very many-chapter video ends
 * up at the floor of two — that is the one rule that beats the video's cap.
 */
export function planChapterFacts(
  chapterDurationSec: number,
  videoDurationSec: number = chapterDurationSec,
  chapterCount = 1,
  density: QuizDensity = 'moderate',
): number {
  const plan = FACTS_PLAN[density]
  const videoTotal = planVideoFacts(videoDurationSec, density)
  const share =
    videoDurationSec > 0
      ? (videoTotal * chapterDurationSec) / videoDurationSec
      : videoTotal / Math.max(1, chapterCount)
  const perChapter = videoTotal <= plan.minVideo ? Math.ceil(share) : Math.floor(share)
  return clamp(perChapter, FACTS_CHAPTER_MIN, plan.maxChapter)
}
