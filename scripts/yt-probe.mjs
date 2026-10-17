/**
 * Dev diagnostic: inspects YouTube's live DOM for the elements the transcript
 * and chapter code depends on, and tests the caption-track fetch path.
 * YouTube changes its markup without notice — run this whenever selectors break:
 *
 *   node scripts/yt-probe.mjs [watchUrl ...]
 *
 * Read-only: it clicks "Show transcript", inspects the panel, and closes it again.
 */
import { CdpSession, findBrowser, launchBrowser } from './lib/cdp.mjs'

const DEFAULT_URLS = ['https://www.youtube.com/watch?v=Ks-_Mh1QhMc']
const urls = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_URLS

const browser = findBrowser()
if (!browser) {
  console.error('No Chromium-based browser found. Set LL_BROWSER to its path.')
  process.exit(1)
}

const session = await launchBrowser({ browser, url: urls[0], profilePrefix: 'll-probe-' })
const cdp = await new CdpSession(session.target.webSocketDebuggerUrl).connect()

// Capture the network traffic the page itself uses for transcripts.
const networkLog = []
await cdp.send('Network.enable')
cdp.on('Network.requestWillBeSent', (params) => {
  const requestUrl = params.request.url
  if (/timedtext|transcript/i.test(requestUrl)) {
    networkLog.push({ phase: 'request', method: params.request.method, url: requestUrl.slice(0, 320) })
  }
})
cdp.on('Network.responseReceived', (params) => {
  const responseUrl = params.response.url
  if (/timedtext|transcript/i.test(responseUrl)) {
    networkLog.push({ phase: 'response', status: params.response.status, mime: params.response.mimeType, url: responseUrl.slice(0, 200) })
  }
})

