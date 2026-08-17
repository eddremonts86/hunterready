/**
 * What the model is doing right now, told to the person waiting — without telling them their own CV.
 *
 * ## The wait this exists for
 *
 * `src/lib/progress.ts` turned a five-minute spinner into a list of stages, and it stopped one row
 * short. The row that says *"The model is reading your CV and structuring it"* is the longest one by a
 * wide margin — seventeen seconds on the third-party model, minutes on our own CPU — and for that whole
 * time it says exactly one thing. A stage list whose longest stage is opaque has moved the problem, not
 * solved it. Edd, looking at that screen: *"deberíamos mostrar el proceso de pensamiento aquí"*.
 *
 * ## Why this is not the model's reasoning text
 *
 * The obvious reading of "show the thinking" is to stream what the model says while it works. That is
 * the one thing this product may never do. A model reasoning about a CV reasons *in* the CV — "the
 * candidate's most recent employer appears to be…" is a sentence containing somebody's employer — and
 * docs/07 forbids CV content leaving into any side channel. `/api/progress` has no auth by design
 * (an anonymous first upload is the commonest case, ADR-023), so anything put there is readable by
 * anyone holding the id. Streaming reasoning into it would be a privacy regression wearing a feature's
 * clothes.
 *
 * ## What is left, and why it is the better answer anyway
 *
 * Extraction is a forced tool call, so what the model emits is one JSON document with **our** schema's
 * key names in it. Those keys are fixed strings from `src/schema/resume.ts` — not the user's text — and
 * watching them arrive tells you precisely what the model is working on: contact details, then work
 * history, then education. The counts are counts. Nothing else is read.
 *
 * So this file is a JSON scanner with one deliberate limitation: **it has no code path that stores a
 * value.** Characters accumulate only while the scanner is inside a string in *key* position; a string
 * in value position is walked character by character and lands nowhere. That is a property of the code
 * rather than a rule someone has to remember, which is the standard the progress store already holds
 * itself to.
 *
 * And the wire stays keys, never sentences: this reports a `NarrationKey`, the English lives in
 * `NARRATION`, and `progressNote` accepts nothing else. A future contributor cannot narrate a phone
 * number here, because the type will not let them.
 */

/**
 * The sections, and what each is called on screen.
 *
 * Keyed by the field names in `Resume`, so a section added to the schema and forgotten here goes
 * unnarrated rather than drawing something wrong. The labels are second person, because the person
 * reading them is watching their own document being taken apart.
 */
export const NARRATION = {
  basics: 'Your name and contact details',
  work: 'Your work history',
  education: 'Your education',
  skills: 'Your skills',
  projects: 'Your projects',
  certifications: 'Your certifications',
  languages: 'Your languages',
  awards: 'Your awards',
  publications: 'Your publications',
  volunteer: 'Your volunteering',
  custom: 'The rest of your CV',
  provenance: 'How sure it is about each field',
  /**
   * Not a section — the phase after the reasoning stops.
   *
   * Measured on the real gateway, a 35-second extraction spends its first 16 seconds reasoning and the
   * rest emitting the answer with nothing on the wire until it lands. That silent tail is not the model
   * hanging, and the one honest thing to say during it is what it is doing. The transition is a real
   * event, not a timer: the reasoning block closes and the tool-use block opens.
   */
  writing: 'Writing out what it found',
} as const

export type NarrationKey = keyof typeof NARRATION

/** Plural nouns for the counted sections. `basics` is not a list, so it has none and shows no count. */
const UNITS: Partial<Record<NarrationKey, [string, string]>> = {
  work: ['role', 'roles'],
  education: ['entry', 'entries'],
  skills: ['group', 'groups'],
  projects: ['project', 'projects'],
  certifications: ['certificate', 'certificates'],
  languages: ['language', 'languages'],
  awards: ['award', 'awards'],
  publications: ['publication', 'publications'],
  volunteer: ['role', 'roles'],
  custom: ['section', 'sections'],
  provenance: ['field', 'fields'],
}

const KEYS = new Set<string>(Object.keys(NARRATION))

export function isNarrationKey(value: unknown): value is NarrationKey {
  return typeof value === 'string' && KEYS.has(value)
}

/**
 * "3 roles so far" — the honest shape for a count that is still climbing.
 *
 * Undefined below one rather than "0 roles": a section that has started and produced nothing yet has
 * not found nothing, it has not finished looking, and those two read very differently to somebody
 * watching their own CV being read.
 */
export function countLabel(
  key: NarrationKey,
  count: number,
): string | undefined {
  const unit = UNITS[key]
  if (unit === undefined || count < 1) return undefined
  return `${count} ${count === 1 ? unit[0] : unit[1]} so far`
}

/** Where the scanner is now. `count` is the completed entries of a list section, 0 for the rest. */
export interface Narration {
  key: NarrationKey
  count: number
}

interface Frame {
  kind: 'object' | 'array'
  /** Objects: the key whose value is being written now. Arrays: unused. */
  key?: string
  /** Arrays: entries completed so far. */
  items: number
  /** Arrays: whether anything has been written inside, so `]` knows to count the final entry. */
  touched: boolean
  /** Objects: whether the next string literal is a key rather than a value. */
  expectKey: boolean
}

