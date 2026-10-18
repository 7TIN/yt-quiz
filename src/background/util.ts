/**
 * Small helpers shared by the Gemini-backed features: tolerant JSON parsing
 * (the model occasionally wraps its reply in a fence despite instructions) and
 * the standard no-key error.
 */
import type { GeminiError } from '../lib/types'

export function noKeyError(): GeminiError {
  return { code: 'no-key', message: 'Add your Gemini API key in the extension settings first.' }
}

/** Strips a ```json fence if the model wrapped its reply despite instructions. */
export function stripFences(text: string): string {
  const trimmed = text.trim()
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed)
  return match ? match[1]! : trimmed
}

export function parseJsonLoose(text: string): unknown {
  try {
    return JSON.parse(stripFences(text))
  } catch {
    return null
  }
}

/**
 * Pulls the complete objects out of an array the model failed to finish.
 *
 * The usual cause is a reply cut off by the output limit (a long chapter asks
 * for several questions): the leading entries are whole, the last one stops
 * mid-object, so `JSON.parse` — and with it the strict validation — throws the
 * whole set away. Walking the text instead and keeping every closed top-level
 * object salvages the questions that did arrive.
 */
export function salvageObjectArray(text: string, key: string): unknown[] {
  const body = stripFences(text)
  const at = body.indexOf(`"${key}"`)
  if (at === -1) return []
  const open = body.indexOf('[', at)
  if (open === -1) return []

  const out: unknown[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  for (let index = open + 1; index < body.length; index++) {
    const char = body[index]!
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') {
      if (depth === 0) start = index
      depth += 1
      continue
    }
    if (char === '}') {
      depth -= 1
      if (depth === 0 && start !== -1) {
        const slice = body.slice(start, index + 1)
        try {
          out.push(JSON.parse(slice))
        } catch {
          // A whole-looking object that still does not parse: skip it.
        }
        start = -1
      }
      if (depth < 0) break
      continue
    }
    if (char === ']' && depth === 0) break
  }

  return out
}
