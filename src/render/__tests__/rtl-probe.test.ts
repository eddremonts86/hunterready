/**
 * What actually happens to a right-to-left CV, established rather than assumed.
 *
 * ## The question this answers, and why it was the wrong question
 *
 * The roadmap listed right-to-left as *unverified, not broken* — "a font is the smaller half: the
 * renderer's bidi behaviour is unknown" — and named the cheap first move, which is this probe. Run on
 * 2026-08-23, and **neither half was where the entry thought it was.**
 *
 * As shipped, takumi refuses before it lays anything out: none of the ten bundled families carries a
 * Hebrew or an Arabic block, so the answer is `MissingGlyphs` rather than a reversed line. That is what
 * the cases below assert, and it is the state of the product.
 *
 * But the font turns out to be the *easy* half, not the blocking one — see ADR-035 below — and bidi
 * turns out to be supported. What blocks RTL is neither: it is that a PDF's text layer comes back in
 * visual order, and an extraction is this product's spine.
 *
 * ## The part that was worth finding
 *
 * **Only the PDF needs our fonts.** The same CV renders to `.docx` and to the self-contained web page
 * with the text intact, because Word and the browser bring a face of their own. So the product is not
 * unusable for these markets today — one of its three downloads is, and until this probe nothing said
 * so: `/api/render` answered every failure with "please try again", which for a missing glyph is a
 * button somebody can press forever.
 *
 * ## The second question, asked and answered — ADR-035
 *
 * Do not read the above as "so bundle the font and see". That was tried, on 2026-08-23, with a real
 * `NotoSansHebrew-Regular.ttf` in the fallback chain, and the answer is why no face is bundled:
 *
 *   glyphs        register the face and it renders. `fontFamilies` is not even needed — takumi falls
 *                 back across every registered family on its own, byte-identically.
 *   layout        **correct.** Bidi applied, RTL paragraph right-aligned, `12` keeping its LTR run
 *                 inside the Hebrew sentence. Looked at, not inferred.
 *   text layer    **visual order.** Every token intact, the sequence within a line reversed.
 *                 `דוד כהן` extracts as `כהן דוד` — surname first.
 *   tagged: true  a structure tree with no text in it. Cannot restore logical order; identical
 *                 extraction either way.
 *
 * A PDF stores glyphs in the order they are painted, and for RTL that is visual order. This product's
 * spine is an extraction, so bundling the face would produce **a document that looks perfect and
 * silently fails the one thing the product sells** — which is worse than a visible refusal.
 *
 * ## Why this stays as a test
 *
 * It is a characterisation test, like `deepseek-schema.test.ts`: it records an answer that is true
 * today and is **notification when it stops being true**. Bundle a Hebrew or Arabic face and the first
 * cases go red — deliberately, because that is a decision with ADR-035 attached and not a font drop.
 *
 * It also holds the one string `classifyRenderFailure` depends on. That prefix is another library's
 * `Display` output; the classifier goes blind the day takumi rewords it, and a test that hardcoded the
 * wording would keep passing while production quietly went back to telling people to try again. So the
 * error is obtained by rendering, never by construction.
 */
import { describe, expect, it } from 'vitest'
import { extractText, getDocumentProxy } from 'unpdf'
import { Resume } from '@/schema/resume'
import { renderResume } from '../render'
import { renderDocx } from '../docx/docx'
import { renderResumeHtml } from '../html'
import { classifyRenderFailure } from '../failure'

/**
 * Ordinary CVs in three scripts, and deliberately not a technology career (CLAUDE.md).
 *
 * Each carries a number inside a right-to-left run — `12`, `2019` — because that is the case bidi is
 * hardest at and the first thing to look at the day a face exists to look with.
 */
