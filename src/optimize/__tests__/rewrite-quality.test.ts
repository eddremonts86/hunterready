/**
 * What the free tier actually produces — the local model, over every fixture, measured.
 *
 * ## Why this exists
 *
 * Until the schema fix in `900eded` the local path answered `unavailable` for all fourteen bullets of
 * the nurse fixture, so "free-tier rewrite quality" had never been a number at all. It now returns
 * suggestions, and the audit recorded one worrying observation: a suggestion that imported content
 * from a different job. One observation is not a rate, and a feature the commonest visitor meets
 * (ADR-023: anonymous means local) cannot be trusted on an anecdote.
 *
 * ## Opt-in, deliberately
 *
 * Roughly thirty model calls per fixture. On the container's CPU that is minutes, which is why this
 * does not run in `pnpm test` — a suite nobody can afford to run is a suite nobody runs. Set
 * `HR_MEASURE_REWRITE=1` and point `OLLAMA_BASE_URL` at a model:
 *
 * ```
 * HR_MEASURE_REWRITE=1 OLLAMA_BASE_URL=http://localhost:11500 pnpm exec vitest run rewrite-quality
 * ```
 *
 * The model is the same one production runs (`qwen2.5:3b-instruct`), so the numbers transfer even
 * when the hardware underneath does not.
 *
 * ## What it asserts
 *
 * Two loose ceilings on the aggregate and one hard zero, in the same spirit as the accuracy suite:
 * numbers to tighten as the feature earns it, never to loosen when a run goes red. The two loose ones
 * are loose because four runs of identical code measured silence at 27%, 4%, 15% and 12% — a model
 * sampled at temperature 0.3 over 26 bullets does not produce a stable number, and a threshold that
 * pretends otherwise is a coin toss. They still catch the regression that actually happened.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { Resume } from '@/schema/resume'
import { rewriteBullets } from '../rewrite'
import { findCrossJobDrift } from '../drift'
import type { RewriteOutcome } from '../rewrite'

const ROOT = process.cwd()

const MEASURE = process.env.HR_MEASURE_REWRITE === '1'

const FIXTURES = ['nurse-senior', 'sales-junior', 'switcher'] as const

interface Measured {
  fixture: string
  bullets: number
  tally: Record<RewriteOutcome, number>
  drifted: number
  driftDetail: Array<string>
  /** Why the silent ones were silent — the question the first measured run could not answer. */
  silence: Record<string, number>
  tells: number
}

const measured: Array<Measured> = []

/**
 * Share of suggestions carrying a claim borrowed from another employer.
 *
 * This is the price of grounding on the whole résumé (docs/06). Nothing is invented — the claim is in
 * the document — but on the wrong job it is still a false sentence with the candidate's name on it.
 */
function driftShare(row: Measured): number {
  return row.tally.suggested === 0 ? 0 : row.drifted / row.tally.suggested
}

