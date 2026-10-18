/**
 * Every YouTube DOM selector used by the extension lives in this file.
 *
 * YouTube's markup changes regularly and without notice. Treat all of these as
 * best-effort: always null-check, always have a fallback, and never assume an
 * element exists at a given moment. Phase 2 (transcript) and later phases add
 * their selectors here as well.
 */
export const SELECTORS = {
  /**
   * Contents of the right-hand column (related videos). Preferred panel spot:
   * the panel is inserted as the first child, above the related list.
   */
  rightColumnInner: ['#secondary-inner', 'ytd-watch-flexy #secondary-inner'],
  /** The right column itself, used when #secondary-inner is missing. */
  rightColumn: ['#secondary'],
  /** Area directly below the player (description, comments). Fallback spot. */
  belowPlayer: ['ytd-watch-flexy #below', '#below'],
  /** The video player. Never style or move this; only read state from it later. */
  player: ['#movie_player', 'ytd-player .html5-video-player'],
  /**
   * Main <video> element of the watch page. The chapter rail (Phase 3) only
   * ever reads `duration` and writes `currentTime` on it.
   */
  mainVideo: ['#movie_player video.html5-main-video', '#movie_player video'],
  /** Watch page title heading; best-effort (falls back to document.title). */
  watchTitle: ['ytd-watch-metadata h1', '#title h1'],
  /** Channel name in the owner row; best-effort, used as prompt context only. */
  watchChannel: [
    'ytd-video-owner-renderer #channel-name a',
    '#owner #channel-name a',
    '#channel-name a',
  ],
} as const

/** Class the player element gets while an ad is playing (used in Phase 4). */
export const PLAYER_AD_SHOWING_CLASS = 'ad-showing'

/** Class the player element gets on a live stream. */
export const PLAYER_LIVE_CLASS = 'ytp-live'

/**
 * Container of the player's progress bar. Quiz marker dots (Phase 4) are
 * appended to it as pointer-transparent children; the bar itself is untouched.
 */
export const PLAYER_PROGRESS_BAR_CONTAINER_SELECTOR = '.ytp-progress-bar-container'

/* ------------------------------------------------------------------------ */
/* Transcript (Phase 2). All verified live on 2026-10-18, video Ks-_Mh1QhMc. */
/* ------------------------------------------------------------------------ */

/**
 * "Show transcript" button in the description area. The button is rendered
 * inside `ytd-video-description-transcript-section-renderer` (server-rendered,
 * present even while the description is collapsed) and it opens the transcript
 * as an engagement panel. The section only exists when the video has captions.
 */
export const TRANSCRIPT_BUTTON_SELECTOR = 'button[aria-label="Show transcript"]'
/** Fallback if YouTube renames the aria-label but keeps the section markup. */
export const TRANSCRIPT_SECTION_BUTTON_SELECTOR = 'ytd-video-description-transcript-section-renderer button'

/** The engagement panel that hosts the transcript after it has been opened once. */
export const TRANSCRIPT_PANEL_SELECTOR =
  'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]'
/** One caption line. Rendered in batches; the whole list usually exists after open. */
export const TRANSCRIPT_SEGMENT_SELECTOR = 'ytd-transcript-segment-renderer'
/** Timestamp element inside a segment, e.g. "1:02:03". */
export const TRANSCRIPT_SEGMENT_TIMESTAMP_SELECTOR = '.segment-timestamp'
/** Text element inside a segment (a `yt-formatted-string`). */
export const TRANSCRIPT_SEGMENT_TEXT_SELECTOR = '.segment-text'
/** The scrolling container for segments; used to force-lazy-load longer transcripts. */
export const TRANSCRIPT_SEGMENT_LIST_SELECTOR = 'ytd-transcript-segment-list-renderer'
/** Footer of the transcript panel; its text is the currently selected language. */
export const TRANSCRIPT_FOOTER_SELECTOR = 'ytd-transcript-footer-renderer'
/** Close button of the transcript panel. */
export const TRANSCRIPT_CLOSE_SELECTOR = 'button[aria-label="Close transcript"]'

/* ---- Creator chapters (verified live on 2026-10-18) ---- */

/** One chapter chip in the description's "Chapters" carousel. */
export const CHAPTER_MARKER_SELECTOR = 'ytd-macro-markers-list-item-renderer'
/** Timestamp element inside a chapter marker, e.g. "0:00". */
export const CHAPTER_MARKER_TIME_SELECTOR = '#time'
/** Title element inside a chapter marker. */
export const CHAPTER_MARKER_TITLE_SELECTOR = 'h3'

/** Returns the first element matching any of the given selectors, or null. */
export function findFirstElement(selectors: readonly string[]): HTMLElement | null {
  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector)
    if (element) return element
  }
  return null
}

/**
 * Beyond this width the "right column" is not really a column next to the
 * player anymore — YouTube stacked it under the player (narrow window), so the
 * panel should move below the player instead. Desktop two-column layout is
 * ~402px wide.
 */
export const STACKED_COLUMN_MAX_WIDTH_PX = 600
