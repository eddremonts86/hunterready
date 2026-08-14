/**
 * JD tailoring — the gap report and the variant.
 *
 * The assertions that matter are the ones about what tailoring **refuses** to do. Every competing
 * tool answers "the job wants X and the CV does not have it" by writing X into the CV; docs/06 makes
 * that the one forbidden move, because it puts a claim in front of an interviewer who will ask about
 * it. So the tests pin: a missing requirement stays missing, a variant never mutates the original,
 * and a reordering never adds or drops a line.
 */
import { describe, expect, it } from 'vitest'
import { Resume } from '@/schema/resume'
import { applyTailoring, buildGapReport } from '../jd'
import type { JobRequirements } from '../jd'

const RESUME = Resume.parse({
  schemaVersion: '1.0',
  basics: {
    fullName: 'Rocío Delgado',
    summary: 'Warehouse supervisor moving into logistics coordination.',
    links: [],
    personalDetails: [],
  },
  work: [
    {
      company: 'Grupo Logístico Ebro',
      role: 'Warehouse Supervisor',
      startDate: '2021-06',
      endDate: null,
      highlights: [
        'Supervised a 30-person shift across inbound and outbound docks.',
        'Ran the weekly cycle-count programme and reconciled discrepancies.',
        'Rebuilt the pick-path layout after mapping where pickers walked.',
      ],
      tech: ['SAP'],
    },
    {
      company: 'Transportes Aragón',
      role: 'Warehouse Operative',
      startDate: '2014-01',
      endDate: '2015-02',
      highlights: ['Loaded and unloaded regional distribution routes.'],
      tech: [],
    },
  ],
  education: [],
  skills: [
    { category: 'Systems', items: ['Excel', 'Inventory control'] },
    { category: 'Leadership', items: ['Shift supervision'] },
  ],
  projects: [],
  certifications: [],
  languages: [],
  awards: [],
  publications: [],
  volunteer: [],
  custom: [],
})

const JOB: JobRequirements = {
  hardSkills: ['inventory control', 'SAP', 'route planning'],
  softSkills: ['shift supervision'],
  responsibilities: ['Coordinate inbound and outbound logistics'],
  seniority: 'mid',
  keywords: ['cycle count', 'logistics'],
}

describe('the gap report shows the evidence rather than asserting it', () => {
  const report = buildGapReport(RESUME, JOB)
  const forRequirement = (name: string) =>
    report.matches.find((m) => m.requirement === name)

  it('matches a requirement evidenced in a recent job, and says where', () => {
    const sap = forRequirement('SAP')
    expect(sap?.evidence).toBe('matched')
    expect(sap?.found.join(' ')).toMatch(/Ebro/)
  })

  it('calls a skills-list-only claim weak, not matched', () => {
    // "Inventory control" is in the skills list and nowhere else: the claim exists, but a recruiter
    // skimming the first half of page one will not find a story behind it.
    const inventory = forRequirement('inventory control')
    expect(inventory?.evidence).toBe('weak')
    expect(inventory?.found.join(' ')).toMatch(/skills list/i)
  })

  it('reports a requirement with nothing behind it as missing — and does not invent it', () => {
    expect(forRequirement('route planning')?.evidence).toBe('missing')
    expect(forRequirement('route planning')?.found).toEqual([])
    expect(report.missing).toContain('route planning')
  })

  it('counts coverage over hard skills only', () => {
    // 2 of 3 hard skills have something behind them. Soft skills are unfalsifiable from a CV, so
    // counting them would make the number about how many adjectives the advert used.
    expect(report.coverage).toBeCloseTo(2 / 3, 5)
  })
})

describe('the controlled synonym map', () => {
  it('accepts a different name for the same thing', () => {
    const report = buildGapReport(RESUME, {
      ...JOB,
      hardSkills: ['ERP'],
      softSkills: [],
    })
    // The CV says SAP; the advert says ERP. One thing, two names.
    expect(report.matches[0].evidence).toBe('matched')
  })

  it('does not treat two different things as one', () => {
    // Nothing maps "route planning" onto "cycle counting", and nothing should: a synonym map that
    // guesses is how a CV starts claiming a job the person never had.
    const report = buildGapReport(RESUME, {
      ...JOB,
      hardSkills: ['route planning'],
      softSkills: [],
    })
    expect(report.matches[0].evidence).toBe('missing')
  })
})

describe('tailoring produces a variant, never a mutation', () => {
  it('leaves the original resume untouched', () => {
    const before = JSON.stringify(RESUME)
    applyTailoring(RESUME, JOB)
    expect(JSON.stringify(RESUME)).toBe(before)
  })

  it('never adds or removes a bullet — only their order changes', () => {
    const { resume } = applyTailoring(RESUME, JOB)
    for (const [index, job] of resume.work.entries()) {
      expect([...job.highlights].sort()).toEqual(
        [...RESUME.work[index].highlights].sort(),
      )
    }
  })

  it('leads with the bullet the job actually asks about', () => {
    const { resume } = applyTailoring(RESUME, JOB)
    // "cycle count" is one of the job's keywords, so that bullet comes first.
    expect(resume.work[0].highlights[0]).toMatch(/cycle-count/)
  })

  it('keeps the candidate’s own order where nothing is more relevant', () => {
    // Equal relevance holds position: they know their job and we do not.
    const { resume } = applyTailoring(RESUME, {
      ...JOB,
      hardSkills: [],
      keywords: [],
    })
    expect(resume.work[0].highlights).toEqual(RESUME.work[0].highlights)
  })

  it('explains every move in plain language', () => {
    const { moves } = applyTailoring(RESUME, JOB)
    expect(moves.length).toBeGreaterThan(0)
    for (const move of moves) {
      expect(move.because.length).toBeGreaterThan(20)
      expect(move.because).not.toMatch(
        /\b(ATS|token|weight|score|relevance)\b/i,
      )
    }
  })

  it('adds no skill the candidate does not have', () => {
    const { resume } = applyTailoring(RESUME, JOB)
    const before = RESUME.skills.flatMap((g) => g.items).sort()
    const after = resume.skills.flatMap((g) => g.items).sort()
    expect(after).toEqual(before)
  })

  it('changes no date and no employer', () => {
    const { resume } = applyTailoring(RESUME, JOB)
    expect(resume.work.map((j) => [j.company, j.startDate, j.endDate])).toEqual(
      RESUME.work.map((j) => [j.company, j.startDate, j.endDate]),
    )
  })
})