describe.skipIf(!MEASURE)('free-tier rewrite quality (local model)', () => {
  beforeAll(
    async () => {
      for (const fixture of FIXTURES) {
        const raw = await readFile(
          join(ROOT, 'fixtures', 'expected', `${fixture}.json`),
          'utf8',
        )
        const resume = Resume.parse(JSON.parse(raw))

        // `useProvider: false` is what an anonymous visitor gets: the local model, never MiniMax.
        const result = await rewriteBullets({ resume, useProvider: false })

        const driftDetail: Array<string> = []
        const silence: Record<string, number> = {}
        let drifted = 0
        for (const rewrite of result.rewrites) {
          if (rewrite.silence !== undefined) {
            silence[rewrite.silence] = (silence[rewrite.silence] ?? 0) + 1
          }
          if (
            rewrite.outcome !== 'suggested' ||
            rewrite.suggestion === undefined
          ) {
            continue
          }
          const borrowed = findCrossJobDrift(
            rewrite.suggestion,
            resume,
            rewrite.workIndex,
          )
          if (borrowed.length === 0) continue
          drifted += 1
          driftDetail.push(
            `${resume.work[rewrite.workIndex]?.company ?? '?'} · bullet ${
              rewrite.highlightIndex + 1
            } → ${borrowed.map((f) => `${f.kind} "${f.value}"`).join(', ')}`,
          )
        }

        measured.push({
          fixture,
          bullets: result.rewrites.length,
          tally: result.tally,
          drifted,
          driftDetail,
          silence,
          tells: result.voice.suggestionsWithTells,
        })
      }
    },
    30 * 60 * 1000,
  )

  /**
   * Thresholds are on the **total**, not per fixture, and they are loose on purpose.
   *
   * A 5-bullet fixture moves 20 points when one bullet changes its mind, and this model is sampled at
   * temperature 0.3: four measured runs of the same code gave silence of 27%, 4%, 15% and 12%. A tight
   * per-fixture floor would be a coin toss dressed as a gate. What these numbers do catch is the
   * regression that actually happened — every bullet on the local path failing, silently, for weeks.
   */
  it('says something about most bullets, instead of failing them all', () => {
    const bullets = measured.reduce((n, row) => n + row.bullets, 0)
    const silent = measured.reduce((n, row) => n + row.tally.unavailable, 0)
    expect(
      silent / bullets,
      `${silent} of ${bullets} bullets came back with nothing:\n  ${measured
        .map((row) => `${row.fixture}: ${JSON.stringify(row.silence)}`)
        .join('\n  ')}`,
    ).toBeLessThanOrEqual(0.35)
  })

  /**
   * A `fabricated` outcome is the guard **working** — an invention caught and thrown away, with the
   * candidate's own wording kept. So this is not a floor of zero; it is a ceiling on how often the
   * model reaches for something that is not there, which is the signal that the prompt has drifted.
   */
  it('does not reach for invented facts more than occasionally', () => {
    const attempts = measured.reduce(
      (n, row) => n + row.tally.suggested + row.tally.fabricated,
      0,
    )
    const caught = measured.reduce((n, row) => n + row.tally.fabricated, 0)
    expect(
      caught / attempts,
      `${caught} of ${attempts} rewrites were rejected as invented`,
    ).toBeLessThanOrEqual(0.2)
  })

  it('shows nothing that belongs to another employer', () => {
    // Zero, not a rate: since ADR-028 the guard rejects exactly what this counts, so a single one
    // reaching a suggestion means the two definitions have come apart.
    for (const row of measured) {
      expect(
        row.drifted,
        `${row.fixture}: ${row.drifted}/${row.tally.suggested} suggestions borrowed from another job\n  ${row.driftDetail.join('\n  ')}`,
      ).toBe(0)
    }
  })

  it('writes the table where CI and a human can both read it', async () => {
    const lines = [
      'Free-tier rewrite quality — local model, one call per bullet',
      '',
      'fixture         bullets  suggested  unchanged  invented  silent  drifted  voice-tells',
    ]
    for (const row of measured) {
      lines.push(
        [
          row.fixture.padEnd(15),
          String(row.bullets).padStart(7),
          String(row.tally.suggested).padStart(10),
          String(row.tally.unchanged).padStart(10),
          String(row.tally.fabricated).padStart(9),
          String(row.tally.unavailable).padStart(7),
          `${row.drifted} (${Math.round(driftShare(row) * 100)}%)`.padStart(8),
          String(row.tells).padStart(12),
        ].join(''),
      )
    }
    const detail = measured.flatMap((row) => [
      ...(Object.keys(row.silence).length === 0
        ? []
        : [
            ``,
            `${row.fixture} — why the silent ones were silent: ${Object.entries(
              row.silence,
            )
              .map(([reason, count]) => `${reason} × ${count}`)
              .join(', ')}`,
          ]),
      ...(row.driftDetail.length === 0
        ? []
        : [
            ``,
            `${row.fixture} — claims borrowed from another job:`,
            ...row.driftDetail.map((d) => `  ${d}`),
          ]),
    ])
    const rendered = [...lines, ...detail].join('\n')

    await writeFile(
      join(ROOT, 'rewrite-quality-report.txt'),
      rendered + '\n',
      'utf8',
    )
    process.stdout.write('\n' + rendered + '\n\n')
    expect(measured.length).toBe(FIXTURES.length)
  })
})
