/**
 * Flags must stay on the row they were measured from.
 *
 * The mechanism this protects is the product's central claim: a marked field means "we were not sure we
 * read this correctly", and the user is asked to trust that. Once an index-based path can drift onto a
 * different row, a mark means nothing — and the failure is invisible, because a flag on the wrong row
 * looks exactly like a flag on the right one.
 */
import { describe, expect, it } from 'vitest'
import { shiftProvenance } from '../provenance'
import type { FieldProvenance } from '../provenance'

const at = (path: string, confidence = 0.5): FieldProvenance => ({
  path,
  confidence,
  inferred: false,
})

const paths = (list: Array<FieldProvenance>) => list.map((p) => p.path)

describe('removing a row', () => {
  it('takes that row’s flags with it and pulls the later ones down', () => {
    const before = [
      at('work.0.role'),
      at('work.1.role'),
      at('work.1.company'),
      at('work.2.role'),
    ]
    expect(paths(shiftProvenance(before, 'work', 1, -1))).toEqual([
      'work.0.role',
      'work.1.role', // was work.2
    ])
  })

  it('leaves earlier rows untouched', () => {
    const before = [at('work.0.role'), at('work.5.role')]
    expect(paths(shiftProvenance(before, 'work', 5, -1))).toEqual([
      'work.0.role',
    ])
  })

  it('handles a nested path, not just a direct field', () => {
    // `work.1.highlights.2` is the shape a bullet's provenance actually takes.
    const before = [at('work.0.highlights.0'), at('work.2.highlights.3')]
    expect(paths(shiftProvenance(before, 'work', 1, -1))).toEqual([
      'work.0.highlights.0',
      'work.1.highlights.3',
    ])
  })
})

describe('inserting a row', () => {
  it('pushes the rows at and after the insertion point up', () => {
    const before = [at('work.0.role'), at('work.1.role')]
    expect(paths(shiftProvenance(before, 'work', 1, 1))).toEqual([
      'work.0.role',
      'work.2.role',
    ])
  })

  it('gives the new row no flags of its own', () => {
    /**
     * The assertion that matters most here. A row the person typed was not extracted from anything, so
     * there is no confidence to report — and inheriting the displaced row's score would be inventing a
     * measurement, which is the same act `optimize/fabrication.ts` exists to prevent.
     */
    const after = shiftProvenance([at('work.0.role', 0.4)], 'work', 0, 1)
    expect(paths(after)).toEqual(['work.1.role'])
    expect(after.some((p) => p.path.startsWith('work.0.'))).toBe(false)
  })
})

describe('what it refuses to touch', () => {
  it('ignores other lists entirely', () => {
    const before = [at('work.1.role'), at('education.1.institution')]
    expect(paths(shiftProvenance(before, 'work', 0, -1))).toEqual([
      'work.0.role',
      'education.1.institution',
    ])
  })

  it('ignores a path whose segment is not an index', () => {
    // `basics.fullName` shares no prefix with a list; `work.length` would be a bug upstream, and
    // guessing at it would move a flag onto a real row.
    const before = [at('basics.fullName'), at('work.length')]
    expect(paths(shiftProvenance(before, 'work', 0, 1))).toEqual([
      'basics.fullName',
      'work.length',
    ])
  })

  it('does not confuse a prefix with a longer list name', () => {
    // `workshops` starts with `work`. Without the trailing dot in the prefix check, editing `work`
    // would silently renumber a different section.
    const before = [at('workshops.2.title')]
    expect(paths(shiftProvenance(before, 'work', 0, -1))).toEqual([
      'workshops.2.title',
    ])
  })
})

describe('a round trip', () => {
  it('insert then remove at the same point restores every path', () => {
    const before = [at('work.0.role'), at('work.1.role'), at('work.2.role')]
    const inserted = shiftProvenance(before, 'work', 1, 1)
    const removed = shiftProvenance(inserted, 'work', 1, -1)
    expect(paths(removed)).toEqual(paths(before))
  })
})
