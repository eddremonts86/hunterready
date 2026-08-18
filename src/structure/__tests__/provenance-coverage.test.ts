/**
 * How many fields come back with no answer to "where did this come from?"
 *
 * Roadmap item 08 said "MiniMax sometimes returns no provenance". **Sometimes is not a number**, and
 * without one there is no way to tell whether a change helped, whether one provider is worse than
 * another, or whether it is worth fixing at all. This produces the number.
 *
 * ## Why it matters more than it sounds
 *
 * The review screen's whole argument is that every detail traces back to the document the person
 * uploaded. A field with no provenance is a field they have to take on trust, which is the one thing
 * this product exists not to ask for. It is also invisible: the field still appears, correctly
 * filled, just unmarked.
 *
 * ## Opt-in, because it spends money
 *
 * Real calls to real providers. `pnpm test` stays hermetic and free; this runs when somebody is
 * deciding something.
 *
 *     set -a; . ./.env; set +a
 *     HR_MEASURE_PROVENANCE=1 pnpm exec vitest run provenance-coverage
 *
 * ## What is counted
 *
 * Every populated leaf in the extracted `Resume` — a string, a number, an array member — and whether
 * any provenance entry names it or a prefix of it. A prefix counts because the model legitimately
 * reports `skills` for a whole block rather than `skills.1.items.0` for each word, and demanding
 * leaf-level precision would measure verbosity rather than coverage.
 */
import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { extractResume } from '../extract'
import { availableProviders } from '../provider'
import type { Resume } from '@/schema/resume'
import type { FieldProvenance } from '@/schema/provenance'

const MEASURE = process.env.HR_MEASURE_PROVENANCE === '1'

/**
 * Three passes per pairing, because one is not a measurement.
 *
 * Found the hard way, twice in ten minutes: two runs of identical code produced DeepSeek at 0% then
 * 65% on the same fixture, and MiniMax at 34% then 100%. CLAUDE.md already records the same lesson
 * about `rewrite-quality` — four runs measured silence at 27%, 4%, 15% and 12%. A model asked for a
 * side-channel it does not have to fill produces a different amount of it each time, so the honest
 * output is a spread and never a number.
 */
const PASSES = Number(process.env.HR_MEASURE_PASSES ?? '3')

/** Two fixtures, not eight. Each one is a real model call per provider and the shape shows up fast. */
const FIXTURES = ['plain.txt', 'nurse-senior.pdf'] as const

/** Paths nothing should be expected to cite: we set them, the document did not say them. */
const OURS = new Set(['schemaVersion', 'locale', 'sectionOrder'])

/** Every populated leaf, as a dotted path. `work.0.company`, `skills.1.items.0`. */
function leaves(value: unknown, path = ''): Array<string> {
  if (value === null || value === undefined || value === '') return []
  if (Array.isArray(value)) {
    return value.flatMap((item, i) =>
      leaves(item, path === '' ? `${i}` : `${path}.${i}`),
    )
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, v]) => leaves(v, path === '' ? key : `${path}.${key}`),
    )
  }
  return path === '' || OURS.has(path.split('.')[0] ?? '') ? [] : [path]
}

/** Cited when a provenance entry names this path or an ancestor of it. */
function cited(path: string, marks: ReadonlySet<string>): boolean {
  const parts = path.split('.')
  for (let i = parts.length; i > 0; i--) {
    if (marks.has(parts.slice(0, i).join('.'))) return true
  }
  return false
}

function coverage(
  resume: Resume,
  provenance: ReadonlyArray<FieldProvenance>,
): { total: number; covered: number; missing: Array<string> } {
  const marks = new Set(provenance.map((p) => p.path))
  const all = leaves(resume)
  const missing = all.filter((p) => !cited(p, marks))
  return { total: all.length, covered: all.length - missing.length, missing }
}

describe.skipIf(!MEASURE)('provenance coverage, per provider', () => {
  const providers = availableProviders()
  const rows: Array<{
    provider: string
    fixture: string
    fields: number
    pcts: Array<number>
  }> = []
  const uncited: Array<string> = []

  it('measures every configured provider on every fixture', async () => {
    expect(
      providers.length,
      'no provider configured — load .env before running this',
    ).toBeGreaterThan(0)

    for (const provider of providers) {
      for (const fixture of FIXTURES) {
        const { ingest } = await import('@/ingest')
        const bytes = new Uint8Array(
          readFileSync(join(process.cwd(), 'fixtures/input', fixture)),
        )
        const read = await ingest(bytes, fixture)
        expect(read.ok, `${fixture} did not ingest`).toBe(true)
        if (!read.ok) continue

        const pcts: Array<number> = []
        let fields = 0
        const seen = new Set<string>()

        for (let pass = 0; pass < PASSES; pass++) {
          const extracted = await extractResume(read.normalized.text, {
            useProvider: true,
            providerId: provider.id,
          })
          expect(extracted.ok, `${provider.name} failed on ${fixture}`).toBe(
            true,
          )
          if (!extracted.ok) continue

          const c = coverage(extracted.resume, extracted.provenance)
          fields = c.total
          pcts.push(Math.round((c.covered / c.total) * 100))
          for (const path of c.missing) seen.add(path)
        }

        rows.push({ provider: provider.name, fixture, fields, pcts })

        /*
          Paths that went uncited in *any* pass, not in all of them. A field that is cited two runs
          out of three is not covered — it is a field somebody may or may not be able to check,
          which is worse to reason about than one that never is.
        */
        if (seen.size > 0) {
          uncited.push(
            `${provider.name} · ${fixture} · ${seen.size} paths uncited in at least one pass\n  ` +
              [...seen].slice(0, 30).join('\n  ') +
              (seen.size > 30 ? `\n  … and ${seen.size - 30} more` : ''),
          )
        }
      }
    }

    /*
      Written to a file rather than logged, following `accuracy.test.ts`. Vitest swallows console
      output, and a number nobody can read is not a measurement. A file also diffs between runs,
      which is the whole point of measuring twice.
    */
    const report = [
      'Provenance coverage — how many populated fields carry a "where did this come from".',
      `Measured ${new Date().toISOString().slice(0, 10)} on ${FIXTURES.join(', ')}.`,
      '',
      `Each pairing run ${PASSES} times. The spread is the finding; a single number would be a lucky run.`,
      '',
      '  provider   fixture              fields   worst   best   passes',
      ...rows.map(
        (r) =>
          `  ${r.provider.padEnd(10)} ${r.fixture.padEnd(18)} ${String(r.fields).padStart(6)} ${String(Math.min(...r.pcts)).padStart(6)}% ${String(Math.max(...r.pcts)).padStart(5)}%   ${r.pcts.join(' ')}`,
      ),
      '',
      ...uncited,
    ].join('\n')
    await writeFile(
      join(process.cwd(), 'provenance-report.txt'),
      `${report}\n`,
      'utf8',
    )

    expect(rows.length).toBe(providers.length * FIXTURES.length)
  }, 600_000)
})
