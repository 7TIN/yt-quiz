/**
 * Player-level quiz affordances. Everything here is additive: YouTube's own
 * DOM is never styled or moved, we only append our own nodes.
 *
 *  - Timeline dots: where the upcoming questions are, appended to the
 *    progress-bar container. Answered ones turn green.
 *  - Timeline stars: where the "did you know" pop-ups sit, in their own host so
 *    they never disturb the question dots. A star is amber while its stretch of
 *    video is still ahead and dims once that stretch is behind you.
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

/** pending: nothing answered yet · partial: some answered · done: finished or skipped. */
export type QuizMarkerState = 'pending' | 'partial' | 'done'

export interface QuizMarker {
  atSec: number
  chapterIndex: number
  state: QuizMarkerState
}

const MARKER_COLOR: Record<QuizMarkerState, string> = {
  pending: '#f4f4f5',
  partial: '#fbbf24',
  done: '#35d35d',
}

/** Finished dots shrink a little, so progress reads at a glance. */
const MARKER_SIZE: Record<QuizMarkerState, string> = {
  pending: '7px',
  partial: '7px',
  done: '5px',
}

/** A "did you know" pop-up's place on the timeline. */
export interface FactMarker {
  atSec: number
  chapterIndex: number
  /** Dismissed, or its stretch of video is already behind the playhead. */
  seen: boolean
}

const MARKERS_HOST_CLASS = 'll-timeline-markers'
const MARKER_ATTR = 'data-ll-quiz-marker'

const FACT_MARKERS_HOST_CLASS = 'll-fact-markers'
const FACT_MARKER_ATTR = 'data-ll-fact-marker'
const FACT_MARKER_SIZE = '9px'
/** Amber, like the lightbulb on the pop-up itself. */
const FACT_MARKER_COLOR = '#fbbf24'
/**
 * A star (not a dot) so an extra reads as an extra even at 7px. The shape is
 * clipped, so the contrast ring is a drop-shadow — a box-shadow would be
 * clipped away with it.
 */
const FACT_MARKER_CLIP =
  'polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)'

const OVERLAY_HOST_CLASS = 'll-quiz-overlay'

let markers: QuizMarker[] = []
let markersDurationSec = 0
let factMarkers: FactMarker[] = []
let factMarkersDurationSec = 0

/** The quiz overlay host inside the player, kept for the loop's lifetime. */
let overlayHost: HTMLDivElement | null = null
let overlayContainer: HTMLDivElement | null = null

export function setQuizMarkers(next: QuizMarker[], durationSec: number): void {
  markers = next
  markersDurationSec = durationSec
  refreshPlayerOverlay()
}

export function setFactMarkers(next: FactMarker[], durationSec: number): void {
  factMarkers = next
  factMarkersDurationSec = durationSec
  refreshPlayerOverlay()
}

/** Removes everything (loop switched off, video navigation). */
export function clearPlayerOverlay(): void {
  markers = []
  factMarkers = []
  document.querySelector(`.${MARKERS_HOST_CLASS}`)?.remove()
  document.querySelector(`.${FACT_MARKERS_HOST_CLASS}`)?.remove()
  removeQuizOverlay()
}

/** Cheap idempotent sync; safe to call every tick. */
export function refreshPlayerOverlay(): void {
  syncMarkers()
  syncFactMarkers()
  // YouTube rebuilds the player subtree on layout changes; re-attach our host
  // if it was dropped (React keeps rendering into the same container node).
  if (overlayHost && !overlayHost.isConnected) ensureQuizOverlayMount()
}

