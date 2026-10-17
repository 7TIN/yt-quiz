/**
 * Turns raw caption lines into prompt-friendly chunks and enforces the token
 * budget. Pure functions — no DOM access — so the behaviour is easy to reason
 * about and test.
 */
import type { TranscriptSegment } from '../../lib/types'
import type { CaptionLine } from './parse'

/** Target chunk length: captions are tiny (2-5s) and useless as prompt units. */
const TARGET_CHUNK_SECONDS = 25
/** A trailing chunk shorter than this gets merged into its predecessor. */
const MIN_TRAILING_CHUNK_SECONDS = 8
/** Rough token estimate: ~4 characters per token. */
const CHARS_PER_TOKEN = 4
/** Truncate transcripts beyond this many tokens (with a visible warning). */
export const MAX_TRANSCRIPT_TOKENS = 250_000

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/** Merges consecutive caption lines into ~TARGET_CHUNK_SECONDS chunks. */
export function chunkCaptionLines(lines: readonly CaptionLine[]): TranscriptSegment[] {
  const chunks: TranscriptSegment[] = []
  let current: { startSec: number; endSec: number; parts: string[] } | null = null

  for (const line of lines) {
    if (current === null) {
      current = { startSec: line.startSec, endSec: line.endSec, parts: [line.text] }
      continue
    }
    const wouldSpan = line.endSec - current.startSec
    if (wouldSpan <= TARGET_CHUNK_SECONDS) {
      current.endSec = Math.max(current.endSec, line.endSec)
      current.parts.push(line.text)
    } else {
      chunks.push({ startSec: current.startSec, endSec: current.endSec, text: current.parts.join(' ') })
      current = { startSec: line.startSec, endSec: line.endSec, parts: [line.text] }
    }
  }
  if (current !== null) {
    chunks.push({ startSec: current.startSec, endSec: current.endSec, text: current.parts.join(' ') })
  }

  // Merge a short leftover tail (e.g. the last 3 seconds of a video).
  if (chunks.length >= 2) {
    const last = chunks.at(-1)!
    if (last.endSec - last.startSec < MIN_TRAILING_CHUNK_SECONDS) {
      const previous = chunks[chunks.length - 2]!
      previous.endSec = last.endSec
      previous.text = `${previous.text} ${last.text}`
      chunks.pop()
    }
  }

  return chunks
}

export interface TruncationResult {
  segments: TranscriptSegment[]
  estimatedTokens: number
  truncated: boolean
}

/** Cuts chunks at a token budget, always keeping at least one chunk. */
export function truncateToTokenBudget(
  segments: readonly TranscriptSegment[],
  maxTokens = MAX_TRANSCRIPT_TOKENS,
): TruncationResult {
  const kept: TranscriptSegment[] = []
  let tokens = 0
  let truncated = false

  for (const segment of segments) {
    const segmentTokens = estimateTokens(segment.text)
    if (kept.length > 0 && tokens + segmentTokens > maxTokens) {
      truncated = true
      break
    }
    kept.push(segment)
    tokens += segmentTokens
  }

  return { segments: kept, estimatedTokens: tokens, truncated }
}

/** Total duration covered by the chunks (seconds). */
export function transcriptDurationSec(segments: readonly TranscriptSegment[]): number {
  const last = segments.at(-1)
  return last ? Math.round(last.endSec) : 0
}

export function formatTimestamp(totalSec: number): string {
  const seconds = Math.max(0, Math.floor(totalSec))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
  return `${minutes}:${String(rest).padStart(2, '0')}`
}
