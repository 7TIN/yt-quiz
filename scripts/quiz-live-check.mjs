/**
 * Live end-to-end check of the learning loop on real YouTube, with the built
 * extension loaded and a DUMMY API key:
 *
 *   npm run build && npm run check:quiz-live
 *
 * Every Gemini answer is seeded into chrome.storage.local first (an overview,
 * one question, one verdict), so the run must make zero API calls — a cache
 * miss would surface as a blocked/error card, because the key is not real.
 * What this proves is the wiring no unit test can see:
 *
 *   - one-click Start: transcript → (cached) overview → armed loop
 *   - quiz dots rendered on the real player's progress bar
 *   - the chapter boundary pausing the real video
 *   - the question opening OVER the video (player-attached shadow root)
 *   - answer typing NOT reaching YouTube's keyboard shortcuts (k/j/l/f/t/c)
 *   - answering (cached judge) → verdict → resume
 *
 * The seed runs in the content script's isolated world, where chrome.storage
 * is available — no service-worker target needed.
 *
 * Artifacts: .check/quiz-live.json and .check/quiz-live-question.png.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CdpSession, findBrowser, launchBrowser, delay } from './lib/cdp.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, '.check')
const distDir = join(root, 'dist')
mkdirSync(outDir, { recursive: true })

/** Same lecture the transcript check uses: long, manual captions. */
const VIDEO_ID = 'Ks-_Mh1QhMc'
const VIDEO_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`
const LEVEL = 'intermediate'
/** This is deliberately a fake key; the seeded caches keep Gemini out of it. */
const DUMMY_KEY = 'live-check-dummy-key-not-a-real-secret'
const ANSWER = 'Rereading feels productive because familiarity feels like knowing, but it is only recognition.'

const results = []
function verify(name, actual, expected) {
  const pass = actual === expected
  results.push({ name, pass, actual, expected })
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${pass ? '' : ` (actual: ${JSON.stringify(actual)}, expected: ${JSON.stringify(expected)})`}`)
}
function verifyContains(name, actual, part) {
  const pass = typeof actual === 'string' && actual.includes(part)
  results.push({ name, pass, actual, expected: `contains ${JSON.stringify(part)}` })
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${pass ? '' : ` (actual: ${JSON.stringify(actual)})`}`)
}

/** FNV-1a over the normalized answer — mirrors src/background/quiz.ts. */
function hashAnswer(answer) {
  const normalized = answer.toLowerCase().replace(/\s+/g, ' ').trim()
  let hash = 2166136261
  for (let index = 0; index < normalized.length; index++) {
    hash ^= normalized.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

const browser = findBrowser()
if (!browser) {
  console.error('[check:quiz-live] no Chromium-based browser found (set LL_BROWSER)')
  process.exit(1)
}

const session = await launchBrowser({
  browser,
  url: 'about:blank',
  extraArgs: [
    `--load-extension=${distDir}`,
    `--disable-extensions-except=${distDir}`,
    '--autoplay-policy=no-user-gesture-required',
  ],
  profilePrefix: 'll-quizlive-',
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

async function waitForBool(expression, timeoutMs) {
  try {
    await cdp.waitFor(expression, { timeoutMs })
    return true
  } catch {
    return false
  }
}

const QUIZ_CARD_IN_SHADOW = `document.querySelector('.ll-quiz-overlay')?.shadowRoot?.querySelector('[data-ll-quiz-card]')`
const QUIZ_SHADOW = `document.querySelector('.ll-quiz-overlay')?.shadowRoot`
const PANEL_SHADOW = `document.getElementById('learning-loop-host')?.shadowRoot`

try {
  // The context of the content script's isolated world is announced when the
  // extension injects it — capture it while navigating.
  const contexts = []
  cdp.on('Runtime.executionContextCreated', ({ context }) => contexts.push(context))
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')

  console.log(`\n---- navigating to ${VIDEO_URL}`)
  await cdp.send('Page.navigate', { url: VIDEO_URL })
  await cdp.waitFor(`!!document.getElementById('learning-loop-host')`, { timeoutMs: 45_000 })

  const extContext = contexts.find(
    (context) => typeof context.origin === 'string' && context.origin.startsWith('chrome-extension://'),
  )
  if (!extContext) throw new Error('content script execution context was never announced')
  console.log(`   content script world: ${extContext.origin}`)

  // Wait for the player and its metadata, then wait out any pre-roll ad.
  await cdp.waitFor(
    `(() => { const v = document.querySelector('#movie_player video'); return !!(v && Number.isFinite(v.duration) && v.duration > 60) })()`,
    { timeoutMs: 60_000 },
  )
  const adCleared = await waitForBool(
    `(() => !document.querySelector('#movie_player')?.classList.contains('ad-showing'))()`,
    90_000,
  )
  verify('player: no ad playing before the run', adCleared, true)

  // Park the video at a known, paused position so the boundary is predictable.
  const parked = await cdp.evaluate(`(() => {
    const v = document.querySelector('#movie_player video')
    v.pause()
    v.currentTime = 5
    return new Promise((resolve) => setTimeout(() => resolve({
      t: v.currentTime, d: v.duration, paused: v.paused,
    }), 600))
  })()`)
  const boundary = Math.ceil(parked.t) + 8
  console.log(`   parked at ${parked.t.toFixed(1)}s of ${parked.d.toFixed(0)}s — boundary at ${boundary}s`)
  if (!(boundary < parked.d - 25)) {
    throw new Error(`video too short for the boundary (duration ${parked.d})`)
  }

  // Seed everything Gemini would have answered, in the isolated world where
  // chrome.storage lives. Language tag "english" is what the panel scrape of
  // this video produces; the others are cheap insurance.
  const tags = ['english', 'en', 'english-auto-generated']
  const seedEntries = {
    'll:settings': { model: 'gemini-3.5-flash-lite', level: LEVEL, quizEvery: 1 },
    'll:api-key': DUMMY_KEY,
  }
  const overview = {
    overview:
      'Live-check overview: the video was parked, the loop was armed with one click, and every Gemini answer came from the cache.',
    takeaways: ['Seeded overview — no API call was made.', 'Chapter 2 starts exactly at the seeded boundary.'],
    chapters: [
      { startSec: 0, title: 'Opening (live check)', summary: 'Already watched when the boundary fires.' },
      { startSec: boundary, title: 'The quiz point (live check)', summary: 'The question fires right here.' },
    ],
    generatedAt: Date.now(),
  }
  /** Seeded chapter check: a locally-graded choice question, then the judged one. */
  const quizSet = {
    questions: [
      {
        kind: 'mcq',
        question: 'Live check: what was the chapter before this point about?',
        choices: [
          'The opening stretch of the video, before the seeded boundary.',
          'A chapter that has not played yet.',
          'An advertisement break.',
        ],
        correctIndex: 0,
        hint: 'Live-check hint: it is the part you just watched.',
        explanation: 'Seeded question — the loop only had to fetch it from the cache.',
        atSec: 0,
      },
      {
        kind: 'free-text',
        question: 'Live check: in one sentence, what did the opening stretch cover?',
        expectedAnswer: 'It was the opening stretch of the video, before the seeded boundary.',
        acceptablePoints: ['Anything about the opening stretch is fine.'],
        hints: ['Live-check hint: it is the part you just watched.'],
        explanation: 'Seeded question — the loop only had to fetch it from the cache.',
        atSec: 0,
      },
    ],
  }
  const judge = { verdict: 'correct', feedback: 'Live-check verdict from the seeded judge cache.' }
  for (const tag of tags) {
    seedEntries[`ll:cache:overview:${VIDEO_ID}:${tag}:${LEVEL}:v1`] = { savedAt: Date.now(), data: overview }
    seedEntries[`ll:cache:quiz:${VIDEO_ID}:${tag}:${LEVEL}:v2:ch0@0`] = { savedAt: Date.now(), data: quizSet }
  }
  seedEntries[`ll:cache:judge:${VIDEO_ID}:${LEVEL}:ch0@0:${hashAnswer(ANSWER)}`] = {
    savedAt: Date.now(),
    data: judge,
  }
  const storedCount = await evalInContext(
    `chrome.storage.local.set(${JSON.stringify(seedEntries)}).then(() => chrome.storage.local.get(null)).then((all) => Object.keys(all).length)`,
    extContext.id,
  )
  verify('seed: settings + caches written to chrome.storage.local', storedCount >= 3 + tags.length * 2, true)

  // One click: transcript → cached overview → armed loop.
  const startClicked = await cdp.evaluate(`(() => {
    const button = ${PANEL_SHADOW}?.querySelector('[data-ll-start]')
    if (!button) return false
    button.click()
    return true
  })()`)
  verify('panel: one-click start button present', startClicked, true)

  const startState = await cdp
    .waitFor(
      `(() => { const state = ${PANEL_SHADOW}?.querySelector('[data-ll-start-state]')?.getAttribute('data-ll-start-state'); return state === 'active' ? state : '' })()`,
      { timeoutMs: 90_000 },
    )
    .catch(() => null)
  verify('one click arms the loop (transcript + cached overview)', startState, 'active')

  // Dots on the real player timeline.
  const markers = await cdp.evaluate(`(() => {
    const dots = [...document.querySelectorAll('[data-ll-quiz-marker]')]
    return {
      count: dots.length,
      inProgressBar: Boolean(document.querySelector('.ytp-progress-bar-container .ll-timeline-markers')),
      insidePlayer: Boolean(document.querySelector('#movie_player > .ll-quiz-overlay')),
      states: dots.map((dot) => dot.getAttribute('data-ll-quiz-marker-state')).join('|'),
    }
  })()`)
  verify('timeline: one dot per quiz moment on the real timeline', markers.count, 2)
  verify('timeline: dots render inside the progress bar container', markers.inProgressBar, true)
  verify('overlay: host sits inside #movie_player', markers.insidePlayer, true)
  verify('timeline: dots start pending', markers.states, 'pending|pending')

  // Walk into the boundary for real: seek just before it, then let it play.
  await cdp.evaluate(`(() => { document.querySelector('#movie_player video').currentTime = ${boundary - 2.2} })()`)
  await delay(800)
  await cdp.evaluate(`document.querySelector('#movie_player video').play()`)

  const quizState = await cdp
    .waitFor(
      `(() => { const card = ${QUIZ_CARD_IN_SHADOW}; return card && card.getAttribute('data-ll-quiz-state') === 'quiz' ? 'quiz' : '' })()`,
      { timeoutMs: 40_000 },
    )
    .catch(() => null)
  verify('boundary: the question opens by itself', quizState, 'quiz')

  const quizInfo = await cdp.evaluate(`(() => {
    const v = document.querySelector('#movie_player video')
    const overlay = document.querySelector('.ll-quiz-overlay')
    return {
      question: (overlay?.shadowRoot?.querySelector('[data-ll-quiz-question]')?.textContent ?? '').trim(),
      scrim: Boolean(overlay?.shadowRoot?.querySelector('[data-ll-quiz-overlay-scrim]')),
      paused: v.paused,
      time: v.currentTime,
      panelNote: Boolean(${PANEL_SHADOW}?.querySelector('[data-ll-quiz-panel-note]')),
      dots: [...document.querySelectorAll('[data-ll-quiz-marker]')].map((dot) => dot.getAttribute('data-ll-quiz-marker-state')).join('|'),
    }
  })()`)
  verifyContains('question: text comes from the seeded cache', quizInfo.question, 'Live check')
  verify('overlay: the question card is open over the video', quizInfo.scrim, true)
  verify('boundary: the real video is paused', quizInfo.paused, true)
  verify('panel: a pointer to the open question is shown', quizInfo.panelNote, true)
  verify('timeline: nothing answered yet keeps the dot pending', quizInfo.dots, 'pending|pending')

  // The set opens on a multiple-choice question: grading is local, so the
  // reveal must be instant and need no second call.
  const choiceCount = await cdp.evaluate(
    `(() => (${QUIZ_SHADOW}?.querySelectorAll('[data-ll-quiz-choice]') ?? []).length)()`,
  )
  verify('multiple choice: the set opens with its options', choiceCount, 3)
  await cdp.evaluate(`${QUIZ_SHADOW}?.querySelector('[data-ll-quiz-choice="0"]')?.click()`)
  await delay(250)
  await cdp.evaluate(`${QUIZ_SHADOW}?.querySelector('[data-ll-quiz-submit]')?.click()`)
  const revealed = await cdp
    .waitFor(
      `(() => { const card = ${QUIZ_CARD_IN_SHADOW}; return card && card.getAttribute('data-ll-quiz-state') === 'revealed' ? 'revealed' : '' })()`,
      { timeoutMs: 15_000 },
    )
    .catch(() => null)
  verify('multiple choice: submitting reveals the answer', revealed, 'revealed')
  const reveal = await cdp.evaluate(`(() => {
    const shadow = ${QUIZ_SHADOW}
    return {
      verdict: shadow?.querySelector('[data-ll-quiz-verdict]')?.getAttribute('data-ll-quiz-verdict') ?? '',
      states: [...(shadow?.querySelectorAll('[data-ll-quiz-choice]') ?? [])].map((el) => el.getAttribute('data-ll-quiz-choice-state')).join('|'),
      dots: [...document.querySelectorAll('[data-ll-quiz-marker]')].map((dot) => dot.getAttribute('data-ll-quiz-marker-state')).join('|'),
    }
  })()`)
  verify('multiple choice: the right option reads correct', reveal.verdict, 'correct')
  verify('multiple choice: only the correct option is highlighted', reveal.states, 'correct|muted|muted')
  verify('timeline: a half-answered spot stays partial', reveal.dots, 'partial|pending')

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, 'quiz-live-question.png'), Buffer.from(shot.data, 'base64'))
  console.log('   screenshot: .check/quiz-live-question.png')

  // "Next question" moves on to the free-response one that ends the set.
  await cdp.evaluate(`${QUIZ_SHADOW}?.querySelector('[data-ll-quiz-next]')?.click()`)
  await delay(400)
  const secondQuestion = await cdp.evaluate(
    `(() => (${QUIZ_SHADOW}?.querySelector('[data-ll-quiz-progress]')?.textContent ?? '').trim())()`,
  )
  verify('multiple choice: next question follows the set', secondQuestion, '2/2')

  // The real bug reported: typing must not drive YouTube's player shortcuts.
  const focusInfo = await cdp.evaluate(`(() => {
    const active = ${QUIZ_SHADOW}?.activeElement
    return { tag: active?.tagName ?? null, isAnswerBox: active?.hasAttribute?.('data-ll-quiz-answer') ?? false }
  })()`)
  verify('typing: the answer box is focused automatically', focusInfo.isAnswerBox, true)
  if (!focusInfo.isAnswerBox) {
    await cdp.evaluate(`(() => { const box = ${QUIZ_SHADOW}?.querySelector('[data-ll-quiz-answer]'); box?.focus() })()`)
  }

  for (const keyChar of ['l', 'j', 'k', 'f', 't', 'c']) {
    const virtualKeyCode = keyChar.toUpperCase().charCodeAt(0)
    for (const type of ['keyDown', 'keyUp']) {
      await cdp.send('Input.dispatchKeyEvent', {
        type,
        key: keyChar,
        code: `Key${keyChar.toUpperCase()}`,
        windowsVirtualKeyCode: virtualKeyCode,
        nativeVirtualKeyCode: virtualKeyCode,
      })
    }
  }
  await delay(500)
  const afterKeys = await cdp.evaluate(`(() => {
    const v = document.querySelector('#movie_player video')
    return { paused: v.paused, time: v.currentTime }
  })()`)
  verify('typing: k/j/l did not seek the video', Math.abs(afterKeys.time - quizInfo.time) < 1, true)
  verify('typing: k did not resume playback', afterKeys.paused, true)

  // Answer it: the judge verdict must come from the seeded cache.
  const typed = await cdp.evaluate(`(() => {
    const box = ${QUIZ_SHADOW}?.querySelector('[data-ll-quiz-answer]')
    if (!box) return false
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setValue.call(box, ${JSON.stringify(ANSWER)})
    box.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  verify('answer: the box accepts the text', typed, true)
  await cdp.evaluate(`${QUIZ_SHADOW}?.querySelector('[data-ll-quiz-submit]')?.click()`)
  const verdict = await cdp
    .waitFor(
      `(() => {
        const card = ${QUIZ_CARD_IN_SHADOW}
        if (!card || card.getAttribute('data-ll-quiz-state') !== 'judged') return ''
        return ${QUIZ_SHADOW}?.querySelector('[data-ll-quiz-verdict]')?.getAttribute('data-ll-quiz-verdict') ?? ''
      })()`,
      { timeoutMs: 25_000 },
    )
    .catch(() => null)
  verify('judging: verdict comes from the seeded cache', verdict, 'correct')

  await cdp.evaluate(`${QUIZ_SHADOW}?.querySelector('[data-ll-quiz-resume]')?.click()`)
  await delay(800)
  const afterResume = await cdp.evaluate(`(() => {
    const v = document.querySelector('#movie_player video')
    const overlay = document.querySelector('.ll-quiz-overlay')
    return {
      paused: v.paused,
      cardGone: !overlay?.shadowRoot?.querySelector('[data-ll-quiz-card]'),
      scrimGone: !overlay?.shadowRoot?.querySelector('[data-ll-quiz-overlay-scrim]'),
      dots: [...document.querySelectorAll('[data-ll-quiz-marker]')].map((dot) => dot.getAttribute('data-ll-quiz-marker-state')).join('|'),
    }
  })()`)
  verify('resume: the card is dismissed', afterResume.cardGone, true)
  verify('resume: the overlay is cleared from the video', afterResume.scrimGone, true)
  verify('resume: the real video plays on', afterResume.paused, false)
  verify('resume: the finished spot turns done', afterResume.dots, 'done|pending')

  writeFileSync(
    join(outDir, 'quiz-live.json'),
    JSON.stringify({ boundary, parked, markers, quizInfo, afterResume, results }, null, 2),
  )
} catch (error) {
  console.error(`[check:quiz-live] aborted: ${error?.message ?? error}`)
  results.push({ name: 'run completed', pass: false, actual: String(error?.message ?? error) })
} finally {
  cdp.close()
  await session.kill()
}

const failed = results.filter((result) => !result.pass)
console.log('')
if (failed.length > 0) {
  console.error(`[check:quiz-live] ${failed.length}/${results.length} checks failed`)
  process.exitCode = 1
} else {
  console.log(`[check:quiz-live] all ${results.length} checks passed`)
}
