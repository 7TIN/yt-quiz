/**
 * Renders the real panel (same controller as the content script) in a fake
 * YouTube shell inside headless Chromium and asserts what actually got
 * rendered: placement, theme plumbing, Shadow DOM style resolution.
 *
 * Why this exists: Tailwind v4 CSS inside a shadow root needs two workarounds
 * (see src/content/inject-styles.ts). Unit tests cannot prove those — only a
 * real render can, so this script renders and checks computed styles.
 *
 * Run: npm run check:panel   (adds --keep to keep artifacts open-able)
 * Artifacts (preview pages + screenshots) land in .check/ .
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { build } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, '.check')
const previewDir = join(outDir, 'preview')

// --------------------------------------------------------- build the preview

rmSync(outDir, { recursive: true, force: true })
mkdirSync(previewDir, { recursive: true })

console.log('[check:panel] building preview bundle (IIFE, file:// friendly)...')
await build({
  configFile: false,
  root,
  publicDir: false,
  logLevel: 'warn',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: previewDir,
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      input: join(root, 'src/dev/main.tsx'),
      output: { format: 'iife', entryFileNames: 'panel.js' },
    },
  },
})

// ------------------------------------------------------------ fake YT pages

const FAKE_YOUTUBE_CSS = `
  body { margin: 0; font-family: Arial, sans-serif; background: #f9f9f9; color: #0f0f0f; }
  html[dark] body { background: #0f0f0f; color: #f1f1f1; }
  .layout { display: grid; grid-template-columns: minmax(0,1fr) 402px; gap: 24px; padding: 24px; }
  .player { position: relative; aspect-ratio: 16/9; background: #000; border-radius: 12px; }
  .ytp-progress-bar-container { position: absolute; left: 0; right: 0; bottom: 6px; height: 5px; background: #666; }
  #below { grid-column: 1 / -1; border: 1px dashed #888; border-radius: 12px; padding: 10px; }
  #ll-report { display: none; }
`

function pageHtml({ mode, hasSecondary, hasBelow }) {
  const startDark = mode === 'dark'
  return `<!doctype html>
<html lang="en"${startDark ? ' dark' : ''}>
<head>
<meta charset="utf-8">
<title>panel check: ${mode}</title>
<style>${FAKE_YOUTUBE_CSS}</style>
</head>
<body>
<div class="layout">
  <div><div class="player" id="movie_player"><video class="html5-main-video"></video><div class="ytp-progress-bar-container"><div class="ytp-progress-bar"></div></div></div></div>
  ${hasSecondary ? '<div id="secondary"><div id="secondary-inner"><div class="related">related videos (fake)</div></div></div>' : ''}
  ${hasBelow ? '<div id="below">description / comments (fake)</div>' : ''}
</div>
<pre id="ll-report">pending</pre>
<script src="./panel.js"></script>
<script>
  const MODE = ${JSON.stringify(mode)}
  const HOLD = new URLSearchParams(location.search).get('hold') === '1'
  const errors = []
  window.addEventListener('error', (event) => errors.push(String(event.message || event.error)))
  window.addEventListener('unhandledrejection', (event) => errors.push('unhandledrejection: ' + String(event.reason)))
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  const FAKE_VIDEO_MODES = ['seeded', 'quizloop', 'quizloop-hold']
  if (FAKE_VIDEO_MODES.includes(MODE)) {
    // A scriptable stand-in for the player: currentTime is a clock we move by
    // hand, and pause/play are recorded so the loop's behavior is observable.
    const video = document.querySelector('#movie_player video')
    window.__llTime = 0
    window.__llSeek = null
    window.__llPaused = false
    window.__llEnded = false
    window.__llDuration = 250
    window.__llPauseCalls = 0
    window.__llPlayCalls = 0
    Object.defineProperties(video, {
      currentTime: {
        configurable: true,
        get: () => window.__llTime,
        set: (value) => {
          window.__llTime = value
          window.__llSeek = value
        },
      },
      paused: { configurable: true, get: () => window.__llPaused },
      ended: { configurable: true, get: () => window.__llEnded },
      duration: { configurable: true, get: () => window.__llDuration },
    })
    video.pause = () => {
      window.__llPaused = true
      window.__llPauseCalls += 1
    }
    video.play = () => {
      window.__llPaused = false
      window.__llPlayCalls += 1
      return Promise.resolve()
    }
    // YouTube's player shortcuts listen on the document. Record what actually
    // reaches it so the check can prove answer typing stops at the quiz card.
    window.__llDocumentKeys = []
    document.addEventListener('keydown', (event) => window.__llDocumentKeys.push(event.key))
  }

  async function waitForPanel() {
    for (let i = 0; i < 800; i++) {
      const host = document.getElementById('learning-loop-host')
      const card = host && host.shadowRoot && host.shadowRoot.querySelector('[data-ll-card]')
      if (card) return { host, card, shadow: host.shadowRoot }
      await sleep(50)
    }
    return null
  }

  async function waitForOverview(shadow) {
    for (let i = 0; i < 120; i++) {
      const state = shadow.querySelector('[data-ll-overview-state]')?.getAttribute('data-ll-overview-state')
      if (state === 'ready') return true
      await sleep(50)
    }
    return false
  }

  /**
   * Drives the learning loop against the fake video: starts it, walks the
   * clock across chapter boundaries, answers the question through the dev
   * stub, and records everything the assertions need. No real media involved.
   */
  async function runQuizLoop(shadow) {
    const out = {}
    /**
     * The quiz card lives in its own shadow root inside the player (over the
     * video); the panel's shadow root is only the fallback spot.
     */
    const overlayShadow = () => document.querySelector('.ll-quiz-overlay')?.shadowRoot ?? null
    const q = (selector) => overlayShadow()?.querySelector(selector) ?? shadow.querySelector(selector)
    const dots = () => [...document.querySelectorAll('[data-ll-quiz-marker]')]
    const dotStates = () => dots().map((dot) => dot.getAttribute('data-ll-quiz-marker-state')).join('|')
    const waitForQuizState = async (value, tries = 140) => {
      for (let i = 0; i < tries; i++) {
        const el = q('[data-ll-quiz-card]')
        if (el && el.getAttribute('data-ll-quiz-state') === value) return true
        await sleep(50)
      }
      return false
    }
    const step = async (time, wait = 540) => {
      window.__llTime = time
      await sleep(wait)
    }

    out.overviewReady = await waitForOverview(shadow)

    // One click: transcript (already cached here) → overview → armed loop.
    const start = shadow.querySelector('[data-ll-start]')
    out.startPresent = Boolean(start)
    out.startCardInitial = shadow
      .querySelector('[data-ll-start-state]')
      ?.getAttribute('data-ll-start-state')
    start?.click()
    for (let i = 0; i < 60; i++) {
      if (
        shadow.querySelector('[data-ll-start-state]')?.getAttribute('data-ll-start-state') === 'active'
      )
        break
      await sleep(50)
    }
    out.startCardAfter = shadow
      .querySelector('[data-ll-start-state]')
      ?.getAttribute('data-ll-start-state')
    out.toggleActive = shadow
      .querySelector('[data-ll-loop-toggle]')
      ?.getAttribute('data-ll-loop-active')
    await sleep(220)

    // Dots on the player's own timeline: where the questions are.
    out.markerCount = dots().length
    out.markersInProgressBar = Boolean(
      document.querySelector('.ytp-progress-bar-container .ll-timeline-markers'),
    )
    out.markerStatesBefore = dotStates()

    // Chapter boundary for chapter 1 sits at 88s.
    await step(10)
    await step(60)
    await step(85)
    await step(88.6)

    out.sawQuiz = await waitForQuizState('quiz')
    out.quizState = q('[data-ll-quiz-card]')?.getAttribute('data-ll-quiz-state')
    out.question = (q('[data-ll-quiz-question]')?.textContent ?? '').trim()
    out.pausedAfterTrigger = window.__llPaused
    out.pauseCalls = window.__llPauseCalls
    out.overlayScrimShown = Boolean(overlayShadow()?.querySelector('[data-ll-quiz-overlay-scrim]'))
    out.panelNoteShown = Boolean(shadow.querySelector('[data-ll-quiz-panel-note]'))
    out.markerStatesAfterFirstQuiz = dotStates()

    // Typing must never drive the player: a keydown from the answer box has to
    // stop at the card, so the document-level listener sees nothing.
    const textarea = q('[data-ll-quiz-answer]')
    for (const key of ['k', 'j', 'l', 'f', 't', 'c']) {
      textarea?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }))
      textarea?.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, composed: true }))
    }
    await sleep(60)
    out.keysReachedDocument = window.__llDocumentKeys.join('|')

    q('[data-ll-quiz-hint]')?.click()
    await sleep(80)
    const cardHost = overlayShadow()?.querySelector('[data-ll-quiz-card]') ? overlayShadow() : shadow
    out.hintText = [...cardHost.querySelectorAll('[data-ll-quiz-hint-item]')]
      .map((el) => el.textContent)
      .join(' | ')

    const submit = q('[data-ll-quiz-submit]')
    out.submitDisabledBefore = submit ? submit.disabled : null
    if (textarea) {
      const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
      setValue.call(textarea, 'It makes the text feel familiar, and familiarity feels like knowing it.')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await sleep(80)
    out.submitDisabledAfter = submit ? submit.disabled : null
    submit?.click()

    out.sawJudged = await waitForQuizState('judged')
    out.verdict = q('[data-ll-quiz-verdict]')?.getAttribute('data-ll-quiz-verdict')
    out.feedback = (q('[data-ll-quiz-feedback]')?.textContent ?? '').trim()

    q('[data-ll-quiz-resume]')?.click()
    await sleep(160)
    out.cardGoneAfterResume = q('[data-ll-quiz-card]') === null
    out.overlayClearedAfterResume = !overlayShadow()?.querySelector('[data-ll-quiz-overlay-scrim]')
    out.panelNoteClearedAfterResume = !shadow.querySelector('[data-ll-quiz-panel-note]')
    out.pausedAfterResume = window.__llPaused
    out.playCalls = window.__llPlayCalls

    // Next boundary (chapter 2 at 137s) with small natural steps.
    await step(100)
    await step(120)
    await step(136)
    await step(137.6)
    out.sawSecondQuiz = await waitForQuizState('quiz')
    out.secondQuizHeader = (q('[data-ll-quiz-card] h3')?.textContent ?? '').trim()

    if (HOLD) return out

    // Leave quiz 2 unanswered: skipping must also give playback back.
    q('[data-ll-quiz-skip]')?.click()
    await sleep(160)
    out.cardGoneAfterSkip = q('[data-ll-quiz-card]') === null
    out.pausedAfterSkip = window.__llPaused

    // A big forward jump must skip the boundaries it crossed, not quiz on them.
    window.__llTime = 250
    await sleep(620)
    out.skippedAfterSeek = q('[data-ll-quiz-card]') === null
    window.__llTime = 250
    await sleep(540)
    out.stillNoCard = q('[data-ll-quiz-card]') === null
    return out
  }

  function readReport(host, card, shadow, extra) {
    const panel = shadow.querySelector('[data-ll-panel]')
    const panelSurface = shadow.querySelector('[data-ll-panel] > div')
    const heading = shadow.querySelector('h2')
    const wrapper = shadow.querySelector('[data-ll-root] > section')
    // The token checks want a plain card; the one-click start card is a
    // tinted hero and would not show the neutral surface/line tokens.
    const plainCard = shadow.querySelector('[data-ll-card]:not([data-ll-start-state])') ?? card
    const panelStyle = getComputedStyle(panel)
    const cardStyle = getComputedStyle(plainCard)
    const hostStyle = getComputedStyle(host)
    const headingStyle = getComputedStyle(heading)
    return {
      mode: MODE,
      host: {
        placement: host.getAttribute('data-ll-placement'),
        theme: host.getAttribute('data-theme'),
        parentId: host.parentElement ? host.parentElement.id : null,
        isFirstChild: host.parentElement ? host.parentElement.firstElementChild === host : false,
        position: hostStyle.position,
      },
      computed: {
        cardBg: cardStyle.backgroundColor,
        cardBorder: cardStyle.borderTopColor,
        cardRadius: cardStyle.borderTopLeftRadius,
        panelBg: getComputedStyle(panelSurface).backgroundColor,
        panelRadius: getComputedStyle(panelSurface).borderTopLeftRadius,
        headingSize: headingStyle.fontSize,
        headingWeight: headingStyle.fontWeight,
        fontFamily: getComputedStyle(wrapper).fontFamily,
        colorScheme: getComputedStyle(panel).colorScheme,
        hostDisplay: hostStyle.display,
      },
      errors: [...errors],
      ...extra,
    }
  }

  ;(async () => {
    const report = document.getElementById('ll-report')
    const found = await waitForPanel()
    if (!found) {
      report.textContent = JSON.stringify({ mode: MODE, fatal: 'panel did not mount', errors })
      return
    }
    let toggledDark = false
    if (MODE === 'dynamic') {
      // Flip YouTube's theme AFTER the panel mounted: proves the live-update path.
      document.documentElement.setAttribute('dark', '')
      toggledDark = true
      await sleep(300)
    }

    let seeded = {}
    if (MODE === 'seeded') {
      // Wait for the overview card to finish loading its seeded data.
      await waitForOverview(found.shadow)
      const chapterButtons = [...found.shadow.querySelectorAll('[data-ll-chapter]')]
      // Click the second chapter: must seek the (fake) video to its startSec.
      chapterButtons[1]?.click()
      await sleep(50)
      const loopToggle = found.shadow.querySelector('[data-ll-loop-toggle]')
      seeded = {
        overviewState: found.shadow
          .querySelector('[data-ll-overview-state]')
          ?.getAttribute('data-ll-overview-state'),
        overviewText: (found.shadow.querySelector('[data-ll-overview-text]')?.textContent ?? '').trim(),
        takeawayCount: found.shadow.querySelectorAll('[data-ll-takeaways] li').length,
        chapterTitles: chapterButtons.map(
          (button) => (button.querySelector('span > span')?.textContent ?? '').trim(),
        ),
        seekedTo: window.__llSeek,
        loopTogglePresent: Boolean(loopToggle),
        loopToggleActive: loopToggle?.getAttribute('data-ll-loop-active'),
        startCardState: found.shadow
          .querySelector('[data-ll-start-state]')
          ?.getAttribute('data-ll-start-state'),
        startButtonPresent: Boolean(found.shadow.querySelector('[data-ll-start]')),
      }
    }

    let quizloop = {}
    if (MODE === 'quizloop' || MODE === 'quizloop-hold') {
      quizloop = await runQuizLoop(found.shadow)
    }

    await sleep(120)
    report.textContent = JSON.stringify(
      readReport(found.host, found.card, found.shadow, { toggledDark, ...seeded, ...quizloop }),
    )
  })()
