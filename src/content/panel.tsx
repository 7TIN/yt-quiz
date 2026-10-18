import { createRoot, type Root } from 'react-dom/client'
import type { ThemeMode, VideoId } from '../lib/types'
import { PanelApp } from '../ui/PanelApp'
import panelCss from '../ui/styles.css?inline'
import { injectPanelStyles } from './inject-styles'
import { createPanelHost, placePanelHost } from './panel-host'
import { getYouTubeTheme } from './theme'

export interface PanelController {
  /** Shows the panel for a video. Re-places the host if needed. */
  show: (videoId: VideoId) => Promise<void>
  /** Cheap "still there?" check, called periodically: re-attaches if YouTube dropped the host. */
  ensure: () => void
  /** Live theme updates from YouTube's light/dark toggle. */
  setTheme: (theme: ThemeMode) => void
  /** Removes the panel and resets (navigation away, unsupported page, ...). */
  hide: () => void
}

/**
 * Owns the single panel instance: shadow host, React root and placement.
 * A generation counter discards async placements that finish after the user
 * already navigated to another video or away from /watch.
 */
export function createPanelController(): PanelController {
  let host: HTMLDivElement | null = null
  let root: Root | null = null
  let videoId: VideoId | null = null
  let theme: ThemeMode = 'light'
  let generation = 0

  function ensureDom(): HTMLDivElement {
    if (!host || !root) {
      const created = createPanelHost()
      injectPanelStyles(created.shadow, panelCss)

      const container = document.createElement('div')
      container.setAttribute('data-ll-root', '')
      created.shadow.append(container)

      host = created.host
      root = createRoot(container)
    }
    return host
  }

  function render(): void {
    const current = host
    if (!current || !root || !videoId) return
    current.dataset.theme = theme
    root.render(<PanelApp videoId={videoId} theme={theme} />)
  }

  async function attach(nextVideoId: VideoId): Promise<void> {
    const gen = ++generation
    videoId = nextVideoId
    theme = getYouTubeTheme()

    const element = ensureDom()
    await placePanelHost(element)
    if (gen !== generation) return

    render()
  }

  return {
    show: attach,
    ensure() {
      if (!videoId) return
      if (!host || !host.isConnected) void attach(videoId)
    },
    setTheme(nextTheme) {
      theme = nextTheme
      if (videoId) render()
    },
    hide() {
      generation += 1
      videoId = null
      root?.unmount()
      root = null
      host?.remove()
      host = null
    },
  }
}
