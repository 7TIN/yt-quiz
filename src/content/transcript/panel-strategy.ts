/**
 * Strategy A (preferred): use YouTube's own "Show transcript" panel.
 *
 * Verified live 2026-10-18 (videos Ks-_Mh1QhMc, bHIhgxav9LY):
 * - The trigger is `button[aria-label="Show transcript"]` inside the
 *   description's transcript section. It is server-rendered (exists even while
 *   the description is collapsed), but its click handler may not be attached
 *   yet right after load — a single early click can silently do nothing, so we
 *   re-click until the panel actually opens.
 * - The engagement panel element pre-exists with
 *   `visibility="ENGAGEMENT_PANEL_VISIBILITY_HIDDEN"`; OPEN means EXPANDED.
 * - Segments (`.segment-timestamp` + `.segment-text`) render in bulk (all 856
 *   for the test video); we still force-scroll in case future layouts lazy-load.
 * - Closing the panel hides it, but YouTube keeps the rendered segments in the
 *   DOM — normal behaviour, not a leak on our side.
 * - The language used is whatever track YouTube shows by default (footer).
 * - Close via `button[aria-label="Close transcript"]`.
 *
 * Ads: none of this touches the player, and the transcript section belongs to
 * the video's metadata (not the ad), so pre-roll ads do not block Strategy A.
 */
import {
  TRANSCRIPT_BUTTON_SELECTOR,
  TRANSCRIPT_CLOSE_SELECTOR,
  TRANSCRIPT_FOOTER_SELECTOR,
  TRANSCRIPT_PANEL_SELECTOR,
  TRANSCRIPT_SEGMENT_LIST_SELECTOR,
  TRANSCRIPT_SEGMENT_SELECTOR,
  TRANSCRIPT_SECTION_BUTTON_SELECTOR,
} from '../selectors'
import type { CaptionLine } from './parse'
import { normalizeWhitespace, readPanelSegments } from './parse'

/** How long to wait (in total) for the panel + segments to appear. */
const OPEN_TIMEOUT_MS = 20_000
/** If a click seems to have done nothing, click the trigger again this often. */
const CLICK_RETRY_MS = 3_000
/** Safety cap while force-scrolling very long transcripts. */
const MAX_LAZY_SCROLL_ROUNDS = 60
const LAZY_SCROLL_STEP_MS = 250

export class PanelUnavailableError extends Error {}

/** The panel counts as open only in the EXPANDED state (it pre-exists as HIDDEN). */
function isTranscriptPanelOpen(): boolean {
  const panel = document.querySelector(TRANSCRIPT_PANEL_SELECTOR)
  return panel?.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED'
}

function hasSegments(): boolean {
  return document.querySelectorAll(TRANSCRIPT_SEGMENT_SELECTOR).length > 0
}

export function findTranscriptButton(): HTMLElement | null {
  const button =
    document.querySelector<HTMLElement>(TRANSCRIPT_BUTTON_SELECTOR) ??
    document.querySelector<HTMLElement>(TRANSCRIPT_SECTION_BUTTON_SELECTOR)
  return button
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/**
 * Clicks "Show transcript" until the panel is open AND segments have rendered.
 * Never clicks while the panel is already open, so it cannot toggle it closed.
 */
async function openTranscriptPanel(wasOpen: boolean): Promise<void> {
  const deadline = Date.now() + OPEN_TIMEOUT_MS
  let lastClickAt = wasOpen ? Date.now() : 0

  while (Date.now() < deadline) {
    if (isTranscriptPanelOpen() && hasSegments()) return

    if (!isTranscriptPanelOpen() && Date.now() - lastClickAt > CLICK_RETRY_MS) {
      const button = findTranscriptButton()
      if (!button) throw new PanelUnavailableError('No "Show transcript" button on this page')
      button.click()
      lastClickAt = Date.now()
    }

    await delay(150)
  }

  if (isTranscriptPanelOpen() && hasSegments()) return
  throw new PanelUnavailableError('The transcript panel did not open')
}

/** Closes the panel we opened: exact aria-label first, then scoped fallbacks. */
function closeTranscriptPanel(): void {
  const panel = document.querySelector(TRANSCRIPT_PANEL_SELECTOR)
  const close =
    document.querySelector<HTMLElement>(TRANSCRIPT_CLOSE_SELECTOR) ??
    panel?.querySelector<HTMLElement>('button[aria-label*="close" i]') ??
    null
  if (close) {
    close.click()
    return
  }
  // Last resort: Escape dismisses engagement panels.
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}

/** Forces any lazily-rendered segments into the DOM by scrolling the list. */
async function forceLoadAllSegments(): Promise<number> {
  const count = () => document.querySelectorAll(TRANSCRIPT_SEGMENT_SELECTOR).length
  const scroller = document.querySelector<HTMLElement>(TRANSCRIPT_SEGMENT_LIST_SELECTOR)
  if (!scroller) return count()

  let lastCount = -1
  for (let round = 0; round < MAX_LAZY_SCROLL_ROUNDS; round++) {
    const current = count()
    if (current === lastCount) break
    lastCount = current
    scroller.scrollTop = scroller.scrollHeight
    await delay(LAZY_SCROLL_STEP_MS)
  }
  scroller.scrollTop = 0
  return count()
}

function readLanguageLabel(): string {
  const footer = document.querySelector<HTMLElement>(TRANSCRIPT_FOOTER_SELECTOR)
  const text = footer?.textContent ?? ''
  const firstLine = text.split('\n').map(normalizeWhitespace).find((line) => line.length > 0)
  return firstLine ?? 'Unknown'
}

export interface PanelScrapeResult {
  lines: CaptionLine[]
  language: string
}

/**
 * Opens the transcript panel, scrapes every segment, and restores the previous
 * panel state (closes it again if it was closed before).
 *
 * Throws `PanelUnavailableError` when the trigger or the panel itself cannot be
 * used — the caller then falls back to Strategy B.
 */
export async function scrapeTranscriptPanel(): Promise<PanelScrapeResult> {
  const wasOpen = isTranscriptPanelOpen()
  await openTranscriptPanel(wasOpen)

  const language = readLanguageLabel()
  await forceLoadAllSegments()

  const elements = document.querySelectorAll<HTMLElement>(TRANSCRIPT_SEGMENT_SELECTOR)
  const lines = readPanelSegments(elements)

  if (!wasOpen) {
    closeTranscriptPanel()
  }

  return { lines, language }
}
