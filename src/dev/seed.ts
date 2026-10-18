/**
 * Dev-only demo data for the file:// harness (`dev.html?v=…&seed=1`, used by
 * scripts/panel-check.mjs). Caches a transcript, an overview, a chapter set and
 * a verdict so the whole learning loop renders with no extension and no API
 * key. Never imported by the extension bundles.
 */
import { seedTranscriptCache } from '../content/transcript'
import type {
  DevSeed,
  FactSet,
  JudgeResult,
  OverviewData,
  QuizSet,
  Transcript,
  TranscriptSegment,
} from '../lib/types'

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
    settings: {
      hasKey: true,
      model: 'gemini-3.5-flash-lite',
      level: 'intermediate',
      quizEvery: 1,
      density: 'fewer',
      factsDensity: 'moderate',
    },
    overview: buildOverview(),
    quizSet: buildQuizSet(),
    judge: buildJudge(),
    facts: buildFacts(),
  }
  window.__llDevSeed = seed
}

/**
 * Canned chapter-1 check, shaped like the real thing: a multiple-choice
 * question (graded locally) then the free-response one the judge verdict
 * belongs to. Option 0 is wrong on purpose — the harness clicks it to exercise
 * the red/green reveal.
 */
function buildQuizSet(): QuizSet {
  return {
    questions: [
      {
        kind: 'mcq',
        question: 'Which sentence is closest to what the video says about rereading a chapter?',
        choices: [
          'Rereading works because repetition slowly moves facts into long-term memory.',
          'Rereading feels productive because the text becomes familiar, which is only recognition.',
          'Rereading works best when it is spread out across several days.',
        ],
        correctIndex: 1,
        hint: 'Listen for the difference between recognising a page and being able to reconstruct it.',
        explanation:
          'Familiarity feels like knowing, but it only trains recognition — a weak, cue-dependent signal. Repetition and spacing are separate ideas the chapter comes to later.',
        atSec: 58,
      },
      {
        kind: 'free-text',
        question:
          'In your own words: why does rereading a chapter feel productive even though it barely helps you remember it?',
        expectedAnswer:
          'Rereading makes the material familiar, and familiarity feels like knowing it. But it only trains recognition — not the active recall you need in an exam.',
        acceptablePoints: [
          'Rereading increases familiarity with the text.',
          'Familiarity feels like learning but is only recognition.',
          'Recognition is weaker than active recall.',
        ],
        hints: [
          'Think about the difference between recognising a page and being able to reconstruct it.',
          'The trap is that familiarity produces a feeling of knowing without the ability to recall.',
        ],
        explanation:
          'The research contrast is between recognition (weak, cue-dependent) and recall (strong, cue-free). Rereading mostly strengthens recognition, which is why the feeling of learning it produces is misleading.',
        atSec: 88,
      },
    ],
  }
}

function buildJudge(): JudgeResult {
  return {
    verdict: 'correct',
    feedback:
      'Exactly — you named the familiarity trap and connected it to the recognition-vs-recall distinction, which is the core point of the chapter.',
  }
}

/**
 * Canned in-between facts, shaped like the real thing: one lands mid-chapter-1
 * (the harness reads it and presses OK), the other mid-chapter-3. The dev stub
 * serves this set for whichever chapter asks.
 */
function buildFacts(): FactSet {
  return {
    facts: [
      {
        kind: 'history',
        title: 'Where the curve came from',
        body: 'Hermann Ebbinghaus mapped the forgetting curve on himself in the 1880s, memorising lists of nonsense syllables for years on end.',
        atSec: 40,
      },
      {
        kind: 'idea',
        title: 'Worth trying',
        body: 'A five-minute free recall before bed often beats an hour of rereading the next morning — sleep does part of the work.',
        atSec: 150,
      },
    ],
  }
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
