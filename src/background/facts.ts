/**
 * In-between facts: the short "did you know" pop-ups that appear over the video
 * while a chapter plays.
 *
 * One Gemini call per chapter (cached per video + language + level + chapter
 * position; a cached set is never regenerated), Zod-validated with the spec's
 * single retry, and tolerant about the shape of each entry — a reply cut off by
 * the output limit still contributes the pop-ups that arrived whole.
 *
 * A failure here must never disturb the video: the content script simply shows
 * no pop-ups for that chapter (see src/ui/FactPopups.tsx), so there is no error
 * UI on this path at all.
 */
import type {
  FactKind,
  FactSet,
  FactsGenerateInput,
  GeminiError,
  Level,
  LlResponse,
  VideoFact,
} from '../lib/types'
import { factsCacheKey, readCacheEntry, slugifyLanguage, writeCacheEntry } from './cache'
import { asSeconds, asText, clampChapterSec } from './coerce'
import { generateJson } from './gemini'
import { planChapterFacts } from '../lib/quiz-plan'
import { buildFactsPrompt, withSchemaNudge } from './prompts'
import {
  FACTS_JSON_SCHEMA,
  factItemSchema,
  factsResponseSchema,
  type FactItemPayload,
} from './schemas'
import { DEFAULT_LEVEL, isLevel, readApiKey, readSettings } from './settings'
import { noKeyError, parseJsonLoose, salvageObjectArray } from './util'

const FACTS_MAX_OUTPUT_TOKENS = 2_048
/** One pop-up is a headline plus two sentences; a cut reply is usually a long one. */
const FACTS_RETRY_NOTE =
  'Keep every pop-up short and complete: title under five words, body under 200 characters. Close every bracket — a reply that stops early cannot be used.'

/** Fallback headline when the model sent no usable title (the badge carries kind). */
const KIND_TITLE: Record<FactKind, string> = {
  fact: 'Did you know?',
  history: 'Where it came from',
  trend: 'Lately',
  idea: 'Worth trying',
  context: 'The bigger picture',
}

function fail<T>(error: GeminiError): LlResponse<T> {
  return { ok: false, error }
}

/** The kind the model meant, however it spelled it. Unknown → a plain fact. */
function readKind(value: unknown): FactKind {
  const text = (asText(value) ?? '').toLowerCase()
  if (/histor|backstor|origin|19\d\d|20\d\d/.test(text)) return 'history'
  if (/trend|recent|lately|nowadays/.test(text)) return 'trend'
  if (/idea|tip|try|practi|habit/.test(text)) return 'idea'
  if (/context|background|why|confus/.test(text)) return 'context'
  return 'fact'
}

/**
 * One usable pop-up out of one loose entry, or null when that entry cannot be
 * used. Null costs one pop-up — never the chapter's whole set.
 */
function normalizeFactEntry(entry: FactItemPayload, input: FactsGenerateInput): VideoFact | null {
  const body = asText(entry.body ?? entry.text ?? entry.fact ?? entry.detail)
  if (!body) return null

  const kind = readKind(entry.kind)
  return {
    kind,
    title: asText(entry.title ?? entry.headline) ?? KIND_TITLE[kind],
    body,
    atSec: clampChapterSec(
      asSeconds(entry.atSec) ?? input.chapterStartSec,
      input.chapterStartSec,
      input.chapterDurationSec,
    ),
  }
}

/**
 * The usable set out of one reply, or null when nothing in it can be used.
 * Two passes, exactly as the question sets do it: the plain parse, then the
 * salvage pass that keeps the complete entries of a reply the output limit cut
 * in half (see salvageObjectArray). Entries are validated one by one.
 */
function readFactSet(text: string, input: FactsGenerateInput): FactSet | null {
  const envelope = factsResponseSchema.safeParse(parseJsonLoose(text))
  const entries = envelope.success
    ? envelope.data.facts
    : salvageObjectArray(text, 'facts')

  const facts: VideoFact[] = []
  for (const entry of entries) {
    if (typeof entry === 'string' || typeof entry === 'number') {
      // A bare string in the list is still something worth reading.
      const body = asText(entry)
      if (body) {
        facts.push({
          kind: 'fact',
          title: KIND_TITLE.fact,
          body,
          atSec: Math.max(0, Math.floor(input.chapterStartSec)),
        })
      }
      continue
    }
    const parsed = factItemSchema.safeParse(entry)
    if (!parsed.success) continue
    const fact = normalizeFactEntry(parsed.data, input)
    if (fact) facts.push(fact)
  }

  if (facts.length === 0) return null
  // Time order: the pop-up loop walks them from the start of the chapter.
  facts.sort((a, b) => a.atSec - b.atSec)
  return { facts: facts.slice(0, 4) }
}

export async function handleFactsGenerate(
  input: FactsGenerateInput,
): Promise<LlResponse<FactSet>> {
  const apiKey = await readApiKey()
  if (!apiKey) return fail(noKeyError())

  const level: Level = isLevel(input.level) ? input.level : DEFAULT_LEVEL
  const languageTag = slugifyLanguage(input.languageCode ?? input.languageLabel)
  const cacheKey = factsCacheKey(
    input.videoId,
    languageTag,
    level,
    input.chapterIndex,
    input.chapterStartSec,
  )

  const cached = await readCacheEntry<FactSet>(cacheKey)
  if (cached) return { ok: true, data: cached }

  const { model } = await readSettings()
  const { systemInstruction, prompt } = buildFactsPrompt({
    videoTitle: input.videoTitle,
    chapterTitle: input.chapterTitle,
    level,
    chapterTranscript: input.chapterTranscript,
    count: planChapterFacts(input.chapterDurationSec),
  })

  const call = (nextPrompt: string) =>
    generateJson({
      apiKey,
      model,
      systemInstruction,
      prompt: nextPrompt,
      jsonSchema: FACTS_JSON_SCHEMA,
      maxOutputTokens: FACTS_MAX_OUTPUT_TOKENS,
    })

  let result = await call(prompt)
  if (!result.ok) return fail(result.error)

  let set = readFactSet(result.text, input)
  if (!set) {
    // Spec rule: exactly one retry on a validation failure.
    result = await call(withSchemaNudge(prompt, FACTS_RETRY_NOTE))
    if (!result.ok) return fail(result.error)
    set = readFactSet(result.text, input)
  }
  if (!set) {
    return fail({
      code: 'schema',
      message: "Gemini's fun facts came back incomplete or unreadable (tried once more).",
    })
  }

  await writeCacheEntry(cacheKey, set)
  return { ok: true, data: set }
}
