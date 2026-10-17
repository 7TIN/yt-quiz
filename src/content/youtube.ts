/** Only /watch pages get the panel. Shorts and live streams are out of scope for v1. */
const WATCH_PATH = '/watch'
const SHORTS_PATH_PREFIX = '/shorts/'
const URL_POLL_INTERVAL_MS = 1000

/** Extracts the `v` param from a /watch URL, or null if this is not a watch URL. */
export function getWatchVideoId(href: string): string | null {
  try {
    const url = new URL(href)
    if (url.pathname !== WATCH_PATH) return null
    const videoId = url.searchParams.get('v')
    return videoId !== null && videoId.length > 0 ? videoId : null
  } catch {
    return null
  }
}

export function isShortsUrl(href: string): boolean {
  try {
    return new URL(href).pathname.startsWith(SHORTS_PATH_PREFIX)
  } catch {
    return false
  }
}

/**
 * YouTube is a single-page app: clicking another video does not reload the
 * document, so the content script must react to in-page navigation itself.
 *
 * `yt-navigate-finish` fires once the new watch page has rendered. A URL poll
 * is kept as a cheap safety net in case YouTube ever renames or drops the event
 * (it is a plain string comparison, so the cost is negligible).
 */
export function onYouTubeNavigate(callback: () => void): () => void {
  const handler = () => callback()

  document.addEventListener('yt-navigate-finish', handler)
  window.addEventListener('popstate', handler)

  let lastHref = location.href
  const interval = window.setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href
      callback()
    }
  }, URL_POLL_INTERVAL_MS)

  return () => {
    document.removeEventListener('yt-navigate-finish', handler)
    window.removeEventListener('popstate', handler)
    window.clearInterval(interval)
  }
}
