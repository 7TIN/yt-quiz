/** Which theme the panel follows. Mirrors YouTube's own light/dark setting. */
export type ThemeMode = 'light' | 'dark'

/** Where the panel ended up in the page. */
export type PanelPlacement = 'secondary' | 'below' | 'floating'

/** YouTube video id (the `v` query parameter on /watch pages). */
export type VideoId = string

/* ------------------------------------------------------------------ */
/* Transcript (Phase 2)                                               */
/* ------------------------------------------------------------------ */

/** A merged ~20-30s slice of the transcript, what prompts are built from. */
export interface TranscriptSegment {
  startSec: number
  endSec: number
  text: string
}

/** A chapter as published by the video's creator on YouTube. */
export interface VideoChapter {
  startSec: number
  title: string
}

/** Where the transcript text came from. */
export type TranscriptSource = 'panel' | 'captions'

export interface Transcript {
  videoId: VideoId
  /** Human label, e.g. "English" (whatever track YouTube used by default). */
  language: string
  languageCode: string | null
  source: TranscriptSource
  /** Merged chunks, ready for prompting. */
  segments: TranscriptSegment[]
  /** Raw caption lines before merging (for diagnostics/UI). */
  rawSegmentCount: number
  durationSec: number
  estimatedTokens: number
  /** True when the transcript was cut down to fit the token budget. */
  truncated: boolean
  /** Creator chapters, if the video has any; else empty (Gemini will make them in Phase 3). */
  chapters: VideoChapter[]
}

export type TranscriptErrorCode =
  | 'live-unsupported'
  | 'no-tracks'
  | 'panel-unavailable'
  | 'captions-empty'
  | 'timeout'
  | 'video-changed'
  | 'unknown'

export interface TranscriptError {
  code: TranscriptErrorCode
  /** Plain-language message, safe to show in the panel as-is. */
  message: string
}

export type TranscriptResult =
  | { ok: true; transcript: Transcript }
  | { ok: false; error: TranscriptError }

/** Progress callback used to drive the panel's loading steps. */
export type TranscriptProgress = (step: string) => void

/* ------------------------------------------------------------------ */
/* Gemini + overview (Phase 3)                                        */
/* ------------------------------------------------------------------ */

/** Depth explanations, quizzes and facts are tuned to. Part of the cache key. */
export type Level = 'beginner' | 'intermediate' | 'advanced'

/** Everything the panel knows about the video that prompts may use. */
export interface LlmVideoMeta {
  title: string
  channel: string | null
  durationSec: number
  /** Human language label from the transcript, e.g. "English". */
  language: string
}

/** One chapter of the generated overview (creator chapters are preserved). */
export interface OverviewChapter {
  startSec: number
  title: string
  summary: string
}

/** The persisted + displayed result of one Gemini overview call. */
export interface OverviewData {
  overview: string
  takeaways: string[]
  chapters: OverviewChapter[]
  /** Epoch ms; used for cache bookkeeping and the options page. */
  generatedAt: number
}

/** Error codes shared by every Gemini-backed feature. */
export type GeminiErrorCode =
  | 'no-key'
  | 'invalid-key'
  | 'model-not-found'
  | 'rate-limit'
  | 'network'
  | 'timeout'
  | 'blocked'
  | 'empty'
  | 'schema'
  | 'server'
  | 'bad-request'
  | 'unknown'

export interface GeminiError {
  code: GeminiErrorCode
  /** Plain-language message, safe to render as text in the panel. */
  message: string
  /** Short sanitized detail from Google for diagnostics (never the key). */
  detail?: string
}

/** Settings the content script and options page may see. Never contains the key. */
export interface LlSettings {
  hasKey: boolean
  model: string
  level: Level
}

/** Cache lookup input — what identifies "this video's overview". */
export interface OverviewGetInput {
  videoId: VideoId
  languageCode: string | null
  languageLabel: string
  level: Level
}

/** Everything needed to generate + cache a fresh overview. */
export interface OverviewGenerateInput extends OverviewGetInput {
  meta: LlmVideoMeta
  chapters: VideoChapter[]
  segments: TranscriptSegment[]
  truncated: boolean
}

export interface KeyTestResult {
  model: string
  latencyMs: number
}

export interface CacheStats {
  entries: number
  bytes: number
}

export interface ClearCacheResult {
  removed: number
}

/** Message union between the content script/options page and the service worker. */
export type LlRequest =
  | { type: 'll:settings:get' }
  | { type: 'll:settings:save'; apiKey?: string; model?: string; level?: Level }
  | { type: 'll:settings:remove-key' }
  | { type: 'll:key:test' }
  | { type: 'll:overview:get'; input: OverviewGetInput }
  | { type: 'll:overview:generate'; input: OverviewGenerateInput }
  | { type: 'll:cache:stats' }
  | { type: 'll:cache:clear' }
  | { type: 'll:open-options' }

export type LlResponse<T> = { ok: true; data: T } | { ok: false; error: GeminiError }

/**
 * Dev harness only (`?seed=1` on the file:// preview): lets the panel render
 * transcript + overview states without the extension or an API key.
 */
export interface DevSeed {
  settings: LlSettings
  overview: OverviewData
}
