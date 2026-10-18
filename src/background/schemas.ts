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

/** Strict shape of one chapter question, after validation. */
export const quizResponseSchema = z.object({
  question: z.string().min(1).max(600),
  expectedAnswer: z.string().min(1).max(1_200),
  acceptablePoints: z.array(z.string().min(1).max(300)).min(1).max(6),
  hints: z.array(z.string().min(1).max(300)).min(1).max(3),
  explanation: z.string().min(1).max(1_500),
})

export type QuizPayload = z.infer<typeof quizResponseSchema>

/** Raw JSON Schema for the Interactions API `response_format` field. */
export const QUIZ_JSON_SCHEMA = {
  type: 'object',
  properties: {
    question: {
      type: 'string',
      description:
        'One short free-response question (max two sentences) about the key idea of the chapter. Never multiple choice, never yes/no.',
    },
    expectedAnswer: { type: 'string', description: 'A model answer in 1 to 3 sentences.' },
    acceptablePoints: {
      type: 'array',
      description: '2 to 5 short points that a correct answer should contain.',
      items: { type: 'string' },
    },
    hints: {
      type: 'array',
      description:
        '1 to 3 progressive hints revealed on demand: the first is a gentle nudge, the last nearly gives the answer away.',
      items: { type: 'string' },
    },
    explanation: {
      type: 'string',
      description: '2 to 3 sentences on why the expected answer is right; shown after judging.',
    },
  },
  required: ['question', 'expectedAnswer', 'acceptablePoints', 'hints', 'explanation'],
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
