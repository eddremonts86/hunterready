/**
 * The inside of the longest stage: which part of the CV the model is writing, right now.
 *
 * ## The row this hangs off
 *
 * The waiting screen's stage list ends the same way every time — *"The model is reading your CV and
 * structuring it"* — and then holds that one sentence for seventeen seconds on the third-party model
 * and for minutes on our own. A narrated wait whose longest stage is a closed door has moved the
 * problem rather than solved it. Edd, looking at exactly that: *"deberíamos mostrar el proceso de
 * pensamiento aquí"*.
 *
 * ## What is shown, and what deliberately is not
 *
 * Not the model's reasoning. A model reasoning about a CV reasons in somebody's employers and dates,
 * and docs/07 does not have an exception for a nice loading screen. What streams instead is the shape
 * of the answer: the section keys of our own schema, arriving in order, with the entries counted as
 * they complete. `src/structure/narrate.ts` is the scanner, and its guarantee is structural — it has no
 * code path that stores a value — so this component receives keys, looks their English up in
 * `NARRATION`, and could not print a name if it tried.
 *
 * ## Why a sub-list rather than more stages
 *
 * Eleven sections promoted to top-level rows would grow the card by a row every second or two, pushing
 * the thing being read down the screen while somebody reads it. Nested, the stage stays put and the
 * detail happens underneath it — the list has one moving part instead of a moving list.
 */
import { NARRATION, countLabel } from '@/structure/narrate'
import type { NarrationKey } from '@/structure/narrate'

export interface ModelNote {
  key: NarrationKey
  count: number
  done: boolean
}

/**
 * A tick for a finished section, a hollow ring for the one in progress.
 *
 * Deliberately not another spinner: the stage above already has one turning, and two rings turning at
 * different speeds in the same card reads as two things happening rather than one thing with parts.
 * The liveness here comes from the count climbing, which is real information rather than motion.
 */
function Mark({ done }: { done: boolean }) {
  if (done) {
    return (
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="h-3 w-3 text-affirm"
      >
        <path d="m5 12.5 4.5 4.5L19 7" />
      </svg>
    )
  }
  return (
    <span
      aria-hidden
      className="h-[7px] w-[7px] rounded-full border-2 border-signal"
    />
  )
}

export function ModelNotes({ notes }: { notes: Array<ModelNote> }) {
  if (notes.length === 0) return null
  return (
    /*
      Not a live region of its own. The stage list around this one already is, and a nested region
      announcing "your education, 2 entries so far" every second would bury the stage name it sits
      under — the same reason the elapsed-seconds counter next to it is `aria-hidden`. A screen reader
      gets the stage; a sighted reader gets the detail.
    */
    <ul
      aria-hidden
      className="mt-2 flex flex-col gap-1.5 border-l border-hairline pl-3"
    >
      {notes.map((note) => {
        const count = countLabel(note.key, note.count)
        return (
          // Keyed by section, so a note that is already on screen is never remounted and only the
          // genuinely new one plays the entrance.
          <li key={note.key} className="slip flex items-center gap-2">
            <span className="flex h-3 w-3 shrink-0 items-center justify-center">
              <Mark done={note.done} />
            </span>
            <span
              className={
                note.done
                  ? 'text-meta text-ink-faint'
                  : 'text-meta font-medium text-ink-soft'
              }
            >
              {NARRATION[note.key]}
            </span>
            {count !== undefined && (
              <span className="tally text-meta text-ink-faint">{count}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
