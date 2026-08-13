/**
 * The guard that makes "no fabrication" a fact instead of a request.
 *
 * Tested in both directions, because a one-directional test would pass on a guard that is useless:
 *
 *  • **It must catch invention.** A rewrite that adds a number, a name or an abbreviation the
 *    candidate never wrote is rejected. These are written as an adversary would produce them —
 *    plausible, well-formed, and exactly the sentences a model reaches for when a bullet reads
 *    weakly.
 *  • **It must not reject honest work.** A guard that flags every rewrite is a feature switched off:
 *    it would reject the useful half of what this exists to do, and the pressure would then be to
 *    weaken it. So the legitimate cases are pinned just as hard as the fabrications.
 *
 * The asymmetry is deliberate and stated in the module: a false positive costs a slightly better
 * sentence, a false negative puts an invented claim in front of a recruiter with the candidate's
 * name on it.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Resume } from '@/schema/resume'
import {
  buildGrounding,
  describeFabrications,
  findFabrications,
} from '../fabrication'

/** A small, realistic resume. Non-tech on purpose — the audience is every sector (PRODUCT.md). */
const RESUME = Resume.parse({
  schemaVersion: '1.0',
  basics: {
    fullName: 'Tom Whitfield',
    headline: 'Account Manager',
    email: 'tom.whitfield@example.com',
    summary: 'Account manager with three years selling into mid-market retail.',
    links: [],
    personalDetails: [],
  },
  work: [
    {
      company: 'Northgate Supplies',
      role: 'Account Manager',
      location: 'Manchester',
      startDate: '2024-01',
      endDate: null,
      highlights: [
        'Manage a book of 40 mid-market retail accounts.',
        'Took over a lapsed territory and rebuilt the call cycle from scratch.',
      ],
      tech: ['Salesforce'],
    },
  ],
  education: [],
  skills: [{ category: 'Tools', items: ['Salesforce', 'Outreach', 'Excel'] }],
  projects: [],
  certifications: [],
  languages: [],
  awards: [],
  publications: [],
  volunteer: [],
  custom: [],
})

const grounding = buildGrounding(RESUME)
const check = (rewrite: string) => findFabrications(rewrite, grounding)

describe('it catches the claims a model invents when a bullet reads weakly', () => {
  it('rejects a percentage nobody supplied', () => {
    const findings = check(
      'Managed a book of 40 mid-market retail accounts, growing revenue 25%.',
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ kind: 'number', value: '25%' })
  })

  it('rejects a headcount nobody supplied', () => {
    const findings = check('Managed 40 accounts across 3 regions.')
    expect(findings.map((f) => f.value)).toContain('3')
  })

  it('rejects a currency amount nobody supplied', () => {
    const findings = check('Managed a book of 40 accounts worth £2M annually.')
    expect(findings.some((f) => f.kind === 'number')).toBe(true)
  })

  it('rejects a tool the candidate never listed', () => {
    const findings = check('Managed 40 accounts in HubSpot.')
    expect(findings).toContainEqual({ kind: 'name', value: 'HubSpot' })
  })

  it('rejects an abbreviation the candidate never used', () => {
    const findings = check('Managed 40 accounts and owned the KPI dashboard.')
    expect(findings).toContainEqual({ kind: 'acronym', value: 'KPI' })
  })

  it('rejects an invented employer', () => {
    const findings = check('Managed 40 accounts for Tesco and Sainsbury.')
    expect(findings.map((f) => f.value).sort()).toEqual(['Sainsbury', 'Tesco'])
  })

  it('rejects a date the candidate never wrote into this bullet', () => {
    // Dates are on docs/06's prohibited list, and a year reads as a fact.
    const findings = check('Managed 40 accounts since 2019.')
    expect(findings.map((f) => f.value)).toContain('2019')
  })

  it('reports every distinct invention, not just the first', () => {
    const findings = check(
      'Grew 12 enterprise accounts by 30% using HubSpot across EMEA.',
    )
    const kinds = new Set(findings.map((f) => f.kind))
    expect(kinds).toContain('number')
    expect(kinds).toContain('name')
    expect(kinds).toContain('acronym')
  })
})

describe('it leaves honest rewriting alone', () => {
  it('accepts a stronger verb and a tightened structure', () => {
    expect(check('Managed a book of 40 mid-market retail accounts.')).toEqual(
      [],
    )
  })

  it('accepts dropping detail — a subset invents nothing', () => {
    expect(check('Managed 40 retail accounts.')).toEqual([])
  })

  it('accepts a number the candidate wrote elsewhere in the resume', () => {
    // "three years" lives in the summary, not in this bullet. docs/06 grounds against the whole
    // resume on purpose: resurfacing the candidate's own words is the point of the feature.
    expect(check('Managed 40 accounts over three years.')).toEqual([])
  })

  it('accepts a tool the candidate listed under skills', () => {
    expect(check('Managed 40 accounts in Salesforce.')).toEqual([])
  })

  it('accepts digits where the candidate spelled the number out', () => {
    // House style on a CV spells one to nine; a rewrite may switch, and it is the same claim.
    expect(check('Managed 40 accounts over 3 years.')).toEqual([])
  })

  it('accepts a plural where the source was singular', () => {
    expect(check('Rebuilt the call cycles from scratch.')).toEqual([])
  })

  it('does not treat the first word of a bullet as a name', () => {
    // Every bullet starts with a capitalised verb. Flagging those would reject everything.
    for (const opener of ['Managed', 'Rebuilt', 'Owned', 'Delivered']) {
      expect(check(`${opener} a book of 40 accounts.`)).toEqual([])
    }
  })

  it('does not treat a capitalised opener after a full stop as a name', () => {
    expect(
      check('Managed 40 accounts. Rebuilt the call cycle from scratch.'),
    ).toEqual([])
  })

  it('accepts an employer the candidate does work for', () => {
    expect(check('Managed 40 accounts for Northgate Supplies.')).toEqual([])
  })
})

