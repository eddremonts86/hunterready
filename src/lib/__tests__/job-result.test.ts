/**
 * The store a whole CV now passes through, and the four promises its own docstring makes about it.
 *
 * `job-result.ts` was written for a targeting result and shipped untested, which was defensible while
 * the worst thing in it was a list of requirements pulled out of a public job advert. Plan 04 block 3
 * puts the **`Resume`** in here — a name, an email, a phone number, twelve employers — for as long as
 * it takes a phone to poll for it. A module holding that should not be the one module whose promises
 * are only prose.
 *
 * Each test below is one sentence from that docstring, asked as a question.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearResults, collect, fail, finish } from '../job-result'

/** Shaped like the client's `crypto.randomUUID()`, which is the only thing the store accepts. */
const ID = 'b7c1f0de-4a2e-4c88-9f31-0a2c5d6e7f80'
const OTHER = 'c8d2e1ef-5b3f-4d99-8e42-1b3d6e7f8091'

beforeEach(() => clearResults())
afterEach(() => {
  clearResults()
  vi.useRealTimers()
})

describe('read once', () => {
  it('hands the answer over exactly one time', () => {
    finish(ID, { resume: { basics: { fullName: 'Anneli Sørensen' } } })

    const first = collect(ID)
    expect(first).toMatchObject({ ok: true })

    /*
      The second read is the one that matters. A CV that stays readable after it has been collected
      is a CV sitting in memory for anybody who learns the id — and the id travels in a URL, which
      is the least private place a string can be.
    */
    expect(collect(ID)).toBeUndefined()
  })

  it('tells two jobs apart', () => {
    finish(ID, { value: 'mine' })
    finish(OTHER, { value: 'yours' })

    expect(collect(ID)).toMatchObject({ ok: true, value: { value: 'mine' } })
    expect(collect(OTHER)).toMatchObject({
      ok: true,
      value: { value: 'yours' },
    })
  })
})

describe('undefined means "not yet", and nothing else', () => {
  it('says the same thing for a job still running and an id that never existed', () => {
    /*
      Deliberately indistinguishable. Telling them apart would mean keeping a record of every id ever
      seen, which is a log of who used the product — the thing docs/07 exists to prevent. The client
      polls until it gets something or gives up on its own clock.
    */
    expect(collect(ID)).toBeUndefined()
    expect(collect(OTHER)).toBeUndefined()
  })
})

describe('a failure is a result too', () => {
  it('keeps the status, the code and the sentence a person reads', () => {
    fail(ID, 422, 'unreadable_pdf', 'That PDF is a scan we could not read.')

    expect(collect(ID)).toMatchObject({
      ok: false,
      status: 422,
      error: 'unreadable_pdf',
      message: 'That PDF is a scan we could not read.',
    })
  })

  it('is collected once, like any other result', () => {
    fail(ID, 502, 'model_unreachable', 'The model did not answer.')
    expect(collect(ID)).toMatchObject({ ok: false })
    expect(collect(ID)).toBeUndefined()
  })
})

describe('five minutes, and then it is gone', () => {
  it('expires a result nobody came back for', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-19T10:00:00.000Z'))
    finish(ID, { resume: 'personal data' })

    // Four minutes: a slow phone on a bad network is still within its rights.
    vi.setSystemTime(new Date('2026-08-19T10:04:00.000Z'))
    expect(collect(ID)).toMatchObject({ ok: true })

    finish(ID, { resume: 'personal data' })
    /*
      Six. ADR-004 promises an anonymous visitor's CV is not stored, and "not stored" has to have a
      number behind it or it is a sentence in a document.
    */
    vi.setSystemTime(new Date('2026-08-19T10:10:00.000Z'))
    expect(collect(ID)).toBeUndefined()
  })

  it('expires results a caller never asks about, not just the one being read', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-19T10:00:00.000Z'))
    finish(OTHER, { resume: 'abandoned' })

    vi.setSystemTime(new Date('2026-08-19T10:10:00.000Z'))
    /*
      Collecting a *different* id has to sweep the abandoned one. Otherwise a tab closed mid-upload
      leaves a CV in memory until the process restarts, and the commonest way a CV is abandoned is
      precisely that nobody ever asks for it again.
    */
    expect(collect(ID)).toBeUndefined()
    expect(collect(OTHER)).toBeUndefined()
  })
})

describe('a runaway client cannot grow the map without bound', () => {
  it('drops the oldest once past the cap', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const base = new Date('2026-08-19T10:00:00.000Z').getTime()

    // 201 results, each a second apart so "oldest" is unambiguous. The cap is 200.
    for (let i = 0; i < 201; i++) {
      vi.setSystemTime(new Date(base + i * 1000))
      finish(`job-${String(i).padStart(4, '0')}-aaaa`, { n: i })
    }

    vi.setSystemTime(new Date(base + 201 * 1000))
    expect(collect('job-0000-aaaa'), 'the oldest should have fallen out').toBe(
      undefined,
    )
    expect(collect('job-0200-aaaa')).toMatchObject({ ok: true })
  })
})

describe('the id has to look like an id', () => {
  it('returns nothing for a shape it did not mint', () => {
    /*
      Not sanitised — refused. The ids are `crypto.randomUUID()`, and an unguessable one is what
      stands between two visitors' results, so anything that is not shaped like one is a caller
      doing something other than collecting their own answer.
    */
    for (const bad of ['', 'short', '../../etc/passwd', 'a'.repeat(65)]) {
      finish(bad, { resume: 'must not be stored' })
      expect(collect(bad), `"${bad}" was accepted`).toBeUndefined()
    }
  })

  it('does not store it either, which the test above cannot see', () => {
    /*
      Written after the obvious version of this test passed with the guard deleted from `finish`.

      `collect` refuses a bad id too, so "never stored" and "stored but unreadable" look identical
      from outside — and they are not identical: the second leaves a CV in a map under a key the
      caller chose, for as long as the sweep takes to notice. Prose said the guard was there and
      nothing failed when it was removed, which is the definition of a rule with no proof.

      So this asks the one question that distinguishes them. The cap is 200 and `sweep()` runs on
      the way in, so a 201st entry evicts the oldest. Fill the map exactly, then hand it a bad id:
      if it was refused, the map is still 200 and the oldest survives. If it was stored, the oldest
      is gone.
    */
    vi.useFakeTimers({ toFake: ['Date'] })
    const base = new Date('2026-08-19T10:00:00.000Z').getTime()

    for (let i = 0; i < 200; i++) {
      vi.setSystemTime(new Date(base + i * 1000))
      finish(`job-${String(i).padStart(4, '0')}-aaaa`, { n: i })
    }

    vi.setSystemTime(new Date(base + 200 * 1000))
    finish('..', { resume: 'must not take a slot' })
    fail('..', 500, 'nope', 'must not take a slot either')

    vi.setSystemTime(new Date(base + 201 * 1000))
    expect(
      collect('job-0000-aaaa'),
      'a refused id took a slot, so it was stored after all',
    ).toMatchObject({ ok: true })
  })
})
