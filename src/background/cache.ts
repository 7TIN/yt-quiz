/**
 * Persistent cache for Gemini results in chrome.storage.local.
 *
 * Rules from the spec: cached content is never regenerated (only "Clear cache"
 * removes it), the key includes video + language + level + schema version, and
 * storage stays bounded with simple LRU eviction on write.
 */
import type { CacheStats, ClearCacheResult, Level, OverviewData, VideoId } from '../lib/types'

const CACHE_PREFIX = 'll:cache:'
/** Bump when prompts or response schemas change so old entries stop matching. */
export const OVERVIEW_SCHEMA_VERSION = 1
/** Upper bound on cached entries; the oldest writes are evicted first. */
const MAX_CACHE_ENTRIES = 60

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

export async function readOverviewCache(key: string): Promise<OverviewData | null> {
  const stored = await chrome.storage.local.get(key)
  const entry = stored[key] as CacheEntry<OverviewData> | undefined
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
export async function writeOverviewCache(key: string, data: OverviewData): Promise<void> {
  const entry: CacheEntry<OverviewData> = { savedAt: Date.now(), data }
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
