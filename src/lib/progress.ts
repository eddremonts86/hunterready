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
 * `progressNote` extends that without weakening it. It is the sub-narration of the one long stage — the
 * model writing its answer, section by section — and it takes a **`NarrationKey`, not a string**: a
 * closed union of the field names in our own schema. The English never travels; the client looks it up
 * in `NARRATION`. So the guarantee above is still enforced by the compiler rather than by care.
 *
 * ## Why polling and not SSE
 *
 * The upload is one long POST the client already holds open; a second streaming response would mean two
 * concurrent connections through every proxy between a phone and this server. A 700ms GET against an
 * in-memory map is boring, survives every proxy, and disappears when the POST resolves. Boring wins.
 */

import type { NarrationKey } from '@/structure/narrate'

/** One section of the model's answer, as it is written. Key and count — see `narrate.ts`. */
export interface ProgressNote {
  key: NarrationKey
  count: number
  /** True once the model has moved on to another section. */
  done: boolean
}

export interface ProgressStep {
  /** A fixed English stage label from this repo. The client localises; the wire stays English. */
  label: string
  /** Counts only — "page 2 of 3". Never free text. */
  detail?: string
  done: boolean
  /** Epoch ms when the step started, so the client can show a truthful elapsed time. */
  at: number
  /** What the model has written so far, within this step. Absent on steps that do not narrate. */
  notes?: Array<ProgressNote>
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

  /**
   * The same stage twice in a row is a retry, not a new step.
   *
   * The extraction path calls this once per attempt, so a repaired structure drew the identical
   * sentence twice — one ticked, one spinning — which reads as the screen having lost count.
   * Collapsing them into one row that says which attempt it is on tells the truth about what is
   * happening (it is having another go) without pretending the list grew.
   */
  if (last !== undefined && last.label === label && !last.done) {
    const attempt = Number(/attempt (\d+)/.exec(last.detail ?? '')?.[1] ?? '1')
    last.detail = detail ?? `attempt ${attempt + 1}`
    // A retry writes its answer again from the top, so the sub-narration starts over with it. Leaving
    // the old notes in place would show a second run appearing to resume where the first stopped.
    delete last.notes
    state.updatedAt = Date.now()
    store.set(id, state)
    return
  }

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

/**
 * Record that the model is now working on a given section of the CV.
 *
 * Attaches to the **current** step rather than creating one: "reading your CV and structuring it" is
 * one thing happening, and splitting it into eleven rows would make the list jump under the reader
 * every second or two. The notes are a sub-list inside that row.
 *
 * ## Revisiting a section moves the marker, it does not add a row
 *
 * Reasoning does not proceed in order. A model works out the job titles, wonders about a date, goes
 * back to the employer — and later writes all of it out again in schema order, which reports the same
 * sections a second time. Appending each report would draw a growing, repeating list that tells the
 * reader nothing about where the work is.
 *
 * So the list is the sections *seen*, in first-seen order, with exactly one marked open. Coming back to
 * one lights its existing row again. `done` therefore means "not what it is on right now" rather than
 * "finished forever", which is the honest reading when the thing being described is attention.
 *
 * Counts only ever climb, so the reasoning pass (which has no counts) cannot blank a number the writing
 * pass has already put there.
 *
 * A repair round clears the notes in `progressStep`, so a retried extraction narrates itself from the
 * top rather than appearing to carry on from where the failed attempt stopped.
 */
export function progressNote(
  id: string,
  key: NarrationKey,
  count: number,
): void {
  const state = store.get(id)
  const step = state?.steps[state.steps.length - 1]
  if (state === undefined || step === undefined || step.done) return
  const notes = step.notes ?? (step.notes = [])
  const seen = notes.find((note) => note.key === key)
  for (const note of notes) note.done = true
  if (seen === undefined) {
    notes.push({ key, count, done: false })
  } else {
    seen.count = Math.max(seen.count, count)
    seen.done = false
  }
  state.updatedAt = Date.now()
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
  for (const step of state.steps) {
    step.done = true
    for (const note of step.notes ?? []) note.done = true
  }
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

/** The sub-narration reporter, bound to one id. A no-op when there is no id to narrate to. */
export type NoteFn = (key: NarrationKey, count: number) => void

export function progressNoter(id: string | undefined): NoteFn {
  if (id === undefined || !isProgressId(id)) return () => {}
  return (key, count) => progressNote(id, key, count)
}
