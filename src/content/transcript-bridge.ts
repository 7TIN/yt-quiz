/**
 * MAIN-world bridge (declared in manifest.json with "world": "MAIN").
 *
 * Why this exists: content scripts run in an isolated world and cannot read
 * `window.ytInitialPlayerResponse` or call the player's `getPlayerResponse()`.
 * It also performs the caption fetch from the page's own origin, because the
 * timedtext endpoint does not send CORS headers for extension origins.
 *
 * Verified live 2026-10-18: the caption track URLs from the player response can
 * still be fetched same-origin, but YouTube frequently answers 200 with an
 * EMPTY body (no `pot` token). Strategy B therefore reports exact failure
 * reasons instead of pretending to work; the panel strategy is the primary path.
 *
 * This script must never throw into the page: everything is wrapped.
 */
import {
  BRIDGE_REQUEST_TYPE,
  BRIDGE_RESPONSE_TYPE,
  type BridgeCaptionTrack,
  type BridgeCaptionsResponse,
  type BridgeFailureReason,
  type RawCaptionTrack,
  type RawPlayerResponse,
} from './transcript/bridge-protocol'
import { PLAYER_AD_SHOWING_CLASS } from './selectors'

/** Cap shipped caption bodies to avoid bouncing huge strings through postMessage. */
const MAX_BODY_CHARS = 2_000_000

function readPlayerResponse(): RawPlayerResponse | null {
  try {
    const player = document.getElementById('movie_player') as
      | (HTMLElement & { getPlayerResponse?: () => RawPlayerResponse })
      | null
    // During a pre-roll ad the player exposes the AD's response, which has no
    // caption tracks — so only ask the live player when no ad is showing and
    // fall back to the page's initial (real video) response otherwise.
    const adShowing = player?.classList.contains(PLAYER_AD_SHOWING_CLASS) ?? false
    if (player && !adShowing) {
      const fromPlayer = player.getPlayerResponse?.()
      if (fromPlayer) return fromPlayer
    }
    const fromWindow = (window as { ytInitialPlayerResponse?: RawPlayerResponse }).ytInitialPlayerResponse
    return fromWindow ?? null
  } catch {
    return null
  }
}

function extractTracks(response: RawPlayerResponse): RawCaptionTrack[] {
  return response.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []
}

function describeTrack(track: RawCaptionTrack): BridgeCaptionTrack {
  const name = track.name?.simpleText ?? track.name?.runs?.[0]?.text ?? null
  return {
    languageCode: track.languageCode ?? 'unknown',
    kind: track.kind ?? null,
    name,
  }
}

/** Manual English first, then any manual track, then anything (usually ASR). */
function pickPreferredTrack(tracks: RawCaptionTrack[]): RawCaptionTrack | null {
  return (
    tracks.find((track) => track.languageCode === 'en' && track.kind !== 'asr') ??
    tracks.find((track) => track.kind !== 'asr') ??
    tracks[0] ??
    null
  )
}

async function buildResponse(nonce: string): Promise<BridgeCaptionsResponse> {
  const response = readPlayerResponse()
  if (!response) {
    return { ll: BRIDGE_RESPONSE_TYPE, nonce, ok: false, reason: 'no-player-response', tracks: [] }
  }

  const rawTracks = extractTracks(response)
  const tracks = rawTracks.map(describeTrack)
  if (rawTracks.length === 0) {
    return { ll: BRIDGE_RESPONSE_TYPE, nonce, ok: false, reason: 'no-tracks', tracks }
  }

  const track = pickPreferredTrack(rawTracks)
  if (!track?.baseUrl) {
    return { ll: BRIDGE_RESPONSE_TYPE, nonce, ok: false, reason: 'no-tracks', tracks }
  }

  try {
    const url = track.baseUrl.includes('fmt=') ? track.baseUrl : `${track.baseUrl}&fmt=json3`
    const res = await fetch(url, { credentials: 'include' })
    const body = await res.text()
    if (body.length === 0) {
      return { ll: BRIDGE_RESPONSE_TYPE, nonce, ok: false, reason: 'empty-body', tracks }
    }
    return {
      ll: BRIDGE_RESPONSE_TYPE,
      nonce,
      ok: true,
      tracks,
      usedTrack: describeTrack(track),
      status: res.status,
      body: body.slice(0, MAX_BODY_CHARS),
    }
  } catch {
    return {
      ll: BRIDGE_RESPONSE_TYPE,
      nonce,
      ok: false,
      reason: 'fetch-failed' as BridgeFailureReason,
      tracks,
    }
  }
}

window.addEventListener('message', (event) => {
  // Strict checks: same window, same origin, exact message shape.
  if (event.source !== window) return
  if (event.origin !== location.origin) return
  const data = event.data as { ll?: unknown; nonce?: unknown } | null
  if (!data || data.ll !== BRIDGE_REQUEST_TYPE || typeof data.nonce !== 'string') return

  const nonce = data.nonce
  void buildResponse(nonce)
    .then((response) => {
      window.postMessage(response, event.origin)
    })
    .catch(() => {
      const failure: BridgeCaptionsResponse = {
        ll: BRIDGE_RESPONSE_TYPE,
        nonce,
        ok: false,
        reason: 'fetch-failed',
        tracks: [],
      }
      window.postMessage(failure, event.origin)
    })
})
