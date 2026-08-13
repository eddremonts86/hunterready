/**
 * The variant diff.
 *
 * The assertion that carries the design is the one about reordering: tailoring's entire job is moving
 * a bullet up, and reporting that as "removed, then added" would make a safe move look destructive
 * and scare people out of using the feature.
 */
import { describe, expect, it } from 'vitest'
import { Resume } from '@/schema/resume'
import { diffResumes, summarizeChanges } from '../variant-diff'

const base = Resume.parse({
  schemaVersion: '1.0',
  basics: { fullName: 'Rocío Delgado', links: [], personalDetails: [] },
  work: [
    {
      company: 'Grupo Logístico Ebro',
      role: 'Warehouse Supervisor',
      startDate: '2021-06',
      endDate: null,
      highlights: [
        'Supervised a 30-person shift.',
        'Ran the cycle-count programme.',
      ],
      tech: [],
    },
  ],
  education: [],
  skills: [{ category: 'Systems', items: ['SAP', 'Excel'] }],
  projects: [],
  certifications: [],
  languages: [],
  awards: [],
  publications: [],
  volunteer: [],
  custom: [],
})

const withPatch = (patch: Record<string, unknown>) =>
  Resume.parse({ ...base, ...patch })

describe('a reordering is reported as a reordering', () => {
  it('does not describe a moved bullet as removed and added', () => {
    const after = withPatch({
      work: [
        {
          ...base.work[0],
          highlights: [
            'Ran the cycle-count programme.',
            'Supervised a 30-person shift.',
          ],
        },
      ],
    })
    const changes = diffResumes(base, after)
    expect(changes).toHaveLength(1)
    expect(changes[0].kind).toBe('reordered')
  })

  it('reports a genuine rewording as changed', () => {
    const after = withPatch({
      work: [
        {
          ...base.work[0],
          highlights: [
            'Led a 30-person shift.',
            'Ran the cycle-count programme.',
          ],
        },
      ],
    })
    const changes = diffResumes(base, after)
    expect(changes[0].kind).toBe('changed')
    expect(changes[0].before).toMatch(/Supervised/)
    expect(changes[0].after).toMatch(/Led/)
  })
})

describe('it points at the place a person would look', () => {
  it('names the employer, not an array index', () => {
    const after = withPatch({
      work: [
        {
          ...base.work[0],
          highlights: [
            'Led a 30-person shift.',
            'Ran the cycle-count programme.',
          ],
        },
      ],
    })
    expect(diffResumes(base, after)[0].where).toMatch(/Ebro/)
  })

  it('reports an added and a removed job as such', () => {
    expect(diffResumes(base, withPatch({ work: [] }))[0].kind).toBe('removed')
    expect(diffResumes(withPatch({ work: [] }), base)[0].kind).toBe('added')
  })
})

describe('noise is not a change', () => {
  it('ignores whitespace and reflow', () => {
    const after = withPatch({
      work: [
        {
          ...base.work[0],
          highlights: [
            'Supervised   a 30-person shift. ',
            'Ran the cycle-count programme.',
          ],
        },
      ],
    })
    expect(diffResumes(base, after)).toEqual([])
  })

  it('says so plainly when nothing moved', () => {
    expect(summarizeChanges([])).toBe('Nothing changed.')
  })
})

describe('the summary is one readable line', () => {
  it('counts by kind', () => {
    const after = withPatch({
      basics: { ...base.basics, summary: 'A new summary.' },
      work: [
        {
          ...base.work[0],
          highlights: [
            'Led a 30-person shift.',
            'Ran the cycle-count programme.',
          ],
        },
      ],
    })
    const line = summarizeChanges(diffResumes(base, after))
    expect(line).toMatch(/2 changes/)
    expect(line).toMatch(/reworded|added/)
  })
})
