/**
 * Reading a job advert into requirements.
 *
 * Two things are worth testing and neither is the model. The first is the **rule reader**, because it
 * is the no-consent path and therefore the one a privacy-conscious user actually gets. The second is
 * the **guard**: a model that invents a requirement produces a fake gap, and that must be impossible
 * rather than unlikely.
 *
 * The adverts here are written the way real ones are — a heading, a bulleted list, a benefits section
 * at the bottom that must not be mistaken for requirements — and one of them is a nurse rather than a
 * developer, because the audience is every sector (PRODUCT.md).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readAdvertWithRules, trimAdvertPayload } from '../advert'

const NURSE_ADVERT = `Registered Nurse — Intensive Care

Herlev Hospital is looking for an experienced nurse to join our intensive care unit.

Requirements
- Danish nursing authorisation
- At least 3 years' experience in intensive care
- Ventilator management
- Excellent communication skills
- Fluent Danish

Your tasks
- Care for ventilated patients on a 12-hour shift rota
- Hand over to the incoming shift lead

We offer
- Pension and six weeks of holiday
- A supportive team and free parking
`

const WAREHOUSE_ADVERT_ES = `Encargado de Almacén

Requisitos
- Carretilla elevadora con certificado en vigor
- Control de inventario
- Trabajo en equipo

Funciones
- Coordinar la recepción de mercancía

Te ofrecemos
- Contrato indefinido y plan de pensiones
`

describe('the rule reader finds what the employer asked for', () => {
  it('reads a requirements list and keeps the employer’s own wording', () => {
    const { requirements } = readAdvertWithRules(NURSE_ADVERT)

    expect(requirements.hardSkills).toContain('Danish nursing authorisation')
    expect(requirements.hardSkills).toContain('Ventilator management')
    // The phrase, not the framing: "At least 3 years' experience in intensive care" is a requirement
    // for intensive care, and that is the part a CV can be matched against.
    expect(requirements.hardSkills).toContain('intensive care')
  })

  it('files a disposition as a soft skill, so it stays out of the coverage ratio', () => {
    const { requirements } = readAdvertWithRules(NURSE_ADVERT)

    expect(requirements.softSkills).toContain('Excellent communication skills')
    expect(requirements.hardSkills).not.toContain(
      'Excellent communication skills',
    )
  })

  it('stops at the benefits section instead of demanding free parking of the candidate', () => {
    const { requirements } = readAdvertWithRules(NURSE_ADVERT)
    const everything = [
      ...requirements.hardSkills,
      ...requirements.softSkills,
    ].join(' | ')

    expect(everything).not.toMatch(/parking|holiday|pension/i)
  })

  it('separates what the person will do from what they must already have', () => {
    const { requirements } = readAdvertWithRules(NURSE_ADVERT)

    expect(requirements.responsibilities.join(' ')).toMatch(
      /ventilated patients/,
    )
    expect(requirements.hardSkills.join(' ')).not.toMatch(/ventilated patients/)
  })

  it('takes the advert’s own title, and reads seniority only when it is stated', () => {
    const nurse = readAdvertWithRules(NURSE_ADVERT)
    expect(nurse.roleTitle).toBe('Registered Nurse — Intensive Care')
    // "experienced" is not a seniority label; nothing is invented from it.
    expect(nurse.requirements.seniority).toBeUndefined()

    const senior = readAdvertWithRules(
      'Senior Electrician\n\nRequirements\n- 17th edition wiring regulations\n',
    )
    expect(senior.requirements.seniority).toBe('Senior')
  })

  it('reads a Spanish advert with Spanish headings', () => {
    const { requirements, roleTitle } = readAdvertWithRules(WAREHOUSE_ADVERT_ES)

    expect(roleTitle).toBe('Encargado de Almacén')
    expect(requirements.hardSkills).toContain(
      'Carretilla elevadora con certificado en vigor',
    )
    expect(requirements.hardSkills).toContain('Control de inventario')
    expect(requirements.softSkills).toContain('Trabajo en equipo')
    expect(requirements.responsibilities.join(' ')).toMatch(
      /recepción de mercancía/,
    )
    expect(
      [...requirements.hardSkills, ...requirements.softSkills].join(' '),
    ).not.toMatch(/pensiones|indefinido/)
  })

  it('never invents a requirement from an advert that lists none', () => {
    // A company blurb with no requirements section must produce nothing, not a guess. An empty list
    // says "paste more of it"; a guessed list sends someone to rewrite their CV for nobody.
    const { requirements } = readAdvertWithRules(
      'About Northgate\n\nWe are a family business founded in 1974 and we care about our people.\n',
    )

    expect(requirements.hardSkills).toEqual([])
    expect(requirements.softSkills).toEqual([])
  })

  it('falls back to bulleted lines when the advert has no heading it recognises', () => {
    const { requirements } = readAdvertWithRules(
      'Kok søges til vores køkken\n\n- Hygiejnebevis\n- Erfaring med à la carte\n',
    )

    expect(requirements.hardSkills).toContain('Hygiejnebevis')
    expect(requirements.hardSkills.join(' ')).toMatch(/la carte/)
  })

  it('does not repeat one requirement because the advert did', () => {
    const { requirements } = readAdvertWithRules(
      'Requirements\n- Forklift licence\n- forklift licence\n- Stock control\n',
    )

    expect(requirements.hardSkills).toHaveLength(2)
  })
})

/* ────────────────────────────────────────────────────────────────────────────────────────────────
   The guard
   ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** Returns one queued tool-call payload, the same shape the rewrite tests use. */
