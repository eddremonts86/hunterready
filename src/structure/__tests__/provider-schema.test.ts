/**
 * Can the third-party model fill our real tool schema?
 *
 * ## Why this is a test and not a note in a commit message
 *
 * It began as a DeepSeek probe (named deepseek-schema.test.ts, unquoted so this file does not fail
 * its own repository's filename check). Edd had asked to move from `deepseek-v4-flash` to
 * `deepseek-v4-pro`, and pro could not do the job: against the schema this project actually sends it
 * returned a tool call with an **empty input**, three times per upload, and every extraction silently
 * degraded to the rule engine.
 *
 * The provider changed twice — ADR-036 to DeepSeek, ADR-038 back to MiniMax — and the question did
 * not, so the file is named for the question now rather than for whoever is answering it this month.
 *
 * **Nobody has ever run it against MiniMax with the current schema.** MiniMax was the provider until
 * 2026-08-29 and this probe was written after it left, so a pass here is new information rather than a
 * regression check: it is the only thing that would catch M3 doing to us what pro did.
 *
 * That is a claim about a remote service, so it has to be re-runnable rather than remembered.
 *
 * ## Opt-in, like `test:measure`
 *
 * It spends real money and needs a credential, so it skips itself without one. `pnpm test` stays
 * hermetic; this runs when somebody is deciding something.
 *
 *     set -a; . ./.env; set +a; pnpm vitest run provider-schema
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { Resume } from '@/schema/resume'

/** The same payload `extract.ts` derives its tool schema from. Kept in step by shape, not by copy. */
const Payload = z.object({
  resume: Resume.partial({ schemaVersion: true }),
  provenance: z
    .array(z.object({ path: z.string(), confidence: z.number().min(0).max(1) }))
    .default([]),
})

/*
  Read straight from the environment rather than through `provider.ts`, on purpose: what is being
  tested is the remote service, and going through the resolver would make a failure ambiguous between
  "the model cannot fill the schema" and "the resolver did not pick it".
*/
const KEY = process.env.MINIMAX_API_KEY ?? ''
const BASE = process.env.MINIMAX_BASE_URL ?? 'https://api.minimax.io/anthropic'

/** A CV small enough to be cheap and complete enough to need more than one section. */
const CV = [
  'Ana Ruiz',
  'Nurse',
  '',
  'EXPERIENCE',
  'Ward Nurse, Clinica Sur (2020 - 2024)',
  '  - Ran the night shift.',
  '',
  'EDUCATION',
  'BSc Nursing, Universidad de Sevilla (2016 - 2020)',
].join('\n')

async function fillsTheSchema(model: string): Promise<Array<string>> {
  const res = await fetch(`${BASE}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${KEY}`,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      temperature: 0,
      // Forced tool calls are refused while this model reasons — see `Provider.forcesThinking`.
      thinking: { type: 'disabled' },
      tools: [
        {
          name: 'submit_cv',
          description: 'Submit the extracted CV.',
          input_schema: z.toJSONSchema(Payload, {
            io: 'input',
            reused: 'inline',
          }),
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_cv' },
      messages: [
        {
          role: 'user',
          content: `CV TEXT:\n${CV}\n\nExtract it and call submit_cv.`,
        },
      ],
    }),
  })
  const body = (await res.json()) as {
    content?: Array<{ type: string; input?: Record<string, unknown> }>
  }
  const tool = (body.content ?? []).find((block) => block.type === 'tool_use')
  return Object.keys(tool?.input ?? {})
}

describe.skipIf(KEY === '')(
  'the third-party model against our real tool schema',
  () => {
    /*
      One assertion, and it is the one that matters: does the model this product actually sends CVs to
      come back with a filled `resume`? An empty tool input is not an error — the call succeeds, the
      extraction degrades to the rule engine, and the only visible symptom is a worse read.
    */
    it('MiniMax-M3 fills it', async () => {
      const model = process.env.MINIMAX_MODEL ?? 'MiniMax-M3'
      expect(
        await fillsTheSchema(model),
        `${model} returned a tool call with an empty input, which is what deepseek-v4-pro did. ` +
          'Every upload through the third-party path would degrade to the rule engine.',
      ).toContain('resume')
    }, 120_000)
  },
)
