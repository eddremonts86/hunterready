/**
 * Can DeepSeek's models fill our real tool schema?
 *
 * ## Why this is a test and not a note in a commit message
 *
 * Edd asked to move from `deepseek-v4-flash` to `deepseek-v4-pro`. Pro cannot do the job: against the
 * schema this project actually sends it returns a tool call with an **empty input**, three times per
 * upload, and every extraction silently degrades to the rule engine. Flash fills the same schema.
 *
 * That is a claim about a remote service, so it needs to be re-runnable rather than remembered. The
 * day DeepSeek fixes it, this is the one command that says so, and the fix is one line in `.env`.
 *
 * ## Opt-in, like `test:measure`
 *
 * It spends real money and needs a credential, so it skips itself without one. `pnpm test` stays
 * hermetic; this runs when somebody is deciding something.
 *
 *     set -a; . ./.env; set +a; pnpm vitest run deepseek-schema
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

const KEY = process.env.DEEPSEEK_API_KEY ?? ''
const BASE =
  process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/anthropic'

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

describe.skipIf(KEY === '')('DeepSeek against our real tool schema', () => {
  it('flash fills it, which is why it is the default', async () => {
    expect(await fillsTheSchema('deepseek-v4-flash')).toContain('resume')
  }, 120_000)

  /**
   * Written as an expectation of the *current* behaviour, so it turns red when DeepSeek fixes pro.
   *
   * A test that passes for a bad reason is worth having when the bad reason is a supplier's bug: this
   * one failing is the signal to change one line in `.env` and delete this block.
   */
  it('pro still returns an empty tool input — flip the default when this fails', async () => {
    expect(
      await fillsTheSchema('deepseek-v4-pro'),
      'v4-pro filled the schema. It can be the default now: set DEEPSEEK_MODEL=deepseek-v4-pro.',
    ).toEqual([])
  }, 120_000)
})