async function withModelReturning(payload: unknown) {
  vi.resetModules()
  vi.doMock('@/structure/provider', () => ({
    resolveProvider: () => ({
      model: 'stub',
      label: 'stub',
      locality: 'third-party',
      client: {
        messages: {
          create: async () => {
            if (payload === 'throw') throw new Error('provider down')
            return {
              content: [
                {
                  type: 'tool_use',
                  id: 'call_1',
                  name: 'submit_requirements',
                  input: payload,
                },
              ],
            }
          },
        },
      },
    }),
    resolveLocalProvider: () => undefined,
  }))
  const { readAdvert } = await import('../advert')
  return readAdvert
}

afterEach(() => {
  vi.doUnmock('@/structure/provider')
  vi.resetModules()
})

describe('a requirement the advert does not contain never reaches the candidate', () => {
  it('drops it and says it was invented', async () => {
    const readAdvert = await withModelReturning({
      hardSkills: ['Ventilator management', 'Paediatric intensive care'],
      // The classic: every advert wants this, so a model supplies it. This one does not ask for it.
      softSkills: ['Excellent communication skills'],
      responsibilities: [],
      keywords: ['Ventilator management'],
    })

    const reading = await readAdvert({
      advert:
        'Requirements\n- Ventilator management\n- Danish nursing authorisation\n',
    })

    expect(reading.source).toBe('model')
    expect(reading.requirements.hardSkills).toEqual(['Ventilator management'])
    expect(reading.requirements.softSkills).toEqual([])
    expect(reading.invented).toContain('Paediatric intensive care')
    expect(reading.invented).toContain('Excellent communication skills')
  })

  it('accepts a requirement the advert words slightly differently', async () => {
    // Leniency is deliberate: deleting something the employer did ask for is the expensive error.
    const readAdvert = await withModelReturning({
      hardSkills: ['shift scheduling'],
      softSkills: [],
      responsibilities: [],
      keywords: [],
    })

    const reading = await readAdvert({
      advert: 'Requirements\n- Scheduling shifts for a team of twelve\n',
    })

    expect(reading.requirements.hardSkills).toEqual(['shift scheduling'])
    expect(reading.invented).toEqual([])
  })

  it('keeps responsibilities the guard would have shredded, because they drive nothing', async () => {
    const readAdvert = await withModelReturning({
      hardSkills: [],
      softSkills: [],
      // A paraphrase of the advert's own sentence. Never matched against the CV, never reordered by.
      responsibilities: [
        'Look after patients on a ventilator during a long shift',
      ],
      keywords: [],
    })

    const reading = await readAdvert({
      advert:
        'Your tasks\n- Care for ventilated patients on a 12-hour shift rota\n',
    })

    expect(reading.requirements.responsibilities).toHaveLength(1)
  })
})

