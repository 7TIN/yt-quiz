import type { PanelPlacement } from '../lib/types'
import { findFirstElement, SELECTORS, STACKED_COLUMN_MAX_WIDTH_PX } from './selectors'

export const PANEL_HOST_ID = 'learning-loop-host'

/**
 * Inline styles on the host element. `all: initial` is the only reliable way to
 * keep YouTube's page CSS out of the host: for the host element, document
 * styles win over the shadow stylesheet's `:host` rules, so the reset must be
 * inline. Custom properties are exempt from `all`, which is why the theme
 * tokens declared under `:host` in the shadow stylesheet still reach the panel.
 */
const BASE_HOST_STYLE = 'all: initial; display: block; width: 100%; margin: 0 0 12px;'
const FLOATING_HOST_STYLE =
  'all: initial; display: block; position: fixed; right: 16px; bottom: 16px; ' +
  'z-index: 2147483000; width: min(400px, calc(100vw - 32px)); margin: 0;'

/** How long to wait for YouTube's layout containers before falling back to floating. */
const PLACEMENT_WAIT_MS = 12_000

export interface PanelHost {
  host: HTMLDivElement
  shadow: ShadowRoot
}

/**
 * Creates the host element and its open shadow root. The host itself stays in
 * the page's light DOM; React lives inside the shadow root, so neither
 * Tailwind's styles nor YouTube's can cross the boundary.
 */
export function createPanelHost(): PanelHost {
  const host = document.createElement('div')
  host.id = PANEL_HOST_ID
  host.style.cssText = BASE_HOST_STYLE
  const shadow = host.attachShadow({ mode: 'open' })
  return { host, shadow }
}

function applyHostPlacementStyle(host: HTMLDivElement, placement: PanelPlacement): void {
  host.style.cssText = placement === 'floating' ? FLOATING_HOST_STYLE : BASE_HOST_STYLE
  host.dataset.llPlacement = placement
}

interface PlacementTarget {
  container: HTMLElement
  placement: PanelPlacement
}

/**
 * Picks where the panel goes, in order of preference:
 *  1. top of the right column (#secondary-inner) — above the related videos,
 *  2. below the player (#below) when the right column is absent or stacked,
 *  3. null → caller falls back to a floating panel.
 */
function findPlacementTarget(): PlacementTarget | null {
  const rightColumnInner = findFirstElement(SELECTORS.rightColumnInner)
  if (rightColumnInner && !isStackedLayout(rightColumnInner)) {
    return { container: rightColumnInner, placement: 'secondary' }
  }

  const rightColumn = findFirstElement(SELECTORS.rightColumn)
  if (rightColumn && !isStackedLayout(rightColumn)) {
    return { container: rightColumn, placement: 'secondary' }
  }

  const belowPlayer = findFirstElement(SELECTORS.belowPlayer)
  if (belowPlayer) {
    return { container: belowPlayer, placement: 'below' }
  }

  if (rightColumnInner) return { container: rightColumnInner, placement: 'secondary' }
  if (rightColumn) return { container: rightColumn, placement: 'secondary' }
  return null
}

/** In the narrow layout YouTube stacks the right column under the player. */
function isStackedLayout(container: HTMLElement): boolean {
  const width = container.getBoundingClientRect().width
  return width > 0 && width > STACKED_COLUMN_MAX_WIDTH_PX
}

/**
 * Waits (bounded) for one of YouTube's containers to exist, observing DOM
 * insertions because the right column often renders a beat after
 * `yt-navigate-finish` fires.
 */
function waitForPlacementTarget(timeoutMs = PLACEMENT_WAIT_MS): Promise<PlacementTarget | null> {
  const immediate = findPlacementTarget()
  if (immediate) return Promise.resolve(immediate)

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const target = findPlacementTarget()
      if (target) {
        cleanup()
        resolve(target)
      }
    })
    const timer = window.setTimeout(() => {
      cleanup()
      resolve(null)
    }, timeoutMs)
    const cleanup = () => {
      observer.disconnect()
      window.clearTimeout(timer)
    }
    observer.observe(document.documentElement, { childList: true, subtree: true })
  })
}

/**
 * Places the panel host in the page and returns the placement that was used.
 * Safe to call repeatedly for the same host (e.g. after YouTube re-renders the
 * column and drops our host): it re-inserts at the current best spot.
 */
export async function placePanelHost(host: HTMLDivElement): Promise<PanelPlacement> {
  const target = await waitForPlacementTarget()

  if (!target) {
    applyHostPlacementStyle(host, 'floating')
    document.body.append(host)
    return 'floating'
  }

  applyHostPlacementStyle(host, target.placement)
  target.container.prepend(host)
  return target.placement
}