describe('number equivalence', () => {
  const scaled = buildGrounding(
    RESUME,
    'Handled a 1,200-strong portfolio worth 2M.',
  )

  // Each of these keeps the *unit* fixed and varies only the notation, which is the thing being
  // tested. An earlier version varied both and was rejected — correctly, as it happens, since
  // "1200 accounts" is a different claim from "1,200-strong portfolio".
  it('treats 1,200 and 1200 as one claim', () => {
    expect(
      findFabrications('Handled a 1200-strong portfolio.', scaled),
    ).toEqual([])
  })

  it('treats 2M and 2 million as one claim', () => {
    expect(
      findFabrications('Handled a portfolio worth 2 million.', scaled),
    ).toEqual([])
  })

  it('rejects the same number attached to a different thing', () => {
    // The subtler half of fabrication: a real number moved onto a noun it never counted. It survives
    // review because the reader recognises the figure.
    const findings = findFabrications('Handled 1200 accounts.', scaled)
    expect(findings).toContainEqual({ kind: 'number', value: '1200' })
  })

  it('does not let a bare number license a percentage', () => {
    // The resume says 40 accounts. It does not say 40%, and the difference is the whole claim.
    const findings = findFabrications('Grew the book 40%.', grounding)
    expect(findings).toContainEqual({ kind: 'number', value: '40%' })
  })
})

describe('the explanation blames the tool, not the candidate', () => {
  it('says what was added, in plain language', () => {
    const message = describeFabrications(
      check('Managed 40 accounts in HubSpot, growing revenue 25%.'),
    )
    expect(message).toMatch(/you did not write/i)
    expect(message).toContain('HubSpot')
    expect(message).toContain('25%')
    // No jargon: the person reading this is a nurse or a warehouse supervisor.
    expect(message).not.toMatch(/fabricat|hallucinat|token|model|LLM/i)
  })

  it('says nothing when there is nothing to say', () => {
    expect(describeFabrications([])).toBe('')
  })
})

/**
 * The false-positive check that matters, run against a real fixture rather than a hand-made example.
 *
 * The audience is every sector and three languages (PRODUCT.md), so the guard meets Danish employer
 * names, medical acronyms and hyphenated compounds long before it meets a tech CV. If it flags
 * `Rigshospitalet` or `CRRT` as invention, a nurse's every rewrite is rejected and the feature is
 * switched off in practice — which is how a safety mechanism gets weakened by whoever ships next.
 */
describe('a real CV, in another language, with clinical abbreviations', () => {
  const nurse = Resume.parse(
    JSON.parse(
      readFileSync(
        join(process.cwd(), 'fixtures/expected/nurse-senior.json'),
        'utf8',
      ),
    ),
  )
  const clinical = buildGrounding(nurse)

  it.each([
    // Stronger verb, same facts.
    'Led nursing handover for a 24-bed unit across rotating three-shift cover.',
    // Reordered, tightened, employer resurfaced from the entry it belongs to.
    'Led handover for a 24-bed intensive care unit at Rigshospitalet.',
    // An abbreviation the candidate holds a certification in.
    'Delivered CRRT for critically ill patients.',
    // Danish proper nouns from elsewhere in the CV.
    'Supported residents at Plejecenter Sølund through personal care.',
    // Digits where the source spelled the number out, unit kept.
    'Precepted 14 newly graduated nurses through their first 6 months.',
  ])('accepts an honest rewrite: %s', (rewrite) => {
    expect(findFabrications(rewrite, clinical)).toEqual([])
  })

  it.each([
    [
      'a survival statistic',
      'Led handover for a 24-bed unit, cutting mortality 12%.',
    ],
    [
      'an unearned certification',
      'Led handover for a 24-bed unit and held ECMO certification.',
    ],
    [
      'a hospital she never worked at',
      'Led nursing handover at Aarhus Universitetshospital.',
    ],
    ['a bigger unit', 'Led nursing handover for a 40-bed unit.'],
  ])('rejects %s', (_label, rewrite) => {
    expect(findFabrications(rewrite, clinical).length).toBeGreaterThan(0)
  })
})

describe('explanatory text is checked for numbers only', () => {
  /**
   * A rationale quotes the wording it changed — that is its job. "Led is stronger than Helped with"
   * names two verbs that are, correctly, not in the CV.
   *
   * Checking that text for names threw away a good rewrite on a real run against MiniMax, reporting
   * `Led` and `Supported` as invented. The rationale never enters the document, so the only claim it
   * can still do damage with is a figure the candidate might then type in themselves.
   */
  it('does not flag a verb a rationale quotes', () => {
    const rationale =
      'Owned is stronger than Responsible for, and Supported was vaguer than the alternative.'
    expect(
      findFabrications(rationale, grounding, { numbersOnly: true }),
    ).toEqual([])
    // Without the option it is flagged, which is why the option exists.
    expect(findFabrications(rationale, grounding).length).toBeGreaterThan(0)
  })

  it('still flags a figure planted in a question', () => {
    const findings = findFabrications(
      'Was that the 25% growth year?',
      grounding,
      { numbersOnly: true },
    )
    expect(findings).toContainEqual({ kind: 'number', value: '25%' })
  })
})
