/**
 * The tailored summary, driven by a stubbed provider.
 *
 * The test that earns its keep is `overclaim`. A sentence like "Experienced in inventory control"
 * invents no number, no employer and no acronym, so the fabrication guard passes it cleanly — and it is
 * a lie if the CV never mentions inventory control. Nothing in the codebase caught that class of claim
 * before this module, and it is the one a recruiter discovers in the interview.
 *
 * The candidate here is a warehouse supervisor, not a developer. That is not decoration: the guards
 * work on the words, and a tech-only fixture would let a tech-only assumption hide.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Resume } from '@/schema/resume'
import { findOverclaims } from '../summary'
import type { JobRequirements } from '../jd'

const RESUME = Resume.parse({
  schemaVersion: '1.0',
  basics: {
    fullName: 'Aneta Kowalska',
    email: 'aneta.kowalska@example.com',
    headline: 'Warehouse Supervisor',
    summary:
      'Warehouse supervisor with eight years in cold-chain distribution.',
    links: [],
    personalDetails: [],
  },
  work: [
    {
      company: 'Northgate Cold Store',
      role: 'Warehouse Supervisor',
      startDate: '2018-03',
      endDate: null,
      highlights: [
        'Ran the shift rota for a team of 14 across two loading bays.',
        'Held the forklift licence and trained four new drivers on it.',
      ],
      tech: ['Navision'],
    },
  ],
  education: [],
  skills: [{ category: 'Warehouse', items: ['Shift scheduling', 'Forklift'] }],
  projects: [],
  certifications: [],
  languages: [],
  awards: [],
  publications: [],
  volunteer: [],
  custom: [],
})

const REQUIREMENTS: JobRequirements = {
  hardSkills: ['Forklift licence', 'Shift scheduling', 'Inventory control'],
  softSkills: [],
  responsibilities: [],
  keywords: ['Forklift licence', 'Inventory control'],
}

/** Queues one tool-call payload per model turn, so a retry can be answered differently. */
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
                  name: 'submit_summary',
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
  const { tailorSummary } = await import('../summary')
  return { tailorSummary, turns: () => turn }
}

afterEach(() => {
  vi.doUnmock('@/structure/provider')
  vi.resetModules()
})

describe('a summary built from the candidate’s own material is offered', () => {
  it('returns it with the rationale, and never touches the resume', async () => {
    const { tailorSummary } = await withModelReturning({
      summary:
        'Warehouse supervisor with eight years in cold-chain distribution. Runs the shift rota for a team of 14 and holds the forklift licence.',
      rationale:
        'Moved the rota and the forklift licence up, because the job asks for both.',
    })

    const result = await tailorSummary({
      resume: RESUME,
      requirements: REQUIREMENTS,
    })

    expect(result.outcome).toBe('suggested')
    expect(result.suggestion).toMatch(/forklift licence/i)
    expect(result.original).toBe(RESUME.basics.summary)
    // The resume itself is untouched — this is a suggestion, and layer 3 is the candidate accepting it.
    expect(RESUME.basics.summary).toBe(
      'Warehouse supervisor with eight years in cold-chain distribution.',
    )
  })
})

describe('a claim the CV cannot support never reaches the candidate', () => {
  it('rejects a summary that claims a missing requirement, and names it', async () => {
    // "Experienced in inventory control" invents no number and no proper noun. The fabrication guard
    // passes it. It is still a claim this CV has no evidence for, and this is the only check that sees it.
    const { tailorSummary, turns } = await withModelReturning({
      summary:
        'Warehouse supervisor with eight years in cold-chain distribution, experienced in inventory control.',
      rationale: 'Matched the advert.',
    })

    const result = await tailorSummary({
      resume: RESUME,
      requirements: REQUIREMENTS,
    })

    expect(result.outcome).toBe('fabricated')
    expect(result.suggestion).toBeUndefined()
    expect(result.overclaimed).toContain('Inventory control')
    // It was told what it did wrong and given a second attempt before the original stood.
    expect(turns()).toBe(2)
  })

  it('accepts the second attempt when the model drops the claim', async () => {
    const { tailorSummary } = await withModelReturning(
      {
        summary: 'Supervisor experienced in inventory control across two bays.',
        rationale: 'first try',
      },
      {
        summary:
          'Warehouse supervisor with eight years in cold-chain distribution. Runs the shift rota for a team of 14.',
        rationale: 'second try, claim removed',
      },
    )

    const result = await tailorSummary({
      resume: RESUME,
      requirements: REQUIREMENTS,
    })

    expect(result.outcome).toBe('suggested')
    expect(result.suggestion).not.toMatch(/inventory/i)
  })

  it('still rejects an invented number, exactly as bullet rewriting does', async () => {
    const { tailorSummary } = await withModelReturning({
      // 30 appears nowhere in this CV. 14 does.
      summary: 'Warehouse supervisor running the shift rota for a team of 30.',
      rationale: 'Added scale.',
    })

    const result = await tailorSummary({
      resume: RESUME,
      requirements: REQUIREMENTS,
    })

    expect(result.outcome).toBe('fabricated')
    expect(result.rejected?.some((finding) => finding.kind === 'number')).toBe(
      true,
    )
  })
})

