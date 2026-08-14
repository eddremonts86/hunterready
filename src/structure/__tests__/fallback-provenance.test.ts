/**
 * The flags have to point at fields that exist.
 *
 * This is the gap a whole class of bug lived in. `extractByRules` keyed its notes on `entry.index` —
 * which is the **line number in the source document**, not the row's position in the resume — so a
 * three-job CV emitted `work.36`, `work.42`, `work.46`. Every accuracy test still passed, because the
 * extracted *data* was fine; only the marks were wrong, and nothing asserted anything about those.
 *
 * The visible result was worse than no marks. `sectionFlagged('work')` matches on the prefix, so the
 * Experience header said "needs a look" while every field inside it looked confident, and the counter
 * reported "3 of 9 fields we read" about paths that resolved to nothing. The product asks people to
 * trust that a mark means something.
 *
 * So the assertion here is not about any particular confidence value. It is that every path resolves.
 */
import { describe, expect, it } from 'vitest'
import { extractByRules } from '../fallback'

/** Walk a dot path into the resume. `undefined` means the flag points at nothing. */
function resolve(root: unknown, path: string): unknown {
  let node: unknown = root
  for (const segment of path.split('.')) {
    if (node === null || node === undefined) return undefined
    if (Array.isArray(node)) {
      const index = Number(segment)
      if (!Number.isInteger(index)) return undefined
      node = node[index]
      continue
    }
    if (typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[segment]
  }
  return node
}

/**
 * A CV in the shape the rules path actually meets: `## ` section markers, an entry title, a date line,
 * bullets. Three jobs and two qualifications, deliberately far down the document so a line-number bug
 * produces an index nowhere near a real row.
 */
const CV = `Marta Sorensen
Registered Nurse
marta@example.org

## Experience
Shift Lead Nurse — Rigshospitalet
Mar 2019 – Present
- Led nursing handover for a 24-bed unit.
- Precepted 14 newly graduated nurses.

Nurse, Post-Operative Recovery — Herlev Hospital
Jan 2016 – Feb 2019
- Recovered post-surgical patients.

Nurse, General Surgical Ward
Aug 2014 – Dec 2015
- Cared for a 28-bed general surgical ward.

## Education
BSc Nursing
2011 – 2014
Kobenhavns Professionshojskole

Vocational diploma
2009 – 2011
Teknisk Skole

## Skills
Clinical: Intensive care, Ventilator management, Triage
Leadership: Shift leadership, Preceptorship
`

describe('every flag points at a field that exists', () => {
  const { resume, provenance } = extractByRules(CV)

  it('read the document it was given', () => {
    // Guards the guard: if the fixture stopped parsing, the assertions below would pass on an empty set.
    expect(resume.work.length).toBeGreaterThanOrEqual(3)
    expect(resume.education.length).toBeGreaterThanOrEqual(2)
    expect(resume.skills.length).toBeGreaterThanOrEqual(2)
    expect(provenance.length).toBeGreaterThan(0)
  })

  it('resolves every single path', () => {
    const dangling = provenance
      .map((entry) => entry.path)
      .filter((path) => resolve(resume, path) === undefined)
    expect(dangling).toEqual([])
  })

  it('never emits a row index past the end of its list', () => {
    /**
     * The specific shape of the old bug: `work.36` on a CV with three jobs. Stated separately from the
     * resolve check because a path can also dangle by naming a field that is merely absent, and this is
     * the one that was systematic.
     */
    const lists: Record<string, number> = {
      work: resume.work.length,
      education: resume.education.length,
      skills: resume.skills.length,
    }
    for (const { path } of provenance) {
      const [list, index] = path.split('.')
      const size = lists[list ?? '']
      if (size === undefined) continue
      expect(Number(index), `${path} with only ${size} rows`).toBeLessThan(size)
    }
  })

  it('names a field, not just a row', () => {
    // `work.0` on its own cannot be shown next to anything: the form looks up `work.0.role`. A bare
    // row path is how a note becomes invisible while still counting towards "fields to check".
    for (const { path } of provenance) {
      if (/^(work|education|skills)\./.test(path)) {
        expect(path.split('.').length, path).toBeGreaterThanOrEqual(3)
      }
    }
  })
})

describe('what the flags say', () => {
  const { provenance } = extractByRules(CV)
  const at = (path: string) => provenance.find((p) => p.path === path)

  it('marks the third job, which a line-number path could never reach', () => {
    expect(at('work.2.role')).toBeDefined()
  })

  it('marks education on the institution, which is the guess', () => {
    // Which line is the school and which is the qualification is genuinely ambiguous in a date-first
    // block, so the flag belongs on the field the person is being asked to check.
    expect(at('education.0.institution')?.inferred).toBe(true)
  })

  it('marks each skill group separately, at strong confidence for a Category: line', () => {
    expect(at('skills.0.items')).toBeDefined()
    expect(at('skills.1.items')).toBeDefined()
    expect(at('skills.0.items')?.inferred).toBe(false)
  })
})