try {
  for (const url of urls) {
    console.log(`\n================ ${url} ================`)
    await cdp.send('Page.enable')
    await cdp.send('Page.navigate', { url })
    await cdp.waitFor(`document.readyState === 'complete' && !!document.querySelector('ytd-watch-flexy')`)
    await cdp.waitFor(`!!document.querySelector('#movie_player')`)

    // ---- 1. transcript trigger: find and click the real button --------------
    const panelStateBefore = await cdp.evaluate(`(() => {
      const panel = document.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]')
      return { exists: !!panel, visibility: panel?.getAttribute('visibility') ?? null }
    })()`)
    console.log('-- transcript panel state before click --')
    console.log(JSON.stringify(panelStateBefore))

    const candidates = await cdp.evaluate(`(() => {
      const buttons = [...document.querySelectorAll('button, yt-button-shape button')]
        .filter((b) => /show transcript/i.test(b.getAttribute('aria-label') ?? b.textContent ?? ''))
      return buttons.map((b, index) => ({
        index,
        aria: b.getAttribute('aria-label'),
        text: b.textContent.trim().slice(0, 30),
        inSection: !!b.closest('ytd-video-description-transcript-section-renderer'),
        visible: b.getBoundingClientRect().width > 0,
        html: b.outerHTML.slice(0, 220),
      }))
    })()`)
    console.log('-- transcript button candidates --')
    console.log(JSON.stringify(candidates, null, 2))

    // Click each candidate (there may be duplicates in shadow wrappers) until segments appear.
    let opened = false
    for (const candidate of candidates) {
      await cdp.evaluate(`(() => {
        const buttons = [...document.querySelectorAll('button, yt-button-shape button')]
          .filter((b) => /show transcript/i.test(b.getAttribute('aria-label') ?? b.textContent ?? ''))
        const button = buttons[${candidate.index}]
        if (button) button.click()
        return !!button
      })()`)
      try {
        await cdp.waitFor(`document.querySelectorAll('ytd-transcript-segment-renderer').length > 0`, { timeoutMs: 10_000 })
        opened = true
        console.log(`-- panel opened via candidate ${candidate.index} (inSection=${candidate.inSection})`)
        break
      } catch {
        console.log(`-- candidate ${candidate.index} did not open the panel`)
      }
    }

    if (!opened) {
      const panels = await cdp.evaluate(`(() => {
        return [...document.querySelectorAll('ytd-engagement-panel-section-list-renderer')].map((p) => ({
          id: p.getAttribute('target-id'),
          visibility: p.getAttribute('visibility'),
          hasTranscript: !!p.querySelector('ytd-transcript-renderer'),
        }))
      })()`)
      console.log('-- engagement panels state --')
      console.log(JSON.stringify(panels, null, 2))
    }

    // ---- 2. panel internals ------------------------------------------------
    const panel = await cdp.evaluate(`(() => {
      const segments = [...document.querySelectorAll('ytd-transcript-segment-renderer')]
      const transcriptRoot = document.querySelector('ytd-transcript-renderer')
      const footer = document.querySelector('ytd-transcript-footer-renderer')
      let scroller = null
      let node = segments[0]
      while (node && node !== document.body) {
        const style = getComputedStyle(node)
        if (/(auto|scroll)/.test(style.overflowY)) { scroller = { tag: node.tagName, id: node.id, cls: String(node.className).slice(0, 50), scrollHeight: node.scrollHeight, clientHeight: node.clientHeight }; break }
        node = node.parentElement
      }
      return {
        segmentCount: segments.length,
        scroller,
        panelVisibility:
          document
            .querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]')
            ?.getAttribute('visibility') ?? null,
        headerAriaButtons: [
          ...document.querySelectorAll(
            'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"] button[aria-label]',
          ),
        ]
          .map((b) => b.getAttribute('aria-label'))
          .slice(0, 12),
        rootAttrs: transcriptRoot ? [...transcriptRoot.attributes].map((a) => a.name + '=' + a.value) : null,
        firstSegmentHtml: segments[0]?.outerHTML?.replace(/<!--[^>]*-->/g, '').slice(0, 700) ?? null,
        timestamps: segments.slice(0, 3).map((s) => ({
          ts: s.querySelector('.segment-timestamp')?.textContent?.trim() ?? null,
          text: s.querySelector('.segment-text, .yt-core-attributed-string')?.textContent?.trim()?.slice(0, 70) ?? null,
        })),
        footerText: footer?.innerText?.replace(/\\s+/g, ' ').slice(0, 140) ?? null,
        footerSelect: footer?.querySelector('select')?.outerHTML?.slice(0, 250) ?? null,
        closeButtons: [...document.querySelectorAll('ytd-transcript-renderer button[aria-label], ytd-engagement-panel-title-header-renderer button[aria-label]')]
          .map((b) => b.getAttribute('aria-label')).slice(0, 10),
      }
    })()`)
    console.log('-- transcript panel --')
    console.log(JSON.stringify(panel, null, 2))

    console.log('-- page network traffic for transcript/timedtext --')
    console.log(JSON.stringify(networkLog.slice(-8), null, 2))

    // ---- 2b. chapter markers ------------------------------------------------
    const chapters = await cdp.evaluate(`(() => {
      const items = [...document.querySelectorAll('ytd-macro-markers-list-item-renderer')]
      const first = items[0]
      return {
        count: items.length,
        firstInnerText: first?.innerText?.replace(/\\s+/g, ' ').trim().slice(0, 120) ?? null,
        firstHtml: first?.outerHTML?.replace(/<!--[^>]*-->/g, '').replace(/\\s+/g, ' ').slice(0, 900) ?? null,
        timeCandidates: first ? {
          timeId: first.querySelector('#time')?.textContent?.trim() ?? null,
          timeClass: first.querySelector('.time')?.textContent?.trim() ?? null,
          h3: first.querySelector('h3')?.textContent?.trim() ?? null,
          titleHref: first.querySelector('a')?.getAttribute('href') ?? null,
        } : null,
      }
    })()`)
    console.log('-- chapter markers --')
    console.log(JSON.stringify(chapters, null, 2))

    // ---- 3. virtual scroll growth ------------------------------------------
    const scrollResult = await cdp.evaluate(`(async () => {
      const count = () => document.querySelectorAll('ytd-transcript-segment-renderer').length
      let node = document.querySelector('ytd-transcript-segment-renderer')
      let scroller = null
      while (node && node !== document.body) {
        if (/(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) { scroller = node; break }
        node = node.parentElement
      }
      if (!scroller) return { before: count(), after: count(), scroller: null }
      const before = count()
      scroller.scrollTop = scroller.scrollHeight
      await new Promise((r) => setTimeout(r, 1200))
      return { before, after: count(), scroller: { tag: scroller.tagName, id: scroller.id } }
    })()`)
    console.log('-- virtual scroll growth --')
    console.log(JSON.stringify(scrollResult))

    // ---- 4. caption tracks + fetch variants --------------------------------
    const tracks = await cdp.evaluate(`(async () => {
      const player = document.getElementById('movie_player')
      let response = null
      try { response = player?.getPlayerResponse?.() ?? null } catch { response = null }
      response = response ?? window.ytInitialPlayerResponse ?? null
      const list = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []
      const info = list.map((t) => ({
        lang: t.languageCode,
        kind: t.kind ?? null,
        name: t.name?.simpleText ?? t.name?.runs?.[0]?.text ?? null,
        fmt: /fmt=([^&]+)/.exec(t.baseUrl)?.[1] ?? null,
        hasPot: /pot=/.test(t.baseUrl),
        urlLen: t.baseUrl.length,
      }))
      const preferred = list.find((t) => t.languageCode === 'en' && t.kind !== 'asr') ?? list.find((t) => t.kind !== 'asr') ?? list[0]
      const variants = {}
      if (preferred) {
        const tests = [
          ['raw', preferred.baseUrl, 'include'],
          ['json3', preferred.baseUrl + '&fmt=json3', 'include'],
          ['json3-nocred', preferred.baseUrl + '&fmt=json3', 'omit'],
          ['json3-cWEB', preferred.baseUrl + '&fmt=json3&c=WEB', 'include'],
          ['json3-tlang', preferred.baseUrl + '&fmt=json3&tlang=en', 'include'],
        ]
        for (const [name, testUrl, credentials] of tests) {
          try {
            const res = await fetch(testUrl, { credentials })
            const text = await res.text()
            variants[name] = { status: res.status, bytes: text.length, head: text.slice(0, 160).replace(/\\s+/g, ' ') }
          } catch (error) {
            variants[name] = { error: String(error) }
          }
        }
      }
      return { trackCount: list.length, englishManual: info.filter((t) => t.lang === 'en').slice(0, 5), firstThree: info.slice(0, 3), preferred: info.find((t) => t.lang === preferred?.languageCode) ?? null, variants }
    })()`)
    console.log('-- caption tracks --')
    console.log(JSON.stringify(tracks, null, 2))

    // ---- 5. live-stream signals --------------------------------------------
    const liveSignals = await cdp.evaluate(`(() => {
      const player = document.getElementById('movie_player')
      const video = document.querySelector('video')
      const watchFlexy = document.querySelector('ytd-watch-flexy')
      const badge = document.querySelector('.ytp-live-badge')
      return {
        playerLiveClass: player?.classList.contains('ytp-live') ?? null,
        playerLiveishClasses: player ? [...player.classList].filter((c) => /live|premiere/i.test(c)) : null,
        flexyLiveAttrs: watchFlexy
          ? [...watchFlexy.attributes].map((a) => a.name + '=' + a.value).filter((s) => /live/i.test(s))
          : null,
        videoDuration: video ? String(video.duration) : null,
        liveBadgeExists: !!badge,
        liveBadgeDisplayed: badge ? getComputedStyle(badge).display !== 'none' : null,
        ytpLiveElements: document.querySelectorAll('.ytp-live').length,
      }
    })()`)
    console.log('-- live signals --')
    console.log(JSON.stringify(liveSignals, null, 2))

    // ---- 6. close the panel again ------------------------------------------
    const closeResult = await cdp.evaluate(`(async () => {
      const panelSel = 'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]'
      const segmentCount = () => document.querySelectorAll('ytd-transcript-segment-renderer').length
      const log = []
      const strategies = [
        ['exact-aria', () => document.querySelector('button[aria-label="Close transcript"]')],
        ['panel-header-close', () => document.querySelector(panelSel + ' ytd-engagement-panel-title-header-renderer button[aria-label*="lose" i]')],
        ['any-close-in-panel', () => document.querySelector(panelSel + ' button[aria-label*="lose" i]')],
      ]
      for (const [name, find] of strategies) {
        const button = find()
        if (!button) { log.push(name + ': not found'); continue }
        button.click()
        await new Promise((r) => setTimeout(r, 700))
        const left = segmentCount()
        log.push(name + ': clicked "' + (button.getAttribute('aria-label') ?? '') + '", segments left ' + left)
        if (left === 0) {
          return { closedBy: name, log, visibility: document.querySelector(panelSel)?.getAttribute('visibility') ?? 'panel-removed' }
        }
      }
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }))
      await new Promise((r) => setTimeout(r, 700))
      return { closedBy: segmentCount() === 0 ? 'escape' : 'none', log, visibility: document.querySelector(panelSel)?.getAttribute('visibility') ?? 'panel-removed' }
    })()`)
    console.log('-- close result --')
    console.log(JSON.stringify(closeResult, null, 2))
  }
} finally {
  cdp.close()
  await session.kill()
}
