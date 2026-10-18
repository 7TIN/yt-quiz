/**
 * Dev-only harness (dev.html and the headless preview used by
 * scripts/panel-check.mjs). Mounts the real panel controller against a fake
 * YouTube shell so the panel can be developed and verified without loading the
 * extension into a browser. Not part of the extension build.
 *
 * Add `?seed=1` to render the transcript + overview cards with demo data.
 */
import { createPanelController } from '../content/panel'
import { observeYouTubeTheme } from '../content/theme'
import { installDevSeed } from './seed'

const params = new URLSearchParams(location.search)
const videoId = params.get('v') ?? 'dQw4w9WgXcQ'
if (params.has('seed')) installDevSeed(videoId)

const panel = createPanelController()
observeYouTubeTheme((theme) => panel.setTheme(theme))
void panel.show(videoId)
