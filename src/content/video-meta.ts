/**
 * Best-effort video metadata for prompts. Every field has a fallback, so a
 * YouTube markup change can never break generation — only lower its quality.
 */
import type { LlmVideoMeta } from '../lib/types'
import { SELECTORS, findFirstElement } from './selectors'

export function readVideoMeta(durationSec: number, language: string): LlmVideoMeta {
  const heading = findFirstElement(SELECTORS.watchTitle)?.textContent?.trim() ?? ''
  const channel = findFirstElement(SELECTORS.watchChannel)?.textContent?.trim() ?? ''
  const fallbackTitle = document.title.replace(/\s*-\s*YouTube\s*$/, '').trim()

  return {
    title: (heading || fallbackTitle || 'Untitled video').slice(0, 200),
    channel: channel ? channel.slice(0, 120) : null,
    durationSec,
    language,
  }
}
