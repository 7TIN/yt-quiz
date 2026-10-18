/**
 * Message router: the only way the content script and options page can reach
 * into the service worker. Every handler is typed and every response is a
 * plain-data envelope — responses never contain the API key.
 */
import type {
  JudgeAnswerInput,
  Level,
  LlRequest,
  LlResponse,
  OverviewGetInput,
  QuizCadence,
  QuizGenerateInput,
} from '../lib/types'
import { cacheStats, clearCache } from './cache'
import { handleKeyTest, handleOverviewGenerate, handleOverviewGet } from './overview'
import { handleJudgeAnswer, handleQuizGenerate } from './quiz'
import {
  isLevel,
  isQuizCadence,
  readPublicSettings,
  removeApiKey,
  writeApiKey,
  writeSettings,
} from './settings'

function badRequest<T>(message: string): LlResponse<T> {
  return { ok: false, error: { code: 'bad-request', message } }
}

/** Minimal runtime guard: senders are typed, but never trust a message blindly. */
function hasOverviewInput(input: unknown): input is OverviewGetInput & Record<string, unknown> {
  if (typeof input !== 'object' || input === null) return false
  const record = input as Record<string, unknown>
  return typeof record.videoId === 'string' && record.videoId.length > 0 && isLevel(record.level)
}

function hasQuizInput(input: unknown): input is QuizGenerateInput & Record<string, unknown> {
  if (typeof input !== 'object' || input === null) return false
  const record = input as Record<string, unknown>
  return (
    typeof record.videoId === 'string' &&
    record.videoId.length > 0 &&
    isLevel(record.level) &&
    typeof record.chapterIndex === 'number' &&
    typeof record.chapterDurationSec === 'number' &&
    typeof record.chapterTranscript === 'string'
  )
}

function hasJudgeInput(input: unknown): input is JudgeAnswerInput & Record<string, unknown> {
  if (typeof input !== 'object' || input === null) return false
  const record = input as Record<string, unknown>
  return (
    typeof record.videoId === 'string' &&
    record.videoId.length > 0 &&
    typeof record.question === 'string' &&
    typeof record.userAnswer === 'string'
  )
}

export async function route(message: LlRequest): Promise<LlResponse<unknown>> {
  switch (message.type) {
    case 'll:settings:get':
      return { ok: true, data: await readPublicSettings() }

    case 'll:settings:save': {
      if (typeof message.apiKey === 'string' && message.apiKey.trim()) {
        await writeApiKey(message.apiKey)
      }
      const patch: { model?: string; level?: Level; quizEvery?: QuizCadence } = {}
      if (typeof message.model === 'string') patch.model = message.model
      if (isLevel(message.level)) patch.level = message.level
      if (isQuizCadence(message.quizEvery)) patch.quizEvery = message.quizEvery
      if (patch.model !== undefined || patch.level !== undefined || patch.quizEvery !== undefined) {
        await writeSettings(patch)
      }
      return { ok: true, data: null }
    }

    case 'll:settings:remove-key':
      await removeApiKey()
      return { ok: true, data: null }

    case 'll:key:test':
      return handleKeyTest()

    case 'll:overview:get':
      if (!hasOverviewInput(message.input)) return badRequest('Malformed overview lookup.')
      return handleOverviewGet(message.input)

    case 'll:overview:generate':
      if (!hasOverviewInput(message.input)) return badRequest('Malformed overview request.')
      return handleOverviewGenerate(message.input)

    case 'll:quiz:generate':
      if (!hasQuizInput(message.input)) return badRequest('Malformed quiz request.')
      return handleQuizGenerate(message.input)

    case 'll:answer:judge':
      if (!hasJudgeInput(message.input)) return badRequest('Malformed judge request.')
      return handleJudgeAnswer(message.input)

    case 'll:cache:stats':
      return { ok: true, data: await cacheStats() }

    case 'll:cache:clear':
      return { ok: true, data: await clearCache() }

    case 'll:open-options':
      await chrome.runtime.openOptionsPage()
      return { ok: true, data: null }

    default:
      return badRequest('Unknown request.')
  }
}
