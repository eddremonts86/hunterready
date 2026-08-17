/**
 * The scanner that narrates a tool call as it streams.
 *
 * Two things are being tested here and they are not equally important. That it reports the right
 * sections in the right order is a feature working. That it **cannot** report a value is the privacy
 * promise in docs/07, and the adversarial cases below are the ones that matter: a CV whose text
 * contains JSON, quotes and our own field names is not a hypothetical — a developer's CV lists
 * `"skills"` and an editor's lists `"publications"`, and one of those strings arriving in value
 * position must not move the screen or, worse, be mistaken for a key and shown.
 */
import { describe, expect, it } from 'vitest'
import { NARRATION, countLabel, isNarrationKey, narrate } from '../narrate'
import type { Narration } from '../narrate'

/** Feed a document one chunk at a time, the way the SDK delivers `input_json_delta`. */
function run(json: string, chunk = 7): Array<Narration> {
  const seen: Array<Narration> = []
  const narrator = narrate((state) => seen.push({ ...state }))
  for (let i = 0; i < json.length; i += chunk) {
    narrator.push(json.slice(i, i + chunk))
  }
  return seen
}

const PAYLOAD = JSON.stringify({
  resume: {
    schemaVersion: '1.0',
    locale: 'en',
    basics: { fullName: 'Rosa Delgado', email: 'rosa@example.com' },
    work: [
      { company: 'Clínica Vega', role: 'Nurse', highlights: ['a', 'b', 'c'] },
      { company: 'Hospital Sur', role: 'Ward sister', highlights: ['d'] },
      { company: 'Cruz Roja', role: 'Volunteer coordinator' },
    ],
    education: [{ institution: 'Universidad de Sevilla', degree: 'Nursing' }],
    skills: [
      { category: 'Clinical', items: ['triage', 'phlebotomy'] },
      { category: 'Languages', items: ['Spanish', 'English'] },
    ],
    languages: [{ name: 'Spanish', level: 'native' }],
  },
  provenance: [
    { path: 'basics.fullName', confidence: 0.98 },
    { path: 'work.0.company', confidence: 0.9 },
  ],
})

describe('narrate', () => {
  it('walks the sections in the order the model writes them', () => {
    const keys = run(PAYLOAD).map((state) => state.key)
    // Duplicates are the counts climbing; the *first* appearance of each is the running order.
    const firsts = keys.filter((key, index) => keys.indexOf(key) === index)
    expect(firsts).toEqual([
      'basics',
      'work',
      'education',
      'skills',
      'languages',
      'provenance',
    ])
  })

  it('counts entries as they complete, including the last one before the bracket closes', () => {
    const seen = run(PAYLOAD)
    const highest = (key: string) =>
      Math.max(
        ...seen
          .filter((state) => state.key === key)
          .map((state) => state.count),
      )
    expect(highest('work')).toBe(3)
    expect(highest('education')).toBe(1)
    expect(highest('skills')).toBe(2)
    expect(highest('languages')).toBe(1)
    expect(highest('provenance')).toBe(2)
  })

  it('never walks a count backwards', () => {
    const perKey = new Map<string, number>()
    for (const state of run(PAYLOAD)) {
      expect(state.count).toBeGreaterThanOrEqual(perKey.get(state.key) ?? 0)
      perKey.set(state.key, state.count)
    }
  })

  it('reports the same sections however the stream is chopped up', () => {
    const reference = run(PAYLOAD, 1)
      .map((state) => `${state.key}:${state.count}`)
      .join('|')
    for (const size of [3, 13, 64, 512, PAYLOAD.length]) {
      expect(
        run(PAYLOAD, size)
          .map((s) => `${s.key}:${s.count}`)
          .join('|'),
      ).toBe(reference)
    }
  })

  it('emits nothing but keys from the fixed table', () => {
    for (const state of run(PAYLOAD)) {
      expect(isNarrationKey(state.key)).toBe(true)
      expect(Object.keys(NARRATION)).toContain(state.key)
    }
  })

  /**
   * The one that matters. A value that looks exactly like the rest of the document must not be read as
   * structure — otherwise a bullet becomes a section name, and a section name is drawn on screen.
   */
  it('does not mistake a value containing JSON for structure', () => {
    const hostile = JSON.stringify({
      resume: {
        basics: {
          fullName: 'A. Nonymous',
          headline: '", "work": [{"company": "Not A Real Employer"}], "x": "',
        },
        work: [{ company: 'Real Employer', role: 'Editor' }],
      },
    })
    const seen = run(hostile)
    // Reads basics, then work — once, from the real key, with one entry.
    expect(
      seen.map((s) => s.key).filter((k, i, all) => all.indexOf(k) === i),
    ).toEqual(['basics', 'work'])
    expect(
      Math.max(...seen.filter((s) => s.key === 'work').map((s) => s.count)),
    ).toBe(1)
  })

  it('is not confused by escaped quotes and backslashes in a value', () => {
    const tricky = JSON.stringify({
      resume: {
        basics: { headline: 'Said "hello" \\ then left' },
        work: [{ role: 'Escapist \\" ' }, { role: 'Second' }],
      },
    })
    const seen = run(tricky)
    expect(
      Math.max(...seen.filter((s) => s.key === 'work').map((s) => s.count)),
    ).toBe(2)
  })

  /** `tool-input.ts` exists because gateways add layers. The scanner searches, so a layer is free. */
  it('finds the sections through a gateway wrapper', () => {
    const wrapped = `{"object":${PAYLOAD}}`
    const keys = run(wrapped).map((s) => s.key)
    expect(keys).toContain('work')
    expect(
      Math.max(
        ...run(wrapped)
          .filter((s) => s.key === 'work')
          .map((s) => s.count),
      ),
    ).toBe(3)
  })

  it('survives a stream that stops in the middle', () => {
    for (const cut of [1, 40, 120, 400, PAYLOAD.length - 1]) {
      expect(() => run(PAYLOAD.slice(0, cut))).not.toThrow()
    }
  })

  it('survives bytes that are not JSON at all', () => {
    expect(() => run('}}]],,,:::"""\\')).not.toThrow()
    expect(run('not json at all')).toEqual([])
  })
})

describe('countLabel', () => {
  it('says nothing until there is something to count', () => {
    expect(countLabel('work', 0)).toBeUndefined()
  })

  it('agrees with itself about singular and plural', () => {
    expect(countLabel('work', 1)).toBe('1 role so far')
    expect(countLabel('work', 4)).toBe('4 roles so far')
    expect(countLabel('education', 1)).toBe('1 entry so far')
    expect(countLabel('education', 2)).toBe('2 entries so far')
  })

  it('counts nothing for the section that is not a list', () => {
    expect(countLabel('basics', 3)).toBeUndefined()
  })
})
