/**
 * getTranscript(videoId): Strategy A (transcript panel) → Strategy B (caption
 * tracks via the MAIN-world bridge) → a clear user-facing error. Never throws.
 */
import type {
  Transcript,
  TranscriptError,
  TranscriptErrorCode,
  TranscriptProgress,
  TranscriptResult,
  VideoId,
} from '../../lib/types'
import { PLAYER_LIVE_CLASS } from '../selectors'
import { tryCaptionTracks } from './bridge-strategy'
import { readCreatorChapters } from './chapters'
import { chunkCaptionLines, transcriptDurationSec, truncateToTokenBudget } from './normalize'
import type { CaptionLine } from './parse'
import { PanelUnavailableError, scrapeTranscriptPanel } from './panel-strategy'

export interface GetTranscriptOptions {
  onProgress?: TranscriptProgress
}

/** Small in-memory cache; the same video shouldn't be scraped twice per session. */
const transcriptCache = new Map<VideoId, Transcript>()

export function getCachedTranscript(videoId: VideoId): Transcript | null {
  return transcriptCache.get(videoId) ?? null
}

export function clearTranscriptCache(): void {
  transcriptCache.clear()
}

/** Dev harness hook (`?seed=1`): pre-fill the cache so the panel renders a ready state. */
export function seedTranscriptCache(transcript: Transcript): void {
  transcriptCache.set(transcript.videoId, transcript)
}

function isLiveStream(): boolean {
  const player = document.querySelector('#movie_player')
  if (player?.classList.contains(PLAYER_LIVE_CLASS)) return true
  return false
}

function errorResult(code: TranscriptErrorCode, message: string): TranscriptResult {
  return { ok: false, error: { code, message } satisfies TranscriptError }
}

export async function getTranscript(
  videoId: VideoId,
  options: GetTranscriptOptions = {},
): Promise<TranscriptResult> {
  const { onProgress } = options

  const cached = transcriptCache.get(videoId)
  if (cached) return { ok: true, transcript: cached }

  if (isLiveStream()) {
    return errorResult('live-unsupported', "Live streams aren't supported yet — try a regular video.")
  }

  onProgress?.('Opening transcript panel')
  let lines: CaptionLine[] = []
  let language = 'Unknown'
  let languageCode: string | null = null
  let source: Transcript['source'] = 'panel'
  let panelFailure: string | null = null

  try {
    const scraped = await scrapeTranscriptPanel()
    lines = scraped.lines
    language = scraped.language
  } catch (error) {
    panelFailure = error instanceof PanelUnavailableError ? error.message : 'Transcript panel failed'
  }

  if (lines.length === 0) {
    onProgress?.('Trying caption tracks')
    const viaTracks = await tryCaptionTracks()
    if (viaTracks.ok) {
      lines = viaTracks.lines
      language = viaTracks.languageLabel ?? viaTracks.languageCode ?? 'Unknown'
      languageCode = viaTracks.languageCode
      source = 'captions'
    } else {
      return mapStrategyBError(viaTracks.reason, panelFailure)
    }
  }

  onProgress?.('Preparing chunks')
  const rawSegmentCount = lines.length
  const chunks = chunkCaptionLines(lines)
  const { segments, estimatedTokens, truncated } = truncateToTokenBudget(chunks)
  const durationSec = transcriptDurationSec(segments)

  const transcript: Transcript = {
    videoId,
    language,
    languageCode,
    source,
    segments,
    rawSegmentCount,
    durationSec,
    estimatedTokens,
    truncated,
    chapters: readCreatorChapters(),
  }

  transcriptCache.set(videoId, transcript)
  return { ok: true, transcript }
}

function mapStrategyBError(reason: string, panelFailure: string | null): TranscriptResult {
  switch (reason) {
    case 'no-tracks':
      return errorResult(
        'no-tracks',
        panelFailure
          ? `No transcript available for this video (${panelFailure}).`
          : 'This video has no captions, so there is no transcript to read.',
      )
    case 'empty-body':
    case 'fetch-failed':
    case 'no-bridge':
    case 'no-player-response':
      return errorResult(
        'captions-empty',
        panelFailure
          ? `Couldn't read this video's transcript (${panelFailure}).`
          : "YouTube didn't send the caption data for this video.",
      )
    default:
      return errorResult('unknown', 'Something went wrong while reading the transcript.')
  }
}
