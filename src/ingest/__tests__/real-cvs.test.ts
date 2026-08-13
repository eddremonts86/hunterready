/**
 * Regression tests against two **real** CVs (v0.2).
 *
 * These files are real people's personal data, so they live in `fixtures/private/` and are
 * gitignored. The suite therefore skips itself when they are absent — CI has no access to them and
 * must not fail because of it. Anyone with the files gets the coverage; nobody else is blocked.
 *
 * Every assertion here corresponds to a defect these two documents actually exposed. They are worth
 * more than the synthetic fixtures precisely because we did not write them:
 *
 *   • `eline.docx`  — Danish, built as ten Word tables, zero heading styles, label/value rows,
 *                     date-first education blocks, language/level pairs on separate lines.
 *   • `edd.pdf`     — Spanish, heavily designed, letter-spaced headings and labels, decorative
 *                     `/01` entry counters, no bullet glyphs at all.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ingest } from '../index'
import { extractByRules } from '@/structure/fallback'

const DIR = join(process.cwd(), 'fixtures/private')
const ELINE = join(DIR, 'eline.docx')
const EDD = join(DIR, 'edd.pdf')

const have = (path: string) => existsSync(path)
const load = (path: string) => new Uint8Array(readFileSync(path))

describe.skipIf(!have(ELINE))('a real table-based Danish CV (.docx)', () => {
  it('normalizes into recognisable Danish sections', async () => {
    const result = await ingest(load(ELINE), 'eline.docx')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const headings = result.normalized.lines
      .filter((line) => line.isHeading)
      .map((line) => line.text.toLowerCase())

    // The vocabulary has to carry this document: it has no Word heading styles at all.
    for (const expected of [
      'profil',
      'uddannelse',
      'erhvervserfaring',
      'sprog',
    ]) {
      expect(headings, `missing section: ${expected}`).toContain(expected)
    }
    expect(
      result.normalized.lines.filter((l) => l.isBullet).length,
    ).toBeGreaterThan(10)
    expect(result.warnings.join(' ')).toMatch(/table/i)
  })

  it('reads the name from its label, not from position', async () => {
    const result = await ingest(load(ELINE), 'eline.docx')
    if (!result.ok) return
    const { resume } = extractByRules(result.normalized.text)

    // Positional guessing produced "Personlige oplysninger Navn" — the section heading plus the
    // field label. The label/value pairing is what fixes it.
    expect(resume.basics.fullName).toBe('Eline Storm Johnsen')
    expect(resume.basics.email).toContain('@')
    expect(resume.basics.phone).toBeDefined()
    // A field label or a section heading must never end up as the job title.
    expect(resume.basics.headline ?? '').not.toMatch(
      /personlige|oplysninger|adresse/i,
    )
  })

  it('pairs date-first education blocks with the right institution', async () => {
    const result = await ingest(load(ELINE), 'eline.docx')
    if (!result.ok) return
    const { resume } = extractByRules(result.normalized.text)

    expect(resume.education.length).toBeGreaterThanOrEqual(3)
    const bachelor = resume.education.find((e) =>
      /bachelor/i.test(e.degree ?? ''),
    )
    expect(
      bachelor,
      'the bachelor entry should exist with a degree, not a date',
    ).toBeDefined()
    // The failure this guards: degree "Aug. 2012", institution "jun. 2015".
    expect(bachelor?.institution).toMatch(/universitet/i)
    expect(bachelor?.startDate).toMatch(/^\d{4}(-\d{2})?$/)
    for (const entry of resume.education) {
      expect(entry.degree ?? '').not.toMatch(/^\w{3,4}\.?\s+\d{4}/)
      expect(entry.institution).not.toMatch(/^\w{3,4}\.?\s+\d{4}/)
    }
  })

  it('keeps roles as roles and dates as dates', async () => {
    const result = await ingest(load(ELINE), 'eline.docx')
    if (!result.ok) return
    const { resume } = extractByRules(result.normalized.text)

    expect(resume.work.length).toBeGreaterThanOrEqual(4)
    for (const job of resume.work) {
      // Roles were literally "September 2014" and companies "nu" before the date-first fix.
      expect(job.role).not.toMatch(/^\w{3,10}\.?\s+(19|20)\d{2}$/)
      expect(job.company).not.toMatch(/^(nu|now|present)$/i)
    }
    // Most recent first, and the current role stays open-ended.
    expect(resume.work[0].endDate).toBeNull()
  })

  it('pairs a language with the level on the following line', async () => {
    const result = await ingest(load(ELINE), 'eline.docx')
    if (!result.ok) return
    const { resume } = extractByRules(result.normalized.text)

    const names = resume.languages.map((l) => l.name.toLowerCase())
    expect(names).toContain('dansk')
    expect(names).toContain('engelsk')
    // "Modersmål" and "Flydende" are levels; they must not become languages of their own.
    for (const level of ['modersmål', 'flydende', 'meget godt']) {
      expect(names, `${level} is a proficiency, not a language`).not.toContain(
        level,
      )
    }
    const danish = resume.languages.find(
      (l) => l.name.toLowerCase() === 'dansk',
    )
    expect(danish?.level).toBe('native')
  })
})

describe.skipIf(!have(EDD))('a real designed Spanish CV (.pdf)', () => {
  it('reconstructs word spaces in letter-spaced headings and labels', async () => {
    const result = await ingest(load(EDD), 'edd.pdf')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const { text } = result.normalized

    // The exact strings a line-level letter-space collapse produced. Each one is a word boundary
    // that was destroyed while "fixing" spaced-out headings.
    for (const broken of [
      'STAFFFRONTENDENGINEER',
      'MAILeddremonts86',
      'QUIÉNESCRIBE',
      'SCHILLINGAPS',
    ]) {
      expect(text, `word spaces lost: ${broken}`).not.toContain(broken)
    }

    // And the same content, correctly spaced.
    expect(text).toContain('STAFF FRONTEND ENGINEER')
    expect(text).toMatch(/MAIL\s+\S+@/)
    expect(text).toContain('Eduardo Inerarte')
  })

  it('finds the Spanish sections', async () => {
    const result = await ingest(load(EDD), 'edd.pdf')
    if (!result.ok) return
    const headings = result.normalized.lines
      .filter((line) => line.isHeading)
      .map((line) => line.text.toLowerCase())
    expect(headings.join(' ')).toMatch(/experiencia/)
  })

  it('strips decorative entry counters from titles', async () => {
    const result = await ingest(load(EDD), 'edd.pdf')
    if (!result.ok) return
    const { resume } = extractByRules(result.normalized.text)
    for (const job of resume.work) {
      expect(
        job.role,
        'the /01 counter is ornament, not part of the job title',
      ).not.toMatch(/^\/?\d/)
    }
  })
})
