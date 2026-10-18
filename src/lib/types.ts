/** Which theme the panel follows. Mirrors YouTube's own light/dark setting. */
export type ThemeMode = 'light' | 'dark'

/** Where the panel ended up in the page. */
export type PanelPlacement = 'secondary' | 'below' | 'floating'

/** YouTube video id (the `v` query parameter on /watch pages). */
export type VideoId = string

/* ------------------------------------------------------------------ */
/* Transcript (Phase 2)                                               */
/* ------------------------------------------------------------------ */

/** A merged ~20-30s slice of the transcript, what prompts are built from. */
export interface TranscriptSegment {
  startSec: number
  endSec: number
  text: string
}

/** A chapter as published by the video's creator on YouTube. */
export interface VideoChapter {
  startSec: number
  title: string
}

/** Where the transcript text came from. */
export type TranscriptSource = 'panel' | 'captions'

export interface Transcript {
  videoId: VideoId
  /** Human label, e.g. "English" (whatever track YouTube used by default). */
  language: string
  languageCode: string | null
  source: TranscriptSource
  /** Merged chunks, ready for prompting. */
  segments: TranscriptSegment[]
  /** Raw caption lines before merging (for diagnostics/UI). */
  rawSegmentCount: number
  durationSec: number
  estimatedTokens: number
  /** True when the transcript was cut down to fit the token budget. */
  truncated: boolean
  /** Creator chapters, if the video has any; else empty (Gemini will make them in Phase 3). */
  chapters: VideoChapter[]
}

export type TranscriptErrorCode =
  | 'live-unsupported'
  | 'no-tracks'
  | 'panel-unavailable'
  | 'captions-empty'
  | 'timeout'
  | 'video-changed'
  | 'unknown'

export interface TranscriptError {
  code: TranscriptErrorCode
  /** Plain-language message, safe to show in the panel as-is. */
  message: string
}

export type TranscriptResult =
  | { ok: true; transcript: Transcript }
  | { ok: false; error: TranscriptError }

/** Progress callback used to drive the panel's loading steps. */
export type TranscriptProgress = (step: string) => void

/* ------------------------------------------------------------------ */
/* Gemini + overview (Phase 3)                                        */
/* ------------------------------------------------------------------ */

/** Depth explanations, quizzes and facts are tuned to. Part of the cache key. */
export type Level = 'beginner' | 'intermediate' | 'advanced'

/** Everything the panel knows about the video that prompts may use. */
export interface LlmVideoMeta {
  title: string
  channel: string | null
  durationSec: number
  /** Human language label from the transcript, e.g. "English". */
  language: string
}

/** One chapter of the generated overview (creator chapters are preserved). */
export interface OverviewChapter {
  startSec: number
  title: string
  summary: string
}

/** The persisted + displayed result of one Gemini overview call. */
export interface OverviewData {
  overview: string
  takeaways: string[]
  chapters: OverviewChapter[]
  /** Epoch ms; used for cache bookkeeping and the options page. */
  generatedAt: number
}

/** Error codes shared by every Gemini-backed feature. */
export type GeminiErrorCode =
  | 'no-key'
  | 'invalid-key'
  | 'model-not-found'
  | 'rate-limit'
  | 'network'
  | 'timeout'
  | 'blocked'
  | 'empty'
  | 'schema'
  | 'server'
  | 'bad-request'
  | 'unknown'

export interface GeminiError {
  code: GeminiErrorCode
  /** Plain-language message, safe to render as text in the panel. */
  message: string
  /** Short sanitized detail from Google for diagnostics (never the key). */
  detail?: string
}

/** How often the learning loop interrupts playback: one quiz every N-th chapter. */
export type QuizCadence = 1 | 2 | 3

/**
 * How many questions a chapter's check gets. The count still scales with the
 * chapter's length (see quiz-plan.ts) — this picks the multiplier, not a fixed
 * number. Part of the quiz cache key, so switching density regenerates each
 * chapter's set once and switching back is free.
 */
export type QuizDensity = 'fewer' | 'moderate' | 'more'

/** Settings the content script and options page may see. Never contains the key. */
export interface LlSettings {
  hasKey: boolean
  model: string
  level: Level
  quizEvery: QuizCadence
  density: QuizDensity
}

/** Cache lookup input — what identifies "this video's overview". */
export interface OverviewGetInput {
  videoId: VideoId
  languageCode: string | null
  languageLabel: string
  level: Level
}

/** Everything needed to generate + cache a fresh overview. */
export interface OverviewGenerateInput extends OverviewGetInput {
  meta: LlmVideoMeta
  chapters: VideoChapter[]
  segments: TranscriptSegment[]
  truncated: boolean
}

export interface KeyTestResult {
  model: string
  latencyMs: number
}

/* ------------------------------------------------------------------ */
/* Quiz loop (Phase 4)                                                */
/* ------------------------------------------------------------------ */

/** What kind of question the viewer is answering. */
export type QuizQuestionKind = 'mcq' | 'free-text'

/** Fields every generated question carries, whatever its kind. */
export interface QuizQuestionBase {
  question: string
  /** 1-2 sentences: why the right answer is right, and the usual mistake. */
  explanation: string
  /** Video position (seconds) where the chapter explains the answer. */
  atSec: number
}

/**
 * A multiple-choice question. Grading is local — the correct index travels with
 * the question — so answering one never costs an API call and the reveal is
 * instant.
 */