/**
 * A key longer than this is not one of ours.
 *
 * Belt and braces around the single place characters are accumulated: even if a malformed stream
 * convinced the scanner that a value was a key, it could collect no more than a field name's worth
 * before the buffer stops growing. Every real key here is under twenty characters.
 */
const MAX_KEY = 64

export interface Narrator {
  /** Feed the next fragment of partial JSON, in arrival order. */
  push: (fragment: string) => void
}

/**
 * Field names that mean a section without being called one.
 *
 * The private path does not extract, it *corrects* (`local-refine.ts`), so its tool schema is a tiny
 * thing with `fullName`, `headline` and `jobs` in it. Those are the same parts of the same CV under
 * other names, and a visitor who declined the transfer deserves the same narrated wait — more so, since
 * theirs is the one measured in minutes. Mapping them here means one scanner serves both paths rather
 * than a second one drifting out of step with the first.
 */
export type Aliases = Readonly<Record<string, NarrationKey>>

export const REFINE_ALIASES: Aliases = {
  fullName: 'basics',
  headline: 'basics',
  jobs: 'work',
}

/**
 * Watch a tool call's JSON arrive and report which section is being written.
 *
 * `onChange` fires only when the section or its count actually moves, so a caller can wire it straight
 * to a progress store without debouncing: a CV with thirty bullets produces a handful of updates rather
 * than one per character.
 *
 * Never throws. Malformed JSON — a truncated stream, a gateway interleaving its own framing — costs
 * narration and nothing else, because the parsed result comes from the SDK's own accumulator and never
 * from here. This is a decoration on a load-bearing path, and it behaves like one.
 */
export function narrate(
  onChange: (state: Narration) => void,
  aliases: Aliases = {},
): Narrator {
  const stack: Array<Frame> = []
  /**
   * The highest count each section has reached.
   *
   * Needed because `]` pops the array frame while the section's key is still current — the enclosing
   * object only forgets it at the next comma. Reading the count live from the stack would therefore
   * announce "12 roles" and then "your work history" with no count at all, which looks like the screen
   * losing its place. Counts only ever climb.
   */
  const counts = new Map<NarrationKey, number>()

  let inString = false
  let escaped = false
  let capturing = false
  let buffer = ''
  let last: Narration | undefined

  const top = (): Frame | undefined => stack[stack.length - 1]

  /**
   * The current section, found by searching the stack rather than indexing it.
   *
   * Indexing assumes the payload's exact nesting — `{ resume: { work: […] } }` — and this project has
   * already met gateways that wrapped a tool input in one more layer than the last (see
   * `tool-input.ts`). Searching for the first frame whose key we recognise costs nothing and survives
   * all of them.
   */
  const report = (): void => {
    let found: Narration | undefined
    for (let i = 0; i < stack.length; i++) {
      const raw = stack[i]?.key
      if (raw === undefined) continue
      const key = isNarrationKey(raw) ? raw : aliases[raw]
      if (key === undefined) continue
      const inner = stack[i + 1]
      const live =
        inner !== undefined && inner.kind === 'array' ? inner.items : 0
      found = { key, count: Math.max(live, counts.get(key) ?? 0) }
      break
    }
    if (found === undefined) return
    counts.set(found.key, found.count)
    if (last?.key === found.key && last.count === found.count) return
    last = found
    onChange(found)
  }

  return {
    push(fragment: string): void {
      for (const char of fragment) {
        if (inString) {
          if (escaped) {
            escaped = false
          } else if (char === '\\') {
            escaped = true
          } else if (char === '"') {
            inString = false
            if (capturing) {
              const frame = top()
              if (frame !== undefined) frame.key = buffer
              capturing = false
              buffer = ''
              report()
            }
          } else if (capturing && buffer.length < MAX_KEY) {
            buffer += char
          }
          // A value's characters reach none of the branches above. That is the whole privacy argument.
          continue
        }

        switch (char) {
          case '"': {
            const frame = top()
            inString = true
            capturing =
              frame !== undefined && frame.kind === 'object' && frame.expectKey
            buffer = ''
            if (frame !== undefined) frame.touched = true
            break
          }
          case ':': {
            const frame = top()
            if (frame !== undefined && frame.kind === 'object') {
              frame.expectKey = false
            }
            break
          }
          case ',': {
            const frame = top()
            if (frame === undefined) break
            if (frame.kind === 'object') {
              frame.expectKey = true
              frame.key = undefined
            } else {
              frame.items++
              report()
            }
            break
          }
          case '{':
          case '[': {
            const frame = top()
            if (frame !== undefined) frame.touched = true
            stack.push({
              kind: char === '{' ? 'object' : 'array',
              items: 0,
              touched: false,
              expectKey: char === '{',
            })
            report()
            break
          }
          case '}':
          case ']': {
            const closed = stack.pop()
            if (closed === undefined) break
            if (closed.kind === 'array' && closed.touched) {
              // The final entry completes at `]`, where there is no comma to count it. Report with the
              // frame still in place, so the closing count is the one the section keeps.
              closed.items++
              stack.push(closed)
              report()
              stack.pop()
            }
            report()
            break
          }
          default: {
            // A bare literal — a number, `true`, `null`. Enough to mark a list as non-empty.
            if (char.trim() !== '') {
              const frame = top()
              if (frame !== undefined) frame.touched = true
            }
          }
        }
      }
    },
  }
}
