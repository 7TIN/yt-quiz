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
