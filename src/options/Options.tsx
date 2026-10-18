import { useCallback, useEffect, useState } from 'react'
import { sendToBackground } from '../content/messaging'
import type { CacheStats, KeyTestResult, Level, LlSettings } from '../lib/types'
import { LogoMark } from '../ui/icons'

const LEVEL_OPTIONS: { value: Level; label: string; hint: string }[] = [
  { value: 'beginner', label: 'Beginner', hint: 'Plain language' },
  { value: 'intermediate', label: 'Intermediate', hint: 'Knows the basics' },
  { value: 'advanced', label: 'Advanced', hint: 'Dense, precise' },
]

type TestState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'ok'; model: string; latencyMs: number }
  | { kind: 'error'; message: string; detail?: string }

const INPUT_CLASS =
  'h-9 rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500'
const PRIMARY_BUTTON_CLASS =
  'inline-flex h-9 items-center rounded-full bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50 motion-safe:transition-colors motion-safe:duration-150'
const SECONDARY_BUTTON_CLASS =
  'inline-flex h-9 items-center rounded-full border border-line px-4 text-sm font-medium hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50 motion-safe:transition-colors motion-safe:duration-150'
const LINK_BUTTON_CLASS =
  'rounded text-xs text-muted underline hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Options page: the user's own Gemini API key, model ID, level, connection
 * test and cache controls. The key is write-only from this UI — it is never
 * read back into the page; the service worker is the only reader.
 */
