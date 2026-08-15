/**
 * The drift scorer, without a model in the loop.
 *
 * These are the cases that decide whether the measured rate means anything: a claim borrowed from the
 * other employer must count, the candidate's own skills must not, and an outright invention must land
 * in the fabrication tally rather than inflating this one.
 */
import { describe, expect, it } from 'vitest'
import { findCrossJobDrift } from '../drift'
import { Resume } from '@/schema/resume'

const RESUME = Resume.parse({
  schemaVersion: '1.0',
  basics: {
    fullName: 'Ana Ferreira',
    headline: 'Warehouse Team Leader',
    links: [],
    personalDetails: [],
  },
  work: [
    {
      company: 'Northgate Logistics',
      role: 'Warehouse Team Leader',
      startDate: '2022-01',
      endDate: null,
      highlights: ['Ran the late shift on the picking floor.'],
      tech: [],
    },
    {
      company: 'Belmont Cold Store',
      role: 'Forklift Operator',
      startDate: '2019-01',
      endDate: '2021-12',
      highlights: ['Moved 300 pallets a night through the freezer bays.'],
      tech: ['Reachtruck'],
    },
  ],
  education: [],
  skills: [{ category: 'Tickets', items: ['Counterbalance licence'] }],
  projects: [],
  certifications: [],
  languages: [],
  custom: [],
})

describe('cross-job drift', () => {
  it('counts a figure borrowed from the other employer', () => {
    // 300 pallets happened at Belmont. On the Northgate bullet it is a claim about the wrong job.
    const found = findCrossJobDrift(
      'Ran the late shift on the picking floor, moving 300 pallets a night.',
      RESUME,
      0,
    )
    expect(found.map((f) => f.value)).toContain('300')
  })

  it('leaves the candidate’s own skills alone', () => {
    // The licence is theirs, not an employer's. Resurfacing it is the behaviour the guard is for.
    expect(
      findCrossJobDrift(
        'Ran the late shift on the picking floor, holding a counterbalance licence.',
        RESUME,
        0,
      ),
    ).toEqual([])
  })

  it('does not count an outright invention — that is the guard’s tally', () => {
    const found = findCrossJobDrift(
      'Ran the late shift on the picking floor, cutting costs by 25%.',
      RESUME,
      0,
    )
    expect(found).toEqual([])
  })

  it('does not count an ordinary verb that another bullet happens to use', () => {
    /*
      The first version of this scorer flagged "Led" — grounded in the full résumé only because the
      other job's bullet opens with it. That is vocabulary, not a claim, and a metric that counts it
      reports drift forever while pointing at nothing. Caught on the second measured run.
    */
    const resume = Resume.parse({
      ...RESUME,
      work: [
        RESUME.work[0],
        { ...RESUME.work[1], highlights: ['Moved pallets through the bays.'] },
      ],
    })
    expect(
      findCrossJobDrift('Moved stock across the picking floor.', resume, 0),
    ).toEqual([])
  })

  it('is empty for a rewrite that stays inside its own job', () => {
    expect(
      findCrossJobDrift('Led the late shift on the picking floor.', RESUME, 0),
    ).toEqual([])
  })

  it('answers nothing for a job index that does not exist', () => {
    expect(findCrossJobDrift('Anything at all.', RESUME, 7)).toEqual([])
  })
})
