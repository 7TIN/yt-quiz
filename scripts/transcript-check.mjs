/**
 * End-to-end transcript checks against real YouTube with the BUILT extension
 * loaded into headless Chromium:
 *
 *   npm run build && npm run check:transcript
 *
 * The panel has no transcript UI any more — the transcript is read silently as
 * the first step of the one-click Start flow — so this check drives the real
 * flow and classifies the outcome by what the panel shows:
 *
 *   1. (first case) click Start with no key  → the blocked card asks for the
 *      Gemini key. That is the content script ↔ service worker ↔ storage
 *      round trip, end to end, with zero network involved.
 *   2. seed a DUMMY key, click Start again   → the transcript is read.
 *      - Transcribed cases now reach the Gemini call, which the dummy key
 *        fails — the blocked card says "Gemini rejected the API key". That
 *        message is the proof the transcript arrived.
 *      - Failing cases stop at the transcript: the blocked card carries the
 *        transcript error itself.
 *
 * Cases cover: a lecture with manual captions + chapters, a science video, a
 * video without captions, Strategy B forced by deleting the transcript button,
 * and a live stream. Artifacts (JSON dumps + a screenshot) land in .check/ .
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CdpSession, findBrowser, launchBrowser, delay } from './lib/cdp.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, '.check')
const distDir = join(root, 'dist')
mkdirSync(outDir, { recursive: true })

const browser = findBrowser()
if (!browser) {
  console.error('[check:transcript] no Chromium-based browser found (set LL_BROWSER)')
  process.exit(1)
}

/** Deliberately fake; the read must reach Gemini and be rejected by it. */
const DUMMY_KEY = 'transcript-check-dummy-key-not-a-real-secret'
const KEY_REJECTED = 'Gemini rejected the API key'

const CASES = [
  {
    name: 'lecture-manual-captions',
    url: 'https://www.youtube.com/watch?v=Ks-_Mh1QhMc',
    expect: 'ready',
    screenshot: 'transcript-lecture.png',
  },
  {
    name: 'science-auto-captions',
    url: 'https://www.youtube.com/watch?v=bHIhgxav9LY',
    expect: 'ready',
  },
  {
    name: 'no-captions',
    url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    expect: 'error',
    expectErrorContains: 'No transcript available',
  },
  {
    name: 'forced-strategy-b',
    url: 'https://www.youtube.com/watch?v=Ks-_Mh1QhMc',
    forceStrategyB: true,
    expect: 'error',
    expectErrorContains: "Couldn't read",
  },
  {
    name: 'live-stream',
    url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    expect: 'error',
    // "Live streams aren't supported yet" when the player reports live state;
    // otherwise the generic no-transcript message (live videos have no captions).
    expectErrorContainsOne: ["Live streams aren't supported", 'No transcript available'],
  },
]

const results = []
function verify(caseName, name, actual, expected) {
  const pass = actual === expected
  results.push({ caseName, name, pass, actual, expected })
  console.log(
    `${pass ? 'ok  ' : 'FAIL'}  [${caseName}] ${name} (actual: ${JSON.stringify(actual)})`,
  )
}
function verifyContains(caseName, name, actual, part) {
  const pass = typeof actual === 'string' && actual.includes(part)
  results.push({ caseName, name, pass, expected: `contains ${JSON.stringify(part)}`, actual })
  console.log(`${pass ? 'ok  ' : 'FAIL'}  [${caseName}] ${name}${pass ? '' : ` (actual: ${JSON.stringify(actual)})`}`)
}

const session = await launchBrowser({
  browser,
  url: 'about:blank',
  extraArgs: [`--load-extension=${distDir}`, `--disable-extensions-except=${distDir}`],
  profilePrefix: 'll-transcript-',
})
const cdp = await new CdpSession(session.target.webSocketDebuggerUrl).connect()

/** Evaluates in a specific execution context (the content script's world). */
async function evalInContext(expression, contextId, timeoutMs = 30_000) {
  const result = await cdp.send(
    'Runtime.evaluate',
    { expression, contextId, awaitPromise: true, returnByValue: true, userGesture: true },
    timeoutMs,
  )
  if (result.exceptionDetails) {
    throw new Error(
      `context evaluate failed: ${result.exceptionDetails.text} ${result.exceptionDetails.exception?.description ?? ''}`,
    )
  }
  return result.result?.value
}

