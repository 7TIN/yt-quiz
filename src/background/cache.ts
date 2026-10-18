/**
 * Persistent cache for Gemini results in chrome.storage.local.
 *
 * Rules from the spec: cached content is never regenerated (only "Clear cache"
 * removes it), keys include video + language + level + schema version, and
 * storage stays bounded with simple LRU eviction on write.
 *
 * Kinds of entries, all sharing one LRU pool:
 *  - overview:<video>:<lang>:<level>:v1
 *  - quiz:<video>:<lang>:<level>:v1:ch<i>@<startSec>
 *  - judge:<video>:<level>:ch<i>@<startSec>:<answerHash>
 */
import type { CacheStats, ClearCacheResult, Level, VideoId } from '../lib/types'

const CACHE_PREFIX = 'll:cache:'
/** Bump when prompts or response schemas change so old entries stop matching. */
export const OVERVIEW_SCHEMA_VERSION = 1
export const QUIZ_SCHEMA_VERSION = 1
/**
 * Upper bound on cached entries across all kinds; the oldest writes are
 * evicted first. One long video can plausibly add ~10 quiz entries + a few
 * verdicts, so this is deliberately roomier than the Phase 3 cap.
 */
const MAX_CACHE_ENTRIES = 120

interface CacheEntry<T> {
  savedAt: number
  data: T
}

/** "English (auto-generated)" → "english-auto-generated"; empty → "unknown". */
export function slugifyLanguage(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'unknown'
}

export function overviewCacheKey(videoId: VideoId, languageTag: string, level: Level): string {
  return `${CACHE_PREFIX}overview:${videoId}:${languageTag}:${level}:v${OVERVIEW_SCHEMA_VERSION}`
}

/**
 * One question per chapter. The chapter's startSec is part of the key so that
 * if the creator re-edits the chapters, stale questions stop matching instead
 * of being asked about the wrong part of the video.
 */
export function quizCacheKey(
  videoId: VideoId,
  languageTag: string,
  level: Level,
  chapterIndex: number,
  chapterStartSec: number,
): string {
  return `${CACHE_PREFIX}quiz:${videoId}:${languageTag}:${level}:v${QUIZ_SCHEMA_VERSION}:ch${chapterIndex}@${Math.round(chapterStartSec)}`
}

/** Judging the same answer to the same question twice never calls Gemini twice. */
export function judgeCacheKey(
  videoId: VideoId,
  level: Level,
  chapterIndex: number,
  chapterStartSec: number,
  answerHash: string,
): string {
  return `${CACHE_PREFIX}judge:${videoId}:${level}:ch${chapterIndex}@${Math.round(chapterStartSec)}:${answerHash}`
}

export async function readCacheEntry<T>(key: string): Promise<T | null> {
  const stored = await chrome.storage.local.get(key)
  const entry = stored[key] as CacheEntry<T> | undefined
  return entry?.data ?? null
}

async function listCacheKeys(): Promise<{ key: string; savedAt: number }[]> {
  const all = await chrome.storage.local.get(null)
  const rows: { key: string; savedAt: number }[] = []
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(CACHE_PREFIX)) continue
    const entry = value as Partial<CacheEntry<unknown>> | undefined
    rows.push({ key, savedAt: typeof entry?.savedAt === 'number' ? entry.savedAt : 0 })
  }
  return rows
}

/** Bounded write: after storing, the oldest entries past the cap are removed. */
export async function writeCacheEntry<T>(key: string, data: T): Promise<void> {
  const entry: CacheEntry<T> = { savedAt: Date.now(), data }
  await chrome.storage.local.set({ [key]: entry })

  const rows = await listCacheKeys()
  if (rows.length > MAX_CACHE_ENTRIES) {
    rows.sort((a, b) => a.savedAt - b.savedAt)
    const excess = rows.slice(0, rows.length - MAX_CACHE_ENTRIES).map((row) => row.key)
    await chrome.storage.local.remove(excess)
  }
}

export async function cacheStats(): Promise<CacheStats> {
  const all = await chrome.storage.local.get(null)
  let entries = 0
  let bytes = 0
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(CACHE_PREFIX)) continue
    entries += 1
    // Character count is a good-enough size estimate; values are JSON-cloned.
    bytes += key.length + JSON.stringify(value).length
  }
  return { entries, bytes }
}

export async function clearCache(): Promise<ClearCacheResult> {
  const rows = await listCacheKeys()
  if (rows.length > 0) await chrome.storage.local.remove(rows.map((row) => row.key))
  return { removed: rows.length }
}
