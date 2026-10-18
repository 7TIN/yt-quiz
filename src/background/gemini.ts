/**
 * Gemini client for the Interactions API — the current documented surface
 * (verified 2026-10-18 against ai.google.dev and the API discovery document):
 *
 *   POST https://generativelanguage.googleapis.com/v1beta/interactions
 *   headers: x-goog-api-key (the key never goes into a URL), content-type
 *   body:    { model, input, system_instruction, generation_config,
 *              response_format, store: false }
 *   reply:   { status, steps: [{ type: "model_output",
 *              content: [{ type: "text", text: "..." }] }] }
 *
 * The classic :generateContent endpoint still exists, but Google's guides now
 * lead with Interactions for new code, so that is what this is built on.
 * `store: false` keeps the request out of Google's interaction history.
 *
 * This module runs in the service worker ONLY. Retry policy: 429 → up to two
 * retries with backoff; network/5xx → one retry; a model that rejects the
 * thinking setting → one retry without it. Schema-failure retries belong to
 * the caller (see overview.ts).
 */
import type { GeminiError } from '../lib/types'

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions'
const DEFAULT_TIMEOUT_MS = 90_000
/** Backoff after a 429, per retry (skipped when Retry-After says otherwise). */
const RATE_LIMIT_BACKOFF_MS = [1_200, 3_000]
const TRANSIENT_RETRY_MS = 1_000

export interface GenerateJsonOptions {
  apiKey: string
  model: string
  systemInstruction: string
  prompt: string
  /** Raw JSON Schema sent as `response_format`. */
  jsonSchema: unknown
  maxOutputTokens?: number
  timeoutMs?: number
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch
}

export type GenerateJsonResult = { ok: true; text: string } | { ok: false; error: GeminiError }

type RequestOutcome =
  | { kind: 'text'; text: string }
  | { kind: 'retry'; error: GeminiError; retryAfterMs?: number }
  | { kind: 'thinking-unsupported' }
  | { kind: 'error'; error: GeminiError }

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeError(code: GeminiError['code'], message: string, detail?: string): GeminiError {
  return detail ? { code, message, detail } : { code, message }
}

/** Trims API-provided text so panels can show it as a one-liner. */
function sanitizeDetail(text: string | undefined): string | undefined {
  if (!text) return undefined
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return undefined
  return clean.length > 220 ? `${clean.slice(0, 217)}…` : clean
}

function apiErrorDetail(body: unknown): string | undefined {
  // The interactions endpoint wraps errors in a single-element array —
  // `[{ error: { message } }]` — while some responses use the object form
  // `{ error: { message } }` directly. Read both, or every 400 loses its
  // reason (invalid key, thinking level, …).
  const envelope = Array.isArray(body) ? body[0] : body
  const error = (envelope as { error?: { message?: unknown } } | null)?.error
  return typeof error?.message === 'string' ? sanitizeDetail(error.message) : undefined
}

function normalizeModelId(model: string): string {
  const trimmed = model.trim()
  return trimmed.startsWith('models/') ? trimmed.slice('models/'.length) : trimmed
}

function retryAfterMsFrom(response: Response): number | undefined {
  const header = response.headers.get('retry-after')
  if (!header) return undefined
  const seconds = Number.parseInt(header, 10)
  // Only honour short waits; longer ones mean "stop trying for now".
  return Number.isFinite(seconds) && seconds > 0 && seconds <= 20 ? seconds * 1000 : undefined
}

function classifyHttpError(
  status: number,
  detail: string | undefined,
): { error: GeminiError; thinkingUnsupported: boolean } {
  if (status === 400) {
    if (detail && /thinking.?level|thinking.?budget/i.test(detail)) {
      return {
        error: makeError('bad-request', 'The model rejected the thinking setting.', detail),
        thinkingUnsupported: true,
      }
    }
    if (detail && /api ?key/i.test(detail)) {
      return {
        error: makeError('invalid-key', 'Gemini rejected the API key. Check the key in settings.', detail),
        thinkingUnsupported: false,
      }
    }
    return {
      error: makeError('bad-request', 'Gemini rejected the request.', detail),
      thinkingUnsupported: false,
    }
  }
  if (status === 401 || status === 403) {
    return {
      error: makeError('invalid-key', 'Gemini rejected the API key. Check the key in settings.', detail),
      thinkingUnsupported: false,
    }
  }
  if (status === 404) {
    return {
      error: makeError('model-not-found', "Gemini doesn't know this model. Check the model ID in settings.", detail),
      thinkingUnsupported: false,
    }
  }
  if (status === 429) {
    return {
      error: makeError('rate-limit', 'Gemini rate limit reached. Wait a minute, then try again.', detail),
      thinkingUnsupported: false,
    }
  }
  if (status >= 500) {
    return {
      error: makeError('server', 'Gemini had a server error. Try again in a moment.', detail),
      thinkingUnsupported: false,
    }
  }
  return {
    error: makeError('unknown', 'Gemini answered with an unexpected error.', detail),
    thinkingUnsupported: false,
  }
}

/** Collects text from a content/parts array, skipping non-text parts. */
function collectText(container: unknown): string[] {
  if (!Array.isArray(container)) return []
  const out: string[] = []
  for (const part of container) {
    if (typeof part !== 'object' || part === null) continue
    const record = part as Record<string, unknown>
    if (typeof record.text === 'string' && record.text) out.push(record.text)
  }
  return out
}

