/**
 * Reading the model's reasoning without repeating a word of it.
 *
 * ## What the measurements forced
 *
 * `narrate.ts` was built on the assumption that a streamed tool call arrives in pieces, so watching its
 * key names would narrate the wait. Measured against the real gateway, that assumption is false. MiniMax
 * buffers the whole answer: a 4,340-character tool input arrived in **two** deltas — one character at
 * 1.9s, the remaining 4,339 at 17.5s. Ollama is no better; its answer lands in one piece at the end. So
 * the JSON scanner reports the sections accurately and reports them all at the finish line, which is a
 * correct narration of a wait that is already over.
 *
 * The signal that *does* cover the wait is the reasoning channel, and it only exists if we ask for it.
 * With `thinking` enabled, the same request produced **201 thinking deltas, the first at 1ms and the
 * last at 15.8s, never more than 1.4s apart** — and MiniMax accepts it at `temperature: 0`, so the
 * "transcription, not authorship" rule survives intact. See `ask.ts` for how it is requested and what
 * happens on a provider that refuses.
 *
 * ## Why this file exists rather than piping the text through
 *
 * Because the reasoning is somebody's CV. The measurement is unambiguous — a real delta read
 * *"Name Ana Ruiz Delgado. Work three entries"*, and another *"2012-2015 Nurse, General Surgical Ward,
 * Cruz Roja"*. That is a name, an employer and a date range, in a channel that `/api/progress` serves
 * without authentication. Streaming it to the browser would be the exact thing docs/07 forbids, and it
 * would be forbidden no less for looking like a feature.
 *
 * So the text is matched, never kept. Fragments go past a table of cues — **our** words, written below
 * in this repo — and what comes out is a `NarrationKey` and nothing else. The only memory is `tail`, a
 * few dozen characters held so a word split across two deltas still matches, overwritten continuously
 * and never read by anyone but the matcher.
 *
 * That is the same bargain `narrate.ts` strikes, and it is the only one available: the person waiting
 * gets to watch the model work through their CV, and no part of their CV leaves the process to do it.
 */
import { isNarrationKey } from './narrate'
import type { NarrationKey } from './narrate'

/**
 * What a mention of each section looks like in reasoning prose.
 *
 * Deliberately generous and deliberately ours. Generous because a model narrating its own work says
 * "the school" as often as "education", and a cue that only matches the schema's field name would sit
 * silent through the paragraph that is plainly about education. Ours because every one of these words
 * is typed here, so the matcher's whole vocabulary is auditable in one screen — no term derived from
 * the document, no term learned at runtime.
 *
 * Order matters: the first section whose cue appears in a fragment wins, so the more specific patterns
 * come before the general ones. `work` is last of the content sections because "role" and "company"
 * turn up inside sentences about everything else.
 */
const CUES: ReadonlyArray<readonly [NarrationKey, RegExp]> = [
  [
    'education',
    /\b(education|degree|universit|school|studied|graduat|bsc|msc|mba|phd|diploma|academy|college)/i,
  ],
  ['certifications', /\b(certif|licen[cs]|accredit|credential|qualification)/i],
  ['publications', /\b(publicat|published|journal|paper|author(ed|ship))/i],
  ['awards', /\b(award|prize|honou?r|distinction|scholarship)/i],
  ['volunteer', /\b(volunt|unpaid|charit|pro ?bono)/i],
  ['languages', /\b(language|fluen|bilingual|mother tongue|native speaker)/i],
  ['projects', /\b(project|portfolio|side ?work|freelance piece)/i],
  ['skills', /\b(skill|competenc|proficien|toolset|technolog|software)/i],
  [
    'basics',
    /\b(full ?name|contact|e-?mail|phone|headline|the candidate'?s name|their name)/i,
  ],
  [
    'provenance',
    /\b(confiden|uncertain|unsure|ambiguous|not clear|cannot tell|guess)/i,
  ],
  [
    'work',
    /\b(work|job|employ|company|employer|role|position|title|experience|responsib|bullet|highlight)/i,
  ],
]

/**
 * How much of the previous fragment to keep.
 *
 * A cue must still match when the stream splits it — "educat" / "ion" arrived as two deltas is not
 * hypothetical at 200 deltas per request. Long enough for the longest pattern above with room to spare,
 * short enough that it is a lookbehind and not a transcript. Nothing reads it except the matcher, and
 * it is overwritten on every fragment.
 */
const TAIL = 48

export interface ReasoningWatch {
  /** Feed the next fragment of reasoning text. Returns nothing; matches go to `onSection`. */
  push: (fragment: string) => void
}

/**
 * Watch reasoning go past and report which part of the CV it is about.
 *
 * `onSection` fires only when the section changes, so a model dwelling on the work history for eight
 * seconds produces one call rather than eighty. A fragment mentioning nothing recognisable leaves the
 * current section alone — silence means "still on that", which is true far more often than it is
 * misleading, and it is certainly better than blanking the row every time the model writes "and".
 */
export function watchReasoning(
  onSection: (key: NarrationKey) => void,
): ReasoningWatch {
  /*
    Fresh copies, because these are stateful once global and a module-level regex shared between two
    concurrent uploads would carry one request's `lastIndex` into the other's scan.
  */
  const cues = CUES.map(
    ([key, cue]) => [key, new RegExp(cue.source, `${cue.flags}g`)] as const,
  )
  let tail = ''
  let current: NarrationKey | undefined

  return {
    push(fragment: string): void {
      const window = tail + fragment
      const carried = tail.length
      tail = window.slice(-TAIL)

      for (const [key, cue] of cues) {
        /*
          The match has to reach into the new text.

          Without this the lookbehind becomes a memory: a fragment about education leaves "degree" in
          the tail, and the *next* fragment — about employers — matches it again and pins the marker
          where the model no longer is. The tail is here to rejoin a word the stream split, and this is
          what keeps it to that job.
        */
        cue.lastIndex = 0
        let hit = false
        for (
          let match = cue.exec(window);
          match !== null;
          match = cue.exec(window)
        ) {
          if (match.index + match[0].length > carried) {
            hit = true
            break
          }
        }
        if (!hit) continue
        if (key !== current) {
          current = key
          onSection(key)
        }
        return
      }
    },
  }
}

/** Guard for the wire, so a hand-written note key cannot slip past the union at runtime. */
export { isNarrationKey }
