/**
 * Unit-level regressions for the rule-based extractor.
 *
 * The accuracy suite next door proves the end-to-end numbers, but it cannot say *why* a number moved,
 * and it stops covering a case the moment a fixture is regenerated. Each test here pins one specific
 * defect found by reading the extractor's actual output, in the smallest input that reproduces it.
 *
 * They are written against `extractByRules` rather than internals, because the normalized-text shape
 * (`## SECTION`, `- bullet`) is the real contract between the normalizer and everything downstream.
 */
import { describe, expect, it } from 'vitest'
import { extractByRules } from '../fallback'

describe('the name is not allowed to absorb the headline', () => {
  it('keeps a two-word name and a two-word job title apart', () => {
    const { resume } = extractByRules(
      [
        'TOM WHITFIELD',
        'Account Manager',
        'tom.whitfield@example.com · +44 7700 900412',
      ].join('\n'),
    )
    expect(resume.basics.fullName).toBe('TOM WHITFIELD')
    expect(resume.basics.headline).toBe('Account Manager')
  })

  it('still joins a name a sidebar wrapped across single-word lines', () => {
    const { resume } = extractByRules(
      ['Rocío', 'Delgado', 'Fuentes', 'rocio.delgado@example.es'].join('\n'),
    )
    expect(resume.basics.fullName).toBe('Rocío Delgado Fuentes')
  })

  it('does not offer a city as somebody’s profession', () => {
    // The line after the contact block in a sidebar is the city. Asserting it as a job title is a
    // claim the document never makes, so the field is left for the person to fill in.
    const { resume } = extractByRules(
      [
        'Rocío',
        'Delgado',
        'rocio@example.es',
        '+34 655 21 09 44',
        'Zaragoza',
      ].join('\n'),
    )
    expect(resume.basics.headline).toBeUndefined()
  })
})

describe('a date range is never mistaken for the role/employer separator', () => {
  it('splits "Role, Employer (Jan 2024 - Present)" on the comma', () => {
    const { resume } = extractByRules(
      [
        'Tom Whitfield',
        '',
        '## EXPERIENCE',
        'Account Manager, Northgate Supplies (Jan 2024 - Present)',
        '- Manage a book of 40 mid-market retail accounts.',
      ].join('\n'),
    )
    expect(resume.work).toHaveLength(1)
    expect(resume.work[0].role).toBe('Account Manager')
    expect(resume.work[0].company).toBe('Northgate Supplies')
    expect(resume.work[0].startDate).toBe('2024-01')
    expect(resume.work[0].endDate).toBeNull()
  })

  it('leaves the dates out of an institution name', () => {
    const { resume } = extractByRules(
      [
        'Tom Whitfield',
        '',
        '## EDUCATION',
        'BA Business Management — University of Leeds (2019 – 2022)',
      ].join('\n'),
    )
    expect(resume.education[0].institution).toBe('University of Leeds')
    expect(resume.education[0].degree).toBe('BA Business Management')
    expect(resume.education[0].startDate).toBe('2019')
    expect(resume.education[0].endDate).toBe('2022')
  })

  it('keeps an employer that follows a date in the middle of the line', () => {
    // Only a *trailing* range is stripped. Removing one from the middle would delete the employer.
    const { resume } = extractByRules(
      ['Ann Blake', '', '## EXPERIENCE', 'Consultant 2019 – Acme Corp'].join(
        '\n',
      ),
    )
    expect(resume.work[0].company).toContain('Acme')
  })
})

describe('ISO dates on a metadata line', () => {
  /**
   * A Word document converted through LibreOffice writes `2024-01 - Present`. The date pattern did
   * not accept it, so the line did not look like a date, so the entry grouper never opened a second
   * entry: two jobs merged into one with five bullets and no start date, and an employment vanished.
   *
   * No fixture exercises this any more — the Word pair is now generated with month names, like the
   * rest — which is exactly why it needs a test of its own.
   */
  it('opens a separate entry for each job and keeps both start dates', () => {
    const { resume } = extractByRules(
      [
        'Tom Whitfield',
        '',
        '## Experience',
        'Account Manager — Northgate Supplies',
        '2024-01 - Present · Manchester',
        '- Manage a book of 40 mid-market retail accounts.',
        'Sales Development Representative — Northgate Supplies',
        '2023-02 - 2023-12 · Manchester',
        '- Booked discovery calls from outbound sequences.',
      ].join('\n'),
    )
    expect(resume.work).toHaveLength(2)
    expect(resume.work.map((job) => job.startDate)).toEqual([
      '2024-01',
      '2023-02',
    ])
    expect(resume.work[0].endDate).toBeNull()
    expect(resume.work[1].endDate).toBe('2023-12')
    expect(resume.work[0].highlights).toHaveLength(1)
  })

  it('still reads a plain year range as two years', () => {
    const { resume } = extractByRules(
      [
        'Ann Blake',
        '',
        '## EDUCATION',
        'BA History — Leeds (2019 - 2022)',
      ].join('\n'),
    )
    expect(resume.education[0].startDate).toBe('2019')
    expect(resume.education[0].endDate).toBe('2022')
  })
})