/**
 * Pulls the model's text out of a reply. Walks both shapes the docs and live
 * traffic show: the SDK-style `outputs[]` and the REST-style `steps[]` — the
 * latter wraps text in `model_output` steps and includes `thought` steps that
 * must be skipped.
 */
export function extractModelText(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const record = body as Record<string, unknown>

  if (typeof record.output_text === 'string' && record.output_text.trim()) return record.output_text

  for (const field of ['outputs', 'steps'] as const) {
    const items = record[field]
    if (!Array.isArray(items)) continue
    const chunks: string[] = []
    for (const item of items) {
      if (typeof item !== 'object' || item === null) continue
      const step = item as Record<string, unknown>
      if (step.type === 'thought') continue
      chunks.push(...collectText(step.content), ...collectText(step.parts))
      if (typeof step.text === 'string' && step.text) chunks.push(step.text)
    }
    const joined = chunks.join('').trim()
    if (joined) return joined
  }
  return null
}

/** A 200 reply with no usable text: blocked, truncated, or just empty. */
function classifyEmptyBody(body: unknown): GeminiError {
  const record = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const status = typeof record.status === 'string' ? record.status : ''
  let blob = ''
  try {
    blob = JSON.stringify(body)
  } catch {
    blob = ''
  }
  if (blob && /safety|blocked|prohibited|policy/i.test(blob)) {
    return makeError('blocked', 'Gemini blocked this request (safety filter).')
  }
  if (status === 'incomplete') {
    return makeError('empty', 'Gemini stopped before finishing the reply (output limit). Try again.')
  }
  if (status === 'failed') {
    return makeError('server', 'Gemini failed to finish this request. Try again.')
  }
  return makeError('empty', 'Gemini returned an empty reply. Try again.')
}

async function requestOnce(
  options: GenerateJsonOptions,
  includeThinkingLevel: boolean,
): Promise<RequestOutcome> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  const body: Record<string, unknown> = {
    model: normalizeModelId(options.model),
    input: options.prompt,
    system_instruction: options.systemInstruction,
    response_format: options.jsonSchema,
    store: false,
  }
  const generationConfig: Record<string, unknown> = {}
  if (includeThinkingLevel) generationConfig.thinking_level = 'low'
  if (options.maxOutputTokens) generationConfig.max_output_tokens = options.maxOutputTokens
  if (Object.keys(generationConfig).length > 0) body.generation_config = generationConfig

  try {
    const fetchImpl = options.fetchImpl ?? fetch
    const response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // The key travels in a header — never in the URL, never logged.
        'x-goog-api-key': options.apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (response.status !== 200) {
      let detail: string | undefined
      try {
        detail = apiErrorDetail(await response.json())
      } catch {
        detail = undefined
      }
      if (response.status === 429) {
        const classified = classifyHttpError(response.status, detail)
        return { kind: 'retry', error: classified.error, retryAfterMs: retryAfterMsFrom(response) }
      }
      if (response.status >= 500) {
        const classified = classifyHttpError(response.status, detail)
        return { kind: 'retry', error: classified.error }
      }
      const classified = classifyHttpError(response.status, detail)
      if (classified.thinkingUnsupported) return { kind: 'thinking-unsupported' }
      return { kind: 'error', error: classified.error }
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return {
        kind: 'error',
        error: makeError('schema', 'Gemini sent a reply that could not be read as JSON. Try again.'),
      }
    }

    const text = extractModelText(payload)
    if (!text) return { kind: 'error', error: classifyEmptyBody(payload) }
    return { kind: 'text', text }
  } catch (error) {
    const aborted = (error as { name?: string } | null)?.name === 'AbortError'
    if (aborted) {
      return { kind: 'error', error: makeError('timeout', 'Gemini took too long to answer. Try again.') }
    }
    return {
      kind: 'retry',
      error: makeError('network', "Couldn't reach Gemini — check your internet connection."),
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function generateJson(options: GenerateJsonOptions): Promise<GenerateJsonResult> {
  // Plan A uses low thinking (cheap + fast); if the model doesn't support the
  // setting, plan B drops it and lets the model use its default.
  let includeThinkingLevel = true

  for (let plan = 0; plan < 2; plan++) {
    let rateLimitRetries = 0
    let transientRetries = 0

    for (;;) {
      const outcome = await requestOnce(options, includeThinkingLevel)

      if (outcome.kind === 'text') return { ok: true, text: outcome.text }
      if (outcome.kind === 'thinking-unsupported') {
        if (includeThinkingLevel) break // retry the whole call without the setting
        return { ok: false, error: makeError('bad-request', 'The model rejected the thinking setting.') }
      }
      if (outcome.kind === 'error') return { ok: false, error: outcome.error }

      const isRateLimit = outcome.error.code === 'rate-limit'
      if (isRateLimit && rateLimitRetries < RATE_LIMIT_BACKOFF_MS.length) {
        const waitMs = outcome.retryAfterMs ?? RATE_LIMIT_BACKOFF_MS[rateLimitRetries]
        rateLimitRetries += 1
        await delay(waitMs)
        continue
      }
      if (!isRateLimit && transientRetries < 1) {
        transientRetries += 1
        await delay(TRANSIENT_RETRY_MS)
        continue
      }
      return { ok: false, error: outcome.error }
    }

    includeThinkingLevel = false
  }

  return { ok: false, error: makeError('unknown', 'Something went wrong talking to Gemini. Try again.') }
}
