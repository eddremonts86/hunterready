import { describe, expect, it } from 'vitest'
import { shiftTarget, shiftTargets } from '@/optimize/rewrite-shift'

/** A suggestion shaped like the real ones, with a marker so the assertions read. */
const at = (workIndex: number, highlightIndex: number, name?: string) => ({
  workIndex,
  highlightIndex,
  original: name ?? `bullet ${workIndex}.${highlightIndex}`,
})

describe('shifting rewrite coordinates through structural edits', () => {
  it('removing a work row drops its suggestions and renumbers the rows below', () => {
    const open = [at(0, 0), at(1, 0), at(1, 2), at(2, 1)]
    const shifted = shiftTargets(open, { kind: 'work-row', at: 1, delta: -1 })
    expect(shifted).toEqual([at(0, 0), { ...at(2, 1), workIndex: 1 }])
  })

  it('inserting a work row shifts everything at and below the insertion point', () => {
    const open = [at(0, 0), at(1, 1)]
    const shifted = shiftTargets(open, { kind: 'work-row', at: 1, delta: 1 })
    expect(shifted).toEqual([at(0, 0), { ...at(1, 1), workIndex: 2 }])
  })

  it('removing a bullet drops its suggestion and renumbers only within that job', () => {
    const open = [at(0, 0), at(0, 1), at(0, 2), at(1, 1)]
    const shifted = shiftTargets(open, {
      kind: 'work-bullet',
      workIndex: 0,
      at: 1,
      delta: -1,
    })
    expect(shifted).toEqual([
      at(0, 0),
      { ...at(0, 2), highlightIndex: 1 },
      // The other job is exactly as true as before the edit.
      at(1, 1),
    ])
  })

  it('appending a bullet moves nothing — nothing sits at or after the end', () => {
    const open = [at(0, 0), at(0, 1)]
    const shifted = shiftTargets(open, {
      kind: 'work-bullet',
      workIndex: 0,
      at: 2,
      delta: 1,
    })
    expect(shifted).toEqual(open)
  })

  it('undoing a row removal (re-insert) restores the original coordinates', () => {
    // The review form's undo re-inserts the removed row at its old position.
    const open = [at(0, 0), at(1, 0), at(2, 1)]
    const removed = shiftTargets(open, { kind: 'work-row', at: 1, delta: -1 })
    const restored = shiftTargets(removed, {
      kind: 'work-row',
      at: 1,
      delta: 1,
    })
    // The deleted row's own suggestion is gone for good; everything else is back where it was.
    expect(restored).toEqual([at(0, 0), at(2, 1)])
  })

  it('the regression this file exists for: accept after a deletion writes the RIGHT bullet', () => {
    /*
      The misfire: suggestions were fetched for work[1].highlights[0]; the person deletes work[0];
      without shifting, accepting would write into the NEW work[1] — a different job entirely.
    */
    const resume = {
      work: [
        { company: 'A', highlights: ['a0'] },
        { company: 'B', highlights: ['b0'] },
      ],
    }
    const suggestion = { ...at(1, 0, 'b0'), suggestion: 'b0 improved' }

    // The person removes job A.
    const workAfter = resume.work.filter((_, i) => i !== 0)
    const [shifted] = shiftTargets([suggestion], {
      kind: 'work-row',
      at: 0,
      delta: -1,
    })

    expect(shifted).toBeDefined()
    const targeted =
      workAfter[shifted.workIndex].highlights[shifted.highlightIndex]
    // The coordinates still point at the bullet the model actually read.
    expect(targeted).toBe(suggestion.original)
  })

  it('shiftTarget returns undefined only for the removed row or bullet itself', () => {
    expect(
      shiftTarget(at(1, 0), { kind: 'work-row', at: 1, delta: -1 }),
    ).toBeUndefined()
    expect(
      shiftTarget(at(0, 2), {
        kind: 'work-bullet',
        workIndex: 0,
        at: 2,
        delta: -1,
      }),
    ).toBeUndefined()
    expect(
      shiftTarget(at(0, 2), {
        kind: 'work-bullet',
        workIndex: 1,
        at: 2,
        delta: -1,
      }),
    ).toEqual(at(0, 2))
  })
})
