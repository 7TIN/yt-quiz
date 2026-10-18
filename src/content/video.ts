/**
 * The only thing this extension ever writes into the player: the chapter rail
 * seeks the main <video> element. The player UI itself is never touched.
 */
import { PLAYER_AD_SHOWING_CLASS, SELECTORS, findFirstElement } from './selectors'

const PLAYER_SELECTOR = '#movie_player'

/** Seeks the video to a timestamp. Safe to call at any time; no-ops when nothing matches. */
export function seekVideoTo(seconds: number): void {
  // Don't fight an ad; the seek would apply to the ad's video element.
  const player = document.querySelector(PLAYER_SELECTOR)
  if (player?.classList.contains(PLAYER_AD_SHOWING_CLASS)) return

  const video = findFirstElement(SELECTORS.mainVideo) as HTMLVideoElement | null
  if (!video) return

  const target = Math.max(0, Math.floor(seconds))
  const duration = video.duration
  video.currentTime =
    Number.isFinite(duration) && duration > 0 ? Math.min(target, Math.max(0, duration - 0.2)) : target
}
