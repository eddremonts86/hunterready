/**
 * The score, tested as what it actually is: a checklist generator.
 *
 * Almost every assertion here is about `findings` rather than about the number, because that is the
 * product — docs/06: *"Nobody improves a CV from 68/100; people improve it from '4 of 11 bullets
 * have no outcome — here they are'."* A test suite that checked only the total would pass on a
 * scorer whose advice was useless.
 *
 * The number is still pinned in two places, for the two properties it must have: it moves when the
 * CV improves, and it is stable when nothing changes.
 */
import { describe, expect, it } from 'vitest'
import { Resume } from '@/schema/resume'
import { scoreCv } from '../score'

function resume(patch: Record<string, unknown> = {}): Resume {
  return Resume.parse({
    schemaVersion: '1.0',
    basics: {
      fullName: 'Tom Whitfield',
      email: 'tom@example.com',
      phone: '+44 7700 900412',
      summary:
        'Account manager with three years selling into mid-market retail.',
      links: [],
      personalDetails: [],
    },
    work: [
      {
        company: 'Northgate Supplies',
        role: 'Account Manager',
        startDate: '2024-01',
        endDate: null,
        highlights: ['Grew a book of 40 mid-market retail accounts.'],
        tech: [],
      },
    ],
    education: [{ institution: 'University of Leeds', highlights: [] }],
    skills: [{ category: 'Sales', items: ['Negotiation'] }],
    projects: [],
    certifications: [],
    languages: [],
    awards: [],
    publications: [],
    volunteer: [],
    custom: [],
    ...patch,
  })
}

const find = (result: ReturnType<typeof scoreCv>, dimension: string) =>
  result.findings.find((f) => f.dimension === dimension)

describe('the checklist names the actual items, not a category', () => {
  it('lists the bullets that describe a duty instead of an act', () => {
    const result = scoreCv({
      resume: resume({
        work: [
          {
            company: 'Northgate Supplies',
            role: 'Account Manager',
            startDate: '2024-01',
            endDate: null,
            highlights: [
              'Responsible for the quarterly review cycle.',
              'Grew a book of 40 mid-market retail accounts.',
            ],
            tech: [],
          },
        ],
      }),
    })

    const bullets = find(result, 'bullets')
    expect(bullets?.items).toContain(
      'Responsible for the quarterly review cycle.',
    )
    // The good one must not be in the list, or the list stops being a work queue.
    expect(bullets?.items).not.toContain(
      'Grew a book of 40 mid-market retail accounts.',
    )
  })

  it('lists the missing sections by name', () => {
    const result = scoreCv({
      resume: resume({ education: [], skills: [] }),
    })
    const completeness = find(result, 'completeness')
    expect(completeness?.items).toEqual(
      expect.arrayContaining(['your education', 'a skills section']),
    )
  })

  it('lists the keywords the job asked for and the CV never mentions', () => {
    const result = scoreCv({
      resume: resume(),
      requiredSkills: ['Negotiation', 'Salesforce', 'Forecasting'],
    })
    const keywords = find(result, 'keywords')
    expect(keywords?.items).toEqual(['Salesforce', 'Forecasting'])
    expect(keywords?.items).not.toContain('Negotiation')
  })

  it('puts the most expensive problem first', () => {
    const result = scoreCv({
      resume: resume({
        education: [],
        work: [
          {
            company: 'Northgate Supplies',
            role: 'Account Manager',
            startDate: '2024-01',
            endDate: null,
            highlights: ['Responsible for things.', 'Worked on other things.'],
            tech: [],
          },
        ],
      }),
    })
    // Bullets are worth 20, completeness 15. The list is a queue, so the costlier work leads.
    expect(result.findings[0].dimension).toBe('bullets')
    expect(result.findings[0].cost).toBeGreaterThan(result.findings[1].cost)
  })
})

describe('a missing job description is not a failing grade', () => {
  it('does not score keyword coverage at all when there is no job to match', () => {
    const result = scoreCv({ resume: resume() })
    expect(result.dimensions.map((d) => d.dimension)).not.toContain('keywords')
    expect(find(result, 'keywords')).toBeUndefined()
  })

  it('scores a complete CV highly without one', () => {
    // Scoring someone 0/30 for not having pasted a job ad is a number about us, not about them.
    expect(scoreCv({ resume: resume() }).score).toBeGreaterThanOrEqual(90)
  })
})

