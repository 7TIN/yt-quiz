import { useCallback, useEffect, useRef, useState } from 'react'
import { getCachedTranscript, getTranscript } from '../content/transcript'
import { formatTimestamp } from '../lib/format'
import type { Transcript, TranscriptError, VideoId } from '../lib/types'

type CardState =
  | { status: 'idle' }
  | { status: 'reading'; step: string }
  | { status: 'ready'; transcript: Transcript }
  | { status: 'error'; error: TranscriptError }

export type TranscriptCardStatus = CardState['status']

interface TranscriptCardProps {
  videoId: VideoId
  /** Fires when the transcript becomes available (drives the overview card). */
  onReady?: (transcript: Transcript) => void
  /** Reports the card status up (drives the one-click start flow). */
  onStateChange?: (status: TranscriptCardStatus, message?: string) => void
  /** Incremented by the one-click start: read now if idle or after an error. */
  startSignal?: number
}

/** Format token counts compactly: 12400 → "12.4k". */
function formatTokens(tokens: number): string {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`
  return String(tokens)
}

export function TranscriptCard({ videoId, onReady, onStateChange, startSignal }: TranscriptCardProps) {
  const [state, setState] = useState<CardState>(() => {
    const cached = getCachedTranscript(videoId)
    return cached ? { status: 'ready', transcript: cached } : { status: 'idle' }
  })
  const readingRef = useRef(false)

  useEffect(() => {
    if (state.status === 'ready') onReady?.(state.transcript)
  }, [state, onReady])

  useEffect(() => {
    onStateChange?.(state.status, state.status === 'error' ? state.error.message : undefined)
  }, [state, onStateChange])

  const readTranscript = useCallback(async () => {
    if (readingRef.current) return
    readingRef.current = true
    setState({ status: 'reading', step: 'Opening transcript panel' })
    try {
      const result = await getTranscript(videoId, {
        onProgress: (step) => setState({ status: 'reading', step }),
      })
      setState(
        result.ok
          ? { status: 'ready', transcript: result.transcript }
          : { status: 'error', error: result.error },
      )
    } finally {
      readingRef.current = false
    }
  }, [videoId])

  // One-click start. Only a *new* signal acts, and only once the card has
  // settled — a read already in flight is left alone.
  const lastSignalRef = useRef(0)
  useEffect(() => {
    if (startSignal === undefined || startSignal === lastSignalRef.current) return
    if (state.status === 'reading') return
    lastSignalRef.current = startSignal
    if (state.status === 'idle' || state.status === 'error') void readTranscript()
  }, [startSignal, state, readTranscript])

  if (state.status === 'idle') {
    return (
      <div data-ll-transcript-state="idle">
        <p className="text-xs text-muted">
          Read this video&apos;s transcript to unlock chapters, quizzes and Q&amp;A.
        </p>
        <button
          type="button"
          onClick={() => void readTranscript()}
          className="mt-2.5 inline-flex h-8 items-center rounded-full bg-indigo-600 px-3.5 font-medium text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 motion-safe:transition-colors motion-safe:duration-150"
        >
          Read transcript
        </button>
        <p className="mt-2 text-[11px] leading-4 text-muted">
          Uses YouTube&apos;s own transcript panel for this video. Nothing leaves your browser.
        </p>
      </div>
    )
  }

  if (state.status === 'reading') {
    return (
      <div data-ll-transcript-state="reading" aria-busy="true">
        <div className="motion-safe:animate-pulse space-y-1.5">
          <div className="h-2.5 w-3/4 rounded-full bg-line" />
          <div className="h-2.5 w-full rounded-full bg-line" />
          <div className="h-2.5 w-1/2 rounded-full bg-line" />
        </div>
        <p role="status" className="mt-2.5 text-xs text-muted">
          {state.step}…
        </p>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div data-ll-transcript-state="error">
        <p className="text-xs text-muted">{state.error.message}</p>
        <button
          type="button"
          onClick={() => void readTranscript()}
          className="mt-2.5 inline-flex h-8 items-center rounded-full border border-line px-3.5 font-medium hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 motion-safe:transition-colors motion-safe:duration-150"
        >
          Try again
        </button>
        <p className="mt-2 text-[11px] leading-4 text-muted">
          If it keeps failing, reload the page once — YouTube sometimes needs a fresh player.
        </p>
      </div>
    )
  }

  const { transcript } = state
  const preview = transcript.segments.slice(0, 3)

  return (
    <div data-ll-transcript-state="ready">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <Stat label="Language" value={transcript.language} />
        <Stat label="Duration" value={formatTimestamp(transcript.durationSec)} />
        <Stat label="Chunks" value={String(transcript.segments.length)} />
        <Stat label="~Tokens" value={formatTokens(transcript.estimatedTokens)} />
      </dl>

      <p className="mt-2 text-[11px] leading-4 text-muted">
        {transcript.rawSegmentCount} caption lines merged into {transcript.segments.length} chunks ·
        source: {transcript.source === 'panel' ? 'YouTube transcript panel' : 'caption tracks'}
      </p>

      {transcript.truncated && (
        <p className="mt-2 rounded-lg border border-amber-300/60 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-4 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          This is a very long transcript — it was shortened to fit the size limit.
        </p>
      )}

      {transcript.chapters.length > 0 && (
        <p className="mt-2">
          <span className="inline-flex items-center rounded-full border border-line px-2 py-0.5 text-[11px] leading-4 text-muted">
            YouTube chapters: {transcript.chapters.length}
          </span>
        </p>
      )}

      <div className="mt-2.5 border-t border-line pt-2.5">
        <p className="text-[11px] font-medium text-muted">
          Preview — first {preview.length} chunk{preview.length === 1 ? '' : 's'}
        </p>
        <ul data-ll-transcript-preview className="mt-1.5 space-y-2">
          {preview.map((segment) => (
            <li key={segment.startSec} className="flex gap-2 text-xs">
              <span className="mt-0.5 shrink-0 rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted">
                {formatTimestamp(segment.startSec)}
              </span>
              <span className="min-w-0 text-muted">{segment.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  )
}
