/**
 * Dev-only demo data for the file:// harness (`dev.html?v=…&seed=1`, used by
 * scripts/panel-check.mjs). Lets the transcript + overview UI render and get
 * screenshotted without the extension or an API key.
 * Never imported by the extension bundles.
 */
import { seedTranscriptCache } from '../content/transcript'
import type { DevSeed, OverviewData, Transcript, TranscriptSegment } from '../lib/types'

const SEGMENTS: TranscriptSegment[] = [
  {
    startSec: 0,
    endSec: 27,
    text: "If you've ever reread a chapter three times and still blanked in the exam, this is for you. Today we're looking at what the research says about studying less and remembering more.",
  },
  {
    startSec: 27,
    endSec: 58,
    text: 'The first thing to understand is the forgetting curve. Within twenty-four hours of a lecture, most students lose more than half of what they heard, and the loss keeps compounding for days.',
  },
  {
    startSec: 58,
    endSec: 88,
    text: "Here's the trap: highlighting and rereading feel productive because the material gets more familiar. But familiarity is not memory. Recognition is a much weaker signal than recall.",
  },
  {
    startSec: 88,
    endSec: 115,
    text: "Active recall flips that. Closing the book and forcing yourself to reconstruct the idea is uncomfortable precisely because it's hard — and the difficulty is what builds the memory.",
  },
  {
    startSec: 115,
    endSec: 137,
    text: 'In one classic experiment, students who tested themselves scored about fifty percent higher a week later than students who simply reread the same passage four times.',
  },
  {
    startSec: 137,
    endSec: 166,
    text: 'That brings us to spacing. Cramming works for tomorrow and fails for next month. Spreading the same total time across days keeps the material on the edge of forgetting, which is exactly where learning happens.',
  },
  {
    startSec: 166,
    endSec: 197,
    text: 'A practical schedule: day one, review after class. Day two, do a five-minute free recall. Day four, quiz yourself. Day eight, explain the hardest idea out loud to someone.',
  },
  {
    startSec: 197,
    endSec: 224,
    text: 'Interleaving matters too. Mixing problem types forces your brain to choose a strategy, not just execute one, and that choice is what you will need in the real exam.',
  },
  {
    startSec: 224,
    endSec: 250,
    text: 'None of this requires more hours. It requires spending the hours you already have differently: fewer highlights, more retrieval, and enough sleep for consolidation.',
  },
]

const CHAPTERS = [
  { startSec: 0, title: 'Why reviewing feels productive' },
  { startSec: 88, title: 'Active recall beats rereading' },
  { startSec: 137, title: 'Spacing beats cramming' },
  { startSec: 197, title: 'Interleaving and sleep' },
  { startSec: 224, title: 'One change to start with' },
]

/** The chapter the panel-check click test targets (index 1 in the rail). */
export const SEED_CLICK_CHAPTER_START_SEC = 88

export function installDevSeed(videoId: string): void {
  const transcript: Transcript = {
    videoId,
    language: 'English',
    languageCode: 'en',
    source: 'panel',
    segments: SEGMENTS,
    rawSegmentCount: 214,
    durationSec: SEGMENTS.at(-1)?.endSec ?? 0,
    estimatedTokens: 1_840,
    truncated: false,
    chapters: CHAPTERS,
  }
  seedTranscriptCache(transcript)

  const seed: DevSeed = {
    settings: { hasKey: true, model: 'gemini-3.5-flash-lite', level: 'intermediate' },
    overview: buildOverview(),
  }
  window.__llDevSeed = seed
}

function buildOverview(): OverviewData {
  return {
    overview:
      'Studying harder usually means studying worse. This talk walks through four findings from memory research — the forgetting curve, active recall, spacing and interleaving — and turns them into a schedule you can start this week without adding hours.',
    takeaways: [
      'Familiarity is not memory: highlighting and rereading create recognition, not recall.',
      'Self-testing beats rereading by a wide margin in controlled experiments.',
      'Spacing the same total time across days hooks the material to the edge of forgetting.',
      'Interleaving forces strategy choice, which is what exams actually test.',
    ],
    chapters: [
      {
        startSec: 0,
        title: 'Why reviewing feels productive',
        summary:
          'Rereading and highlighting create familiarity, which feels like learning but decays fast. The forgetting curve shows most of a lecture is gone within days.',
      },
      {
        startSec: 88,
        title: 'Active recall beats rereading',
        summary:
          'Closing the book and reconstructing the idea is hard — and that difficulty is the mechanism. A classic experiment shows a large week-later advantage for self-testing.',
      },
      {
        startSec: 137,
        title: 'Spacing beats cramming',
        summary:
          'Cramming optimises for tomorrow and fails for next month. Spreading the same minutes across days lands each review right where forgetting is about to win.',
      },
      {
        startSec: 197,
        title: 'Interleaving and sleep',
        summary:
          'Mixing problem types trains strategy selection, and sleep consolidates what the day built. Both are free once the schedule is set up.',
      },
      {
        startSec: 224,
        title: 'One change to start with',
        summary:
          'Keep your hours, change their shape: fewer highlights, more retrieval, a day-two free recall and a day-eight quiz of the hardest idea.',
      },
    ],
    generatedAt: Date.now(),
  }
}
