/**
 * Quiz + judging features. Runs in the service worker:
 *
 *  - one Gemini call per chapter question (cached per video + language + level
 *    + chapter position; a cached question is never regenerated)
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
  QuizGenerateInput,
  QuizQuestion,
} from '../lib/types'
import { judgeCacheKey, quizCacheKey, readCacheEntry, slugifyLanguage, writeCacheEntry } from './cache'
import { generateJson } from './gemini'
import { buildJudgePrompt, buildQuizPrompt, withSchemaNudge } from './prompts'
import {
  JUDGE_JSON_SCHEMA,
  QUIZ_JSON_SCHEMA,
  judgeResponseSchema,
  quizResponseSchema,
  type QuizPayload,
} from './schemas'
import { DEFAULT_LEVEL, isLevel, readApiKey, readSettings } from './settings'
import { noKeyError, parseJsonLoose } from './util'

const QUIZ_MAX_OUTPUT_TOKENS = 4_096
const JUDGE_MAX_OUTPUT_TOKENS = 2_048
const MAX_USER_ANSWER_CHARS = 2_000

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

function normalizeQuiz(payload: QuizPayload): QuizQuestion {
  return {
    question: payload.question.trim(),
    expectedAnswer: payload.expectedAnswer.trim(),
    acceptablePoints: payload.acceptablePoints.map((point) => point.trim()).filter(Boolean).slice(0, 6),
    hints: payload.hints.map((hint) => hint.trim()).filter(Boolean).slice(0, 3),
    explanation: payload.explanation.trim(),
  }
}

export async function handleQuizGenerate(input: QuizGenerateInput): Promise<LlResponse<QuizQuestion>> {
  const apiKey = await readApiKey()
  if (!apiKey) return fail(noKeyError())

  const level: Level = isLevel(input.level) ? input.level : DEFAULT_LEVEL
  const languageTag = slugifyLanguage(input.languageCode ?? input.languageLabel)
  const cacheKey = quizCacheKey(input.videoId, languageTag, level, input.chapterIndex, input.chapterStartSec)

  // Spec rule: never regenerate content that is already cached.
  const cached = await readCacheEntry<QuizQuestion>(cacheKey)
  if (cached) return { ok: true, data: cached }

  const { model } = await readSettings()
  const { systemInstruction, prompt } = buildQuizPrompt({
    videoTitle: input.videoTitle,
    chapterTitle: input.chapterTitle,
    level,
    chapterText: input.chapterText,
  })

  const call = (nextPrompt: string) =>
    generateJson({
      apiKey,
      model,
      systemInstruction,
      prompt: nextPrompt,
      jsonSchema: QUIZ_JSON_SCHEMA,
      maxOutputTokens: QUIZ_MAX_OUTPUT_TOKENS,
    })

  let result = await call(prompt)
  if (!result.ok) return fail(result.error)

  let parsed = quizResponseSchema.safeParse(parseJsonLoose(result.text))
  if (!parsed.success) {
    // Spec rule: exactly one retry on a validation failure.
    result = await call(withSchemaNudge(prompt))
    if (!result.ok) return fail(result.error)
    parsed = quizResponseSchema.safeParse(parseJsonLoose(result.text))
  }
  if (!parsed.success) {
    return fail({
      code: 'schema',
      message: "Gemini's question didn't match the expected format (tried once more). Try again.",
    })
  }

  const quiz = normalizeQuiz(parsed.data)
  await writeCacheEntry(cacheKey, quiz)
  return { ok: true, data: quiz }
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
