/**
 * The output contract for Gemini-backed features, in both directions:
 *  - the raw JSON Schema sent as `response_format` on the wire
 *  - the Zod validator run on whatever the model actually returns
 *
 * The two must stay in sync. Any change here requires bumping
 * OVERVIEW_SCHEMA_VERSION in cache.ts so stale cache entries stop matching.
 */
import { z } from 'zod'

/** Strict shape of a model overview, after validation. */
export const overviewResponseSchema = z.object({
  overview: z.string().min(1).max(4_000),
  takeaways: z.array(z.string().min(1).max(500)).min(1).max(8),
  chapters: z
    .array(
      z.object({
        startSec: z.number().min(0).max(24 * 3600),
        title: z.string().min(1).max(160),
        summary: z.string().min(1).max(1_200),
      }),
    )
    .min(1)
    .max(24),
})

export type OverviewPayload = z.infer<typeof overviewResponseSchema>

/** Raw JSON Schema for the Interactions API `response_format` field. */
export const OVERVIEW_JSON_SCHEMA = {
  type: 'object',
  properties: {
    overview: {
      type: 'string',
      description: 'A 3 to 5 sentence summary of the whole video, written for the requested level.',
    },
    takeaways: {
      type: 'array',
      description: '3 to 6 short bullet points with the key ideas a viewer should remember.',
      items: { type: 'string' },
    },
    chapters: {
      type: 'array',
      description:
        'Chapter summaries in video order. Reuse the provided chapters verbatim when the video has published chapters; otherwise propose 4 to 8 chapters covering the whole video.',
      items: {
        type: 'object',
        properties: {
          startSec: { type: 'integer', description: 'Chapter start time in seconds.' },
          title: { type: 'string', description: 'Short chapter title.' },
          summary: { type: 'string', description: 'A 2 to 3 sentence summary of what that chapter teaches.' },
        },
        required: ['startSec', 'title', 'summary'],
      },
    },
  },
  required: ['overview', 'takeaways', 'chapters'],
} as const

/** Tiny schema used by the options page's "Test connection" button. */
export const KEY_TEST_JSON_SCHEMA = {
  type: 'object',
  properties: { ok: { type: 'boolean' } },
  required: ['ok'],
} as const

export const keyTestSchema = z.object({ ok: z.boolean() })

/* ------------------------------------------------------------------ */
/* Quiz + judging (Phase 4)                                           */
/* ------------------------------------------------------------------ */

/**
 * One entry of the model's `questions` array, validated loose on purpose.
 *
 * The payload is model prose wearing a JSON hat: live traffic drifts — an index
 * sent as "B", a timestamp sent as "2:03", a correct option flagged with
 * `correct: true` instead of indexed, a hint list that never arrived. Giving
 * each field a tolerant type means one odd entry costs one question instead of
 * the chapter's whole set. quiz.ts coerces what it can (normalizeQuizEntry);
 * anything it still cannot use is dropped there.
 */
export const quizItemSchema = z.object({
  kind: z.union([z.string(), z.number()]).nullish(),
  question: z.string().min(1),
  choices: z.array(z.unknown()).nullish(),
  correctIndex: z.union([z.number(), z.string()]).nullish(),
  hint: z.union([z.string(), z.number()]).nullish(),
  explanation: z.union([z.string(), z.number()]).nullish(),
  atSec: z.union([z.number(), z.string()]).nullish(),
  expectedAnswer: z.union([z.string(), z.number()]).nullish(),
  acceptablePoints: z.array(z.unknown()).nullish(),
  hints: z.array(z.unknown()).nullish(),
})

export type QuizItemPayload = z.infer<typeof quizItemSchema>

/**
 * The envelope, and all a reply must prove to be worth normalizing: it is an
 * object holding a non-empty list. (A reply cut off by the output limit never
 * gets this far — quiz.ts salvages the complete entries out of it first.)
 */
export const quizSetResponseSchema = z.object({
  questions: z.array(z.unknown()).min(1),
})

/** Raw JSON Schema for the Interactions API `response_format` field. */
export const QUIZ_JSON_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      description: 'The chapter’s questions, in the order they are asked.',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', description: 'Exactly one of the two strings: "mcq" or "free-text".' },
          question: {
            type: 'string',
            description: 'One short question (max two sentences), phrased about the video — never mention a transcript.',
          },
          choices: {
            type: 'array',
            description:
              '"mcq" only: 3 or 4 answer choices of similar length, exactly one correct, no jokes and no "all of the above".',
            items: { type: 'string' },
          },
          correctIndex: {
            type: 'integer',
            description: '"mcq" only: 0-based index of the correct choice in `choices`.',
          },
          hint: {
            type: 'string',
            description: '"mcq" only: one short hint that narrows the choices without giving the answer away.',
          },
          expectedAnswer: {
            type: 'string',
            description: '"free-text" only: a model answer in 1 to 3 sentences.',
          },
          acceptablePoints: {
            type: 'array',
            description: '"free-text" only: 2 to 5 short points that a correct answer should contain.',
            items: { type: 'string' },
          },
          hints: {
            type: 'array',
            description:
              '"free-text" only: 1 to 3 progressive hints: the first is a gentle nudge, the last nearly gives the answer away.',
            items: { type: 'string' },
          },
          explanation: {
            type: 'string',
            description:
              '1 to 2 sentences on why the right answer is right; for a multiple-choice question also why the most tempting wrong choice fails. Shown right after answering.',
          },
          atSec: {
            type: 'integer',
            description:
              'Integer seconds into the video (from the [m:ss] markers) of the moment the answer is explained; powers the "rewatch this part" link.',
          },
        },
        required: ['kind', 'question', 'explanation', 'atSec'],
      },
    },
  },
  required: ['questions'],
} as const

/** Strict shape of one verdict, after validation. */
export const judgeResponseSchema = z.object({
  // The wire schema deliberately describes the enum in words instead of using
  // the `enum` keyword (whose support in the Interactions API schema is
  // unverified); Zod enforces it locally and the schema nudge retries once.
  verdict: z.enum(['correct', 'partial', 'incorrect']),
  feedback: z.string().min(1).max(1_500),
})

export type JudgePayload = z.infer<typeof judgeResponseSchema>

export const JUDGE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    verdict: {
      type: 'string',
      description: 'Exactly one of the three strings: "correct", "partial", or "incorrect".',
    },
    feedback: {
      type: 'string',
      description:
        '2 to 4 sentences addressed to the learner: what was right, what was missing, and one nudge to remember it.',
    },
  },
  required: ['verdict', 'feedback'],
} as const