export interface QuizMcqQuestion extends QuizQuestionBase {
  kind: 'mcq'
  choices: string[]
  /** Index into `choices` of the one correct option. */
  correctIndex: number
  /** One short hint; null when the model wrote none. */
  hint: string | null
}

/** The free-response question the chapter ends on; graded by the judge call. */
export interface QuizFreeTextQuestion extends QuizQuestionBase {
  kind: 'free-text'
  expectedAnswer: string
  acceptablePoints: string[]
  /** Progressive hints, revealed one at a time before answering. */
  hints: string[]
}

export type QuizQuestion = QuizMcqQuestion | QuizFreeTextQuestion

/**
 * One chapter's check: a small set asked in order — one or two quick
 * multiple-choice questions, then the free-response one that ends the chapter.
 * Cached as a unit per video + language + level + chapter.
 */
export interface QuizSet {
  questions: QuizQuestion[]
}

export type JudgeVerdict = 'correct' | 'partial' | 'incorrect'

export interface JudgeResult {
  verdict: JudgeVerdict
  feedback: string
}

/**
 * Everything the model needs about one chapter: where it sits, how long it is,
 * and its transcript slice. Shared by the two per-chapter features — the
 * question set and the facts that pop up during it.
 */
export interface ChapterContextInput extends OverviewGetInput {
  chapterIndex: number
  chapterStartSec: number
  /** Chapter length; decides how many questions (and facts) it gets. */
  chapterDurationSec: number
  videoTitle: string
  chapterTitle: string
  /**
   * The chapter's transcript slice as "[m:ss] text" lines, already trimmed to a
   * safe size. The timestamps let the model point `atSec` at the exact moment
   * it is talking about, which powers the "rewatch this part" link.
   */
  chapterTranscript: string
}

/** Cache lookup + generation input for one chapter's question set. */
export interface QuizGenerateInput extends ChapterContextInput {
  /** How many questions the viewer asked for; part of the cache key. */
  density: QuizDensity
}

/* ------------------------------------------------------------------ */
/* Fun facts (the pop-ups between the questions)                      */
/* ------------------------------------------------------------------ */

/** The badge a fact carries; shown as the label on the pop-up. */
export type FactKind = 'fact' | 'history' | 'trend' | 'idea' | 'context'

/**
 * One short "did you know" pop-up. It appears over the video while playback is
 * inside its little window and is closed with one OK — it never pauses the
 * video and never asks the viewer to answer anything.
 */
export interface VideoFact {
  kind: FactKind
  /** Short headline, e.g. "Did you know?" */
  title: string
  /** One or two sentences. */
  body: string
  /** Video position (seconds) the pop-up belongs to. */
  atSec: number
}

/** One chapter's facts, generated and cached as a unit. */
export interface FactSet {
  facts: VideoFact[]
}

/** Facts need exactly the chapter context a question set needs. */
export type FactsGenerateInput = ChapterContextInput


/** One free-text answer to grade. Identical answers hit the verdict cache. */
export interface JudgeAnswerInput {
  videoId: VideoId
  level: Level
  chapterIndex: number
  chapterStartSec: number
  question: string
  expectedAnswer: string
  acceptablePoints: string[]
  userAnswer: string
}

export interface CacheStats {
  entries: number
  bytes: number
}

export interface ClearCacheResult {
  removed: number
}

/* ------------------------------------------------------------------ */
/* Loop progress                                                      */
/* ------------------------------------------------------------------ */

/**
 * What the viewer has done at one chapter's quiz spot. Persisted by the content
 * script (see src/content/loop-progress.ts) so a half-finished set stays
 * unfinished — and continues where it left off — across reloads.
 */
export interface MomentProgress {
  /** Questions in the chapter's set; 0 until the set has been generated. */
  total: number
  /** Indices of the questions answered so far, ascending and unique. */
  answered: number[]
  /** True when the viewer deliberately skipped the spot (scrubbed past it). */
  skipped: boolean
}

/** chapterKey ("ch2@137") → entry, for one video + language + level. */
export type LoopProgress = Record<string, MomentProgress>

/** Message union between the content script/options page and the service worker. */
export type LlRequest =
  | { type: 'll:settings:get' }
  | {
      type: 'll:settings:save'
      apiKey?: string
      model?: string
      level?: Level
      quizEvery?: QuizCadence
      density?: QuizDensity
    }
  | { type: 'll:settings:remove-key' }
  | { type: 'll:key:test' }
  | { type: 'll:overview:get'; input: OverviewGetInput }
  | { type: 'll:overview:generate'; input: OverviewGenerateInput }
  | { type: 'll:quiz:generate'; input: QuizGenerateInput }
  | { type: 'll:facts:generate'; input: FactsGenerateInput }
  | { type: 'll:answer:judge'; input: JudgeAnswerInput }
  | { type: 'll:cache:stats' }
  | { type: 'll:cache:clear' }
  | { type: 'll:open-options' }

export type LlResponse<T> = { ok: true; data: T } | { ok: false; error: GeminiError }

/**
 * Dev harness only (`?seed=1` on the file:// preview): lets the panel render
 * transcript + overview states without the extension or an API key.
 */
export interface DevSeed {
  settings: LlSettings
  overview: OverviewData
  /** Canned chapter check + verdict so the loop runs without a key. */
  quizSet?: QuizSet
  judge?: JudgeResult
  /** Canned in-between facts; served for whichever chapter asks. */
  facts?: FactSet
}
