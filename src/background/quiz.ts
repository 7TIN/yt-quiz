/**
 * Quiz + judging features. Runs in the service worker:
 *
 *  - one Gemini call per chapter question SET (cached per video + language +
 *    level + chapter position; a cached set is never regenerated). The set
 *    holds the multiple-choice questions — graded locally, no call needed —
 *    and the free-response one
 *  - one call per distinct free-text answer (the judge cache key contains a
 *    hash of the normalized answer, so re-submitting the same answer is free)
 *  - every payload Zod-validated, with the spec's single schema retry
 */
import type {
  GeminiError,
  JudgeAnswerInput,
  JudgeResult,
  Level,
  LlResponse,
  QuizDensity,
  QuizGenerateInput,
  QuizQuestion,
  QuizSet,
} from '../lib/types'
import { judgeCacheKey, quizCacheKey, readCacheEntry, slugifyLanguage, writeCacheEntry } from './cache'
import { asList, asSeconds, asText, clampChapterSec } from './coerce'
import { generateJson } from './gemini'
import { planChapterQuestions } from '../lib/quiz-plan'
import { buildJudgePrompt, buildQuizPrompt, withSchemaNudge } from './prompts'
import {
  JUDGE_JSON_SCHEMA,
  QUIZ_JSON_SCHEMA,
  judgeResponseSchema,
  quizItemSchema,
  quizSetResponseSchema,
  type QuizItemPayload,
} from './schemas'
import { DEFAULT_LEVEL, isLevel, isQuizDensity, readApiKey, readSettings } from './settings'
import { noKeyError, parseJsonLoose, salvageObjectArray } from './util'

const JUDGE_MAX_OUTPUT_TOKENS = 2_048
const MAX_USER_ANSWER_CHARS = 2_000

/**
 * A set carries more than a question each: choices, a hint, an explanation, the
 * timestamp. Bigger sets need room, and arriving cut off — the failure that
 * shows up most in the wild — is best avoided rather than salvaged.
 */
function quizOutputBudget(questionCount: number): number {
  return Math.min(16_384, 4_096 + 1_600 * questionCount)
}

/**
 * Added to the single schema retry. A set of questions with hints and
 * explanations is a long reply, and the failure that shows up most in the wild
 * is a reply cut off by the output limit — asking for a shorter, closed reply
 * is far more likely to fix it than repeating the same request verbatim.
 */
const QUIZ_RETRY_NOTE =
  'Keep this reply short and complete: question under 25 words, explanation under 30 words, each hint under 20 words, at most 4 choices. Close every bracket — a reply that stops early cannot be used.'

function fail<T>(error: GeminiError): LlResponse<T> {
  return { ok: false, error }
}

