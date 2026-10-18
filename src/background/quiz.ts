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
  QuizGenerateInput,
  QuizQuestion,
  QuizSet,
} from '../lib/types'
import { judgeCacheKey, quizCacheKey, readCacheEntry, slugifyLanguage, writeCacheEntry } from './cache'
import { generateJson } from './gemini'
import { planChapterQuestions } from '../lib/quiz-plan'
import { buildJudgePrompt, buildQuizPrompt, withSchemaNudge } from './prompts'
import {
  JUDGE_JSON_SCHEMA,
  QUIZ_JSON_SCHEMA,
  judgeResponseSchema,
  quizSetResponseSchema,
  type QuizSetPayload,
} from './schemas'
import { DEFAULT_LEVEL, isLevel, readApiKey, readSettings } from './settings'
import { noKeyError, parseJsonLoose } from './util'

const QUIZ_MAX_OUTPUT_TOKENS = 6_144
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

/** Clamp the model's answer timestamp into the chapter it belongs to. */
function clampAtSec(atSec: number, input: QuizGenerateInput): number {
  const from = Math.max(0, Math.floor(input.chapterStartSec))
  const raw = Math.max(0, Math.floor(atSec))
  const to = input.chapterDurationSec > 0 ? from + Math.ceil(input.chapterDurationSec) : null
  return to === null ? Math.max(from, raw) : Math.min(Math.max(raw, from), to)
}

/**
 * Shape the model's payload into a usable set. A multiple-choice entry whose
 * options are missing or whose correct index points nowhere is dropped rather
 * than costing the whole set a retry; null means "nothing usable, retry".
 */
function normalizeQuizSet(payload: QuizSetPayload, input: QuizGenerateInput): QuizSet | null {
  const questions: QuizQuestion[] = []
  for (const item of payload.questions) {
    const atSec = clampAtSec(item.atSec, input)
    if (item.kind === 'mcq') {
      const choices = item.choices.map((choice) => choice.trim()).filter(Boolean).slice(0, 4)
      if (choices.length < 2) continue
      if (item.correctIndex < 0 || item.correctIndex >= choices.length) continue
      questions.push({
        kind: 'mcq',
        question: item.question.trim(),
        choices,
        correctIndex: item.correctIndex,
        hint: item.hint?.trim() || null,
        explanation: item.explanation.trim(),
        atSec,
      })
    } else {
      questions.push({
        kind: 'free-text',
        question: item.question.trim(),
        expectedAnswer: item.expectedAnswer.trim(),
        acceptablePoints: item.acceptablePoints
          .map((point) => point.trim())
          .filter(Boolean)
          .slice(0, 6),
        hints: item.hints.map((hint) => hint.trim()).filter(Boolean).slice(0, 3),
        explanation: item.explanation.trim(),
        atSec,
      })
    }
  }
  return questions.length > 0 ? { questions: questions.slice(0, 4) } : null
}

export async function handleQuizGenerate(input: QuizGenerateInput): Promise<LlResponse<QuizSet>> {
  const apiKey = await readApiKey()
  if (!apiKey) return fail(noKeyError())

  const level: Level = isLevel(input.level) ? input.level : DEFAULT_LEVEL
  const languageTag = slugifyLanguage(input.languageCode ?? input.languageLabel)
  const cacheKey = quizCacheKey(input.videoId, languageTag, level, input.chapterIndex, input.chapterStartSec)

  // Spec rule: never regenerate content that is already cached.
  const cached = await readCacheEntry<QuizSet>(cacheKey)
  if (cached) return { ok: true, data: cached }

  const { model } = await readSettings()
  const { systemInstruction, prompt } = buildQuizPrompt({
    videoTitle: input.videoTitle,
    chapterTitle: input.chapterTitle,
    level,
    chapterTranscript: input.chapterTranscript,
    kinds: planChapterQuestions(input.chapterDurationSec),
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

  const attempt = (text: string): QuizSet | null => {
    const parsed = quizSetResponseSchema.safeParse(parseJsonLoose(text))
    return parsed.success ? normalizeQuizSet(parsed.data, input) : null
  }

  let result = await call(prompt)
  if (!result.ok) return fail(result.error)

  let set = attempt(result.text)
  if (!set) {
    // Spec rule: exactly one retry on a validation failure.
    result = await call(withSchemaNudge(prompt))
    if (!result.ok) return fail(result.error)
    set = attempt(result.text)
  }
  if (!set) {
    return fail({
      code: 'schema',
      message: "Gemini's questions didn't match the expected format (tried once more). Try again.",
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
