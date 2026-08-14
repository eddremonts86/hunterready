import { describe, expect, it } from 'vitest'
import {
  isProgressId,
  progressDetail,
  progressEnd,
  progressGet,
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
