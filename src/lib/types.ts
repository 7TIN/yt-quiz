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