/** Clicks the panel's Start / Try again button (same hook in both states). */
function clickStart() {
  return cdp.evaluate(`(() => {
    const button = document.getElementById('learning-loop-host')?.shadowRoot?.querySelector('[data-ll-start]')
    if (!button) return false
    button.click()
    return true
  })()`)
}

function waitForStartState(state, timeoutMs) {
  const expected = JSON.stringify(state)
  return cdp.waitFor(
    `(() => {
      const el = document.getElementById('learning-loop-host')?.shadowRoot?.querySelector('[data-ll-start-state]')
      const value = el?.getAttribute('data-ll-start-state')
      return value === ${expected} ? value : ''
    })()`,
    { timeoutMs },
  )
}

/** What the panel currently says — the only outward signal of the flow. */
function readPanel() {
  return cdp.evaluate(`(() => {
    const shadow = document.getElementById('learning-loop-host')?.shadowRoot
    const card = shadow?.querySelector('[data-ll-start-state]')
    const panel = document.querySelector(
      'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]',
    )
    return {
      startState: card?.getAttribute('data-ll-start-state') ?? null,
      message: (card?.querySelector('p')?.textContent ?? '').replace(/\\s+/g, ' ').trim(),
      panelText: (shadow?.querySelector('[data-ll-panel]')?.textContent ?? '')
        .replace(/\\s+/g, ' ')
        .trim()
        .slice(0, 400),
      openSettingsVisible: Boolean(shadow?.querySelector('[data-ll-open-settings]')),
      panelVisibilityAfterDone: panel?.getAttribute('visibility') ?? 'panel-removed',
      transcriptPanelSegmentsLeftInDom: document.querySelectorAll('ytd-transcript-segment-renderer').length,
    }
  })()`)
}