export function Options() {
  const [settings, setSettings] = useState<LlSettings | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [modelInput, setModelInput] = useState('')
  const [levelInput, setLevelInput] = useState<Level>('intermediate')
  const [saving, setSaving] = useState(false)
  const [saveNote, setSaveNote] = useState<string | null>(null)
  const [testState, setTestState] = useState<TestState>({ kind: 'idle' })
  const [cache, setCache] = useState<CacheStats | null>(null)
  const [cacheNote, setCacheNote] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const settingsRes = await sendToBackground<LlSettings>({ type: 'll:settings:get' })
    if (settingsRes.ok) {
      setSettings(settingsRes.data)
      setModelInput(settingsRes.data.model)
      setLevelInput(settingsRes.data.level)
    }
    const statsRes = await sendToBackground<CacheStats>({ type: 'll:cache:stats' })
    if (statsRes.ok) setCache(statsRes.data)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const settingsRes = await sendToBackground<LlSettings>({ type: 'll:settings:get' })
      if (cancelled) return
      if (settingsRes.ok) {
        setSettings(settingsRes.data)
        setModelInput(settingsRes.data.model)
        setLevelInput(settingsRes.data.level)
      }
      const statsRes = await sendToBackground<CacheStats>({ type: 'll:cache:stats' })
      if (cancelled) return
      if (statsRes.ok) setCache(statsRes.data)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const keyDirty = keyInput.trim().length > 0
  const modelDirty = settings !== null && modelInput.trim().length > 0 && modelInput.trim() !== settings.model
  const canTest = settings?.hasKey === true && !saving && !keyDirty && !modelDirty

  async function save() {
    setSaving(true)
    setSaveNote(null)
    const res = await sendToBackground<null>({
      type: 'll:settings:save',
      apiKey: keyInput.trim() || undefined,
      model: modelInput.trim() || undefined,
      level: levelInput,
    })
    setSaving(false)
    if (!res.ok) {
      setSaveNote(res.error.message)
      return
    }
    setKeyInput('')
    setTestState({ kind: 'idle' })
    setSaveNote('Saved.')
    await refresh()
  }

  async function testKey() {
    setTestState({ kind: 'running' })
    const res = await sendToBackground<KeyTestResult>({ type: 'll:key:test' })
    if (res.ok) {
      setTestState({ kind: 'ok', model: res.data.model, latencyMs: res.data.latencyMs })
    } else {
      setTestState({ kind: 'error', message: res.error.message, detail: res.error.detail })
    }
  }

  async function removeKey() {
    await sendToBackground({ type: 'll:settings:remove-key' })
    setSaveNote('Key removed.')
    setTestState({ kind: 'idle' })
    await refresh()
  }

  async function clearCacheNow() {
    const res = await sendToBackground<{ removed: number }>({ type: 'll:cache:clear' })
    setCacheNote(
      res.ok
        ? `Cleared ${res.data.removed} ${res.data.removed === 1 ? 'entry' : 'entries'}.`
        : res.error.message,
    )
    await refresh()
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 px-6 py-10">
      <header className="flex items-center gap-3">
        <LogoMark className="size-9 shrink-0" />
        <div>
          <h1 className="text-lg font-semibold">Learning Loop for YouTube</h1>
          <p className="text-sm text-muted">Extension settings</p>
        </div>
      </header>

      <section
        className="rounded-2xl border border-line bg-surface-2 p-5"
        aria-labelledby="ll-key-heading"
      >
        <h2 id="ll-key-heading" className="text-sm font-semibold">
          Gemini API key
        </h2>
        <p className="mt-1 text-sm text-muted">
          {settings === null
            ? 'Loading…'
            : settings.hasKey
              ? 'A key is saved in this browser.'
              : 'No key saved yet.'}{' '}
          Create one at <span className="font-mono text-xs">aistudio.google.com/apikey</span>. The
          key is stored locally and sent only to Google&apos;s Gemini API.
        </p>

        <div className="mt-3 flex items-stretch gap-2">
          <label className="sr-only" htmlFor="ll-key">
            Gemini API key
          </label>
          <input
            id="ll-key"
            type={showKey ? 'text' : 'password'}
            value={keyInput}
            onChange={(event) => setKeyInput(event.target.value)}
            placeholder={
              settings?.hasKey ? 'Type a new key to replace the saved one' : 'Paste your API key'
            }
            autoComplete="off"
            spellCheck={false}
            className={`${INPUT_CLASS} min-w-0 flex-1 font-mono text-xs`}
          />
          <button
            type="button"
            onClick={() => setShowKey((value) => !value)}
            aria-pressed={showKey}
            className={SECONDARY_BUTTON_CLASS}
          >
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className={PRIMARY_BUTTON_CLASS}
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          <button
            type="button"
            onClick={() => void testKey()}
            disabled={!canTest}
            title={
              canTest
                ? 'Ask Gemini for a tiny reply using the saved key'
                : 'Save your changes first, then test'
            }
            className={SECONDARY_BUTTON_CLASS}
          >
            {testState.kind === 'running' ? 'Testing…' : 'Test connection'}
          </button>
          {settings?.hasKey && (
            <button type="button" onClick={() => void removeKey()} className={LINK_BUTTON_CLASS}>
              Remove key
            </button>
          )}
          {saveNote && (
            <span role="status" className="text-xs text-muted">
              {saveNote}
            </span>
          )}
        </div>

        <div
          role="status"
          aria-live="polite"
          className="mt-3 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-muted"
        >
          {testState.kind === 'idle' &&
            (settings?.hasKey
              ? 'Test the saved key with the model below.'
              : 'Save a key first, then test the connection.')}
          {testState.kind === 'running' && 'Asking Gemini for a tiny reply…'}
          {testState.kind === 'ok' &&
            `✓ ${testState.model} answered in ${testState.latencyMs} ms — key, model and JSON output all work.`}
          {testState.kind === 'error' &&
            `${testState.message}${testState.detail ? ` (${testState.detail})` : ''}`}
        </div>
      </section>

      <section
        className="rounded-2xl border border-line bg-surface-2 p-5"
        aria-labelledby="ll-model-heading"
      >
        <h2 id="ll-model-heading" className="text-sm font-semibold">
          Model &amp; level
        </h2>

        <label className="mt-3 block" htmlFor="ll-model">
          <span className="text-xs font-medium text-muted">Gemini model ID</span>
          <input
            id="ll-model"
            value={modelInput}
            onChange={(event) => setModelInput(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            className={`${INPUT_CLASS} mt-1.5 w-full font-mono text-xs`}
          />
        </label>
        <p className="mt-1.5 text-xs text-muted">
          Any Gemini model your key can use. Default:{' '}
          <span className="font-mono">gemini-3.5-flash-lite</span> — fast and cheap for long
          transcripts.
        </p>

        <fieldset className="mt-4">
          <legend className="text-xs font-medium text-muted">
            Level for summaries, quizzes and facts
          </legend>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {LEVEL_OPTIONS.map((option) => {
              const active = levelInput === option.value
              return (
                <label
                  key={option.value}
                  className={`cursor-pointer rounded-lg border px-2.5 py-2 text-center has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-indigo-500 motion-safe:transition-colors motion-safe:duration-150 ${
                    active ? 'border-indigo-500 bg-indigo-500/10' : 'border-line bg-surface'
                  }`}
                >
                  <input
                    type="radio"
                    name="ll-level"
                    value={option.value}
                    checked={active}
                    onChange={() => setLevelInput(option.value)}
                    className="sr-only"
                  />
                  <span className={`block text-xs font-medium ${active ? 'text-ink' : 'text-muted'}`}>
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-4 text-muted">
                    {option.hint}
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      </section>

      <section
        className="rounded-2xl border border-line bg-surface-2 p-5"
        aria-labelledby="ll-cache-heading"
      >
        <h2 id="ll-cache-heading" className="text-sm font-semibold">
          Cache
        </h2>
        <p className="mt-1 text-sm text-muted">
          {cache === null
            ? 'Loading…'
            : cache.entries === 0
              ? 'No cached content yet.'
              : `${cache.entries} cached ${cache.entries === 1 ? 'entry' : 'entries'} · about ${formatBytes(cache.bytes)}.`}{' '}
          Cached content is never regenerated, so revisiting a video makes no new API calls.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void clearCacheNow()}
            disabled={cache === null || cache.entries === 0}
            className={SECONDARY_BUTTON_CLASS}
          >
            Clear cache
          </button>
          {cacheNote && (
            <span role="status" className="text-xs text-muted">
              {cacheNote}
            </span>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface-2 p-5">
        <h2 className="text-sm font-semibold">Privacy</h2>
        <p className="mt-1 text-sm text-muted">
          Your Gemini API key is stored only in this browser (chrome.storage.local). Transcript
          text and your questions are sent directly to Google&apos;s Gemini API using your own key.
          Nothing is sent to the extension&apos;s developer and no analytics are collected. Cached
          summaries, quizzes and facts never leave your machine.
        </p>
      </section>

      <footer className="pt-1 text-xs text-muted">
        Learning Loop for YouTube
        {typeof chrome !== 'undefined' && chrome.runtime?.getManifest
          ? ` · v${chrome.runtime.getManifest().version}`
          : ''}
      </footer>
    </main>
  )
}
