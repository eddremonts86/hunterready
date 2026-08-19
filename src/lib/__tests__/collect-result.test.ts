/**
 * Polling for an answer that arrives late, fails, or never comes.
 *
 * Every branch here is a way the wait can end, and three of the four are the unhappy ones. That
 * ratio is the point: the happy path was already working when the request was synchronous, and
 * detaching it is only an improvement if the failures are handled better than a dropped connection
 * handled them.
 *
 * A fake clock and a fake fetch, so the four-minute ceiling is asserted in milliseconds.
 */
import { describe, expect, it, vi } from 'vitest'

import { collectResult } from '../collect-result'

/** Answers 204 the given number of times, then the payload. */
function fetcherThat(
  notReadyTimes: number,
  final: { status: number; body: unknown },
) {
  let calls = 0
  const fn = async (): Promise<Response> => {
    calls += 1
    if (calls <= notReadyTimes) return new Response(null, { status: 204 })
    return new Response(JSON.stringify(final.body), {
      status: final.status,
      headers: { 'content-type': 'application/json' },
    })
  }
  return Object.assign(fn, { count: () => calls })
}

describe('collectResult', () => {
  it('returns the answer once it lands', async () => {
    vi.useFakeTimers()
    const fetcher = fetcherThat(3, { status: 200, body: { source: 'model' } })
    const promise = collectResult('abcd1234', { fetcher })
    await vi.runAllTimersAsync()
    expect(await promise).toEqual({ value: { source: 'model' } })
    expect(fetcher.count()).toBe(4)
    vi.useRealTimers()
  })

  it('reports a job that failed, rather than waiting out the clock', async () => {
    /*
      Without a stored failure this would poll for four minutes and then say "that took too long",
      which is both wrong and the least useful thing it could say.
    */
    vi.useFakeTimers()
    const fetcher = fetcherThat(1, {
      status: 502,
      body: {
        error: 'target_failed',
        message: 'We could not read that advert.',
      },
    })
    const promise = collectResult('abcd1234', { fetcher })
    await vi.runAllTimersAsync()
    expect(await promise).toEqual({
      error: 'target_failed',
      message: 'We could not read that advert.',
    })
    vi.useRealTimers()
  })

  it('survives a dropped poll, because a lost packet is not a lost job', async () => {
    // A phone changing network mid-wait must not throw away an answer sitting ready on the server.
    vi.useFakeTimers()
    let calls = 0
    const fetcher = async (): Promise<Response> => {
      calls += 1
      if (calls === 1) throw new Error('network changed')
      return new Response(JSON.stringify({ ok: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    const promise = collectResult('abcd1234', { fetcher })
    await vi.runAllTimersAsync()
    expect(await promise).toEqual({ value: { ok: 1 } })
    vi.useRealTimers()
  })

  it('gives up at the ceiling instead of polling until the tab closes', async () => {
    vi.useFakeTimers()
    const always204 = async () => new Response(null, { status: 204 })
    const promise = collectResult('abcd1234', { fetcher: always204 })
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    expect(await promise).toBeUndefined()
    vi.useRealTimers()
  })

  it('refuses nothing itself — the id shape is the server s business', async () => {
    // Two places validating one rule is how they drift. `/api/result` returns 400 and this reports it.
    vi.useFakeTimers()
    const fetcher = fetcherThat(0, {
      status: 400,
      body: { error: 'bad_id', message: 'That is not a job id.' },
    })
    const promise = collectResult('!!', { fetcher })
    await vi.runAllTimersAsync()
    expect(await promise).toMatchObject({ error: 'bad_id' })
    vi.useRealTimers()
  })
})
