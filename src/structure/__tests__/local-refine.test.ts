/**
 * The local refinement contract, against a stubbed model.
 *
 * Every case here is a shape a 3B model **actually produced** during development, not one I imagined.
 * That is the point: an "Anthropic-compatible" endpoint is not Anthropic, and a small model is not a
 * large one, so the boundary has to be read defensively and the defence has to be pinned.
 */
import { describe, expect, it } from 'vitest'
import { Resume } from '@/schema/resume'
import { refineLocally } from '../local-refine'
import type { Provider } from '../provider'

const DRAFT = Resume.parse({
  schemaVersion: '1.0',
  basics: {
    fullName: 'Wrong Name',
    headline: 'Copenhagen',
    links: [],
    personalDetails: [],
  },
  work: [
    {
      company: '',
      role: 'Pædagog',
      startDate: '2021-06',
      endDate: null,
      highlights: [],
      tech: [],
    },
    {
      company: 'studiejob',
      role: 'Assistant',
      startDate: '2018-01',
      endDate: '2019-01',
      highlights: [],
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

const TEXT = `Eline Storm Johnsen
Pædagog
Planbørnefonden, København
Strandengens SFO, Dragør`

function providerReturning(input: unknown): Provider {
  return {
    model: 'stub',
    label: 'local',
    locality: 'local',
    client: {
      messages: {
        create: async () => ({
          content: [
            { type: 'tool_use', id: 'c1', name: 'submit_corrections', input },
          ],
        }),
      },
    } as unknown as Provider['client'],
  }
}

const refine = (input: unknown) =>
  refineLocally({
    normalizedText: TEXT,
    draft: DRAFT,
    provenance: [],
    provider: providerReturning(input),
  })

describe('shapes a small model actually returns', () => {
  it('accepts null for "nothing to correct" instead of rejecting the whole answer', async () => {
    // Measured: the model writes `fullName: null` rather than omitting the key. A strict schema threw
    // away every other correction in the same response.
    const result = await refine({
      fullName: null,
      headline: null,
      jobs: [{ index: 0, company: 'Planbørnefonden, København' }],
    })
    expect(result.corrections).toBe(1)
    expect(result.resume.work[0].company).toBe('Planbørnefonden, København')
  })

  it('unwraps the extra `object` key Ollama nests the input under', async () => {
    const result = await refine({
      object: { jobs: [{ index: 0, company: 'Planbørnefonden, København' }] },
    })
    expect(result.corrections).toBe(1)
  })

  it('keeps the other corrections when one job entry is malformed', async () => {
    const result = await refine({
      jobs: [
        { index: 'not a number' },
        { index: 1, company: 'Strandengens SFO, Dragør' },
      ],
    })
    expect(result.resume.work[1].company).toBe('Strandengens SFO, Dragør')
  })
})

describe('nothing is trusted', () => {
  it('rejects a correction that does not appear in the document', async () => {
    // The whole guard: a model inventing an employer here would be indistinguishable from the parser
    // having read one.
    const result = await refine({ jobs: [{ index: 0, company: 'Google' }] })
    expect(result.corrections).toBe(0)
    expect(result.resume.work[0].company).toBe('')
  })

  it('discards an unindexed correction when there is more than one job', async () => {
    // Applying it to the wrong job is worse than dropping it, because the result looks deliberate.
    const result = await refine({
      jobs: [{ company: 'Planbørnefonden, København' }],
    })
    expect(result.corrections).toBe(0)
  })

  it('accepts an unindexed correction when there is only one job to mean', async () => {
    const single = Resume.parse({ ...DRAFT, work: [DRAFT.work[0]] })
    const result = await refineLocally({
      normalizedText: TEXT,
      draft: single,
      provenance: [],
      provider: providerReturning({
        jobs: [{ company: 'Planbørnefonden, København' }],
      }),
    })
    expect(result.resume.work[0].company).toBe('Planbørnefonden, København')
  })
})

describe('failure leaves the draft standing', () => {
  it('returns the rules result unchanged when the model errors', async () => {
    const provider = providerReturning(null)
    ;(
      provider.client.messages as unknown as { create: () => Promise<never> }
    ).create = () => {
      throw new Error('model down')
    }
    const result = await refineLocally({
      normalizedText: TEXT,
      draft: DRAFT,
      provenance: [],
      provider,
    })
    expect(result.corrections).toBe(0)
    expect(result.resume).toEqual(DRAFT)
  })

  it('marks every correction as needing review', async () => {
    const result = await refine({
      jobs: [{ index: 0, company: 'Planbørnefonden, København' }],
    })
    // A field a model changed is exactly the field a person should look at, so it goes in front with
    // a confidence below the review threshold.
    expect(result.provenance[0]?.path).toBe('work.0.company')
    expect(result.provenance[0]?.confidence).toBeLessThan(0.8)
    expect(result.provenance[0]?.inferred).toBe(true)
  })
})