describe('consistency reports what a reader would notice', () => {
  const twoCurrentJobs = resume({
    work: [
      {
        company: 'Northgate Supplies',
        role: 'Account Manager',
        startDate: '2024-01',
        endDate: null,
        highlights: ['Grew a book of 40 accounts.'],
        tech: [],
      },
      {
        company: 'Ridgeway Ltd',
        role: 'Sales Executive',
        startDate: '2021-01',
        endDate: null,
        highlights: ['Grew a book of 20 accounts.'],
        tech: [],
      },
    ],
  })

  it('flags two jobs both shown as current', () => {
    const finding = find(scoreCv({ resume: twoCurrentJobs }), 'consistency')
    expect(finding?.items.join(' ')).toMatch(/still going/i)
  })

  it('flags a job that ends before it starts', () => {
    const finding = find(
      scoreCv({
        resume: resume({
          work: [
            {
              company: 'Northgate Supplies',
              role: 'Account Manager',
              startDate: '2024-01',
              endDate: '2023-01',
              highlights: ['Grew a book of 40 accounts.'],
              tech: [],
            },
          ],
        }),
      }),
      'consistency',
    )
    expect(finding?.items.join(' ')).toMatch(/before it starts/i)
  })

  it('reports a multi-year gap without editorialising about it', () => {
    const finding = find(
      scoreCv({
        resume: resume({
          work: [
            {
              company: 'Northgate Supplies',
              role: 'Account Manager',
              startDate: '2024-01',
              endDate: null,
              highlights: ['Grew a book of 40 accounts.'],
              tech: [],
            },
            {
              company: 'Ridgeway Ltd',
              role: 'Sales Executive',
              startDate: '2018-01',
              endDate: '2020-01',
              highlights: ['Grew a book of 20 accounts.'],
              tech: [],
            },
          ],
        }),
      }),
      'consistency',
    )
    expect(finding?.items.join(' ')).toMatch(/gap/i)
    // A career break is normal and often nobody's business. We say it is visible, not that it is bad.
    expect(finding?.fix).not.toMatch(
      /explain yourself|concern|red flag|problem/i,
    )
  })
})

describe('the ATS dimension is answered by the renderer, not guessed at', () => {
  it('costs the full weight when the round-trip failed', () => {
    const failed = scoreCv({ resume: resume(), atsVerified: false })
    expect(failed.dimensions.find((d) => d.dimension === 'ats')?.earned).toBe(0)
    expect(find(failed, 'ats')?.fix).toMatch(/pick a different one/i)
  })

  it('is full marks when nothing said otherwise', () => {
    expect(
      scoreCv({ resume: resume() }).dimensions.find(
        (d) => d.dimension === 'ats',
      )?.earned,
    ).toBe(15)
  })
})

describe('the number itself', () => {
  it('is stable across runs — the reason it is not an LLM', () => {
    const a = scoreCv({ resume: resume() })
    const b = scoreCv({ resume: resume() })
    expect(a.score).toBe(b.score)
    expect(a.findings).toEqual(b.findings)
  })

  it('rises when the CV is actually improved', () => {
    const weak = scoreCv({
      resume: resume({
        education: [],
        work: [
          {
            company: 'Northgate Supplies',
            role: 'Account Manager',
            startDate: '2024-01',
            endDate: null,
            highlights: ['Responsible for accounts.'],
            tech: [],
          },
        ],
      }),
    })
    expect(scoreCv({ resume: resume() }).score).toBeGreaterThan(weak.score)
  })

  it('never leaves the 0–100 range, however broken the CV', () => {
    const wrecked = scoreCv({
      resume: resume({
        basics: { fullName: 'X', links: [], personalDetails: [] },
        work: [],
        education: [],
        skills: [],
      }),
      requiredSkills: ['Salesforce'],
      atsVerified: false,
    })
    expect(wrecked.score).toBeGreaterThanOrEqual(0)
    expect(wrecked.score).toBeLessThanOrEqual(100)
  })
})

describe('every fix is written for the person reading it', () => {
  it('uses no jargon a nurse or an electrician would have to look up', () => {
    const result = scoreCv({
      resume: resume({ education: [], skills: [], work: [] }),
      requiredSkills: ['Salesforce'],
      atsVerified: false,
    })
    expect(result.findings.length).toBeGreaterThan(0)
    for (const finding of result.findings) {
      expect(finding.fix).not.toMatch(
        /\b(ATS|LLM|token|schema|parse[rd]?|keyword density|synerg)/i,
      )
      // Advice with no verb is an observation, and observations do not get acted on.
      expect(finding.fix.length).toBeGreaterThan(20)
    }
  })
})
