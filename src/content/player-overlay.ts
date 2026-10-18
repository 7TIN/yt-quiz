/**
 * Player-level quiz affordances. Everything here is additive: YouTube's own
 * DOM is never styled or moved, we only append our own nodes.
 *
 *  - Timeline dots: where the upcoming questions are, appended to the
 *    progress-bar container. Answered ones turn green.
 *  - The overlay host: when a question is open, the quiz card is shown *over
 *    the video* (portalled into a shadow root inside the player). Two reasons:
 *    the viewer is looking at the video, and — importantly — answer typing
 *    inside our shadow root never reaches YouTube's global shortcut keys
 *    (k, j, l, f, …), because the card stops key events at its own boundary.
 *
 * The host itself is pointer-transparent and empty between questions; React
 * renders a click-blocking scrim only while a question is open. The quiz loop
 * calls `refreshPlayerOverlay()` from its tick, so if YouTube rebuilds the
 * player DOM the nodes are re-created.
 */
import panelCss from '../ui/styles.css?inline'
import { injectPanelStyles } from './inject-styles'
import { PLAYER_PROGRESS_BAR_CONTAINER_SELECTOR, SELECTORS, findFirstElement } from './selectors'
import { getYouTubeTheme } from './theme'

export interface QuizMarker {
  atSec: number
  chapterIndex: number
  done: boolean
}

const MARKERS_HOST_CLASS = 'll-timeline-markers'
const MARKER_ATTR = 'data-ll-quiz-marker'
const OVERLAY_HOST_CLASS = 'll-quiz-overlay'

let markers: QuizMarker[] = []
let markersDurationSec = 0

/** The quiz overlay host inside the player, kept for the loop's lifetime. */
let overlayHost: HTMLDivElement | null = null
let overlayContainer: HTMLDivElement | null = null

export function setQuizMarkers(next: QuizMarker[], durationSec: number): void {
  markers = next
  markersDurationSec = durationSec
  refreshPlayerOverlay()
}

/** Removes everything (loop switched off, video navigation). */
export function clearPlayerOverlay(): void {
  markers = []
  document.querySelector(`.${MARKERS_HOST_CLASS}`)?.remove()
  removeQuizOverlay()
}

/** Cheap idempotent sync; safe to call every tick. */
export function refreshPlayerOverlay(): void {
  syncMarkers()
  // YouTube rebuilds the player subtree on layout changes; re-attach our host
  // if it was dropped (React keeps rendering into the same container node).
  if (overlayHost && !overlayHost.isConnected) ensureQuizOverlayMount()
}

function syncMarkers(): void {
  const container = document.querySelector<HTMLElement>(PLAYER_PROGRESS_BAR_CONTAINER_SELECTOR)
  if (!container) return

  let host = container.querySelector<HTMLElement>(`:scope > .${MARKERS_HOST_CLASS}`)
  if (markers.length === 0) {
    host?.remove()
    return
  }

  if (!host) {
    host = document.createElement('div')
    host.className = MARKERS_HOST_CLASS
    host.setAttribute('aria-hidden', 'true')
    host.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:visible;z-index:35;'
    container.appendChild(host)
  }

  // Rebuild only when the set changed; ≤ ~12 nodes either way.
  const signature = markers
    .map((marker) => `${marker.chapterIndex}:${Math.round(marker.atSec)}:${marker.done ? 1 : 0}`)
    .join('|')
  if (host.getAttribute('data-ll-markers') === signature) return
  host.setAttribute('data-ll-markers', signature)
  host.textContent = ''

  for (const marker of markers) {
    const dot = document.createElement('span')
    dot.setAttribute(MARKER_ATTR, String(marker.chapterIndex))
    dot.setAttribute('data-ll-quiz-marker-state', marker.done ? 'done' : 'pending')
    const left =
      markersDurationSec > 0
        ? Math.min(100, Math.max(0, (marker.atSec / markersDurationSec) * 100))
        : 0
    const size = marker.done ? '5px' : '7px'
    dot.style.cssText = [
      'position:absolute',
      `left:${left.toFixed(2)}%`,
      'top:50%',
      'transform:translate(-50%,-50%)',
      `width:${size}`,
      `height:${size}`,
      'border-radius:9999px',
      `background:${marker.done ? '#10b981' : '#6366f1'}`,
      'box-shadow:0 0 0 2px rgba(255,255,255,.85),0 0 6px rgba(99,102,241,.9)',
    ].join(';')
    host.appendChild(dot)
  }
}

/**
 * Ensures the overlay host exists inside the player and returns the React
 * portal target (a plain div inside its shadow root). Null when there is no
 * player at all — the caller then falls back to rendering the card inline.
 */
export function ensureQuizOverlayMount(): HTMLDivElement | null {
  if (overlayHost && overlayContainer && overlayHost.isConnected) return overlayContainer

  const player = findFirstElement(SELECTORS.player)
  if (!player) return null

  if (!overlayHost || !overlayContainer) {
    const host = document.createElement('div')
    host.className = OVERLAY_HOST_CLASS
    const shadow = host.attachShadow({ mode: 'open' })
    // Same stylesheet as the panel: same design tokens, same Tailwind output.
    injectPanelStyles(shadow, panelCss)
    const container = document.createElement('div')
    container.style.cssText = 'position:absolute;inset:0;'
    shadow.append(container)
    overlayHost = host
    overlayContainer = container
  }

  // The theme can change between questions; refresh it on every (re)attach.
  overlayHost.dataset.theme = getYouTubeTheme()
  overlayHost.style.cssText =
    'all:initial;display:block;position:absolute;inset:0;z-index:2147483000;pointer-events:none;'

  player.appendChild(overlayHost)
  return overlayContainer
}

export function removeQuizOverlay(): void {
  overlayHost?.remove()
  overlayHost = null
  overlayContainer = null
}
