import { describe, expect, it } from 'vitest'
import {
  digitsOf,
  guardTranslation,
  translatableSlots,
  writeSlot,
} from '@/optimize/translate'
import { Resume } from '@/schema/resume'

const resume = Resume.parse({
  schemaVersion: '1.0',
  basics: {
    fullName: 'Marta Sørensen',
    headline: 'Registered Nurse',
    summary: 'Twelve years in intensive care across a 24-bed unit.',
    links: [{ label: 'Portfolio', url: 'https://example.org' }],
    personalDetails: [],
  },
  work: [
    {
      role: 'Shift Lead Nurse',
      company: 'Rigshospitalet',
      highlights: ['Led handover for a 24-bed unit.'],
    },
  ],
  education: [],
  skills: [{ category: 'Clinical', items: ['Triage'] }],
  projects: [],
  certifications: [{ name: 'ALS', issuer: 'ERC' }],
  languages: [{ name: 'Danish' }],
  custom: [{ title: 'Kurser', items: ['DJØF Teamlederkursus April 2018'] }],
})

describe('the translation guards', () => {
  it('keeps the original when a single digit changes', () => {
    expect(guardTranslation('a 24-bed unit', 'una unidad de 24 camas')).toBe(
      true,
    )
    // The CV-killing failure: a number silently altered in translation.
    expect(guardTranslation('a 24-bed unit', 'una unidad de 42 camas')).toBe(
      false,
    )
    expect(guardTranslation('a 24-bed unit', 'una unidad de camas')).toBe(false)
  })

  it('keeps the original when the model returns nothing or an essay', () => {
    expect(guardTranslation('Triage', '')).toBe(false)
    expect(guardTranslation('Triage', '   ')).toBe(false)
    expect(guardTranslation('Triage', 'T'.repeat(200))).toBe(false)
  })

  it('digitsOf reads digits in order and nothing else', () => {
    expect(digitsOf('24-bed unit, 3 shifts (2019)')).toBe('2432019')
    expect(digitsOf('no numbers')).toBe('')
  })
})

describe('what is offered for translation', () => {
  const paths = translatableSlots(resume).map((slot) => slot.path.join('.'))

  it('offers the prose: headline, summary, roles, bullets, skills, custom sections', () => {
    expect(paths).toContain('basics.headline')
    expect(paths).toContain('basics.summary')
    expect(paths).toContain('work.0.role')
    expect(paths).toContain('work.0.highlights.0')
    expect(paths).toContain('skills.0.category')
    expect(paths).toContain('custom.0.title')
    expect(paths).toContain('custom.0.items.0')
    expect(paths).toContain('languages.0.name')
  })

  it('never offers the identity: names, employers, URLs, certifications', () => {
    // A translated employer is a wrong claim about someone's career — these fields are never sent.
    expect(paths).not.toContain('basics.fullName')
    expect(paths.some((p) => p.includes('company'))).toBe(false)
    expect(paths.some((p) => p.includes('url'))).toBe(false)
    expect(paths.some((p) => p.startsWith('certifications'))).toBe(false)
  })
})

describe('writing a translation back', () => {
  it('replaces exactly one field and mutates nothing', () => {
    const next = writeSlot(resume, ['work', 0, 'highlights', 0], 'Lideré…')
    expect(next.work[0].highlights[0]).toBe('Lideré…')
    expect(resume.work[0].highlights[0]).toBe('Led handover for a 24-bed unit.')
    expect(next.basics.fullName).toBe('Marta Sørensen')
  })
})
