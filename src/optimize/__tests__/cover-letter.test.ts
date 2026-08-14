/**
 * The cover letter, driven by a stubbed provider.
 *
 * The test that earns its keep is the third guard. `"I have long admired your work in paediatric
 * oncology"` invents nothing about the candidate — no number, no employer of theirs, no qualification —
 * so the fabrication guard on the CV alone passes it. It is still a claim about the world that the
 * candidate will be asked to defend, and a model produces it readily from a job title.
 *
 * The fix is not a fourth checker: the advert joins the grounding set, so the letter may name the
 * hospital the advert names and may not name a specialty it never mentions. These tests pin both halves,
 * because a guard that rejects everything is as useless as one that rejects nothing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Resume } from '@/schema/resume'
import type { JobRequirements } from '../jd'

const RESUME = Resume.parse({
  schemaVersion: '1.0',
  basics: {
    fullName: 'Marta Sørensen',
    email: 'marta.sorensen@example.org',
    headline: 'Registered Nurse — Intensive Care',
    summary:
      'Registered nurse with 12 years in intensive and post-operative care.',
    links: [],
    personalDetails: [],
  },
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
  certifications: [{ name: 'Danish nursing authorisation' }],
  languages: [],
  awards: [],
  publications: [],
  volunteer: [],
  custom: [],
})

const ADVERT = `Registered Nurse - Intensive Care
Herlev Hospital

Requirements
- Danish nursing authorisation
- Ventilator management
- Paediatric intensive care
`

const REQUIREMENTS: JobRequirements = {
  hardSkills: [
    'Danish nursing authorisation',
    'Ventilator management',
    'Paediatric intensive care',
  ],
  softSkills: [],
  responsibilities: [],
  keywords: [],
}

async function withModelReturning(...payloads: Array<unknown>) {
  vi.resetModules()
  let turn = 0
  vi.doMock('@/structure/provider', () => ({
    resolveProvider: () => ({
      model: 'stub',
      label: 'stub',
      locality: 'third-party',
      client: {
        messages: {
          create: async () => {
            const input = payloads[Math.min(turn, payloads.length - 1)]
            turn++
            if (input === 'throw') throw new Error('provider down')
            return {
              content: [
                {
                  type: 'tool_use',
                  id: `call_${turn}`,
                  name: 'submit_letter',
                  input,
                },
              ],
            }
          },
        },
      },
    }),
    resolveLocalProvider: () => undefined,
  }))
  const { draftCoverLetter } = await import('../cover-letter')
  return { draftCoverLetter, turns: () => turn }
}

const request = {
  resume: RESUME,
  requirements: REQUIREMENTS,
  advert: ADVERT,
  roleTitle: 'Registered Nurse - Intensive Care',
  company: 'Herlev Hospital',
}

afterEach(() => {
  vi.doUnmock('@/structure/provider')
  vi.resetModules()
})

describe('a letter built from the CV and the advert is offered', () => {
  it('assembles the greeting and sign-off around the body', async () => {
    const { draftCoverLetter } = await withModelReturning({
      body: 'I am applying for the Registered Nurse post at Herlev Hospital. I have led nursing handover for a 24-bed unit at Rigshospitalet, and ventilator management is part of my daily practice.',
      rationale: 'Led with the two requirements the CV evidences.',
    })

    const letter = await draftCoverLetter(request)

    expect(letter.outcome).toBe('drafted')
    // The greeting is ours, not the model's: a model asked for one invents a surname.
    expect(letter.text).toMatch(/^Dear Herlev Hospital hiring team,/)
    expect(letter.text).toContain('Kind regards,\nMarta Sørensen')
  })

  it('lets the letter name the employer, because the advert names them', async () => {
    // The point of grounding on the advert as well as the CV. "Herlev Hospital" is nowhere in this CV.
    const { draftCoverLetter } = await withModelReturning({
      body: 'Herlev Hospital is advertising for an intensive care nurse, and I have led handover for a 24-bed unit.',
      rationale: 'Named the employer from the advert.',
    })

    const letter = await draftCoverLetter(request)
    expect(letter.outcome).toBe('drafted')
  })

  it('says Dear Hiring Manager when the advert names no employer', async () => {
    const { draftCoverLetter } = await withModelReturning({
      body: 'I am applying for the intensive care post. I have led handover for a 24-bed unit.',
      rationale: '',
    })

    const letter = await draftCoverLetter({ ...request, company: undefined })
    expect(letter.text).toMatch(/^Dear Hiring Manager,/)
  })
})

describe('nothing invented about the employer reaches the candidate', () => {
  it('refuses flattery the advert does not support', async () => {
    /**
     * The failure specific to this form. It invents nothing about the candidate, so the CV-only
     * fabrication guard passes it — and the candidate is the one who gets asked "what do you know
     * about our oncology work?" about a sentence a machine wrote.
     */
    const { draftCoverLetter, turns } = await withModelReturning({
      body: 'I have long admired the work of the Oncology Institute and its reputation for patient safety. I have led handover for a 24-bed unit.',
      rationale: 'Opened warmly.',
    })

    const letter = await draftCoverLetter(request)

    expect(letter.outcome).toBe('refused')
    expect(letter.text).toBeUndefined()
    expect(letter.rejected?.some((f) => f.value.includes('Oncology'))).toBe(
      true,
    )
    // Told what it did wrong, then given one more attempt before being refused.
    expect(turns()).toBe(2)
  })

  it('accepts the second attempt when the flattery is dropped', async () => {
    const { draftCoverLetter } = await withModelReturning(
      {
        body: 'I have admired the Oncology Institute for years.',
        rationale: 'first try',
      },
      {
        body: 'I am applying for the intensive care post at Herlev Hospital, where ventilator management is part of my daily practice.',
        rationale: 'second try, flattery removed',
      },
    )

    const letter = await draftCoverLetter(request)
    expect(letter.outcome).toBe('drafted')
    expect(letter.text).not.toMatch(/admired/)
  })

  it('refuses a requirement the CV does not evidence', async () => {
    const { draftCoverLetter } = await withModelReturning({
      body: 'My paediatric intensive care experience makes me a strong fit for this post.',
      rationale: 'Matched the advert.',
    })

    const letter = await draftCoverLetter(request)

    expect(letter.outcome).toBe('refused')
    expect(letter.overclaimed).toContain('Paediatric intensive care')
  })

  it('refuses an invented figure, exactly as the other features do', async () => {
    const { draftCoverLetter } = await withModelReturning({
      body: 'I have led handover for a 40-bed unit at Rigshospitalet.',
      rationale: 'Added scale.',
    })

    const letter = await draftCoverLetter(request)
    expect(letter.outcome).toBe('refused')
    expect(letter.rejected?.some((f) => f.kind === 'number')).toBe(true)
  })
})

