/**
 * Overview feature: cache lookup, prompt build, one Gemini call (with a single
 * schema retry), normalization and persistence. Runs in the service worker.
 */
import type {
  GeminiError,
  KeyTestResult,
  Level,
  LlResponse,
  OverviewChapter,
  OverviewData,
  OverviewGenerateInput,
  OverviewGetInput,
  VideoChapter,
} from '../lib/types'
import { overviewCacheKey, readCacheEntry, slugifyLanguage, writeCacheEntry } from './cache'
import { generateJson } from './gemini'
import { buildOverviewPrompt, withSchemaNudge } from './prompts'
import {
  KEY_TEST_JSON_SCHEMA,
  OVERVIEW_JSON_SCHEMA,
  keyTestSchema,
  overviewResponseSchema,
  type OverviewPayload,
} from './schemas'
import { DEFAULT_LEVEL, isLevel, readApiKey, readSettings } from './settings'
import { noKeyError, parseJsonLoose } from './util'

const OVERVIEW_MAX_OUTPUT_TOKENS = 8_192
const KEY_TEST_MAX_OUTPUT_TOKENS = 128
const KEY_TEST_TIMEOUT_MS = 20_000

function fail<T>(error: GeminiError): LlResponse<T> {
  return { ok: false, error }
}

function cacheKeyFor(input: OverviewGetInput): string {
  const languageTag = slugifyLanguage(input.languageCode ?? input.languageLabel)
  return overviewCacheKey(input.videoId, languageTag, input.level)
}

function parseOverview(text: string): OverviewPayload | null {
  const parsed = overviewResponseSchema.safeParse(parseJsonLoose(text))
  return parsed.success ? parsed.data : null
}

/**
 * When the creator published chapters we asked the model to reuse them
 * verbatim. If it returned one chapter per creator chapter with times within a
 * minute, the official times/titles are snapped in; otherwise the model's own
 * list is trusted.
 */
function alignWithCreatorChapters(
  generated: OverviewChapter[],
  creatorChapters: VideoChapter[],
): OverviewChapter[] {
  if (creatorChapters.length === 0 || creatorChapters.length !== generated.length) return generated
  const close = generated.every(
    (chapter, index) => Math.abs(chapter.startSec - creatorChapters[index]!.startSec) <= 60,
  )
  if (!close) return generated
  return generated.map((chapter, index) => ({
    startSec: creatorChapters[index]!.startSec,
    title: creatorChapters[index]!.title,
    summary: chapter.summary,
  }))
}

function normalizeOverview(payload: OverviewPayload, input: OverviewGenerateInput): OverviewData {
  const duration = input.meta.durationSec > 0 ? input.meta.durationSec : null
  const generated = payload.chapters
    .map((chapter) => ({
      startSec: Math.max(0, Math.round(chapter.startSec)),
      title: chapter.title.trim(),
      summary: chapter.summary.trim(),
    }))
    .filter((chapter) => chapter.title.length > 0 && chapter.summary.length > 0)
    .sort((a, b) => a.startSec - b.startSec)

  const chapters = alignWithCreatorChapters(generated, input.chapters).map((chapter) => ({
    ...chapter,
    startSec: duration === null ? chapter.startSec : Math.min(chapter.startSec, duration),
  }))

  return {
    overview: payload.overview.trim(),
    takeaways: payload.takeaways
      .map((takeaway) => takeaway.trim())
      .filter(Boolean)
      .slice(0, 8),
    chapters,
    generatedAt: Date.now(),
  }
}

export async function handleOverviewGet(input: OverviewGetInput): Promise<LlResponse<OverviewData | null>> {
  const level: Level = isLevel(input.level) ? input.level : DEFAULT_LEVEL
  const cached = await readCacheEntry<OverviewData>(cacheKeyFor({ ...input, level }))
  return { ok: true, data: cached }
}

export async function handleOverviewGenerate(
  input: OverviewGenerateInput,
): Promise<LlResponse<OverviewData>> {
  const apiKey = await readApiKey()
  if (!apiKey) return fail(noKeyError())

  const level: Level = isLevel(input.level) ? input.level : DEFAULT_LEVEL
  const cacheKey = cacheKeyFor({ ...input, level })

  // Spec rule: never regenerate content that is already cached.
  const cached = await readCacheEntry<OverviewData>(cacheKey)
  if (cached) return { ok: true, data: cached }

  const { model } = await readSettings()
  const { systemInstruction, prompt } = buildOverviewPrompt({
    meta: input.meta,
    level,
    chapters: input.chapters,
    segments: input.segments,
    truncated: input.truncated,
  })

  const call = (nextPrompt: string) =>
    generateJson({
      apiKey,
      model,
      systemInstruction,
      prompt: nextPrompt,
      jsonSchema: OVERVIEW_JSON_SCHEMA,
      maxOutputTokens: OVERVIEW_MAX_OUTPUT_TOKENS,
    })

  let result = await call(prompt)
  if (!result.ok) return fail(result.error)

  let payload = parseOverview(result.text)
  if (!payload) {
    // Spec rule: exactly one retry on a validation failure.
    result = await call(withSchemaNudge(prompt))
    if (!result.ok) return fail(result.error)
    payload = parseOverview(result.text)
  }
  if (!payload) {
    return fail({
      code: 'schema',
      message: "Gemini's reply didn't match the expected format (tried once more). Try again.",
    })
  }

  const data = normalizeOverview(payload, { ...input, level })
  await writeCacheEntry(cacheKey, data)
  return { ok: true, data }
}

export async function handleKeyTest(): Promise<LlResponse<KeyTestResult>> {
  const [apiKey, { model }] = await Promise.all([readApiKey(), readSettings()])
  if (!apiKey) return fail(noKeyError())

  const startedAt = Date.now()
  const result = await generateJson({
    apiKey,
    model,
    systemInstruction: 'You reply with tiny JSON objects only.',
    prompt: 'Reply with exactly {"ok": true} and nothing else.',
    jsonSchema: KEY_TEST_JSON_SCHEMA,
    maxOutputTokens: KEY_TEST_MAX_OUTPUT_TOKENS,
    timeoutMs: KEY_TEST_TIMEOUT_MS,
  })
  if (!result.ok) return fail(result.error)

  const parsed = keyTestSchema.safeParse(parseJsonLoose(result.text))
  if (!parsed.success) {
    return fail({
      code: 'schema',
      message: 'The model answered, but not in the expected format — it may not support JSON output.',
    })
  }
  return { ok: true, data: { model, latencyMs: Date.now() - startedAt } }
}