</script>
</body>
</html>
`
}

const PAGES = [
  { mode: 'light', hasSecondary: true, hasBelow: true },
  { mode: 'dark', hasSecondary: true, hasBelow: true },
  { mode: 'dynamic', hasSecondary: true, hasBelow: true },
  { mode: 'below', hasSecondary: false, hasBelow: true },
  { mode: 'floating', hasSecondary: false, hasBelow: false },
  // Seeded demo data (src/dev/seed.ts): renders the transcript + overview
  // cards with no extension and no API key, so the full UI can be verified.
  { mode: 'seeded', hasSecondary: true, hasBelow: true, query: '?v=devseed1&seed=1' },
  // Same seed plus a scriptable fake video: starts the learning loop, walks
  // the clock across chapter boundaries, answers and resumes.
  { mode: 'quizloop', hasSecondary: true, hasBelow: true, query: '?v=devseed1&seed=1' },
  // Stops while the second quiz card is open — used for the screenshot.
  { mode: 'quizloop-hold', hasSecondary: true, hasBelow: true, query: '?v=devseed1&seed=1&hold=1' },
]

for (const page of PAGES) {
  writeFileSync(join(previewDir, `${page.mode}.html`), pageHtml(page))
}

// ------------------------------------------------------------ find a browser

const browserCandidates = [
  process.env.LL_BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)

const browser = browserCandidates.find((candidate) => existsSync(candidate))
if (!browser) {
  console.warn('[check:panel] no Chromium-based browser found (set LL_BROWSER); skipping render checks.')
  process.exit(0)
}
console.log(`[check:panel] browser: ${browser}`)

const profileDir = join(outDir, 'profile')
const baseArgs = [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  `--user-data-dir=${profileDir}`,
  '--virtual-time-budget=30000',
  '--hide-scrollbars',
]

function runBrowser(args) {
  return execFileSync(browser, [...baseArgs, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
}

function pageUrl(page) {
  return pathToFileURL(join(previewDir, `${page.mode}.html`)).href + (page.query ?? '')
}

function readReport(page) {
  const dom = runBrowser(['--dump-dom', pageUrl(page)])
  const match = /<pre id="ll-report">([\s\S]*?)<\/pre>/.exec(dom)
  if (!match) throw new Error(`no report element on page "${mode}"`)
  const text = match[1]
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
  return JSON.parse(text)
}

// ------------------------------------------------------------------ assertions

const results = []
function verify(name, actual, expected) {
  const pass = actual === expected
  results.push({ name, pass, actual, expected })
}

function verifyContains(name, actual, part) {
  verify(name, typeof actual === 'string' && actual.includes(part), true)
}

console.log('[check:panel] rendering pages...')
const reports = {}
for (const page of PAGES) reports[page.mode] = readReport(page)

const light = reports.light
verify('light: placement is secondary', light.host.placement, 'secondary')
verify('light: host sits in #secondary-inner', light.host.parentId, 'secondary-inner')
verify('light: host is the first child (above related)', light.host.isFirstChild, true)
verify('light: theme is light', light.host.theme, 'light')
verify('light: card uses --ll-surface-2 token', light.computed.cardBg, 'rgb(247, 247, 247)')
verify('light: card border uses --ll-line token', light.computed.cardBorder, 'rgb(230, 230, 230)')
verify('light: rounded-xl card resolves to 12px', light.computed.cardRadius, '12px')
verify('light: panel surface uses --ll-surface token', light.computed.panelBg, 'rgb(255, 255, 255)')
verify('light: rounded-2xl container resolves to 16px', light.computed.panelRadius, '16px')
verify('light: text-sm heading is 14px', light.computed.headingSize, '14px')
verify('light: font-semibold heading is 600', light.computed.headingWeight, '600')
verifyContains('light: font-sans resolves to Roboto stack', light.computed.fontFamily, 'Roboto')
verify('light: color-scheme follows theme', light.computed.colorScheme, 'light')
verify('light: host display is block', light.computed.hostDisplay, 'block')
verify('light: no page errors', light.errors.length, 0)

const dark = reports.dark
verify('dark: theme is dark', dark.host.theme, 'dark')
verify('dark: card uses dark surface token', dark.computed.cardBg, 'rgb(47, 47, 47)')
verify('dark: panel surface uses dark token', dark.computed.panelBg, 'rgb(33, 33, 33)')
verify('dark: card border uses dark line token', dark.computed.cardBorder, 'rgb(61, 61, 61)')
verify('dark: color-scheme flips to dark', dark.computed.colorScheme, 'dark')
verify('dark: no page errors', dark.errors.length, 0)

const dynamic = reports.dynamic
verify('dynamic: toggled after mount', dynamic.toggledDark, true)
verify('dynamic: panel followed the live theme change', dynamic.host.theme, 'dark')
verify('dynamic: dark tokens applied after live change', dynamic.computed.cardBg, 'rgb(47, 47, 47)')
verify('dynamic: no page errors', dynamic.errors.length, 0)

const below = reports.below
verify('below: falls back below the player', below.host.placement, 'below')
verify('below: host sits in #below', below.host.parentId, 'below')
verify('below: no page errors', below.errors.length, 0)

const floating = reports.floating
verify('floating: falls back to floating panel', floating.host.placement, 'floating')
verify('floating: host is position:fixed', floating.host.position, 'fixed')
verify('floating: no page errors', floating.errors.length, 0)

const seeded = reports.seeded
verify('seeded: overview card reaches ready', seeded.overviewState, 'ready')
verifyContains('seeded: overview text rendered', seeded.overviewText, 'Studying harder usually means studying worse')
verify('seeded: takeaways rendered', seeded.takeawayCount, 4)
verify('seeded: chapter rail lists five chapters', seeded.chapterTitles.length, 5)
verify('seeded: chapter titles come from cached data', seeded.chapterTitles[0], 'Why reviewing feels productive')
verify('seeded: clicking a chapter seeks the video', seeded.seekedTo, 88)
verify('seeded: learning-loop toggle renders', seeded.loopTogglePresent, true)
verify('seeded: learning-loop starts switched off', seeded.loopToggleActive, 'false')
verify('seeded: one-click start card renders', seeded.startButtonPresent, true)
verify('seeded: start card starts idle', seeded.startCardState, 'idle')
verify('seeded: no page errors', seeded.errors.length, 0)

const quizloop = reports.quizloop
verify('quizloop: overview reaches ready', quizloop.overviewReady, true)
verify('quizloop: one-click start button renders', quizloop.startPresent, true)
verify('quizloop: start card begins idle', quizloop.startCardInitial, 'idle')
verify('quizloop: one click arms the loop', quizloop.startCardAfter, 'active')
verify('quizloop: the same click switched the loop toggle on', quizloop.toggleActive, 'true')
verify('quizloop: timeline dots show every quiz moment', quizloop.markerCount, 5)
verify('quizloop: dots live inside the progress bar container', quizloop.markersInProgressBar, true)
verify('quizloop: dots start pending', quizloop.markerStatesBefore, 'pending|pending|pending|pending|pending')
verify('quizloop: crossing a chapter boundary shows a question', quizloop.sawQuiz, true)
verifyContains('quizloop: question text comes from the stub', quizloop.question, 'rereading a chapter')
verify('quizloop: the question opens over the video', quizloop.overlayScrimShown, true)
verify('quizloop: the panel keeps a pointer to the open question', quizloop.panelNoteShown, true)
verify('quizloop: answering marks that dot done', quizloop.markerStatesAfterFirstQuiz, 'done|pending|pending|pending|pending')
verify('quizloop: the crossing paused the video', quizloop.pausedAfterTrigger, true)
verify('quizloop: pause happened exactly once', quizloop.pauseCalls, 1)
verify('quizloop: typing never reaches the document (player shortcuts safe)', quizloop.keysReachedDocument, '')
verifyContains('quizloop: hint reveals the first hint', quizloop.hintText, 'recognising a page')
verify('quizloop: submit is disabled with an empty answer', quizloop.submitDisabledBefore, true)
verify('quizloop: submit enables once an answer is typed', quizloop.submitDisabledAfter, false)
verify('quizloop: judging renders the verdict', quizloop.verdict, 'correct')
verifyContains('quizloop: judging renders the feedback', quizloop.feedback, 'familiarity trap')
verify('quizloop: resume dismisses the card', quizloop.cardGoneAfterResume, true)
verify('quizloop: resume clears the overlay from the video', quizloop.overlayClearedAfterResume, true)
verify('quizloop: resume removes the panel note', quizloop.panelNoteClearedAfterResume, true)
verify('quizloop: resume gives playback back', quizloop.pausedAfterResume, false)
verify('quizloop: play was called exactly once', quizloop.playCalls, 1)
verify('quizloop: the next boundary quizzes the next chapter', quizloop.sawSecondQuiz, true)
verifyContains('quizloop: second card names chapter 2', quizloop.secondQuizHeader, 'Active recall')
verify('quizloop: skip dismisses the second card', quizloop.cardGoneAfterSkip, true)
verify('quizloop: skip gives playback back', quizloop.pausedAfterSkip, false)
verify('quizloop: forward seek skips crossed boundaries', quizloop.skippedAfterSeek, true)
verify('quizloop: no quiz appears after the skipped boundaries', quizloop.stillNoCard, true)
verify('quizloop: no page errors', quizloop.errors.length, 0)

// ------------------------------------------------------------------ screenshots

console.log('[check:panel] taking screenshots...')
for (const page of PAGES.filter((candidate) =>
  ['light', 'dark', 'seeded', 'quizloop-hold'].includes(candidate.mode),
)) {
  const shot = join(outDir, `panel-${page.mode}.png`)
  runBrowser([
    '--force-device-scale-factor=2',
    '--window-size=1400,860',
    `--screenshot=${shot}`,
    pageUrl(page),
  ])
  console.log(`[check:panel] screenshot: ${shot}`)
}

// ------------------------------------------------------------------ summary

let failed = 0
for (const result of results) {
  if (!result.pass) {
    failed++
    console.error(`FAIL  ${result.name}  (actual: ${JSON.stringify(result.actual)}, expected: ${JSON.stringify(result.expected)})`)
  } else {
    console.log(`ok    ${result.name}`)
  }
}

console.log('')
if (failed > 0) {
  console.error(`[check:panel] ${failed}/${results.length} checks failed`)
  process.exitCode = 1
} else {
  console.log(`[check:panel] all ${results.length} checks passed`)
}
