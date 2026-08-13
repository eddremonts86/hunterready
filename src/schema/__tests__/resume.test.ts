/**
 * Block 2 verifier: the canonical schema accepts every hand-written fixture, and the
 * rules docs/03-resume-schema.md commits to actually hold.
 *
 * The fixtures are the contract's real test. They are deliberately sector-diverse
 * (nurse, sales, warehouse-to-logistics) because the audience is the whole working
 * population — a fixture set of engineering CVs would let the schema drift toward
 * assumptions most users do not match.
 */
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Resume, YearMonth, emptyResume } from '../resume'
import {
  CONFIDENCE_REVIEW_THRESHOLD,
  ExtractionResult,
  needsReview,
} from '../provenance'

const EXPECTED_DIR = join(process.cwd(), 'fixtures/expected')

async function fixtureNames(): Promise<string[]> {
  const files = await readdir(EXPECTED_DIR)
  return files.filter((f) => f.endsWith('.json'))
}

async function loadFixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(join(EXPECTED_DIR, name), 'utf8'))
}

describe('fixtures', async () => {
  const names = await fixtureNames()

  it('there are fixtures at all', () => {
    expect(names.length).toBeGreaterThanOrEqual(3)
  })

  it.each(names)('%s parses against the Resume schema', async (name) => {
    const raw = await loadFixture(name)
    const result = Resume.safeParse(raw)
    // Print the actual issues rather than a bare boolean when this fails.
    expect(result.success ? [] : result.error.issues).toEqual([])
  })

  it.each(names)('%s round-trips without losing data', async (name) => {
    const raw = await loadFixture(name)
    const once = Resume.parse(raw)
    const twice = Resume.parse(once)
    expect(twice).toEqual(once)
  })

  it.each(names)('%s uses YYYY or YYYY-MM for every date', async (name) => {
    const resume = Resume.parse(await loadFixture(name))
    const dates: Array<string> = []
    for (const w of [...resume.work, ...resume.volunteer]) {
      if (w.startDate) dates.push(w.startDate)
      if (w.endDate) dates.push(w.endDate)
    }
    for (const e of resume.education) {
      if (e.startDate) dates.push(e.startDate)
      if (e.endDate) dates.push(e.endDate)
    }
    for (const c of resume.certifications) {
      if (c.date) dates.push(c.date)
      if (c.expires) dates.push(c.expires)
    }
    for (const d of dates) {
      expect(YearMonth.safeParse(d).success, `bad date: ${d}`).toBe(true)
    }
  })

  it.each(names)('%s covers the sector-neutral basics', async (name) => {
    const resume = Resume.parse(await loadFixture(name))
    expect(resume.basics.fullName.length).toBeGreaterThan(0)
    expect(resume.work.length).toBeGreaterThan(0)
    expect(resume.skills.length).toBeGreaterThan(0)
  })

  it('the fixture set is not all one sector', async () => {
    const headlines = await Promise.all(
      names.map(async (n) => {
        const r = Resume.parse(await loadFixture(n))
        return (r.basics.headline ?? '').toLowerCase()
      }),
    )
    const techish = headlines.filter((h) =>
      /engineer|developer|programmer|software/.test(h),
    )
    expect(
      techish.length,
      `${techish.length}/${headlines.length} fixtures are tech roles; the audience is all sectors`,
    ).toBeLessThan(headlines.length / 2)
  })
})

describe('schema rules', () => {
  it('null endDate means current, and is the default', () => {
    const r = Resume.parse({
      schemaVersion: '1.0',
      basics: { fullName: 'A' },
      work: [{ company: 'C', role: 'R' }],
    })
    expect(r.work[0].endDate).toBeNull()
  })

  it('accepts a year-only date', () => {
    expect(YearMonth.safeParse('2019').success).toBe(true)
  })

  it('rejects a full ISO date, a bad month and a bare month', () => {
    expect(YearMonth.safeParse('2019-06-01').success).toBe(false)
    expect(YearMonth.safeParse('2019-13').success).toBe(false)
    expect(YearMonth.safeParse('2019-6').success).toBe(false)
  })

  it('requires only fullName, so a bad parse is still editable', () => {
    const r = Resume.safeParse({
      schemaVersion: '1.0',
      basics: { fullName: 'A' },
    })
    expect(r.success).toBe(true)
  })

  it('rejects an empty fullName', () => {
    const r = Resume.safeParse({
      schemaVersion: '1.0',
      basics: { fullName: '' },
    })
    expect(r.success).toBe(false)
  })

  it('pins schemaVersion so a migration cannot be skipped silently', () => {
    const r = Resume.safeParse({
      schemaVersion: '1.1',
      basics: { fullName: 'A' },
    })
    expect(r.success).toBe(false)
  })

  it('emptyResume is valid', () => {
    expect(Resume.safeParse(emptyResume('Someone')).success).toBe(true)
  })

  it('keeps every array present after parse, so templates never guard for undefined', () => {
    const r = emptyResume('A')
    for (const key of [
      'work',
      'education',
      'skills',
      'projects',
      'certifications',
      'languages',
      'awards',
      'publications',
      'volunteer',
      'custom',
    ] as const) {
      expect(Array.isArray(r[key]), key).toBe(true)
    }
  })
})

describe('provenance', () => {
  it('flags low confidence and inferred values for review', () => {
    expect(needsReview({ path: 'a', confidence: 0.9, inferred: false })).toBe(
      false,
    )
    expect(needsReview({ path: 'a', confidence: 0.4, inferred: false })).toBe(
      true,
    )
    expect(needsReview({ path: 'a', confidence: 1, inferred: true })).toBe(true)
  })

  it('treats the threshold itself as reviewable-above', () => {
    expect(
      needsReview({
        path: 'a',
        confidence: CONFIDENCE_REVIEW_THRESHOLD,
        inferred: false,
      }),
    ).toBe(false)
  })

  it('validates an extraction envelope', () => {
    const r = ExtractionResult.safeParse({
      resume: {},
      sourceFormat: 'pdf',
      extractedAt: '2026-08-13T00:00:00.000Z',
      promptVersion: 'v1',
    })
    expect(r.success).toBe(true)
  })

  it('rejects an unknown source format', () => {
    const r = ExtractionResult.safeParse({
      resume: {},
      sourceFormat: 'rtf',
      extractedAt: '2026-08-13T00:00:00.000Z',
      promptVersion: 'v1',
    })
    expect(r.success).toBe(false)
  })
})