describe('a wordy explanation does not cost a good letter', () => {
  it('clamps the rationale rather than rejecting the payload', async () => {
    const { draftCoverLetter } = await withModelReturning({
      body: 'I am applying for the intensive care post at Herlev Hospital, where ventilator management is part of my daily practice.',
      rationale: `Led with the evidenced requirements. ${'Explaining at length. '.repeat(40)}`,
    })

    const letter = await draftCoverLetter(request)

    expect(letter.outcome).toBe('drafted')
    expect(letter.rationale.length).toBeLessThanOrEqual(401)
    expect(letter.rationale.endsWith('…')).toBe(true)
  })
})

describe('the feature reports itself unavailable rather than hanging', () => {
  it('when the call throws', async () => {
    const { draftCoverLetter } = await withModelReturning('throw')
    const letter = await draftCoverLetter(request)
    expect(letter.outcome).toBe('unavailable')
  })

  it('when nothing is configured', async () => {
    vi.resetModules()
    vi.doMock('@/structure/provider', () => ({
      resolveProvider: () => undefined,
      resolveLocalProvider: () => undefined,
    }))
    const { draftCoverLetter } = await import('../cover-letter')
    const letter = await draftCoverLetter(request)
    expect(letter.outcome).toBe('unavailable')
    expect(letter.text).toBeUndefined()
  })
})
