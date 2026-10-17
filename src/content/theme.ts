import type { ThemeMode } from '../lib/types'

/**
 * YouTube keeps its theme as a bare `dark` attribute on <html>
 * (e.g. <html dark>). Light mode means the attribute is absent.
 */
export function getYouTubeTheme(): ThemeMode {
  return document.documentElement.hasAttribute('dark') ? 'dark' : 'light'
}

/** Calls back whenever the user toggles YouTube's theme, so the panel follows live. */
export function observeYouTubeTheme(onChange: (theme: ThemeMode) => void): () => void {
  const observer = new MutationObserver(() => onChange(getYouTubeTheme()))
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['dark'] })
  return () => observer.disconnect()
}
