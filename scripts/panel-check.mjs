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
  .player { aspect-ratio: 16/9; background: #000; border-radius: 12px; }
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
  <div><div class="player" id="movie_player"><video class="html5-main-video"></video></div></div>
  ${hasSecondary ? '<div id="secondary"><div id="secondary-inner"><div class="related">related videos (fake)</div></div></div>' : ''}
  ${hasBelow ? '<div id="below">description / comments (fake)</div>' : ''}
</div>
<pre id="ll-report">pending</pre>
<script src="./panel.js"></script>
<script>
  const MODE = ${JSON.stringify(mode)}
  const errors = []
  window.addEventListener('error', (event) => errors.push(String(event.message || event.error)))
  window.addEventListener('unhandledrejection', (event) => errors.push('unhandledrejection: ' + String(event.reason)))
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  if (MODE === 'seeded') {
    const video = document.querySelector('#movie_player video')
    window.__llSeek = null
    // Record programmatic seeks instead of moving a real media element.
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get() {
        return window.__llSeek ?? 0
      },
      set(value) {
        window.__llSeek = value
      },
    })
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

  function readReport(host, card, shadow, extra) {
    const panel = shadow.querySelector('[data-ll-panel]')
    const panelSurface = shadow.querySelector('[data-ll-panel] > div')
    const heading = shadow.querySelector('h2')
    const wrapper = shadow.querySelector('[data-ll-root] > section')
    const panelStyle = getComputedStyle(panel)
    const cardStyle = getComputedStyle(card)
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
      for (let i = 0; i < 100; i++) {
        const state = found.shadow
          .querySelector('[data-ll-overview-state]')
          ?.getAttribute('data-ll-overview-state')
        if (state === 'ready') break
        await sleep(50)
      }
      const chapterButtons = [...found.shadow.querySelectorAll('[data-ll-chapter]')]
      // Click the second chapter: must seek the (fake) video to its startSec.
      chapterButtons[1]?.click()
      await sleep(50)
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
      }
    }

    await sleep(120)
    report.textContent = JSON.stringify(
      readReport(found.host, found.card, found.shadow, { toggledDark, ...seeded }),
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
verify('seeded: no page errors', seeded.errors.length, 0)

// ------------------------------------------------------------------ screenshots

console.log('[check:panel] taking screenshots...')
for (const page of PAGES.filter((candidate) => ['light', 'dark', 'seeded'].includes(candidate.mode))) {
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