try {
  // The content script's isolated world (where chrome.storage lives) is
  // announced when the extension injects it; keep every announcement and pick
  // the newest one after each navigation.
  const contexts = []
  cdp.on('Runtime.executionContextCreated', ({ context }) => contexts.push(context))
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')

  async function extensionContextId() {
    for (let attempt = 0; attempt < 100; attempt++) {
      const found = [...contexts]
        .reverse()
        .find(
          (context) =>
            typeof context.origin === 'string' && context.origin.startsWith('chrome-extension://'),
        )
      if (found) return found.id
      await delay(100)
    }
    throw new Error('content script execution context was never announced')
  }

  async function seedDummyKey() {
    const contextId = await extensionContextId()
    return evalInContext(
      `chrome.storage.local.set(${JSON.stringify({
        'll:api-key': DUMMY_KEY,
        'll:settings': { model: 'gemini-3.5-flash-lite', level: 'intermediate', quizEvery: 1 },
      })}).then(() => true)`,
      contextId,
    )
  }

  let keySeeded = false

  /**
   * Waits for the content script's host to mount. On a fresh profile the very
   * first page loads can beat the extension's registration, in which case no
   * content script ever runs in that document — a reload fixes it, so retry.
   */
  async function waitForHostWithReload(attempts = 4) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await cdp.waitFor(`!!document.getElementById('learning-loop-host')`, { timeoutMs: 15_000 })
        return
      } catch {
        if (attempt === attempts) {
          throw new Error(`the panel host never mounted after ${attempts} loads`)
        }
        console.log(`   host not mounted yet — reloading (attempt ${attempt + 1})`)
        await cdp.send('Page.reload')
        await delay(1_500)
      }
    }
  }

  async function runCase(testCase) {
    console.log(`\n---- ${testCase.name}: ${testCase.url}`)
    await cdp.send('Page.navigate', { url: testCase.url })

    // Wait for the extension's host to be mounted by the content script.
    await waitForHostWithReload()

    if (testCase.forceStrategyB) {
      const removed = await cdp.evaluate(`(() => {
        const buttons = [...document.querySelectorAll(
          'button[aria-label="Show transcript"], ytd-video-description-transcript-section-renderer button',
        )]
        for (const button of buttons) button.remove()
        return buttons.length
      })()`)
      console.log(`   removed ${removed} transcript button(s) to force Strategy B`)
    }

    if (!keySeeded) {
      // Start with no key: the flow must stop at the settings check and say so.
      await clickStart()
      await waitForStartState('blocked', 20_000)
      const probe = await readPanel()
      verify(testCase.name, 'Start without a key blocks the flow', probe.startState, 'blocked')
      verifyContains(
        testCase.name,
        'the blocked card asks for the Gemini API key',
        probe.message,
        'API key',
      )
      verify(testCase.name, 'the blocked card offers Open settings', probe.openSettingsVisible, true)

      keySeeded = await seedDummyKey()
      verify(testCase.name, 'dummy key seeded into chrome.storage.local', keySeeded, true)
    } else {
      await seedDummyKey()
    }

    // Click, then wait for the flow to leave the pre-click state. Seeing the
    // "preparing" phase is not guaranteed: a video with no caption tracks at
    // all fails before a poll can catch it, so any observable change counts.
    const before = await readPanel()
    const clicked = await clickStart()
    if (!clicked) {
      verify(testCase.name, 'Start button clickable', clicked, true)
      return
    }

    const moved = await cdp.waitFor(
      `(() => {
        const el = document.getElementById('learning-loop-host')?.shadowRoot?.querySelector('[data-ll-start-state]')
        const state = el?.getAttribute('data-ll-start-state') ?? ''
        const message = (el?.querySelector('p')?.textContent ?? '').replace(/\\s+/g, ' ').trim()
        const previous = ${JSON.stringify({ state: before.startState, message: before.message })}
        if (!state) return ''
        if (state !== previous.state) return state
        if (state === 'blocked' && message !== previous.message) return 'blocked'
        return ''
      })()`,
      { timeoutMs: 60_000 },
    )
    verify(testCase.name, 'the flow moves once Start is clicked', moved !== '', true)

    const final = await waitForStartState('blocked', 120_000)
    verify(testCase.name, 'the flow stops at a blocked card', final, 'blocked')

    const dump = await readPanel()
    writeFileSync(join(outDir, `transcript-${testCase.name}.json`), JSON.stringify(dump, null, 2))
    console.log(JSON.stringify(dump, null, 2))

    if (testCase.expect === 'ready') {
      // The transcript was read: the flow moved on to Gemini and the dummy key
      // was rejected. Anything else means the read never delivered.
      verifyContains(
        testCase.name,
        'transcript arrived — the flow reached the Gemini call',
        dump.message,
        KEY_REJECTED,
      )
      const expanded = dump.panelVisibilityAfterDone === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED'
      verify(testCase.name, 'transcript panel hidden after scraping', expanded ? 'expanded' : 'hidden', 'hidden')
    }
    if (testCase.expect === 'error' && testCase.expectErrorContains) {
      verifyContains(
        testCase.name,
        `error message mentions ${JSON.stringify(testCase.expectErrorContains)}`,
        dump.message,
        testCase.expectErrorContains,
      )
    }
    if (testCase.expect === 'error' && testCase.expectErrorContainsOne) {
      const matched = testCase.expectErrorContainsOne.some((part) => dump.message.includes(part))
      results.push({
        caseName: testCase.name,
        name: `error message matches one of ${JSON.stringify(testCase.expectErrorContainsOne)}`,
        pass: matched,
        actual: dump.message,
      })
      console.log(
        `${matched ? 'ok  ' : 'FAIL'}  [${testCase.name}] error message matches one of ${JSON.stringify(
          testCase.expectErrorContainsOne,
        )}`,
      )
    }

    if (testCase.screenshot) {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(join(outDir, testCase.screenshot), Buffer.from(shot.data, 'base64'))
      console.log(`   screenshot: .check/${testCase.screenshot}`)
    }

    await delay(500)
  }

  // Warm-up: on a fresh profile the first document load can beat the extension's
  // registration (no content script runs in it at all, so no panel ever mounts).
  // Loading the first case once — reloading only if needed — gets past that, so
  // every real case starts from a page the extension is fully active in.
  await cdp.send('Page.navigate', { url: CASES[0].url })
  await waitForHostWithReload()

  for (const testCase of CASES) {
    try {
      await runCase(testCase)
    } catch (error) {
      // One bad case must not hide the rest of the run.
      const message = error instanceof Error ? error.message : String(error)
      results.push({ caseName: testCase.name, name: 'case ran to completion', pass: false, actual: message })
      console.log(`FAIL  [${testCase.name}] case ran to completion — ${message}`)
    }
  }
} finally {
  cdp.close()
  await session.kill()
}

const failed = results.filter((result) => !result.pass)
console.log('')
if (failed.length > 0) {
  console.error(`[check:transcript] ${failed.length}/${results.length} checks failed`)
  process.exitCode = 1
} else {
  console.log(`[check:transcript] all ${results.length} checks passed`)
}
