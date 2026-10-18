/**
 * Typed bridge between page context (content script / options page) and the
 * service worker. The worker is the only place that knows the API key, so all
 * API work goes through these messages.
 *
 * Dev harness: on plain file:// pages there is no chrome.runtime, so a small
 * stub answers from window.__llDevSeed (set by src/dev/seed.ts) instead.
 */
import type { DevSeed, LlRequest, LlResponse } from '../lib/types'

declare global {
  interface Window {
    __llDevSeed?: DevSeed
  }
}

function unavailable<T>(message: string): LlResponse<T> {
  return { ok: false, error: { code: 'unknown', message } }
}

const NO_KEY: LlResponse<never> = {
  ok: false,
  error: { code: 'no-key', message: 'Add your Gemini API key in the extension settings first.' },
}

export async function sendToBackground<T>(request: LlRequest): Promise<LlResponse<T>> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) return devStub<T>(request)
  try {
    const response = (await chrome.runtime.sendMessage(request)) as LlResponse<T> | undefined
    return response ?? unavailable<T>('The background worker sent no reply. Reload the page and try again.')
  } catch {
    return unavailable<T>('Could not reach the extension background worker. Reload the page and try again.')
  }
}

/** Dev-only fallback (never used inside the installed extension). */
async function devStub<T>(request: LlRequest): Promise<LlResponse<T>> {
  const seed = window.__llDevSeed
  switch (request.type) {
    case 'll:settings:get':
      return {
        ok: true,
        data: seed?.settings ?? {
          hasKey: false,
          model: 'gemini-3.5-flash-lite',
          level: 'intermediate',
          quizEvery: 1,
          density: 'fewer',
          factsDensity: 'moderate',
        },
      } as LlResponse<T>
    case 'll:overview:get':
      return { ok: true, data: seed?.overview ?? null } as LlResponse<T>
    case 'll:overview:generate':
      return (seed ? { ok: true, data: seed.overview } : NO_KEY) as LlResponse<T>
    case 'll:quiz:generate':
      return (seed?.quizSet ? { ok: true, data: seed.quizSet } : NO_KEY) as LlResponse<T>
    case 'll:facts:generate':
      return (seed?.facts ? { ok: true, data: seed.facts } : NO_KEY) as LlResponse<T>
    case 'll:answer:judge':
      return (seed?.judge ? { ok: true, data: seed.judge } : NO_KEY) as LlResponse<T>
    case 'll:cache:stats':
      return { ok: true, data: { entries: seed ? 1 : 0, bytes: 0 } } as LlResponse<T>
    case 'll:cache:clear':
      return { ok: true, data: { removed: 0 } } as LlResponse<T>
    case 'll:key:test':
      return NO_KEY as LlResponse<T>
    default:
      return { ok: true, data: null } as LlResponse<T>
  }
}
