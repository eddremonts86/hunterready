/**
 * Which provider reads a CV better — scored, not assumed.
 *
 * ## Why this did not exist
 *
 * `accuracy.test.ts` scores the **rule-based** path on purpose: deterministic, free, identical in
 * CI, and therefore the baseline a model has to beat. That is the right thing for a gate and it
 * means the obvious question has never been asked. DeepSeek was added on 2026-08-17 "so it can be
 * measured against MiniMax on the same CVs", and then nothing measured it.
 *
 * The provenance numbers (`provenance-report.txt`) make MiniMax look like the clear choice, and they
 * are one dimension. **A provider that cites every field and reads half of them wrong is worse than
 * one that cites nothing.** This scores the fields themselves, with the same scorer, so the two
 * numbers can be read side by side.
 *
 * ## Three passes, for the reason the last measurement taught
 *
 * Two runs of the provenance instrument, identical code and inputs, disagreed by 66 points. One run
 * is not a measurement here either.
 *
 *     set -a; . ./.env; set +a
 *     HR_MEASURE_ACCURACY=1 pnpm exec vitest run provider-accuracy
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { ingest } from '@/ingest'
import { Resume } from '@/schema/resume'
import { scoreExtraction } from '../accuracy'
import { extractResume } from '../extract'
import { extractByRules } from '../fallback'
import { availableProviders } from '../provider'

const MEASURE = process.env.HR_MEASURE_ACCURACY === '1'
const PASSES = Number(process.env.HR_MEASURE_PASSES ?? '3')

/** Fixtures with a hand-written expected result, which is what makes a score mean anything. */
const CASES = [
  { input: 'plain.txt', expected: 'sales-junior.json' },
  { input: 'nurse-senior.pdf', expected: 'nurse-senior.json' },
] as const

const ROOT = process.cwd()

async function readFixture(input: string) {
  const bytes = new Uint8Array(
    readFileSync(join(ROOT, 'fixtures/input', input)),
  )
  const ingested = await ingest(bytes, input)
  if (!ingested.ok) throw new Error(`${input}: ${ingested.code}`)
  return ingested.normalized.text
}

describe.skipIf(!MEASURE)('extraction accuracy, per provider', () => {
  it('scores every provider against the rule baseline', async () => {
    const providers = availableProviders()
    expect(providers.length, 'load .env first').toBeGreaterThan(0)

    const lines: Array<string> = [
      'Extraction accuracy by provider, scored with the same scorer as accuracy-report.txt.',
      `Measured ${new Date().toISOString().slice(0, 10)}, ${PASSES} passes each.`,
      '',
      '  who        fixture              overall   passes',
    ]

    for (const { input, expected: expectedFile } of CASES) {
      const text = await readFixture(input)
      const expected = Resume.parse(
        JSON.parse(
          await readFile(join(ROOT, 'fixtures/expected', expectedFile), 'utf8'),
        ),
      )

      // The baseline first. A provider that cannot beat plain regular expressions is not an upgrade.
      const rules = scoreExtraction(extractByRules(text).resume, expected)
      lines.push(
        `  ${'rules'.padEnd(10)} ${input.padEnd(18)} ${String(Math.round(rules.overall * 100)).padStart(6)}%   (deterministic)`,
      )

      for (const provider of providers) {
        const scores: Array<number> = []
        for (let pass = 0; pass < PASSES; pass++) {
          const out = await extractResume(text, {
            useProvider: true,
            providerId: provider.id,
          })
          if (!out.ok) continue
          scores.push(
            Math.round(scoreExtraction(out.resume, expected).overall * 100),
          )
        }
        const best = scores.length === 0 ? 0 : Math.max(...scores)
        const worst = scores.length === 0 ? 0 : Math.min(...scores)
        lines.push(
          `  ${provider.name.padEnd(10)} ${input.padEnd(18)} ${String(worst).padStart(5)}-${String(best).padEnd(3)}%  ${scores.join(' ')}`,
        )
      }
    }

    await writeFile(
      join(ROOT, 'provider-accuracy-report.txt'),
      `${lines.join('\n')}\n`,
      'utf8',
    )
    expect(lines.length).toBeGreaterThan(4)
  }, 900_000)
})