describe('an advert’s framing does not hide the evidence', () => {
  /**
   * Adverts wrap a requirement in words the CV never repeats — "Certification in advanced life
   * support" where the CV says "Advanced Life Support (ALS)". Matching is containment of the
   * requirement inside the CV's text, so the wrapper makes the requirement *longer* than its own
   * evidence and guarantees a miss.
   *
   * It produced the worst available answer on a real run: a nurse holding the exact certification the
   * advert named was told "Not in your CV. Nothing here matches this." For the regulated professions
   * this product is aimed at, that is the signal the employer screens on first.
   */
  const NURSE = Resume.parse({
    schemaVersion: '1.0',
    basics: { fullName: 'Marta Sørensen', links: [], personalDetails: [] },
    work: [
      {
        company: 'Rigshospitalet',
        role: 'Shift Lead Nurse, Intensive Care',
        startDate: '2019-03',
        endDate: null,
        highlights: ['Led nursing handover for a 24-bed unit.'],
        tech: ['Ventilator management'],
      },
    ],
    education: [],
    skills: [{ category: 'Clinical', items: ['Triage'] }],
    projects: [],
    certifications: [
      {
        name: 'Advanced Life Support (ALS)',
        issuer: 'European Resuscitation Council',
      },
      {
        name: 'Danish nursing authorisation',
        issuer: 'Styrelsen for Patientsikkerhed',
      },
    ],
    languages: [],
    awards: [],
    publications: [],
    volunteer: [],
    custom: [],
  })

  const framed: JobRequirements = {
    hardSkills: [
      'Certification in advanced life support',
      'Danish nursing authorisation',
      "3 years' experience with ventilator management",
      'Licence for a forklift',
    ],
    softSkills: [],
    responsibilities: [],
    keywords: [],
  }

  const report = buildGapReport(NURSE, framed)
  const verdict = (name: string) =>
    report.matches.find((m) => m.requirement === name)

  it('finds a certification the advert asked for by its framed name', () => {
    expect(verdict('Certification in advanced life support')?.evidence).toBe(
      'matched',
    )
    expect(
      verdict('Certification in advanced life support')?.found.join(' '),
    ).toContain('Advanced Life Support')
  })

  it('sees through a duration clause to the skill behind it', () => {
    expect(
      verdict("3 years' experience with ventilator management")?.evidence,
    ).toBe('matched')
  })

  it('still reports a requirement that genuinely is not there', () => {
    // Stripping framing must not turn everything into a match: a forklift licence is nowhere on this CV.
    expect(verdict('Licence for a forklift')?.evidence).toBe('missing')
  })

  it('leaves an unframed requirement exactly as it was', () => {
    expect(verdict('Danish nursing authorisation')?.evidence).toBe('matched')
  })
})

describe('ordinary rewording does not hide the evidence either', () => {
  /**
   * A CV says what somebody *did*; an advert names the *thing*. Exact-phrase containment therefore
   * misses constantly: "Precepted 14 newly graduated nurses through their first six months" was no
   * evidence at all for "Preceptorship of newly graduated nurses".
   *
   * The pair of tests below is the whole design. Every claim-bearing word must be present in one line,
   * which finds the rewording — and still refuses the case that matters, because a CV full of adult
   * intensive care must never come back as evidence of paediatric experience.
   */
  const NURSE = Resume.parse({
    schemaVersion: '1.0',
    basics: { fullName: 'Marta Sørensen', links: [], personalDetails: [] },
    work: [
      {
        company: 'Rigshospitalet',
        role: 'Shift Lead Nurse, Intensive Care',
        startDate: '2019-03',
        endDate: null,
        highlights: [
          'Precepted 14 newly graduated nurses through their first six months.',
          'Led nursing handover for a 24-bed intensive care unit.',
        ],
        tech: [],
      },
    ],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    languages: [],
    awards: [],
    publications: [],
    volunteer: [],
    custom: [],
  })

  const report = buildGapReport(NURSE, {
    hardSkills: [
      'Preceptorship of newly graduated nurses',
      'Experience with paediatric intensive care',
    ],
    softSkills: [],
    responsibilities: [],
    keywords: [],
  })
  const verdict = (name: string) =>
    report.matches.find((m) => m.requirement === name)

  it('finds the requirement the CV states in its own words', () => {
    expect(verdict('Preceptorship of newly graduated nurses')?.evidence).toBe(
      'matched',
    )
    expect(
      verdict('Preceptorship of newly graduated nurses')?.found.join(' '),
    ).toContain('Precepted 14 newly graduated nurses')
  })

  it('refuses to read adult intensive care as paediatric experience', () => {
    // The load-bearing assertion. An any-word rule would match on "intensive" and "care" and claim a
    // speciality this nurse has never worked in — the fabrication the missing verdict exists to report.
    expect(verdict('Experience with paediatric intensive care')?.evidence).toBe(
      'missing',
    )
  })
})