describe('the overclaim check does not fire on an incidental word', () => {
  it('permits a summary that shares only framing words with a missing requirement', () => {
    // "experience" and "with" are hollow. A summary containing them has claimed nothing.
    expect(
      findOverclaims(
        'Warehouse supervisor with eight years of experience on the loading bay.',
        ['Experience with stock control'],
      ),
    ).toEqual([])
  })

  it('requires every claim-bearing word, not any of them', () => {
    expect(
      findOverclaims('Cared for patients on a surgical ward.', [
        'Paediatric intensive care',
      ]),
    ).toEqual([])

    expect(
      findOverclaims('Worked in paediatric intensive care for six years.', [
        'Paediatric intensive care',
      ]),
    ).toEqual(['Paediatric intensive care'])
  })

  it('sees through a light rewording, because that is how a model would smuggle it', () => {
    expect(
      findOverclaims('Handles inventory controls for the whole site.', [
        'Inventory control',
      ]),
    ).toEqual(['Inventory control'])
  })
})

describe('a wordy explanation does not cost a good suggestion', () => {
  it('clamps a long rationale instead of throwing the summary away', async () => {
    /**
     * The first real run of this feature lost a correct, guard-passing summary because the rationale
     * was forty characters over a 300-character cap: the whole payload failed to parse and the
     * candidate was told the feature was unavailable. The rationale never reaches the CV, so its
     * length cannot make the suggestion dishonest.
     */
    const { tailorSummary } = await withModelReturning({
      summary:
        'Warehouse supervisor with eight years in cold-chain distribution. Runs the shift rota for a team of 14.',
      rationale: `Led with the rota because the advert names shift scheduling. ${'Explaining at length. '.repeat(40)}`,
    })

    const result = await tailorSummary({
      resume: RESUME,
      requirements: REQUIREMENTS,
    })

    expect(result.outcome).toBe('suggested')
    expect(result.rationale.length).toBeLessThanOrEqual(401)
    expect(result.rationale).toMatch(/^Led with the rota/)
    expect(result.rationale.endsWith('…')).toBe(true)
  })
})

describe('the candidate keeps their own summary when the model is unavailable', () => {
  it('reports unavailable rather than blanking the field', async () => {
    const { tailorSummary } = await withModelReturning('throw')

    const result = await tailorSummary({
      resume: RESUME,
      requirements: REQUIREMENTS,
    })

    expect(result.outcome).toBe('unavailable')
    expect(result.suggestion).toBeUndefined()
    expect(result.original).toBe(RESUME.basics.summary)
  })

  it('reports unavailable when nothing is configured', async () => {
    vi.resetModules()
    vi.doMock('@/structure/provider', () => ({
      resolveProvider: () => undefined,
      resolveLocalProvider: () => undefined,
    }))
    const { tailorSummary } = await import('../summary')

    const result = await tailorSummary({
      resume: RESUME,
      requirements: REQUIREMENTS,
    })

    expect(result.outcome).toBe('unavailable')
  })
})

describe('a true summary that reads machine-written gets one more try', () => {
  it('takes the plainer second attempt', async () => {
    /**
     * The soft guard, end to end. Both versions pass the fabrication and overclaim checks — the first
     * one just sounds like every other generated summary. Unlike a fabrication, it is not thrown away:
     * it is kept as a floor while the model is asked for something plainer.
     */
    const { tailorSummary, turns } = await withModelReturning(
      {
        summary:
          'A results-driven warehouse supervisor, leveraging a robust approach to the shift rota, showcasing eight years in cold-chain distribution.',
        rationale: 'first try',
      },
      {
        summary:
          'Warehouse supervisor with eight years in cold-chain distribution. Runs the shift rota for a team of 14.',
        rationale: 'second try, plainer',
      },
    )

    const result = await tailorSummary({
      resume: RESUME,
      requirements: REQUIREMENTS,
    })

    expect(result.outcome).toBe('suggested')
    expect(result.suggestion).not.toMatch(
      /results-driven|leveraging|robust|showcasing/i,
    )
    expect(turns()).toBe(2)
  })

  it('ships the first version when the retry is no cleaner, rather than nothing', async () => {
    // It passed both hard guards, so it is true and targeted. Refusing over style would be the wrong
    // trade, and the candidate edits or rejects it either way.
    const machine =
      'A results-driven supervisor leveraging a robust rota across two bays.'
    const { tailorSummary } = await withModelReturning(
      { summary: machine, rationale: 'first' },
      { summary: machine, rationale: 'second, identical' },
    )

    const result = await tailorSummary({
      resume: RESUME,
      requirements: REQUIREMENTS,
    })
    expect(result.outcome).toBe('suggested')
    expect(result.suggestion).toBe(machine)
  })

  it('does not spend a second call when the first version is already plain', async () => {
    const { tailorSummary, turns } = await withModelReturning({
      summary:
        'Warehouse supervisor with eight years in cold-chain distribution. Runs the shift rota for a team of 14.',
      rationale: 'clean first time',
    })

    const result = await tailorSummary({
      resume: RESUME,
      requirements: REQUIREMENTS,
    })
    expect(result.outcome).toBe('suggested')
    expect(turns()).toBe(1)
  })
})
