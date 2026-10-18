/**
 * Where the viewer got to in each chapter's check.
 *
 * The loop pauses at a spot, asks the chapter's set, and remembers which
 * questions were answered. A spot is only "done" once every question is
 * answered — a half-finished one stays unfinished (amber dot, a Continue row
 * in the panel) and reopens exactly where it left off, even after a reload.
 *
 * Stored in chrome.storage.local under `ll:loop:<videoId>:<lang>:<level>` (the
 * content script owns this key; the service worker never reads it — it only
 * removes it with the cache). On the dev harness (file://, no chrome.storage)
 * an in-memory map keeps the same shape so the loop still works.
 */
import { slugifyLanguage } from '../lib/format'
import type { Level, LoopProgress, MomentProgress, VideoId } from '../lib/types'

const PROGRESS_PREFIX = 'll:loop:'

/** The shape every spot starts from. */
export function emptyMomentProgress(): MomentProgress {
  return { total: 0, answered: [], skipped: false }
}

/**
 * "ch2@137" — a chapter's identity inside the progress record. Same idea as
 * the quiz cache key (and rounded the same way): if the creator re-edits the
 * chapters, a stale entry simply stops matching.
 */
export function chapterKey(chapterIndex: number, chapterStartSec: number): string {
  return `ch${chapterIndex}@${Math.round(chapterStartSec)}`
}

export function progressStorageKey(videoId: VideoId, languageTag: string, level: Level): string {
  return `${PROGRESS_PREFIX}${videoId}:${languageTag}:${level}`
}

/** Everything the loop needs, with one call: tag included. */
export function progressKeyFor(
  videoId: VideoId,
  languageCode: string | null,
  languageLabel: string,
  level: Level,
): string {
  return progressStorageKey(videoId, slugifyLanguage(languageCode ?? languageLabel), level)
}

const memoryFallback = new Map<string, LoopProgress>()

function hasStorage(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local)
}

/** Guards against anything that was not written by this version. */
function sanitize(value: unknown): LoopProgress {
  if (typeof value !== 'object' || value === null) return {}
  const out: LoopProgress = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>
    const total =
      typeof record.total === 'number' && Number.isFinite(record.total)
        ? Math.min(8, Math.max(0, Math.floor(record.total)))
        : 0
    const answered = Array.isArray(record.answered)
      ? [
          ...new Set(
            record.answered.filter(
              (index): index is number =>
                typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < total,
            ),
          ),
        ].sort((a, b) => a - b)
      : []
    out[key] = { total, answered, skipped: record.skipped === true }
  }
  return out
}

export async function readLoopProgress(key: string): Promise<LoopProgress> {
  if (!hasStorage()) return memoryFallback.get(key) ?? {}
  try {
    const stored = await chrome.storage.local.get(key)
    return sanitize(stored[key])
  } catch {
    return {}
  }
}

/** Best effort: losing a progress write only costs a re-ask, never data. */
export async function writeLoopProgress(key: string, progress: LoopProgress): Promise<void> {
  if (!hasStorage()) {
    memoryFallback.set(key, progress)
    return
  }
  try {
    await chrome.storage.local.set({ [key]: progress })
  } catch {
    // Ignore — see above.
  }
}
