/**
 * Poll `/api/result` until the answer lands, or until waiting stops being reasonable.
 *
 * The client half of `job-result.ts`. A long job answers with an id in milliseconds; this is how the
 * page turns that id back into an answer.
 *
 * ## The interval is not a guess
 *
 * 700ms, matching the narration poll the same screen already runs, so the two settle into one rhythm
 * rather than two overlapping ones. A `204` costs a header and nothing else.
 *
 * ## Why there is a ceiling at all
 *
 * Measured against production on 2026-08-18, an advert read took 101s and then 52s on the local
 * model — a 2x spread between two identical requests a minute apart. A ceiling of four minutes is
 * roughly twice the slow end, which is the shape of "generous but finite". Without one, a job that
 * dies server-side leaves the page polling until the tab closes, showing progress that will never
 * advance, which is worse than an error.
 *
 * **Giving up here does not cancel anything.** The work may still finish and the result will expire
 * unread. That is deliberate: cancelling would mean a second endpoint and a way to address somebody
 * else's job, and the cost of not cancelling is one wasted model call on our own hardware.
 */

export type Collected = { value: unknown } | { error: string; message: string }

const INTERVAL_MS = 700
const CEILING_MS = 4 * 60 * 1000

/** `undefined` means the ceiling was reached. An `error` means the job itself failed and said why. */
export async function collectResult(
  id: string,
  { fetcher = fetch, now = Date.now } = {},
): Promise<Collected | undefined> {
  const deadline = now() + CEILING_MS

  while (now() < deadline) {
    let response: Response
    try {
      response = await fetcher(`/api/result?id=${encodeURIComponent(id)}`)
    } catch {
      /*
        A dropped poll is not a failed job. A phone changing network mid-wait would otherwise throw
        away an answer that is sitting on the server ready to be read.
      */
      await sleep(INTERVAL_MS)
      continue
    }

    // 204: not finished. The only expected answer for most of the wait.
    if (response.status === 204) {
      await sleep(INTERVAL_MS)
      continue
    }

    const body = (await response.json().catch(() => undefined)) as
      Record<string, unknown> | undefined

    if (!response.ok) {
      return {
        error: typeof body?.error === 'string' ? body.error : 'failed',
        message:
          typeof body?.message === 'string'
            ? body.message
            : 'That did not work. Your CV is untouched.',
      }
    }

    return { value: body }
  }

  return undefined
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
