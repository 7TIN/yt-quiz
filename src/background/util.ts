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
