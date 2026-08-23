/**
 * What actually happens to a right-to-left CV, established rather than assumed.
 *
 * ## The question this answers, and why it was the wrong question
 *
 * The roadmap listed right-to-left as *unverified, not broken* — "a font is the smaller half: the
 * renderer's bidi behaviour is unknown" — and named the cheap first move, which is this probe. Run on
 * 2026-08-23, it turns out the halves are the other way round. **The font is the blocking half and
 * bidi cannot be asked about at all yet**, because takumi refuses before it lays anything out: none of
 * the ten bundled families carries a Hebrew or an Arabic block, and the renderer's answer is
 * `MissingGlyphs`, not a reversed line.
 *
 * That is the ADR-022 order holding up a second time. Bundling an Arabic face and *then* asking about
 * bidi is the same mistake as adding fontsource's `cyrillic` subset and assuming the glyphs arrived.
 *
 * ## The part that was worth finding
 *
 * **Only the PDF needs our fonts.** The same CV renders to `.docx` and to the self-contained web page
 * with the text intact, because Word and the browser bring a face of their own. So the product is not
 * unusable for these markets today — one of its three downloads is, and until this probe nothing said
 * so: `/api/render` answered every failure with "please try again", which for a missing glyph is a
 * button somebody can press forever.
 *
 * ## Why this stays as a test
 *
 * It is a characterisation test, like `deepseek-schema.test.ts`: it records an answer that is true
 * today and is **notification when it stops being true**. Bundle a Hebrew or Arabic face and the first
 * two cases go red — which is precisely the moment somebody has to go and find out what takumi does
 * with bidi, and the moment this file should be replaced by a test that asserts reading order.
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

  it('exports Hebrew to a web page, with the name still in it', async () => {
    const { html } = await renderResumeHtml(cv('hebrew'))
    expect(html).toContain(CVS.hebrew.fullName)
  })
})