const CVS = {
  hebrew: {
    fullName: 'דוד כהן',
    headline: 'אחות מוסמכת',
    bullet: 'ניהלתי צוות של 12 אחיות במשמרת לילה',
  },
  arabic: {
    fullName: 'أحمد حسن',
    headline: 'مهندس مدني',
    bullet: 'أشرفت على فريق من 12 مهندسا في 2019',
  },
  latin: {
    fullName: 'David Cohen',
    headline: 'Registered Nurse',
    bullet: 'Led a team of 12 nurses on the night shift',
  },
} as const

function cv(which: keyof typeof CVS): Resume {
  const { fullName, headline, bullet } = CVS[which]
  return Resume.parse({
    schemaVersion: '1.0',
    basics: {
      fullName,
      headline,
      email: 'candidate@example.org',
      links: [],
      personalDetails: [],
    },
    work: [
      {
        company: 'Herlev Hospital',
        role: headline,
        startDate: '2019-03',
        endDate: null,
        highlights: [bullet],
        tech: [],
      },
    ],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    languages: [],
    awards: [],
    publications: [],
    volunteer: [],
    custom: [],
  })
}

/** The error the real renderer throws, or `undefined` if it did not throw at all. */
async function refusalOf(which: keyof typeof CVS): Promise<unknown> {
  try {
    await renderResume(cv(which), {})
    return undefined
  } catch (error) {
    return error
  }
}

describe('a right-to-left CV, through the PDF path', () => {
  it.each(['hebrew', 'arabic'] as const)(
    'is refused loudly rather than drawn as boxes: %s',
    async (which) => {
      const error = await refusalOf(which)
      /*
        Not a silent tofu page. This is the property that makes the whole situation survivable: a CV
        full of empty boxes would have shipped to an employer, and a throw cannot.
      */
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toMatch(/^MissingGlyphs/)
    },
  )

  it('classifies that refusal as permanent, from the real error', async () => {
    /*
      The link between takumi's wording and our own vocabulary, asserted end to end. Everything else
      about this failure — the status code, the sentence, whether a monitor should care — hangs off
      `code`, so this is the assertion that keeps the route from silently falling back to "try again".
    */
    const failure = classifyRenderFailure(await refusalOf('hebrew'))
    expect(failure.code).toBe('missing_glyphs')
    expect(failure.retryable).toBe(false)
    // The one thing the message may never contain: the document.
    expect(failure.message).not.toContain(CVS.hebrew.fullName)
    expect(failure.message).not.toContain('U+')
  })

  it('renders the same CV in Latin, so the refusal is about the script', async () => {
    // Otherwise all this proves is that the fixture is broken.
    const { bytes } = await renderResume(cv('latin'), {})
    const pdf = await getDocumentProxy(new Uint8Array(bytes))
    const { text } = await extractText(pdf, { mergePages: true })
    expect(text).toContain('David Cohen')
  })
})

describe('the two downloads that do not use our fonts', () => {
  it('exports Hebrew to .docx, because Word brings its own face', () => {
    const bytes = renderDocx(cv('hebrew'))
    expect(bytes.length).toBeGreaterThan(0)
  })

  it('keeps Hebrew in logical order in the .docx, which the PDF cannot', async () => {
    /*
      The assertion the interface's sentence rests on. `/api/render` tells somebody with an RTL CV that
      the Word download works, and for that to be advice rather than an apology the `.docx` has to be
      *better* than the PDF for the thing this product sells — not merely available.

      It is. Word applies bidi at display time, so the file keeps the order the person typed, and an
      extractor reading it gets `דוד כהן` rather than `כהן דוד`. Read back with mammoth, which is the
      same library our own ingestion uses, so this is the round trip a screener's parser makes.
    */
    const mammoth = await import('mammoth')
    const { value } = await mammoth.extractRawText({
      buffer: Buffer.from(renderDocx(cv('hebrew'))),
    })
    expect(value).toContain(CVS.hebrew.fullName)
    expect(value).toContain(CVS.hebrew.bullet)
  })

  it('exports Hebrew to a web page, with the name still in it', async () => {
    const { html } = await renderResumeHtml(cv('hebrew'))
    expect(html).toContain(CVS.hebrew.fullName)
  })
})
