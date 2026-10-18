/**
 * When the quiz loop should interrupt playback. Pure math, no DOM: one quiz at
 * the end of every eligible chapter, so a quiz about chapter N fires when the
 * viewer crosses into chapter N+1. The last chapter's quiz lands two seconds
 * before the video ends; the loop's 'ended' handler is the safety net for
 * videos where the duration is unknown.
 */
import type { OverviewChapter, QuizCadence } from '../lib/types'

export interface QuizMoment {
  chapterIndex: number
  /** Video position (seconds) that triggers the quiz for that chapter. */
  atSec: number
}

export function computeQuizMoments(
  chapters: OverviewChapter[],
  durationSec: number,
  cadence: QuizCadence,
): QuizMoment[] {
  const moments: QuizMoment[] = []
  for (let index = 0; index < chapters.length; index++) {
    if (index % cadence !== 0) continue
    const chapter = chapters[index]!
    const next = chapters[index + 1]

    let atSec: number
    if (next) {
      atSec = next.startSec
    } else if (durationSec > chapter.startSec + 10) {
      atSec = Math.max(chapter.startSec + 10, durationSec - 2)
    } else {
      // Duration unknown (rare): quiz a couple of minutes into the chapter.
      atSec = chapter.startSec + 120
    }
    if (atSec <= chapter.startSec) atSec = chapter.startSec + 5

    moments.push({ chapterIndex: index, atSec })
  }
  return moments.sort((a, b) => a.atSec - b.atSec)
}
