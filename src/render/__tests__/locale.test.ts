/**
 * The document's language — v0.8.
 *
 * Two properties matter, and the second is the one that could go wrong quietly.
 *
 * 1. The **furniture** changes: headings, months, the word for "present".
 * 2. The **content** does not. A mistranslated job title is a wrong claim about somebody's career, and
 *    no guard in this codebase could catch it — so the candidate's own words are never touched, and that
 *    is asserted rather than assumed.
 */
import { describe, expect, it } from 'vitest'
import { Resume } from '@/schema/resume'
import { formatRange, formatYearMonth } from '../format'
import {
  isOutputLocale,
  localeOptions,
  OUTPUT_LOCALES,
  resolveLocale,
  strings,
} from '../locale'
import { renderDocx } from '../docx/docx'

const BASE = {
  schemaVersion: '1.0' as const,
  basics: {
    fullName: 'Marta Sørensen',
    headline: 'Registered Nurse — Intensive Care',
    links: [],
    personalDetails: [],
  },
  work: [
    {
      company: 'Rigshospitalet',
      role: 'Shift Lead Nurse',
      startDate: '2019-03',
      endDate: null,
      highlights: ['Led nursing handover for a 24-bed unit.'],
      tech: [],
    },
  ],
  education: [{ institution: 'Københavns Professionshøjskole', degree: 'BSc' }],
  skills: [{ category: 'Clinical', items: ['Triage'] }],
  projects: [],
  certifications: [],
  languages: [],
  awards: [],
  publications: [],
  volunteer: [],
  custom: [],
}

describe('a locale tag resolves to furniture we have', () => {
  it('reads the language subtag out of a full BCP-47 tag', () => {
    expect(resolveLocale('da-DK')).toBe('da')
    expect(resolveLocale('es-419')).toBe('es')
    expect(resolveLocale('en_GB')).toBe('en')
    expect(resolveLocale('DA')).toBe('da')
  })

  it('falls back to English rather than throwing', () => {
    // A CV in a language we have no furniture for still renders correctly in every other respect.
    // Refusing to render it would be a worse answer than an English heading.
    expect(resolveLocale('pl')).toBe('en')
    expect(resolveLocale(undefined)).toBe('en')
    expect(resolveLocale('')).toBe('en')
  })

  it('offers each language under its own name', () => {
    // Endonyms: nobody looks for "Danish" in a Danish interface.
    expect(localeOptions().map((option) => option.label)).toEqual([
      'English',
      'Español',
      'Dansk',
    ])
    expect(isOutputLocale('da')).toBe(true)
    expect(isOutputLocale('pl')).toBe(false)
  })
})

describe('dates take the document’s language', () => {
  it('names the month in each', () => {
    expect(formatYearMonth('2019-03', 'en')).toBe('Mar 2019')
    expect(formatYearMonth('2019-03', 'es')).toBe('mar 2019')
    expect(formatYearMonth('2019-03', 'da')).toBe('mar. 2019')
  })

  it('uses the local word for a current role', () => {
    expect(formatRange('2019-03', null, 'en')).toBe('Mar 2019 – Present')
    expect(formatRange('2019-03', null, 'es')).toBe('mar 2019 – Actualidad')
    expect(formatRange('2019-03', null, 'da')).toBe('mar. 2019 – Nu')
  })

  it('leaves a year-only date alone in every language', () => {
    // The schema allows `2019` with no month, and there is nothing to localize about a number.
    for (const locale of OUTPUT_LOCALES) {
      expect(formatYearMonth('2019', locale)).toBe('2019')
    }
  })

  it('defaults to English, so every caller written before v0.8 behaves as it did', () => {
    expect(formatYearMonth('2019-03')).toBe('Mar 2019')
    expect(formatRange('2019-03', null)).toBe('Mar 2019 – Present')
  })
})

describe('a rendered document is set in its own language', () => {
  /** Through mammoth, so the assertion is about the document a reader opens, not about our own table. */
  const readBack = async (locale: string): Promise<string> => {
    const mammoth = (await import('mammoth')).default
    const resume = Resume.parse({ ...BASE, locale })
    const { value } = await mammoth.extractRawText({
      buffer: Buffer.from(renderDocx(resume)),
    })
    return value
  }

  for (const locale of OUTPUT_LOCALES) {
    it(`uses ${locale} headings and dates`, async () => {
      const text = await readBack(locale)
      const local = strings(locale)
      expect(text).toContain(local.headings.work)
      expect(text).toContain(local.headings.education)
      expect(text).toContain(local.headings.skills)
      expect(text).toContain(formatRange('2019-03', null, locale))
    })
  }

  it('never translates the candidate’s own words', async () => {
    /**
     * The load-bearing assertion of the whole feature. Only the furniture is localized: a job title, a
     * bullet or an employer rendered in a language the candidate did not write is a claim about their
     * career that they never made.
     */
    const text = await readBack('da')

    expect(text).toContain('Shift Lead Nurse')
    expect(text).toContain('Led nursing handover for a 24-bed unit.')
    expect(text).toContain('Rigshospitalet')
    // And the furniture *is* Danish, with no English heading left behind.
    expect(text).toContain('Erfaring')
    expect(text).toContain('Uddannelse')
    expect(text).toContain('mar. 2019 – Nu')
    expect(text).not.toContain('Experience')
    expect(text).not.toContain('Present')
  })
})
