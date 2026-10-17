/**
 * Dev-only harness (dev.html and the headless preview used by
 * scripts/panel-check.mjs). Mounts the real panel controller against a fake
 * YouTube shell so the panel can be developed and verified without loading the
 * extension into a browser. Not part of the extension build.
 */
import { createPanelController } from '../content/panel'
import { observeYouTubeTheme } from '../content/theme'

const videoId = new URLSearchParams(location.search).get('v') ?? 'dQw4w9WgXcQ'

const panel = createPanelController()
observeYouTubeTheme((theme) => panel.setTheme(theme))
void panel.show(videoId)
