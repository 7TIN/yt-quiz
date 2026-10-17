/**
 * Parsing helpers for transcript data. Two input shapes exist:
 *
 * - `ytd-transcript-segment-renderer` DOM nodes (Strategy A, the panel).
 * - YouTube's `json3` caption format (Strategy B, caption tracks).
 *
 * Both end up as plain caption lines with start/end seconds.
 */
import {
  TRANSCRIPT_SEGMENT_TEXT_SELECTOR,
  TRANSCRIPT_SEGMENT_TIMESTAMP_SELECTOR,
} from '../selectors'

export interface CaptionLine {
  startSec: number
  endSec: number
  text: string
}

/** "0:07" / "12:34" / "1:02:03" → seconds. Returns null for anything else. */
export function parseTimestampToSeconds(text: string): number | null {
  const parts = text.trim().split(':').map((part) => part.trim())
  if (parts.length < 2 || parts.length > 3) return null
  const numbers = parts.map((part) => (/^\d+$/.test(part) ? Number(part) : Number.NaN))
  if (numbers.some((value) => Number.isNaN(value))) return null

  if (numbers.length === 2) return numbers[0]! * 60 + numbers[1]!
  return numbers[0]! * 3600 + numbers[1]! * 60 + numbers[2]!
}

/** Collapses newlines/tabs/nbsp artifacts that YouTube sometimes emits. */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Reads caption lines from the opened transcript panel.
 * Verified structure (2026-10): each segment is a `ytd-transcript-segment-renderer`
 * containing `.segment-timestamp` and `.segment-text`.
 */
export function readPanelSegments(segments: Iterable<HTMLElement>): CaptionLine[] {
  const lines: CaptionLine[] = []
  for (const element of segments) {
    const timeText = element
      .querySelector<HTMLElement>(TRANSCRIPT_SEGMENT_TIMESTAMP_SELECTOR)
      ?.textContent
    const text = element
      .querySelector<HTMLElement>(TRANSCRIPT_SEGMENT_TEXT_SELECTOR)
      ?.textContent
    if (timeText === undefined || text === undefined) continue

    const startSec = parseTimestampToSeconds(timeText)
    if (startSec === null) continue

    const normalized = normalizeWhitespace(text)
    if (normalized.length === 0) continue

    lines.push({ startSec, endSec: startSec, text: normalized })
  }

  // endSec: each line ends where the next begins; the last one gets a small tail.
  for (let index = 0; index < lines.length - 1; index++) {
    lines[index]!.endSec = lines[index + 1]!.startSec
  }
  const last = lines.at(-1)
  if (last) last.endSec = last.startSec + 5

  return lines
}

interface Json3Event {
  tStartMs?: number
  dDurationMs?: number
  segs?: { utf8?: string }[]
}

/**
 * Parses YouTube's `json3` caption format (used by Strategy B).
 * Returns an empty array for empty/invalid payloads — the caller treats that
 * as "captions unavailable" rather than crashing.
 */
export function parseJson3Captions(body: string): CaptionLine[] {
  let parsed: { events?: Json3Event[] }
  try {
    parsed = JSON.parse(body) as { events?: Json3Event[] }
  } catch {
    return []
  }
  if (!Array.isArray(parsed.events)) return []

  const lines: CaptionLine[] = []
  for (const event of parsed.events) {
    if (!event.segs || typeof event.tStartMs !== 'number') continue
    const text = normalizeWhitespace(event.segs.map((seg) => seg.utf8 ?? '').join(''))
    if (text.length === 0) continue
    const startSec = event.tStartMs / 1000
    lines.push({
      startSec,
      endSec: startSec + (event.dDurationMs ?? 0) / 1000,
      text,
    })
  }
  return lines
}
