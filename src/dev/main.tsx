/**
 * Dev-only harness (dev.html and the headless preview used by
 * scripts/panel-check.mjs). Mounts the real panel controller against a fake
 * YouTube shell so the panel can be developed and verified without loading the
 * extension into a browser. Not part of the extension build.
 *
 * Add `?seed=1` to pre-cache demo data (transcript, overview, question) so the
 * learning loop can run end to end without an extension or an API key.
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
