/**
 * Settings storage. Everything lives in chrome.storage.local — never
 * chrome.storage.sync, which would upload the API key to Google's servers.
 *
 * The service worker is the only reader of the key; every other context asks
 * for the public settings (hasKey/model/level) over messages.
 */
import type { Level, LlSettings } from '../lib/types'

const SETTINGS_STORAGE_KEY = 'll:settings'
const API_KEY_STORAGE_KEY = 'll:api-key'

export const DEFAULT_MODEL = 'gemini-3.5-flash-lite'
export const DEFAULT_LEVEL: Level = 'intermediate'

export interface StoredSettings {
  model: string
  level: Level
}

export function isLevel(value: unknown): value is Level {
  return value === 'beginner' || value === 'intermediate' || value === 'advanced'
}

/** Reads model + level. Contains no secrets, so any extension context may use it. */
export async function readSettings(): Promise<StoredSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_STORAGE_KEY)
  const raw = stored[SETTINGS_STORAGE_KEY] as Partial<StoredSettings> | undefined
  const model = typeof raw?.model === 'string' && raw.model.trim() ? raw.model.trim() : DEFAULT_MODEL
  const level = isLevel(raw?.level) ? raw.level : DEFAULT_LEVEL
  return { model, level }
}

export async function writeSettings(patch: Partial<StoredSettings>): Promise<void> {
  const current = await readSettings()
  const next: StoredSettings = {
    model: typeof patch.model === 'string' && patch.model.trim() ? patch.model.trim() : current.model,
    level: isLevel(patch.level) ? patch.level : current.level,
  }
  await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: next })
}

/**
 * Service-worker only. Never log the returned value, never send it to a
 * content script, and never put it in a URL.
 */
export async function readApiKey(): Promise<string | null> {
  const stored = await chrome.storage.local.get(API_KEY_STORAGE_KEY)
  const key = stored[API_KEY_STORAGE_KEY]
  return typeof key === 'string' && key.trim() ? key.trim() : null
}

export async function writeApiKey(key: string): Promise<void> {
  await chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: key.trim() })
}

export async function removeApiKey(): Promise<void> {
  await chrome.storage.local.remove(API_KEY_STORAGE_KEY)
}

/** The non-secret view handed to the content script and options page. */
export async function readPublicSettings(): Promise<LlSettings> {
  const [settings, apiKey] = await Promise.all([readSettings(), readApiKey()])
  return { hasKey: apiKey !== null, model: settings.model, level: settings.level }
}
