/**
 * What to say when a render fails, and what to write down about it.
 *
 * ## The one failure that is not worth retrying
 *
 * `/api/render` caught everything and answered with one sentence: *"We could not build the file just
 * now. Your CV is unchanged — please try again."* For a transient fault that is the right sentence.
 * For the commonest real cause it is a dead end dressed as a hiccup: **the renderer has no glyph for
 * the writing system the CV is in**, and "just now" and "try again" are both false — it will fail
 * identically forever, and the person retrying learns nothing each time.
 *
 * Measured on 2026-08-23, and the reason this file exists: takumi refuses Hebrew and Arabic with
 * `MissingGlyphs` before it lays anything out, because none of the ten bundled families carries those
 * blocks. **But only the PDF needs our fonts.** The same CV exports to `.docx` and to the
 * self-contained web page without complaint — Word and the browser supply a face we do not have. So
 * the honest message is not "we failed", it is "this format cannot, these two can", which is the
 * difference between a dead end and a detour for every candidate in those markets.
 *
 * ## Why a bounded code, and why the message never comes from the error
 *
 * Two rules meet here and neither bends.
 *
 * `renderResume`'s failures **quote the text they could not lay out** — the probe's message listed
 * seventeen Hebrew characters taken straight from the document. docs/07 forbids CV content in any
 * response, log or telemetry, so the error's own message can go to none of them. Every string in the
 * returned value is therefore written here, in advance, and chosen from a fixed set.
 *
 * The route used to log `error.constructor.name` for the same reason, which was right in spirit and
 * blind in practice: takumi throws a plain `Error`, so a missing glyph and a genuine renderer bug both
 * logged `code: "Error"`. A bounded vocabulary is only useful if its words differ.
 */

/** Marker takumi puts at the front of its own message. Matched as a prefix — never read past it. */
const MISSING_GLYPHS = 'MissingGlyphs'

export type RenderFailureCode = 'missing_glyphs' | 'unknown'

export interface RenderFailure {
  /** For the log. A closed vocabulary, so it can never carry a line of somebody's CV. */
  code: RenderFailureCode
  /** For the person. Written here, never derived from the error. */
  message: string
  /**
   * Whether retrying could plausibly help.
   *
   * The caller uses it to choose the status: a permanent refusal is the request's problem (`422`), not
   * the server having a bad moment (`500`), and a monitor that pages on 5xx should not be woken by a
   * CV written in a script we have not bundled.
   */
  retryable: boolean
}

/**
 * Recognise the failures worth distinguishing, and say nothing about the rest.
 *
 * Pure and exported so it can be asserted against a **real** thrown error rather than a string I typed
 * from memory — `rtl-probe.test.ts` renders Hebrew through the actual renderer and feeds what comes
 * back to this function. That matters more than it looks: the prefix below is another library's
 * `Display` output, so the day takumi rewords it this classifier goes blind, and the only test that
 * would notice is one that never hardcoded the wording.
 */
export function classifyRenderFailure(error: unknown): RenderFailure {
  if (error instanceof Error && error.message.startsWith(MISSING_GLYPHS)) {
    return {
      code: 'missing_glyphs',
      /*
        No script name, no character, no count. Naming the writing system would read better and it is
        a claim about the document derived from the document, which is exactly the sort of thing that
        is defensible in a response and indefensible once somebody copies the string into a log line.
        The person already knows what their CV is written in; what they do not know is that two of the
        three downloads work.
      */
      message:
        'Our page designs cannot set this CV’s writing system yet — the PDF is the only download that uses our own fonts. The Word and web-page downloads work now, and your CV is unchanged.',
      retryable: false,
    }
  }
  return {
    code: 'unknown',
    message:
      'We could not build the file just now. Your CV is unchanged — please try again.',
    retryable: true,
  }
}
