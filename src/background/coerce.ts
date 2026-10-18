/**
 * Coercion helpers shared by the Gemini-backed per-chapter features.
 *
 * The payloads are model prose wearing a JSON hat: live traffic drifts — an
 * index sent as "B", a timestamp sent as "2:03", a list of `{ text }` objects
 * where strings were asked for. Both the question set and the facts read all of
 * that the same way from here, so one odd field costs one entry at most.
 */

/** Text out of a value that should be a string but is sometimes a number. */
export function asText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

/** Seconds out of a number, "88", "88s", "1:28" or "1:02:03". */
export function asSeconds(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = asText(value)
  if (!text) return null
  const clock = /^(?:(\d+):)?([0-5]?\d):([0-5]?\d)$/.exec(text)
  if (clock) {
    const [, hours, minutes, seconds] = clock
    return Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds)
  }
  const plain = Number.parseFloat(text.replace(/[^\d.-]/g, ''))
  return Number.isFinite(plain) ? plain : null
}

/** A short string list out of an array of strings, numbers or `{ text }` objects. */
export function asList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const entry of value) {
    const record =
      typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : null
    const text = asText(record ? (record.text ?? record.point ?? record.value ?? record.hint) : entry)
    if (text) out.push(text)
    if (out.length >= max) break
  }
  return out
}

/** Clamp a model-written timestamp into the chapter it belongs to. */
export function clampChapterSec(
  atSec: number,
  chapterStartSec: number,
  chapterDurationSec: number,
): number {
  const from = Math.max(0, Math.floor(chapterStartSec))
  const raw = Math.max(0, Math.floor(atSec))
  if (chapterDurationSec <= 0) return Math.max(from, raw)
  return Math.min(Math.max(raw, from), from + Math.ceil(chapterDurationSec))
}
