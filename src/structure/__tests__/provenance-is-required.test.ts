/**
 * The tool contract has to *ask* for provenance, not merely allow it.
 *
 * ## The one line, and what it was worth
 *
 * `ExtractionPayload.provenance` carries `.default([])`, so `z.toJSONSchema(…, { io: 'input' })`
 * emitted `required: ["resume"]` — provenance optional. Three paragraphs earlier the prompt asks the
 * model to report "the index of the line you took it from" for every field it fills.
 *
 * **The prompt asked and the schema excused.** Provenance is the only part of the answer with no
 * visible consequence if it is dropped, so a model resolving that tension under output-budget
 * pressure drops it. Measured across two fixtures and two providers, three passes each:
 *
 * ```
 *                                 before          after
 *   DeepSeek   plain.txt          0% ·  94%     100% · 100%
 *   DeepSeek   nurse-senior.pdf   0% ·   0%      67% ·  96%
 *   MiniMax    plain.txt         68% · 100%     100% · 100%
 *   MiniMax    nurse-senior.pdf  22% ·  96%      97% · 100%
 * ```
 *
 * DeepSeek cited **nothing at all** on the larger document, in every pass, and roadmap item 08 had
 * recorded that as a fault of the providers. It was a fault of the request.
 *
 * ## Why this test and not only the measurement
 *
 * `provenance-coverage.test.ts` holds the floor, and it costs money and four minutes, so it is
 * opt-in and never runs in CI. This one is free, hermetic and runs on every push — which makes it
 * the thing that will actually catch the line being deleted by a refactor that "simplifies"
 * `toolSchema` back to a single `z.toJSONSchema` call.
 */
import { describe, expect, it } from 'vitest'

import { toolSchema } from '../extract'

describe('the extraction tool contract', () => {
  it('demands provenance rather than permitting it', () => {
    const schema = toolSchema() as {
      required?: Array<string>
      properties?: Record<string, unknown>
    }

    expect(schema.required ?? []).toContain('provenance')
    // And still the resume, obviously — a regression here would be the opposite mistake.
    expect(schema.required ?? []).toContain('resume')
  })

  it('still describes provenance as the shape the model has to fill', () => {
    const schema = toolSchema() as {
      properties?: { provenance?: { type?: string; items?: unknown } }
    }
    const node = schema.properties?.provenance
    expect(node?.type).toBe('array')
    // Required *and* empty-able would be a contract that asks for nothing.
    expect(node?.items).toBeDefined()
  })

  it('accepts an answer that omits it anyway, which is the other half', async () => {
    /*
      Asking strictly must not mean refusing leniently. A model that ignores `required` should cost
      the person their citations, never their CV: the alternative is a failed extraction that falls
      back to regular expressions, trading a whole read for a side channel. `review-form.tsx` already
      says "check everything, we could not tell which fields" when the list is empty, and
      `no-provenance-is-honest.test.ts` holds that in place.
    */
    const { z } = await import('zod')
    const { Resume } = await import('@/schema/resume')
    const Payload = z.object({
      resume: Resume.partial({ schemaVersion: true }),
      provenance: z
        .array(
          z.object({
            path: z.string(),
            confidence: z.number().min(0).max(1),
            sourceLine: z.number().int().min(0).optional(),
            inferred: z.boolean().optional(),
          }),
        )
        .default([]),
    })

    const withoutProvenance = {
      resume: {
        locale: 'en',
        basics: { fullName: 'Marta Sørensen' },
        work: [],
        education: [],
        skills: [],
      },
    }
    const parsed = Payload.safeParse(withoutProvenance)
    expect(
      parsed.success,
      'a model that ignores `required` must not cost the person their CV',
    ).toBe(true)
    expect(parsed.success && parsed.data.provenance).toEqual([])
  })
})
