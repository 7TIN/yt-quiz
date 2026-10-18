/**
 * The only things this extension ever writes into the player: seeking the main
 * <video> element. The player UI itself is never touched. Also exposes the two
 * reads the quiz loop needs: the video element and the ad state.
 */
import { PLAYER_AD_SHOWING_CLASS, SELECTORS, findFirstElement } from './selectors'

const PLAYER_SELECTOR = '#movie_player'

/** The watch page's main <video> element, re-queried because YouTube swaps it on SPA navigation. */
export function getVideoElement(): HTMLVideoElement | null {
  return findFirstElement(SELECTORS.mainVideo) as HTMLVideoElement | null
}

/** True while a pre-roll or mid-roll ad is playing in the main player. */
export function isAdShowing(): boolean {
  return document.querySelector(PLAYER_SELECTOR)?.classList.contains(PLAYER_AD_SHOWING_CLASS) ?? false
}

/** Seeks the video to a timestamp. Safe to call at any time; no-ops when nothing matches. */
export function seekVideoTo(seconds: number): void {
  // Don't fight an ad; the seek would apply to the ad's video element.
  if (isAdShowing()) return

  const video = getVideoElement()
  if (!video) return

  const target = Math.max(0, Math.floor(seconds))
  const duration = video.duration
  video.currentTime =
    Number.isFinite(duration) && duration > 0 ? Math.min(target, Math.max(0, duration - 0.2)) : target
}