/** Position on the bar as a CSS percentage, clamped to the track. */
function timelineLeftPercent(atSec: number, durationSec: number): string {
  if (!(durationSec > 0)) return '0%'
  const percent = Math.min(100, Math.max(0, (atSec / durationSec) * 100))
  return `${percent.toFixed(2)}%`
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
    .map((marker) => `${marker.chapterIndex}:${Math.round(marker.atSec)}:${marker.state}`)
    .join('|')
  if (host.getAttribute('data-ll-markers') === signature) return
  host.setAttribute('data-ll-markers', signature)
  host.textContent = ''

  for (const marker of markers) {
    const dot = document.createElement('span')
    dot.setAttribute(MARKER_ATTR, String(marker.chapterIndex))
    dot.setAttribute('data-ll-quiz-marker-state', marker.state)
    dot.style.cssText = [
      'position:absolute',
      `left:${timelineLeftPercent(marker.atSec, markersDurationSec)}`,
      'top:50%',
      'transform:translate(-50%,-50%)',
      `width:${MARKER_SIZE[marker.state]}`,
      `height:${MARKER_SIZE[marker.state]}`,
      'border-radius:9999px',
      // Neutral pending, amber while a spot has unanswered questions left,
      // accent green once finished — readable on both the grey track and the
      // red watched-portion fill.
      `background:${MARKER_COLOR[marker.state]}`,
      'box-shadow:0 0 0 1.5px rgba(0,0,0,.45)',
    ].join(';')
    host.appendChild(dot)
  }
}

/** Stars for the in-between pop-ups: same host pattern as the dots above. */
function syncFactMarkers(): void {
  const container = document.querySelector<HTMLElement>(PLAYER_PROGRESS_BAR_CONTAINER_SELECTOR)
  if (!container) return

  let host = container.querySelector<HTMLElement>(`:scope > .${FACT_MARKERS_HOST_CLASS}`)
  if (factMarkers.length === 0) {
    host?.remove()
    return
  }

  if (!host) {
    host = document.createElement('div')
    host.className = FACT_MARKERS_HOST_CLASS
    host.setAttribute('aria-hidden', 'true')
    host.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:visible;z-index:36;'
    container.appendChild(host)
  }

  const signature = factMarkers
    .map((marker) => `${marker.chapterIndex}:${Math.round(marker.atSec)}:${marker.seen ? 'seen' : 'new'}`)
    .join('|')
  if (host.getAttribute('data-ll-markers') === signature) return
  host.setAttribute('data-ll-markers', signature)
  host.textContent = ''

  for (const marker of factMarkers) {
    const star = document.createElement('span')
    star.setAttribute(FACT_MARKER_ATTR, String(marker.chapterIndex))
    star.setAttribute('data-ll-fact-marker-state', marker.seen ? 'seen' : 'new')
    star.style.cssText = [
      'position:absolute',
      `left:${timelineLeftPercent(marker.atSec, factMarkersDurationSec)}`,
      'top:50%',
      'transform:translate(-50%,-50%)',
      `width:${FACT_MARKER_SIZE}`,
      `height:${FACT_MARKER_SIZE}`,
      `clip-path:${FACT_MARKER_CLIP}`,
      `background:${FACT_MARKER_COLOR}`,
      // Bright while the pop-up is still ahead; quiet once it is behind you.
      `opacity:${marker.seen ? '0.45' : '1'}`,
      'filter:drop-shadow(0 0 1px rgba(0,0,0,.8))',
    ].join(';')
    host.appendChild(star)
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
  // `all: initial` keeps the host immune to YouTube's player styles, but it also
  // resets the inherited font — and an inline declaration beats any `:host`
  // rule in the injected stylesheet. Without restating the type here, every
  // glyph in the card would fall back to the browser's standard font. The
  // var() fallbacks are the same stack in case the tokens are ever unavailable.
  overlayHost.style.cssText = [
    'all:initial',
    'display:block',
    'position:absolute',
    'inset:0',
    'z-index:2147483000',
    'pointer-events:none',
    'font-family:var(--font-sans, Geist, ui-sans-serif, system-ui, sans-serif)',
    'font-size:var(--text-sm, 15px)',
    'line-height:var(--text-sm--line-height, 22px)',
    'color:var(--ll-ink, #e7e7e9)',
  ].join(';')

  player.appendChild(overlayHost)
  return overlayContainer
}

export function removeQuizOverlay(): void {
  overlayHost?.remove()
  overlayHost = null
  overlayContainer = null
}
