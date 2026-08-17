/**
 * The matcher that reads the model's reasoning and reports a section.
 *
 * The fixtures below are real: they are reasoning deltas captured from MiniMax while it extracted an
 * invented CV during the measurement that motivated this file. They are what the matcher actually has
 * to work with — clipped, ungrammatical, jumping between sections mid-sentence.
 *
 * The load-bearing test is the last one. Every fixture here contains a name, an employer and a date
 * range, because that is what a model reasoning about a CV writes; the matcher must emit section keys
 * and nothing that could carry any of it.
 */
import { describe, expect, it } from 'vitest'
import { NARRATION } from '../narrate'
import type { NarrationKey } from '../narrate'
import { watchReasoning } from '../reasoning'

/** Captured verbatim from a streamed extraction (probe3, MiniMax-M3, thinking enabled). */
const REAL_DELTAS = [
  'We need must',
  ' call submit_cv. Need format. Name Ana Ruiz Delgado. Work three entries. Role "Registered ',
  ' work unless current designation? Need faithfully extract. submit schema basics fullName a',
  ' company role highlights. We can include 2019-2026 Shift Lead Nurse, ICU, Hospital Norte, ',
  ' Sur. 2012-2015 Nurse, General Surgical Ward, Cruz Roja. Education, skills unavailable in ',
]

function run(fragments: Array<string>): Array<NarrationKey> {
  const seen: Array<NarrationKey> = []
  const watch = watchReasoning((key) => seen.push(key))
  for (const fragment of fragments) watch.push(fragment)
  return seen
}

describe('watchReasoning', () => {
  it('follows real reasoning through the sections it names', () => {
    const seen = run(REAL_DELTAS)
    expect(seen.length).toBeGreaterThan(1)
    expect(seen).toContain('work')
    expect(seen).toContain('education')
  })

  it('says nothing at all until it recognises something', () => {
    expect(run(['We need must', ' hmm, let me see. Okay.'])).toEqual([])
  })

  it('reports a section once, not once per fragment', () => {
    const seen = run([
      'the work history',
      ' more about the job',
      ' still the employer',
    ])
    expect(seen).toEqual(['work'])
  })

  it('reports it again when the model comes back to it', () => {
    expect(
      run(['the work history', ' now the degree', ' back to the employer']),
    ).toEqual(['work', 'education', 'work'])
  })

  it('matches a cue split across two deltas', () => {
    // 200 deltas per request; a word landing on the boundary is not hypothetical.
    expect(run(['Now the educ', 'ation section'])).toEqual(['education'])
  })

  it('reads a section that the reasoning names in its own words', () => {
    expect(run(['she studied at the university until 2008'])).toEqual([
      'education',
    ])
    expect(run(['no certifications are listed anywhere'])).toEqual([
      'certifications',
    ])
    expect(run(['it is not clear which employer this was'])).toEqual([
      'provenance',
    ])
  })

  it('emits nothing but keys the label table can draw', () => {
    for (const key of run(REAL_DELTAS)) {
      expect(Object.keys(NARRATION)).toContain(key)
    }
  })

  /**
   * The whole reason this file exists rather than a pipe.
   *
   * The captured deltas contain a full name, three employers and four date ranges. What comes out has
   * to be keys — not a substring of the input, not a redaction of it, not a length. This asserts the
   * output is drawn from the closed table and touches nothing in the text.
   */
  it('lets no fragment of the reasoning through, only keys', () => {
    const secrets = [
      'Ana Ruiz Delgado',
      'Hospital Norte',
      'Cruz Roja',
      '2019-2026',
      '2012-2015',
      'ICU',
    ]
    const emitted = run(REAL_DELTAS)
    const wire = JSON.stringify(emitted)
    for (const secret of secrets) {
      expect(wire).not.toContain(secret)
      expect(wire.toLowerCase()).not.toContain(secret.toLowerCase())
    }
    // Positively: every emission is a key of the fixed table, so there is nowhere for text to hide.
    expect(emitted.every((key) => key in NARRATION)).toBe(true)
  })

  it('cannot be made to emit anything by hostile document text', () => {
    // A CV bullet that quotes our own schema is a real shape; it may move the marker, never more.
    const emitted = run([
      'the bullet reads: {"leak": "Ana Ruiz Delgado", "work": "Hospital Norte"}',
    ])
    expect(emitted.every((key) => key in NARRATION)).toBe(true)
    expect(JSON.stringify(emitted)).not.toContain('Ana')
  })
})
