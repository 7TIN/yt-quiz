/**
 * MV3 service worker. This is the ONLY context that reads the Gemini API key
 * and calls the API — the content script is page-adjacent, so its requests
 * would be subject to YouTube's CORS and the key could leak into page context.
 *
 * The worker is event-driven and sleeps between events; every message from the
 * content script or options page wakes it up and is answered by the router.
 */
import type { LlRequest } from '../lib/types'
import { route } from './router'

chrome.runtime.onInstalled.addListener((details) => {
  // Bookkeeping only: never log user data or keys here.
  console.info(`[learning-loop] service worker installed/updated (${details.reason})`)
  // A fresh install lands on the settings page: nothing works without a key,
  // and the options page is where it goes. Updates stay quiet — no stolen tabs.
  if (details.reason === 'install') void chrome.runtime.openOptionsPage()
})

// No browser-action popup: clicking the toolbar icon is the shortest path back
// to the options page, where the API key can be replaced or removed. (The
// panel's gear sends the same `ll:open-options` request.)
chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage()
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only our own contexts (content script, options page) may talk to us.
  if (sender.id !== chrome.runtime.id) return false

  void route(message as LlRequest).then(sendResponse, () => {
    sendResponse({
      ok: false,
      error: { code: 'unknown', message: 'Unexpected error in the background worker.' },
    })
  })
  // Keep the channel open: every handler resolves asynchronously.
  return true
})