/** FNV-1a over the normalized answer: the judge cache key for one attempt. */
export function hashAnswer(answer: string): string {
  const normalized = answer.toLowerCase().replace(/\s+/g, ' ').trim()
  let hash = 2166136261
  for (let index = 0; index < normalized.length; index++) {
    hash ^= normalized.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

/* The coercion helpers live in ./coerce (shared with the facts feature). */

/** Choice list, plus the index the model flagged as correct (if it flagged one). */
function readChoices(value: unknown): { choices: string[]; flagged: number | null } {
  const choices: string[] = []
  let flagged: number | null = null
  if (!Array.isArray(value)) return { choices, flagged }
  for (const entry of value) {
    const record =
      typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : null
    const text = asText(
      record ? (record.text ?? record.choice ?? record.value ?? record.label) : entry,
    )
    if (!text) continue
    if (record && (record.correct === true || record.isCorrect === true)) flagged = choices.length
    choices.push(text)
  }
  return { choices, flagged }
}

/** The correct option's index, from `1`, `"1"` or `"B"` (as models alternate). */
function readCorrectIndex(value: unknown, choiceCount: number): number | null {
  let index: number | null = null
  if (typeof value === 'number' && Number.isInteger(value)) {
    index = value
  } else {
    const text = asText(value)
    if (text && /^[A-Da-d]$/.test(text)) index = text.toUpperCase().charCodeAt(0) - 65
    else if (text && Number.isInteger(Number.parseInt(text, 10))) {
      index = Number.parseInt(text, 10)
    }
  }
  return index !== null && index >= 0 && index < choiceCount ? index : null
}

/**
 * One usable question out of one loose entry, or null when that entry cannot
 * be used. Null costs one question — never the chapter's whole set.
 */
function normalizeQuizEntry(entry: QuizItemPayload, input: QuizGenerateInput): QuizQuestion | null {
  const question = asText(entry.question)
  if (!question) return null

  const atSec = clampChapterSec(
    asSeconds(entry.atSec) ?? input.chapterStartSec,
    input.chapterStartSec,
    input.chapterDurationSec,
  )
  const explanation = asText(entry.explanation) ?? ''
  const kind = asText(entry.kind)?.toLowerCase()
  const freeShaped = kind === 'free-text' || kind === 'freetext' || entry.expectedAnswer != null
  const choiceShaped = kind === 'mcq' || entry.choices != null

  if (choiceShaped && !freeShaped) {
    const { choices, flagged } = readChoices(entry.choices)
    if (choices.length < 2) return null
    const correctIndex = readCorrectIndex(entry.correctIndex, choices.length) ?? flagged
    if (correctIndex === null || correctIndex >= choices.length) return null
    return {
      kind: 'mcq',
      question,
      choices: choices.slice(0, 5),
      correctIndex,
      hint: asText(entry.hint),
      explanation,
      atSec,
    }
  }

  return {
    kind: 'free-text',
    question,
    expectedAnswer: asText(entry.expectedAnswer) ?? '',
    acceptablePoints: asList(entry.acceptablePoints, 6),
    hints: asList(entry.hints, 3),
    explanation,
    atSec,
  }
}

/**
 * The usable set out of one reply, or null when nothing in it can be used.
 *
 * Two passes: the plain one (the reply parsed as JSON and held a list) and the
 * salvage pass, which picks the complete entries out of a reply the output
 * limit cut in half (see salvageObjectArray). Entries are validated one by one,
 * so a single odd question never costs the rest.
 */
function readQuizSet(text: string, input: QuizGenerateInput): QuizSet | null {
  const envelope = quizSetResponseSchema.safeParse(parseJsonLoose(text))
  const entries = envelope.success
    ? envelope.data.questions
    : salvageObjectArray(text, 'questions')

  const questions: QuizQuestion[] = []
  for (const entry of entries) {
    const item = typeof entry === 'string' || typeof entry === 'number' ? null : entry
    if (!item) {
      // A bare string in the list is still a question worth asking.
      const question = asText(entry)
      if (question) {
        questions.push({
          kind: 'free-text',
          question,
          expectedAnswer: '',
          acceptablePoints: [],
          hints: [],
          explanation: '',
          atSec: Math.max(0, Math.floor(input.chapterStartSec)),
        })
      }
      continue
    }
    const parsed = quizItemSchema.safeParse(item)
    if (!parsed.success) continue
    const question = normalizeQuizEntry(parsed.data, input)
    if (question) questions.push(question)
  }

  return questions.length > 0 ? { questions: questions.slice(0, 4) } : null
}

export async function handleQuizGenerate(input: QuizGenerateInput): Promise<LlResponse<QuizSet>> {
  const apiKey = await readApiKey()
  if (!apiKey) return fail(noKeyError())

  const settings = await readSettings()
  const level: Level = isLevel(input.level) ? input.level : DEFAULT_LEVEL
  // The caller's density is what the viewer just chose in the panel; the stored
  // setting is the fallback for anything older or hand-written.
  const density: QuizDensity = isQuizDensity(input.density) ? input.density : settings.density
  const languageTag = slugifyLanguage(input.languageCode ?? input.languageLabel)
  const cacheKey = quizCacheKey(
    input.videoId,
    languageTag,
    level,
    density,
    input.chapterIndex,
    input.chapterStartSec,
  )

  // Spec rule: never regenerate content that is already cached.
  const cached = await readCacheEntry<QuizSet>(cacheKey)
  if (cached) return { ok: true, data: cached }

  const kinds = planChapterQuestions(input.chapterDurationSec, density)
  const { systemInstruction, prompt } = buildQuizPrompt({
    videoTitle: input.videoTitle,
    chapterTitle: input.chapterTitle,
    level,
    chapterTranscript: input.chapterTranscript,
    kinds,
  })

  const call = (nextPrompt: string) =>
    generateJson({
      apiKey,
      model: settings.model,
      systemInstruction,
      prompt: nextPrompt,
      jsonSchema: QUIZ_JSON_SCHEMA,
      maxOutputTokens: quizOutputBudget(kinds.length),
    })

  const attempt = (text: string): QuizSet | null => readQuizSet(text, input)

  let result = await call(prompt)
  if (!result.ok) return fail(result.error)

  let set = attempt(result.text)
  if (!set) {
    // Spec rule: exactly one retry on a validation failure — asked this time to
    // keep the reply short and complete, because arriving cut off is the
    // failure that actually shows up.
    result = await call(withSchemaNudge(prompt, QUIZ_RETRY_NOTE))
    if (!result.ok) return fail(result.error)
    set = attempt(result.text)
  }
  if (!set) {
    return fail({
      code: 'schema',
      message:
        "Gemini's questions came back incomplete or unreadable (tried once more). Try again.",
    })
  }

  await writeCacheEntry(cacheKey, set)
  return { ok: true, data: set }
}

export async function handleJudgeAnswer(input: JudgeAnswerInput): Promise<LlResponse<JudgeResult>> {
  const apiKey = await readApiKey()
  if (!apiKey) return fail(noKeyError())

  const level: Level = isLevel(input.level) ? input.level : DEFAULT_LEVEL
  const userAnswer = input.userAnswer.trim().slice(0, MAX_USER_ANSWER_CHARS)
  if (!userAnswer) return fail({ code: 'bad-request', message: 'The answer is empty.' })

  const cacheKey = judgeCacheKey(
    input.videoId,
    level,
    input.chapterIndex,
    input.chapterStartSec,
    hashAnswer(userAnswer),
  )
  const cached = await readCacheEntry<JudgeResult>(cacheKey)
  if (cached) return { ok: true, data: cached }

  const { model } = await readSettings()
  const { systemInstruction, prompt } = buildJudgePrompt({
    level,
    question: input.question,
    expectedAnswer: input.expectedAnswer,
    acceptablePoints: input.acceptablePoints,
    userAnswer,
  })

  const call = (nextPrompt: string) =>
    generateJson({
      apiKey,
      model,
      systemInstruction,
      prompt: nextPrompt,
      jsonSchema: JUDGE_JSON_SCHEMA,
      maxOutputTokens: JUDGE_MAX_OUTPUT_TOKENS,
    })

  let result = await call(prompt)
  if (!result.ok) return fail(result.error)

  let parsed = judgeResponseSchema.safeParse(parseJsonLoose(result.text))
  if (!parsed.success) {
    result = await call(withSchemaNudge(prompt))
    if (!result.ok) return fail(result.error)
    parsed = judgeResponseSchema.safeParse(parseJsonLoose(result.text))
  }
  if (!parsed.success) {
    return fail({
      code: 'schema',
      message: "Gemini's verdict didn't match the expected format (tried once more). Try again.",
    })
  }

  const judge: JudgeResult = { verdict: parsed.data.verdict, feedback: parsed.data.feedback.trim() }
  await writeCacheEntry(cacheKey, judge)
  return { ok: true, data: judge }
}
