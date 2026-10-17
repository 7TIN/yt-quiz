/**
 * MV3 service worker. This is the ONLY place that will ever read the Gemini API
 * key and call the API (Phase 3+) — the content script is page-adjacent, so its
 * requests would be subject to YouTube's CORS and the key could leak into page
 * context. Phase 1 only does install/update bookkeeping.
 */
chrome.runtime.onInstalled.addListener((details) => {
  // Bookkeeping only: never log user data or keys here.
  console.info(`[learning-loop] service worker installed/updated (${details.reason})`)
})

export {}
