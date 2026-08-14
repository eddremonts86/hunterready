/**
 * Live progress for the two long waits — what the server is actually doing, told to the person waiting.
 *
 * ## The complaint this answers
 *
 * "Es difícil esperar 5 minutos sin saber qué está pasando." The local model on our own hardware is the
 * privacy promise (ADR-023) and it is slow — a structuring pass on CPU can take minutes — and the screen
 * showed one spinner and a sentence the whole time. The person waiting had no idea whether anything was
 * happening at all. This store is how the work narrates itself: the ingest pipeline reports each stage as
 * it starts, and the client polls and draws the list.
 *
 * ## Content-free by construction, not by discipline
 *
 * docs/07: no CV content in logs, ever. This store is not a log, but it is server memory holding state
 * about somebody's document, so it holds **stage labels and counts only** — "reading the scan, page 2 of
 * 3", never a name, never a bullet. The labels are fixed strings written here in this repo; the details
 * are numbers. There is deliberately no API for putting free text in, so the next contributor cannot
 * accidentally narrate a phone number.
 *
 * ## Why polling and not SSE
 *
 * The upload is one long POST the client already holds open; a second streaming response would mean two
 * concurrent connections through every proxy between a phone and this server. A 700ms GET against an
 * in-memory map is boring, survives every proxy, and disappears when the POST resolves. Boring wins.
 */

export interface ProgressStep {
  /** A fixed English stage label from this repo. The client localises; the wire stays English. */
  label: string
  /** Counts only — "page 2 of 3". Never free text. */
  detail?: string
  done: boolean
  /** Epoch ms when the step started, so the client can show a truthful elapsed time. */
  at: number
}

interface ProgressState {
  steps: Array<ProgressStep>
  updatedAt: number
}

const store = new Map<string, ProgressState>()

/** Entries older than this are swept. A finished upload's steps are read within seconds or never. */
const TTL_MS = 10 * 60 * 1000

/** A runaway client cannot grow the map without bound. Oldest entries fall out first. */
const MAX_ENTRIES = 500

/** Ids come from `crypto.randomUUID()` on the client. Anything else is refused, not sanitised. */
const ID_SHAPE = /^[a-zA-Z0-9-]{8,64}$/

export function isProgressId(value: unknown): value is string {
  return typeof value === 'string' && ID_SHAPE.test(value)
}

function sweep(): void {
  const now = Date.now()
  for (const [key, state] of store) {
    if (now - state.updatedAt > TTL_MS) store.delete(key)
  }
  if (store.size > MAX_ENTRIES) {
    const oldest = [...store.entries()].sort(
      (a, b) => a[1].updatedAt - b[1].updatedAt,
    )
    for (const [key] of oldest.slice(0, store.size - MAX_ENTRIES)) {
      store.delete(key)
    }
  }
}

/**
 * Start (or restart) a step. The previous step, if any, is marked done — stages are strictly
 * sequential in both pipelines, so "a new one began" and "the last one finished" are the same event.
 */
export function progressStep(id: string, label: string, detail?: string): void {
  if (!isProgressId(id)) return
  sweep()
  const state = store.get(id) ?? { steps: [], updatedAt: 0 }
  const last = state.steps[state.steps.length - 1]
  if (last !== undefined) last.done = true
  state.steps.push({
    label,
    ...(detail === undefined ? {} : { detail }),
    done: false,
    at: Date.now(),
  })
  state.updatedAt = Date.now()
  store.set(id, state)
}

/** Update the current step's detail — the OCR page counter ticking, nothing else changing. */
export function progressDetail(id: string, detail: string): void {
  const state = store.get(id)
  const last = state?.steps[state.steps.length - 1]
  if (state === undefined || last === undefined) return
  last.detail = detail
  state.updatedAt = Date.now()
}

/** The work finished (or failed — the client stops polling either way when its POST resolves). */
export function progressEnd(id: string): void {
  const state = store.get(id)
  if (state === undefined) return
  for (const step of state.steps) step.done = true
  state.updatedAt = Date.now()
}

export function progressGet(id: string): Array<ProgressStep> {
  if (!isProgressId(id)) return []
  return store.get(id)?.steps ?? []
}

/** The reporter the pipelines receive: label + optional count detail. Bound to one id. */
export type ProgressFn = (label: string, detail?: string) => void

export function progressReporter(id: string | undefined): ProgressFn {
  if (id === undefined || !isProgressId(id)) return () => {}
  return (label, detail) => progressStep(id, label, detail)
}