describe('the feature survives a model that is absent or broken', () => {
  it('falls back to the rule reader when the call throws, rather than failing the request', async () => {
    const readAdvert = await withModelReturning('throw')

    const reading = await readAdvert({
      advert: 'Requirements\n- Forklift licence\n- Stock control\n',
    })

    expect(reading.source).toBe('rules')
    expect(reading.requirements.hardSkills).toContain('Forklift licence')
  })

  it('uses rules when no provider is configured at all', async () => {
    vi.resetModules()
    vi.doMock('@/structure/provider', () => ({
      resolveProvider: () => undefined,
      resolveLocalProvider: () => undefined,
    }))
    const { readAdvert } = await import('../advert')

    const reading = await readAdvert({
      advert: 'Requirements\n- Forklift licence\n',
    })

    expect(reading.source).toBe('rules')
    expect(reading.requirements.hardSkills).toContain('Forklift licence')
  })
})

describe('one row that does not fit costs that row, not the reading', () => {
  /**
   * Production, 15 Aug 2026: `advert.fell_back` with `bad_shape:keywords.0.too_big`. The model wrote a
   * whole sentence into the keyword list, the schema rejected the entire payload on it, and the reading
   * silently became the rule reader's — which finds materially less. The oversized row should go. The
   * other rows should not go with it.
   */
  it('drops an oversized keyword and still reads the advert with the model', async () => {
    const readAdvert = await withModelReturning({
      hardSkills: ['Ventilator management'],
      softSkills: [],
      responsibilities: [],
      keywords: [
        'The successful candidate will be expected to demonstrate ventilator management across a twelve-hour shift rota',
        'Ventilator management',
      ],
    })

    const reading = await readAdvert({
      advert:
        'Requirements\n- Ventilator management\n- Danish nursing authorisation\n',
    })

    expect(reading.source).toBe('model')
    expect(reading.requirements.keywords).toEqual(['Ventilator management'])
  })

  it('drops an oversized role title without losing the requirements under it', async () => {
    const readAdvert = await withModelReturning({
      hardSkills: ['Ventilator management'],
      softSkills: [],
      responsibilities: [],
      keywords: [],
      roleTitle: 'Registered Nurse '.repeat(20),
    })

    const reading = await readAdvert({
      advert: 'Requirements\n- Ventilator management\n',
    })

    expect(reading.source).toBe('model')
    expect(reading.roleTitle).toBeUndefined()
    expect(reading.requirements.hardSkills).toEqual(['Ventilator management'])
  })
})

describe('trimAdvertPayload', () => {
  it('counts what it dropped, so the caller can say so', () => {
    const { payload, dropped } = trimAdvertPayload({
      keywords: ['ok', '', 'x'.repeat(81), 42, 'ok'],
    })

    // The blank, the oversized one and the number. The duplicate is dedupe's job, not this one's.
    expect(dropped).toBe(3)
    expect((payload as { keywords: Array<string> }).keywords).toEqual([
      'ok',
      'ok',
    ])
  })

  it('applies the item cap as well as the character cap', () => {
    const { payload, dropped } = trimAdvertPayload({
      keywords: Array.from({ length: 45 }, (_, index) => `keyword ${index}`),
    })

    expect((payload as { keywords: Array<string> }).keywords).toHaveLength(40)
    expect(dropped).toBe(5)
  })

  it('leaves something that is not an object alone', () => {
    expect(trimAdvertPayload(null)).toEqual({ payload: null, dropped: 0 })
    expect(trimAdvertPayload('nope')).toEqual({ payload: 'nope', dropped: 0 })
  })
})
