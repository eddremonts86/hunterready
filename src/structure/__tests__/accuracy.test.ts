/**
 * The accuracy suite (v0.2). Measures extraction against hand-written expected results and holds it
 * to a floor.
 *
 * It scores the **rule-based** path, deliberately: it is deterministic, free and offline, so the
 * number means the same thing on every run and in CI. That makes it the baseline the model has to
 * beat — if a prompt change does not beat plain rules, it is not an improvement (docs/09, ADR-013).
 *
 * The thresholds below are floors, not targets. Raise one whenever a change earns it; never lower
 * one to make a red suite go green — that converts a regression into a new normal, which is exactly
 * what a quality gate exists to prevent.
 */
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ingest } from '@/ingest'
import { ocrAvailable } from '@/ingest/adapters/ocr'
import { Resume } from '@/schema/resume'
import { extractByRules } from '../fallback'
import { formatReport, scoreExtraction } from '../accuracy'

const ROOT = process.cwd()

/**
 * The `.doc` path needs LibreOffice, which lives in the Docker image and deliberately **not** on a
 * developer's machine (ADR-012). So the case is skipped rather than failed when soffice is absent:
 * asserting an environment we chose not to have would be a test lying about the code.
 */
const HAS_SOFFICE = (() => {
  try {
    execFileSync('soffice', ['--version'], { stdio: 'ignore', timeout: 10_000 })
    return true
  } catch {
    return false
  }
})()

/** Same reasoning for Tesseract and poppler: they ship in the image, not on a laptop. */
const HAS_OCR = await ocrAvailable()

/**
 * Each input paired with the expected result it was generated from, and the floor it must clear.
 *
 * The floors are high — 0.95 — and that is a statement about the *fixtures*, not a boast about the
 * parser. Every input here is synthesized from the expected result it is scored against, so all the
 * information is present by construction and anything short of a full recovery is a defect in our
 * code. Earlier, staggered floors (0.88 / 0.8 / 0.72 / 0.7) described a parser that was losing names,
 * employers and whole jobs; they were set to whatever the code happened to score, which makes a
 * threshold a record of the status quo rather than a gate.
 *
 * A margin of 0.05 is left so a single lost field fails the run loudly instead of silently.
 *
 * These fixtures being at 100% is *not* evidence that extraction is solved. It means the synthetic
 * set no longer discriminates, and the honest next move is harder inputs — a real designed export, a
 * scan — not a higher number here. See fixtures/input/README.md for what is still owed.
 */
const FLOOR = 0.95

/**
 * The scan is the one input where 100% would be a lie.
 *
 * Every other fixture carries its information losslessly, so anything short of full recovery is our
 * bug. A scan does not: OCR misreads characters, and no amount of parsing gets a `5` back once it has
 * been read as an `S`. This floor is a claim about how much of a *printed* CV survives the round trip.
 *
 * It currently scores 100%, which is a genuinely good result and not a reason to set the floor at 0.95
 * like the rest. Tesseract's output shifts with its version and its language data, and this is the one
 * case where a failing run would mean "the OCR build changed" rather than "someone broke the parser".
 * The wider margin is the difference between the two.
 */
const SCAN_FLOOR = 0.9

const CASES = [
  {
    input: 'clean-single-column.pdf',
    expected: 'sales-junior.json',
    floor: FLOOR,
  },
  { input: 'plain.txt', expected: 'sales-junior.json', floor: FLOOR },
  { input: 'sales-word.docx', expected: 'sales-junior.json', floor: FLOOR },
  ...(HAS_SOFFICE
    ? ([
        { input: 'legacy.doc', expected: 'sales-junior.json', floor: FLOOR },
      ] as const)
    : []),
  { input: 'nurse-senior.pdf', expected: 'nurse-senior.json', floor: FLOOR },
  {
    input: 'two-column-designed.pdf',
    expected: 'switcher.json',
    floor: FLOOR,
  },
  /**
   * The same CV as the line above, with an interleaved text layer instead of a column-sequential one
   * (`scripts/make-interleaved.mjs`). Two fixtures for one document is the point: the content is
   * identical, so any difference between the two scores is attributable to reading order alone.
   *
   * It earned its place immediately. It is the only fixture whose bullets wrap, and it found a
   * phantom fourth job built out of one bullet's continuation line.
   */
  {
    input: 'two-column-interleaved.pdf',
    expected: 'switcher.json',
    floor: FLOOR,
  },
  /**
   * The image-only CV, read through Tesseract (`scripts/make-scanned.mjs`). Skipped without the OCR
   * toolchain, which lives in the Docker image — `pnpm test:docker` is where this one actually runs.
   *
   * Same document as `sales-word.docx`, printed and scanned. Comparing the two scores says exactly what
   * a scan costs someone, which is the number worth knowing.
   */
  ...(HAS_OCR
    ? ([
        {
          input: 'scanned.pdf',
          expected: 'sales-junior.json',
          floor: SCAN_FLOOR,
        },
      ] as const)
    : []),
] as const

async function run(input: string, expectedFile: string) {
  const bytes = new Uint8Array(
    await readFile(join(ROOT, 'fixtures/input', input)),
  )
  const ingested = await ingest(bytes, input)
  if (!ingested.ok)
    throw new Error(`${input} failed to ingest: ${ingested.code}`)

  const expected = Resume.parse(
    JSON.parse(
      await readFile(join(ROOT, 'fixtures/expected', expectedFile), 'utf8'),
    ),
  )
  const { resume } = extractByRules(ingested.normalized.text)
  return { report: scoreExtraction(resume, expected), resume, expected }
}

describe('extraction accuracy (rule-based baseline)', () => {
  const table: Array<string> = []

  it.each(CASES)(
    '$input scores at least $floor',
    async ({ input, expected: expectedFile, floor }) => {
      const { report } = await run(input, expectedFile)
      table.push(formatReport(input, report))

      expect(
        report.overall,
        `${input} scored ${Math.round(report.overall * 100)}%, floor is ${Math.round(floor * 100)}%.\nMissed:\n  ${report.misses.slice(0, 12).join('\n  ')}`,
      ).toBeGreaterThanOrEqual(floor)
    },
  )

  it('never scrambles reading order, on any input', async () => {
    for (const testCase of CASES) {
      const { report } = await run(testCase.input, testCase.expected)
      expect(
        report.orderPreserved,
        `${testCase.input}: employers came back out of order — a column or table was read wrong`,
      ).toBe(true)
    }
  })

  it('always recovers the identity fields, which are the ones that cost an interview', async () => {
    for (const testCase of CASES) {
      const { report } = await run(testCase.input, testCase.expected)
      const identity = report.scores.filter((s) =>
        ['name', 'email'].includes(s.field),
      )
      for (const score of identity) {
        expect(
          score.matched,
          `${testCase.input}: ${score.field} not recovered. A CV with the wrong name or no email is unusable.`,
        ).toBe(score.expected)
      }
    }
  })

  it('writes the table where CI and a human can both read it', async () => {
    // The suite's real output. Written to a file as well as stdout, because vitest suppresses
    // console output by default and a quality number nobody can see is not a quality gate.
    const rendered = table.join('\n\n')
    await writeFile(join(ROOT, 'accuracy-report.txt'), rendered + '\n', 'utf8')
    process.stdout.write('\n' + rendered + '\n\n')
    expect(table.length).toBeGreaterThan(0)
  })
})
