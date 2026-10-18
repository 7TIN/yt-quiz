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
