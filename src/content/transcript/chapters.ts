/**
 * Creator chapters ("Chapters" carousel in the description).
 * Verified live 2026-10: each `ytd-macro-markers-list-item-renderer` has a
 * `#time` element ("0:00") and an `h3` title. Markers exist in the DOM even
 * while the description is collapsed.
 */
import type { VideoChapter } from '../../lib/types'
import {
  CHAPTER_MARKER_SELECTOR,
  CHAPTER_MARKER_TIME_SELECTOR,
  CHAPTER_MARKER_TITLE_SELECTOR,
} from '../selectors'
import { normalizeWhitespace, parseTimestampToSeconds } from './parse'

export function readCreatorChapters(): VideoChapter[] {
  const chapters: VideoChapter[] = []
  const markers = document.querySelectorAll<HTMLElement>(CHAPTER_MARKER_SELECTOR)

  for (const marker of markers) {
    const timeText = marker.querySelector<HTMLElement>(CHAPTER_MARKER_TIME_SELECTOR)?.textContent
    const title = marker.querySelector<HTMLElement>(CHAPTER_MARKER_TITLE_SELECTOR)?.textContent
    if (timeText === undefined || timeText === null || title === undefined || title === null) continue

    const startSec = parseTimestampToSeconds(timeText)
    const normalizedTitle = normalizeWhitespace(title)
    if (startSec === null || normalizedTitle.length === 0) continue

    chapters.push({ startSec, title: normalizedTitle })
  }

  // Defensive: drop duplicates, sort by time (the carousel order is stable but
  // older/newer YouTube layouts have been seen in odd orders).
  const seen = new Set<number>()
  return chapters
    .filter((chapter) => {
      if (seen.has(chapter.startSec)) return false
      seen.add(chapter.startSec)
      return true
    })
    .sort((a, b) => a.startSec - b.startSec)
}