describe('a wrapped bullet does not become a job', () => {
  /**
   * A PDF text layer has no paragraphs. A bullet long enough to wrap arrives as two lines, and only
   * the first carries the bullet glyph — so the second opened a phantom fourth employment on a CV
   * with three, with no employer and a role of "wanted."
   */
  it('joins the continuation onto the bullet instead of opening an entry', () => {
    const { resume } = extractByRules(
      [
        'Rocío Delgado',
        '',
        '## EXPERIENCIA',
        'Warehouse Operative',
        'Grupo Logístico Ebro · Mar 2015 – May 2021',
        '- Picked, packed and loaded outbound orders on a rotating shift.',
        "- Became the shift's reference point for the labelling exceptions nobody else",
        'wanted.',
      ].join('\n'),
    )
    expect(resume.work).toHaveLength(1)
    expect(resume.work[0].highlights).toEqual([
      'Picked, packed and loaded outbound orders on a rotating shift.',
      "Became the shift's reference point for the labelling exceptions nobody else wanted.",
    ])
  })

  it('still opens a new entry after a bullet that ends its sentence', () => {
    const { resume } = extractByRules(
      [
        'Rocío Delgado',
        '',
        '## EXPERIENCIA',
        'Warehouse Supervisor',
        'Grupo Logístico Ebro · Jun 2021 – Present',
        '- Supervise a 30-person shift across inbound and outbound docks.',
        'Warehouse Operative',
        'Transportes Aragón · Jan 2014 – Feb 2015',
        '- Loaded and unloaded regional distribution routes.',
      ].join('\n'),
    )
    expect(resume.work.map((job) => job.company)).toEqual([
      'Grupo Logístico Ebro',
      'Transportes Aragón',
    ])
  })
})

describe('a wrapped summary is not cut off mid-sentence', () => {
  it('keeps the continuation line', () => {
    const long =
      'Registered nurse with 12 years in intensive and post-operative care. Shift lead for a 24-bed unit, responsible for the induction of new'
    const { resume } = extractByRules(
      ['Marta Sørensen', 'Registered Nurse', long, 'graduates.'].join('\n'),
    )
    expect(resume.basics.summary).toBe(`${long} graduates.`)
  })
})

describe('languages', () => {
  it('does not read a sentence as a language somebody speaks', () => {
    // In a two-column CV the main column's summary is emitted inside the sidebar's last section.
    // Splitting it on commas listed "with route" among this person's languages.
    const { resume } = extractByRules(
      [
        'Rocío Delgado',
        '',
        '## IDIOMAS',
        'Spanish — lengua materna',
        'English — nivel intermedio',
        'Eleven years on the warehouse floor, the last four supervising a 30-person shift. Moving into logistics coordination, with route',
        'and inventory planning already a daily part of the job.',
      ].join('\n'),
    )
    expect(resume.languages.map((language) => language.name)).toEqual([
      'Spanish',
      'English',
    ])
  })

  it('reads a level written with a qualifier in front of it', () => {
    const { resume } = extractByRules(
      ['Rocío Delgado', '', '## IDIOMAS', 'English — nivel intermedio'].join(
        '\n',
      ),
    )
    expect(resume.languages[0].level).toBe('B1')
  })

  it('keeps an inline row that lists three languages with their levels', () => {
    const { resume } = extractByRules(
      [
        'Marta Sørensen',
        '',
        '## LANGUAGES',
        'Danish (mother tongue) · English (fluent) · German (conversational)',
      ].join('\n'),
    )
    expect(resume.languages.map((language) => language.name)).toEqual([
      'Danish',
      'English',
      'German',
    ])
    expect(resume.languages.map((language) => language.level)).toEqual([
      'native',
      'C1',
      'B1',
    ])
  })
})
