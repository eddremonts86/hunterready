/**
 * Where a long job leaves its answer, so the request that started it does not have to wait.
 *
 * ## Why this is not in `progress.ts`
 *
 * That module holds the narration, and it says of itself that it carries "stage labels and counts
 * only — never a name, never a bullet", with **no API for putting free text in, so the next
 * contributor cannot accidentally narrate a phone number**. A targeting result is CV content. Putting
 * it there would quietly turn a guarantee enforced by the compiler into one enforced by care.
 *
 * So: two stores, one id. The narration stays content-free and provable. This one holds content and
 * says so at the top, which is the only honest way to have both.
 *
 * ## What protects the content that is in here
 *
 * - **Memory only.** Never a disk, never a log, never a database. A restart loses it, and losing it
 *   is a retry rather than a leak.
 * - **Five minutes.** Shorter than the narration's ten: a result is collected within seconds of being
 *   written or the person has closed the tab. ADR-004 promises an anonymous visitor's CV is not
 *   stored, and five minutes of process memory is the shortest window that keeps that true while
 *   still letting a slow phone poll for it.
 * - **Read once.** Collecting deletes. A second read gets nothing, so a result cannot sit around
 *   being re-fetched by anybody who learns the id.
 * - **The id is the client's own `crypto.randomUUID()`**, already generated for the progress channel
 *   and already travelling on the request. Nothing here invents a handle, and an unguessable one is
 *   what stands between two visitors' results.
 *
 * ## Why a store and not a queue
 *
 * One box, one request at a time (`OLLAMA_NUM_PARALLEL: '1'`). A queue service would be
 * infrastructure introduced to fix the shape of a response, which is the expensive version of this.
 */
import { isProgressId } from './progress'

/** Five minutes. See the note above about why it is shorter than the narration's ten. */
const TTL_MS = 5 * 60 * 1000

/** A runaway client cannot grow the map without bound. Oldest out first. */
const MAX_ENTRIES = 200

type Finished =
  | { ok: true; value: unknown; at: number }
  | { ok: false; status: number; error: string; message: string; at: number }

const results = new Map<string, Finished>()

function sweep(): void {
  const now = Date.now()
  for (const [id, r] of results) {
    if (now - r.at > TTL_MS) results.delete(id)
  }
  if (results.size > MAX_ENTRIES) {
    const oldest = [...results.entries()].sort((a, b) => a[1].at - b[1].at)
    for (const [id] of oldest.slice(0, results.size - MAX_ENTRIES)) {
      results.delete(id)
    }
  }
}

export function finish(id: string, value: unknown): void {
  if (!isProgressId(id)) return
  sweep()
  results.set(id, { ok: true, value, at: Date.now() })
}

/**
 * A failure is a result too.
 *
 * Without this a client polling for an answer that will never come waits until its own timeout and
 * then says "we could not reach the server", which is both wrong and the least useful thing it could
 * say. `message` is the sentence a person reads, written by the handler; it never quotes the request.
 */
export function fail(
  id: string,
  status: number,
  error: string,
  message: string,
): void {
  if (!isProgressId(id)) return
  sweep()
  results.set(id, { ok: false, status, error, message, at: Date.now() })
}

/** Collect and delete. `undefined` means "not finished yet", which is not the same as "no such job". */
export function collect(id: string): Finished | undefined {
  if (!isProgressId(id)) return undefined
  sweep()
  const found = results.get(id)
  if (found !== undefined) results.delete(id)
  return found
}

/** For tests, and for nothing else. */
export function clearResults(): void {
  results.clear()
}
