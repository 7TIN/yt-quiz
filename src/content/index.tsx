/**
 * Content-script entry (isolated world, https://www.youtube.com/*).
 *
 * Responsibilities here stay thin: watch for SPA navigation, decide whether the
 * current page is supported, and drive the panel controller. Everything else
 * lives in its own module (transcript in Phase 2, background messaging in
 * Phase 3).
 */
import { createPanelController } from './panel'
import { observeYouTubeTheme } from './theme'
import { getWatchVideoId, isShortsUrl, onYouTubeNavigate } from './youtube'

const panel = createPanelController()
let activeVideoId: string | null = null

/** Re-aligns the panel with the current URL. Safe to call at any time. */
function syncWithLocation(): void {
  const videoId = isShortsUrl(location.href) ? null : getWatchVideoId(location.href)

  if (!videoId) {
    if (activeVideoId !== null) {
      activeVideoId = null
      panel.hide()
    }
    return
  }

  if (videoId === activeVideoId) {
    panel.ensure()
    return
  }

  activeVideoId = videoId
  void panel.show(videoId)
}

observeYouTubeTheme((theme) => panel.setTheme(theme))
onYouTubeNavigate(syncWithLocation)

// YouTube occasionally re-renders column contents without a URL change; this
// cheap liveness check re-attaches the panel if our host got dropped.
window.setInterval(() => {
  if (activeVideoId) panel.ensure()
}, 2000)

syncWithLocation()
