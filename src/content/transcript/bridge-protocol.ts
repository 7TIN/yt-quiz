/**
 * Message protocol between the isolated content script and the MAIN-world
 * bridge (src/content/transcript-bridge.ts). Kept dependency-free so both
 * bundles can inline it.
 *
 * Both sides check `event.source === window`, `event.origin === location.origin`
 * and a per-request nonce. The bridge only ever exposes data the page already
 * has (caption track list + fetched caption body) — no extension internals.
 */
export const BRIDGE_REQUEST_TYPE = 'learning-loop:captions-request'
export const BRIDGE_RESPONSE_TYPE = 'learning-loop:captions-response'

export interface BridgeCaptionTrack {
  languageCode: string
  /** 'asr' for auto-generated, null/undefined for manual captions. */
  kind: string | null
  /** Human name, e.g. "English (auto-generated)". */
  name: string | null
}

export interface BridgeCaptionsRequest {
  ll: typeof BRIDGE_REQUEST_TYPE
  nonce: string
}

export type BridgeFailureReason =
  /** The player did not expose a player response at all. */
  | 'no-player-response'
  /** The player response exists but the video has no caption tracks. */
  | 'no-tracks'
  /** Fetching the caption track threw (network/CORS). */
  | 'fetch-failed'
  /** Fetch returned success with an empty body (the common 2026 outcome). */
  | 'empty-body'

export type BridgeCaptionsResponse =
  | {
      ll: typeof BRIDGE_RESPONSE_TYPE
      nonce: string
      ok: true
      tracks: BridgeCaptionTrack[]
      usedTrack: BridgeCaptionTrack
      status: number
      /** json3 caption body. */
      body: string
    }
  | {
      ll: typeof BRIDGE_RESPONSE_TYPE
      nonce: string
      ok: false
      reason: BridgeFailureReason
      tracks: BridgeCaptionTrack[]
    }

/** Shape of the (untyped) page objects the bridge reads. Match loosely on purpose. */
export interface RawCaptionTrack {
  baseUrl?: string
  languageCode?: string
  kind?: string
  name?: { simpleText?: string; runs?: { text?: string }[] }
}

export interface RawPlayerResponse {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: RawCaptionTrack[]
    }
  }
}
