import { describe, expect, it } from 'vitest'
import {
  isProgressId,
  progressDetail,
  progressEnd,
  progressGet,
  progressNote,
  progressNoter,
  progressReporter,
  progressStep,
} from '@/lib/progress'

const id = () => crypto.randomUUID()

describe('the live-progress store', () => {
  it('narrates a sequence: each new step closes the previous one', () => {
    const key = id()
    progressStep(key, 'Opening the file')
    progressStep(key, 'Reading the scanned pages', 'page 1 of 3')
    const steps = progressGet(key)
    expect(steps.map((s) => s.done)).toEqual([true, false])
    expect(steps[1].detail).toBe('page 1 of 3')
  })

  it('updates the running step detail without adding steps', () => {
    const key = id()
    progressStep(key, 'Reading the scanned pages', 'page 1 of 3')
    progressDetail(key, 'page 2 of 3')
    const steps = progressGet(key)
    expect(steps).toHaveLength(1)
    expect(steps[0].detail).toBe('page 2 of 3')
  })

  it('marks everything done at the end', () => {
    const key = id()
    progressStep(key, 'Opening the file')
    progressStep(key, 'Checking nothing was invented')
    progressEnd(key)
    expect(progressGet(key).every((s) => s.done)).toBe(true)
  })

  it('refuses ids that are not uuid-shaped, rather than sanitising them', () => {
    /*
      The id is the only client-controlled string that touches this store. Refusing anything odd is
      cheaper and safer than trusting a sanitiser — there is no legitimate id a browser's randomUUID
      cannot produce.
    */
    expect(isProgressId('../../etc/passwd')).toBe(false)
    expect(isProgressId('a'.repeat(65))).toBe(false)
    expect(isProgressId('short')).toBe(false)
    expect(isProgressId(crypto.randomUUID())).toBe(true)
    progressStep('nope!', 'Opening the file')
    expect(progressGet('nope!')).toEqual([])
  })

  it('a reporter bound to no id is a silent no-op', () => {
    // The pipelines call the reporter unconditionally; an upload without a progress field must not throw.
    const report = progressReporter(undefined)
    expect(() => report('Opening the file')).not.toThrow()
  })

  it('never accepts free text as a detail by design — the API takes labels and counts', () => {
    /*
      Documentation-as-test: the store's privacy property is structural. Labels are fixed strings in
      this repo; details are counts formatted by the pipelines. If someone adds a call that narrates
      content, it will be visible in review as a string literal with interpolation — this test is the
      standing reminder of what the channel is for (docs/07: no CV content beyond the owner's screen).
    */
    const key = id()
    progressStep(key, 'Reading the scanned pages', `page ${2} of ${3}`)
    expect(progressGet(key)[0].detail).toBe('page 2 of 3')
  })
})

describe('the sub-narration of the model call', () => {
  const structuring = (key: string) =>
    progressStep(key, 'The model is reading your CV and structuring it')

  it('hangs the sections off the running step instead of adding rows', () => {
    const key = id()
    progressStep(key, 'Opening the file')
    structuring(key)
    progressNote(key, 'basics', 0)
    progressNote(key, 'work', 2)
    expect(progressGet(key)).toHaveLength(2)
    expect(progressGet(key)[1].notes).toEqual([
      { key: 'basics', count: 0, done: true },
      { key: 'work', count: 2, done: false },
    ])
  })

  it('moves the count of the open section without opening another', () => {
    const key = id()
    structuring(key)
    progressNote(key, 'work', 1)
    progressNote(key, 'work', 2)
    progressNote(key, 'work', 3)
    expect(progressGet(key)[0].notes).toEqual([
      { key: 'work', count: 3, done: false },
    ])
  })

  it('never walks a count backwards, whatever the stream replays', () => {
    const key = id()
    structuring(key)
    progressNote(key, 'work', 4)
    progressNote(key, 'work', 1)
    expect(progressGet(key)[0].notes?.[0].count).toBe(4)
  })

  it('lights an existing row again instead of adding a second one', () => {
    /*
      Reasoning wanders — work, then a date, then back to work — and the writing pass afterwards reports
      every section a second time. Appending each report would draw a repeating list that says nothing
      about where the work is.
    */
    const key = id()
    structuring(key)
    progressNote(key, 'work', 0)
    progressNote(key, 'education', 0)
    progressNote(key, 'work', 0)
    const notes = progressGet(key)[0].notes ?? []
    expect(notes.map((n) => n.key)).toEqual(['work', 'education'])
    expect(notes.find((n) => n.key === 'work')?.done).toBe(false)
    expect(notes.find((n) => n.key === 'education')?.done).toBe(true)
  })

  it('keeps exactly one section open at a time', () => {
    const key = id()
    structuring(key)
    for (const section of ['basics', 'work', 'education', 'skills'] as const) {
      progressNote(key, section, 0)
    }
    expect(
      (progressGet(key)[0].notes ?? []).filter((n) => !n.done),
    ).toHaveLength(1)
  })

  it('keeps a count the writing pass reported when reasoning revisits the section', () => {
    // The reasoning watcher has no counts and reports 0. It must not blank a real number.
    const key = id()
    structuring(key)
    progressNote(key, 'work', 5)
    progressNote(key, 'work', 0)
    expect(progressGet(key)[0].notes?.[0].count).toBe(5)
  })

  it('starts the narration over when the model has another go', () => {
    /*
      A repair round re-runs the whole tool call, so the sections arrive again from the top. Keeping the
      first attempt's notes would draw a second run as though it were resuming — "your skills" already
      ticked while the model is back at the name.
    */
    const key = id()
    structuring(key)
    progressNote(key, 'basics', 0)
    progressNote(key, 'work', 3)
    structuring(key)
    expect(progressGet(key)).toHaveLength(1)
    expect(progressGet(key)[0].detail).toBe('attempt 2')
    expect(progressGet(key)[0].notes).toBeUndefined()
  })

  it('closes the open section when the work ends', () => {
    const key = id()
    structuring(key)
    progressNote(key, 'work', 2)
    progressEnd(key)
    expect(progressGet(key)[0].notes?.every((note) => note.done)).toBe(true)
  })

  it('ignores notes arriving with no step to hang them on, or after the end', () => {
    const key = id()
    expect(() => progressNote(key, 'work', 1)).not.toThrow()
    expect(progressGet(key)).toEqual([])
    structuring(key)
    progressEnd(key)
    progressNote(key, 'work', 1)
    expect(progressGet(key)[0].notes).toBeUndefined()
  })

  it('a noter bound to no id is a silent no-op', () => {
    expect(() => progressNoter(undefined)('work', 3)).not.toThrow()
  })
})
