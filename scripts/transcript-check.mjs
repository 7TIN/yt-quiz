/**
 * End-to-end transcript checks against real YouTube with the BUILT extension
 * loaded into headless Chromium:
 *
 *   npm run build && npm run check:transcript
 *
 * For each case it clicks "Read transcript" inside the panel's shadow DOM and
 * waits for the card to reach a `ready` or `error` state, then asserts what the
 * user would see. Cases cover: a lecture with manual captions + chapters, a
 * science video, a video without captions, Strategy B forced by deleting the
 * transcript button, and a live stream.
 *
 * Artifacts (JSON dumps + screenshots) land in .check/ .
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

const CASES = [
  {
    name: 'lecture-manual-captions',
    url: 'https://www.youtube.com/watch?v=Ks-_Mh1QhMc',
    expect: 'ready',
    expectChapters: true,
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
    // 'Live streams aren't supported yet' when the player reports live state;
    // otherwise the generic no-transcript message (live videos have no captions).
    expectErrorContainsOne: ["Live streams aren't supported", 'No transcript available'],
  },
]

const results = []
function verify(caseName, name, actual, expected) {
  const pass = expected === undefined ? true : actual === expected
  results.push({ caseName, name, pass, actual, expected })
  console.log(`${pass ? 'ok  ' : 'FAIL'}  [${caseName}] ${name}${expected === undefined ? '' : ` (actual: ${JSON.stringify(actual)})`}`)
}
function verifyContains(caseName, name, actual, part) {
  const pass = typeof actual === 'string' && actual.includes(part)
  results.push({ caseName, name, pass, expected: `contains ${JSON.stringify(part)}`, actual })
  console.log(`${pass ? 'ok  ' : 'FAIL'}  [${caseName}] ${name}`)
}

const session = await launchBrowser({
  browser,
  url: 'about:blank',
  extraArgs: [`--load-extension=${distDir}`, `--disable-extensions-except=${distDir}`],
  profilePrefix: 'll-transcript-',
})
const cdp = await new CdpSession(session.target.webSocketDebuggerUrl).connect()

let allPassed = true
try {
  await cdp.send('Page.enable')
  for (const testCase of CASES) {
    console.log(`\n---- ${testCase.name}: ${testCase.url}`)
    await cdp.send('Page.navigate', { url: testCase.url })

    // Wait for the extension's host to be mounted by the content script.
    await cdp.waitFor(`!!document.getElementById('learning-loop-host')`, { timeoutMs: 30_000 })

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

    const clicked = await cdp.evaluate(`(() => {
      const host = document.getElementById('learning-loop-host')
      const button = host?.shadowRoot ? [...host.shadowRoot.querySelectorAll('button')].find((b) => /read transcript/i.test(b.textContent)) : null
      if (!button) return false
      button.click()
      return true
    })()`)
    if (!clicked) {
      verify(testCase.name, 'Read transcript button clickable', false, true)
      continue
    }

    const state = await cdp.waitFor(
      `(() => {
        const card = document.getElementById('learning-loop-host')?.shadowRoot?.querySelector('[data-ll-transcript-state]')
        const state = card?.getAttribute('data-ll-transcript-state')
        return state === 'ready' || state === 'error' ? state : ''
      })()`,
      { timeoutMs: 60_000 },
    )

    const dump = await cdp.evaluate(`(() => {
      const sr = document.getElementById('learning-loop-host').shadowRoot
      const card = sr.querySelector('[data-ll-transcript-state]')?.closest('[data-ll-card]')
      const panel = document.querySelector(
        'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]',
      )
      return {
        state: sr.querySelector('[data-ll-transcript-state]')?.getAttribute('data-ll-transcript-state'),
        text: (card?.innerText ?? '').replace(/\\s+/g, ' ').trim().slice(0, 600),
        previews: [...sr.querySelectorAll('[data-ll-transcript-preview] li')].map((li) =>
          (li.textContent ?? '').replace(/\\s+/g, ' ').trim(),
        ),
        panelVisibilityAfterDone: panel?.getAttribute('visibility') ?? 'panel-removed',
        transcriptPanelSegmentsLeftInDom: document.querySelectorAll('ytd-transcript-segment-renderer').length,
      }
    })()`)

    writeFileSync(join(outDir, `transcript-${testCase.name}.json`), JSON.stringify(dump, null, 2))
    console.log(JSON.stringify(dump, null, 2))

    verify(testCase.name, 'final state', state, testCase.expect)
    if (testCase.expect === 'error' && testCase.expectErrorContains) {
      verifyContains(testCase.name, `error message mentions ${JSON.stringify(testCase.expectErrorContains)}`, dump.text, testCase.expectErrorContains)
    }
    if (testCase.expect === 'error' && testCase.expectErrorContainsOne) {
      const matched = testCase.expectErrorContainsOne.some((part) => dump.text.includes(part))
      results.push({
        caseName: testCase.name,
        name: `error message matches one of ${JSON.stringify(testCase.expectErrorContainsOne)}`,
        pass: matched,
        actual: dump.text,
      })
      console.log(`${matched ? 'ok  ' : 'FAIL'}  [${testCase.name}] error message matches one of ${JSON.stringify(testCase.expectErrorContainsOne)}`)
    }
    // A failed read (YouTube flake) shows the error card; without a transcript
    // the overview card never mounts, so only assert on it — and on the chunk
    // text — when the transcript actually arrived. The state mismatch above is
    // already recorded as a failure.
    if (testCase.expect === 'ready' && state === 'ready') {
      verifyContains(testCase.name, 'shows a chunk count', dump.text, 'Chunks')
      verifyContains(testCase.name, 'source is the transcript panel', dump.text, 'YouTube transcript panel')
      verify(testCase.name, 'preview has non-empty chunks', dump.previews.some((p) => p.length > 0), true)
      const panelExpanded = dump.panelVisibilityAfterDone === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED'
      verify(testCase.name, 'transcript panel hidden after scraping', panelExpanded ? 'expanded' : 'hidden', 'hidden')
      if (testCase.expectChapters) verifyContains(testCase.name, 'creator chapters detected', dump.text, 'YouTube chapters')

      // The overview card mounts once the transcript is ready. A fresh test
      // profile has no API key, so it must ask for one — which also proves the
      // content script ↔ service worker round trip end to end.
      const overviewState = await cdp.waitFor(
        `(() => {
          const el = document.getElementById('learning-loop-host')?.shadowRoot?.querySelector('[data-ll-overview-state]')
          const state = el?.getAttribute('data-ll-overview-state')
          return state && state !== 'loading' ? state : ''
        })()`,
        { timeoutMs: 15_000 },
      )
      verify(testCase.name, 'overview card asks for an API key (none saved)', overviewState, 'no-key')
      const overviewText = await cdp.evaluate(`(() => {
        const el = document.getElementById('learning-loop-host')?.shadowRoot?.querySelector('[data-ll-overview-state]')
        return el ? (el.textContent ?? '').replace(/\\s+/g, ' ').trim().slice(0, 300) : ''
      })()`)
      verifyContains(testCase.name, 'overview card points at the settings', overviewText, 'Open settings')
    }

    if (testCase.screenshot) {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(join(outDir, testCase.screenshot), Buffer.from(shot.data, 'base64'))
      console.log(`   screenshot: .check/${testCase.screenshot}`)
    }

    await delay(500)
  }
} finally {
  cdp.close()
  await session.kill()
}

const failed = results.filter((result) => !result.pass)
allPassed = failed.length === 0
console.log('')
if (!allPassed) {
  console.error(`[check:transcript] ${failed.length}/${results.length} checks failed`)
  process.exitCode = 1
} else {
  console.log(`[check:transcript] all ${results.length} checks passed`)
}
