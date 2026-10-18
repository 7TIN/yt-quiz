/**
 * Background data for the one-click Start flow. The panel itself never renders
 * the transcript or the overview — it is a status card with the quiz living
 * over the video — so the two state machines that used to be cards live here
 * as hooks, and PanelApp just watches them.
 *
 * Both hooks are "run when signalled": they stay idle until the start signal
 * arrives (incremented by Start), which is the moment the user asked for the
 * work — and the only moment anything can reach Gemini.
 */
import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import { sendToBackground } from '../content/messaging'
import { getCachedTranscript, getTranscript } from '../content/transcript'
import { readVideoMeta } from '../content/video-meta'
import type {
  GeminiError,
  Level,
  LlSettings,
  OverviewData,
  OverviewGenerateInput,
  OverviewGetInput,
  Transcript,
  VideoId,
} from '../lib/types'

export interface TranscriptRead {
  status: 'idle' | 'reading' | 'ready' | 'error'
  transcript: Transcript | null
  /** Human-readable reason when status is 'error'. */
  message: string | null
}

/** Reads (and caches) the video's transcript when the start signal arrives. */
export function useTranscriptRead(videoId: VideoId, startSignal: number): TranscriptRead {
  const [state, setState] = useState<TranscriptRead>(() => {
    const cached = getCachedTranscript(videoId)
    return cached
      ? { status: 'ready', transcript: cached, message: null }
      : { status: 'idle', transcript: null, message: null }
  })
  const readingRef = useRef(false)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const read = useCallback(async () => {
    if (readingRef.current) return
    readingRef.current = true
    setState({ status: 'reading', transcript: null, message: null })
    try {
      const result = await getTranscript(videoId, {})
      if (!aliveRef.current) return
      setState(
        result.ok
          ? { status: 'ready', transcript: result.transcript, message: null }
          : { status: 'error', transcript: null, message: result.error.message },
      )
    } finally {
      readingRef.current = false
    }
  }, [videoId])

  // Only a *new* signal acts, and not while a read is already in flight.
  const lastSignalRef = useRef(0)
  useEffect(() => {
    if (startSignal === lastSignalRef.current) return
    if (state.status === 'reading') return
    lastSignalRef.current = startSignal
    if (state.status === 'idle' || state.status === 'error') void read()
  }, [startSignal, state, read])

  return state
}

export interface OverviewBuild {
  /** 'loading' is the settings + cache lookup; the panel never shows it. */
  status: 'loading' | 'idle' | 'no-key' | 'building' | 'ready' | 'error'
  overview: OverviewData | null
  message: string | null
  /** True when the options page can fix this (key or model problem). */
  canOpenSettings: boolean
}

type BuildState =
  | { status: 'loading' }
  | { status: 'no-key' }
  | { status: 'idle'; settings: LlSettings }
  | { status: 'building'; settings: LlSettings }
  | { status: 'ready'; settings: LlSettings; overview: OverviewData }
  | { status: 'error'; settings: LlSettings | null; error: GeminiError }

function toGetInput(videoId: VideoId, transcript: Transcript, level: Level): OverviewGetInput {
  return {
    videoId,
    languageCode: transcript.languageCode,
    languageLabel: transcript.language,
    level,
  }
}

/** Error codes that a trip to the options page can actually fix. */
function fixableInSettings(code: GeminiError['code']): boolean {
  return code === 'no-key' || code === 'invalid-key' || code === 'model-not-found'
}

/**
 * Settings → cache lookup once the transcript exists, then one generation per
 * start signal. Everything downstream (question, verdict) is keyed off this
 * overview, so the panel treats "overview in memory" as "loop ready".
 */
export function useOverviewBuild(
  videoId: VideoId,
  transcript: Transcript | null,
  startSignal: number,
): OverviewBuild {
  const [state, setState] = useState<BuildState>({ status: 'loading' })
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  // Nothing is generated here — this only reads settings and the cache.
  useEffect(() => {
    if (!transcript) return
    let cancelled = false

    const load = async () => {
      const settingsRes = await sendToBackground<LlSettings>({ type: 'll:settings:get' })
      if (cancelled) return
      if (!settingsRes.ok) {
        setState({ status: 'error', settings: null, error: settingsRes.error })
        return
      }
      const settings = settingsRes.data
      if (!settings.hasKey) {
        setState({ status: 'no-key' })
        return
      }
      const cachedRes = await sendToBackground<OverviewData | null>({
        type: 'll:overview:get',
        input: toGetInput(videoId, transcript, settings.level),
      })
      if (cancelled) return
      if (!cachedRes.ok) {
        setState({ status: 'error', settings, error: cachedRes.error })
        return
      }
      setState(
        cachedRes.data
          ? { status: 'ready', settings, overview: cachedRes.data }
          : { status: 'idle', settings },
      )
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [videoId, transcript])

  const generate = useCallback(
    async (settings: LlSettings) => {
      setState({ status: 'building', settings })
      const input: OverviewGenerateInput = {
        ...toGetInput(videoId, transcript!, settings.level),
        meta: readVideoMeta(transcript!.durationSec, transcript!.language),
        chapters: transcript!.chapters,
        segments: transcript!.segments,
        truncated: transcript!.truncated,
      }
      const res = await sendToBackground<OverviewData>({ type: 'll:overview:generate', input })
      if (!aliveRef.current) return
      setState(
        res.ok
          ? { status: 'ready', settings, overview: res.data }
          : { status: 'error', settings, error: res.error },
      )
    },
    [videoId, transcript],
  )

  // One-click start: only a new signal acts, only when the hook has settled
  // (a cache miss to generate, or a failed attempt to retry) and never while
  // the lookup or a generation is in flight. The kick-off goes through a
  // transition: the effect must not cascade a synchronous render.
  const lastSignalRef = useRef(0)
  useEffect(() => {
    if (startSignal === lastSignalRef.current) return
    if (
      state.status === 'loading' ||
      state.status === 'building' ||
      state.status === 'no-key' ||
      state.status === 'ready'
    ) {
      return
    }
    const settings = state.settings
    lastSignalRef.current = startSignal
    if (settings) {
      startTransition(() => {
        void generate(settings)
      })
    }
  }, [startSignal, state, generate])

  return {
    status: state.status,
    overview: state.status === 'ready' ? state.overview : null,
    message: state.status === 'error' ? state.error.message : null,
    canOpenSettings:
      state.status === 'no-key' ||
      (state.status === 'error' && fixableInSettings(state.error.code)),
  }
}
