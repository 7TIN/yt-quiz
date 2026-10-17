/**
 * Strategy B (fallback): caption tracks from the page's player response.
 *
 * The isolated world asks the MAIN-world bridge (src/content/transcript-bridge.ts)
 * via window.postMessage. Both message directions are validated: same window,
 * same origin, and a per-request nonce.
 *
 * Reality check (verified live 2026-10-18): YouTube often returns 200 with an
 * empty body for these track URLs now, so this strategy reports exact failure
 * reasons and Strategy A remains the primary path.
 */
import {
  BRIDGE_REQUEST_TYPE,
  BRIDGE_RESPONSE_TYPE,
  type BridgeCaptionsResponse,
} from './bridge-protocol'
import type { CaptionLine } from './parse'
import { parseJson3Captions } from './parse'

const BRIDGE_TIMEOUT_MS = 8_000

export type CaptionTracksResult =
  | { ok: true; lines: CaptionLine[]; languageCode: string | null; languageLabel: string | null }
  | { ok: false; reason: 'no-bridge' | 'no-tracks' | 'empty-body' | 'fetch-failed' | 'no-player-response' }

function requestCaptionTracks(): Promise<BridgeCaptionsResponse | null> {
  const nonce = crypto.randomUUID()

  return new Promise((resolve) => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin) return
      const data = event.data as BridgeCaptionsResponse | null
      if (!data || data.ll !== BRIDGE_RESPONSE_TYPE) return
      if (data.nonce !== nonce) return
      cleanup()
      resolve(data)
    }

    const timer = window.setTimeout(() => {
      cleanup()
      resolve(null)
    }, BRIDGE_TIMEOUT_MS)

    const cleanup = () => {
      window.removeEventListener('message', onMessage)
      window.clearTimeout(timer)
    }

    window.addEventListener('message', onMessage)
    window.postMessage({ ll: BRIDGE_REQUEST_TYPE, nonce }, location.origin)
  })
}

export async function tryCaptionTracks(): Promise<CaptionTracksResult> {
  const response = await requestCaptionTracks()
  if (response === null) return { ok: false, reason: 'no-bridge' }
  if (!response.ok) return { ok: false, reason: response.reason }

  const lines = parseJson3Captions(response.body)
  if (lines.length === 0) return { ok: false, reason: 'empty-body' }

  return {
    ok: true,
    lines,
    languageCode: response.usedTrack.languageCode,
    languageLabel: response.usedTrack.name,
  }
}
