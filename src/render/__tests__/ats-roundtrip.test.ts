/**
 * ⭐ Block 5 — the ATS round-trip test. The spine of the product.
 *
 * Render a CV → read the PDF back with an **independent** parser (`unpdf`, a serverless
 * pdf.js build, not the renderer that produced it) → assert every critical field survived,
 * in reading order.
 *
 * This is the mechanism nothing else in the market offers. Competitors claim
 * "ATS-friendly"; this is a test that fails the build. Every template must pass it, and a
 * template that cannot is not shipped — no exceptions, including "just for this design".
 *
 * If you are changing a template and this fails: the template is wrong, not the test.
 */
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractText, getDocumentProxy } from 'unpdf'
import { Resume } from '@/schema/resume'
import { renderResume } from '../render'
import { TEMPLATE_IDS, templates } from '../templates/registry'
import { THEME_IDS } from '../themes'
import type { ThemeId } from '../themes'
import { formatRange, resolveLocale } from '../format'
import { strings } from '../locale'

const EXPECTED_DIR = join(process.cwd(), 'fixtures/expected')

async function loadFixtures(): Promise<
  Array<{ name: string; resume: Resume }>
> {
  const files = (await readdir(EXPECTED_DIR)).filter((f) => f.endsWith('.json'))
  return Promise.all(
    files.map(async (name) => ({
      name,
      resume: Resume.parse(
        JSON.parse(await readFile(join(EXPECTED_DIR, name), 'utf8')),
      ),
    })),
  )
}

/**
 * The text a screener would see. Normalizes whitespace only — never rewrites content, or the
 * test would paper over the very defects it exists to catch.
 */
async function extractPdfText(bytes: Uint8Array): Promise<{
  text: string
  pages: number
}> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  const { text } = await extractText(pdf, { mergePages: true })
  return {
    text: text.replace(/\s+/g, ' ').trim(),
    pages: pdf.numPages,
  }
}

const fixtures = await loadFixtures()
const combos = TEMPLATE_IDS.flatMap((templateId) =>
  fixtures.map((f) => ({ templateId, ...f })),
)

describe.each(combos)(
  '$templateId × $name survives a parse-back',
  ({ templateId, resume }) => {
    let text = ''
    let pages = 0

    it('renders a readable PDF', async () => {
      const { bytes } = await renderResume(resume, { templateId })
      const extracted = await extractPdfText(bytes)
      text = extracted.text
      pages = extracted.pages

      expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('%PDF')
      // An image-only PDF would extract almost nothing — the failure mode we exist to prevent.
      expect(text.length).toBeGreaterThan(300)
      expect(pages).toBeGreaterThanOrEqual(1)
    })

    it('keeps the name and contact details', () => {
      expect(text).toContain(resume.basics.fullName)
      if (resume.basics.email !== undefined) {
        expect(text).toContain(resume.basics.email)
      }
      if (resume.basics.phone !== undefined) {
        expect(text).toContain(resume.basics.phone)
      }
    })

    it('keeps every employer and every role', () => {
      for (const job of resume.work) {
        expect(text, `missing employer: ${job.company}`).toContain(job.company)
        expect(text, `missing role: ${job.role}`).toContain(job.role)
      }
    })

    it('keeps every date range in MMM YYYY form, in the document’s language', () => {
      /**
       * `locale` since v0.8. The shape is what clause 7 mandates; the *words* are the document's own.
       * A Spanish CV prints `mar 2015 – may 2021`, and asserting the English months here would have
       * demanded that a Spanish document be dated in English — which is what it used to do.
       */
      const locale = resolveLocale(resume.locale)
      for (const job of resume.work) {
        const range = formatRange(job.startDate, job.endDate, locale)
        if (range === '') continue
        expect(text, `missing date range: ${range}`).toContain(range)
      }
    })

    it('keeps every skill', () => {
      for (const group of resume.skills) {
        for (const skill of group.items) {
          expect(text, `missing skill: ${skill}`).toContain(skill)
        }
      }
    })

    it('keeps every bullet', () => {
      for (const job of resume.work) {
        for (const highlight of job.highlights) {
          expect(text, `missing bullet: ${highlight.slice(0, 40)}…`).toContain(
            highlight,
          )
        }
      }
    })

    it('preserves reading order', () => {
      // Employers must appear in the order the resume lists them. This is the assertion that
      // catches layout mistakes — a two-column text layer scrambles it while every
      // "does the string exist" check above still passes.
      const positions = resume.work.map((job) => text.indexOf(job.company))
      const seen = new Set(resume.work.map((j) => j.company))
      if (seen.size !== resume.work.length) return // same employer twice: order is ambiguous

      for (let i = 1; i < positions.length; i++) {
        expect(
          positions[i],
          `${resume.work[i].company} appears before ${resume.work[i - 1].company}`,
        ).toBeGreaterThan(positions[i - 1])
      }
    })

    it('uses standard section headings, as one findable word each', () => {
      // Case-insensitive because real ATS keyword matching is, and ALL-CAPS section headings
      // are both common and well parsed. Not whitespace-insensitive, though: that is what
      // catches a letter-spaced heading extracting as "E x p e r i e n c e", which looks
      // perfect on screen and is invisible to a parser. Block 5 caught exactly that on its
      // first run — see rule 13 in docs/05-pdf-rendering.md.
      const haystack = text.toLowerCase()
      /**
       * The *local* standard heading since v0.8 — `Erfaring` on a Danish CV, `Experiencia` on a Spanish
       * one. Clause 6 asks for the heading the screener has seen a thousand times, and a Danish screener
       * has never seen `Experience`. Asserting English here was demanding the violation.
       */
      const local = strings(resolveLocale(resume.locale))
      if (resume.work.length > 0)
        expect(haystack).toContain(local.headings.work.toLowerCase())
      if (resume.education.length > 0)
        expect(haystack).toContain(local.headings.education.toLowerCase())
      if (resume.skills.length > 0)
        expect(haystack).toContain(local.headings.skills.toLowerCase())
    })
  },
)

describe('the two regional conventions differ exactly as specified (ADR-010)', () => {
  const withDetails = fixtures.find(
    (f) => f.resume.basics.personalDetails.length > 0,
  )

  it('a fixture with personal details exists to test against', () => {
    expect(withDetails).toBeDefined()
  })

  it('the European variant prints personal details and the international one does not', async () => {
    if (withDetails === undefined) return
    const detail = withDetails.resume.basics.personalDetails[0]
    const needle = `${detail.label}: ${detail.value}`

    const eu = await renderResume(withDetails.resume, {
      templateId: 'modern-eu',
    })
    const intl = await renderResume(withDetails.resume, {
      templateId: 'modern-intl',
    })

    expect((await extractPdfText(eu.bytes)).text).toContain(needle)
    // The international convention forbids these fields; leaking them is a real-world harm,
    // not a cosmetic bug — it invites discrimination the format exists to avoid.
    expect((await extractPdfText(intl.bytes)).text).not.toContain(needle)
  })

  /**
   * The photo, which is the only image this system draws (docs/05) and therefore the only place the ATS
   * ruleset's "contact details as text, never an image" clause can be broken by accident.
   *
   * An 8×8 PNG, hand-built rather than fetched: the assertions are about *whether* an image is embedded
   * and what happens to the text beside it, and a real portrait would add half a second to the suite for
   * no extra evidence.
   */
  const PHOTO =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4YWODFTEMLQkAZZlQAVIPr1MAAAAASUVORK5CYII='

  const withPhoto = () => {
    const base = fixtures[0].resume
    return { ...base, basics: { ...base.basics, photoUrl: PHOTO } }
  }

  /** Counts image XObjects in the raw PDF, which is the only place the truth about this lives. */
  const imageCount = (bytes: Uint8Array) =>
    (
      Buffer.from(bytes)
        .toString('latin1')
        .match(/\/Subtype\s*\/Image/g) ?? []
    ).length

  it('the European variant embeds the photo and the international one ignores it', async () => {
    const resume = withPhoto()
    const eu = await renderResume(resume, { templateId: 'modern-eu' })
    const intl = await renderResume(resume, { templateId: 'modern-intl' })

    expect(imageCount(eu.bytes)).toBe(1)
    /**
     * Not "does not show it prominently" — zero images. US and UK guidance is to leave a photo off, and
     * several screeners drop a document that has one in the header. Somebody who uploaded a photo and
     * then chose the international layout chose a convention, and this template honours it.
     */
    expect(imageCount(intl.bytes)).toBe(0)
  })

  it('a photo costs nothing from the text: name, contact and every bullet still extract', async () => {
    /**
     * The assertion that matters. The photo sits in the masthead — the exact region a screener scans for
     * a name — so the risk is not that the image looks wrong but that it displaces or overlaps the text
     * that has to be machine-readable. Read back with unpdf, the independent parser.
     */
    const resume = withPhoto()
    const { bytes } = await renderResume(resume, { templateId: 'modern-eu' })
    const { text } = await extractPdfText(bytes)

    expect(text).toContain(resume.basics.fullName)
    if (resume.basics.email !== undefined) {
      expect(text).toContain(resume.basics.email)
    }
    for (const job of resume.work) {
      expect(text).toContain(job.company)
      for (const highlight of job.highlights) {
        // Compared exactly, the same way the per-template suite above does it.
        expect(text, `missing bullet: ${highlight.slice(0, 40)}…`).toContain(
          highlight,
        )
      }
    }
  })

  /**
   * The renderer's image support, pinned as a fact rather than an assumption.
   *
   * takumi-pdf embeds a PNG data URL and **silently drops** a JPEG or WebP one — no error, no warning, no
   * image in the PDF. It was found the hard way: the browser preview showed a photo and the downloaded
   * document had none, because the crop was being encoded as JPEG. Preview and print disagreeing quietly
   * is the worst failure this render path can have.
   *
   * `photo.ts` therefore encodes PNG, at a third the resolution a JPEG would have allowed, and this test
   * exists so the day the renderer learns JPEG shows up as a **failure** — the good kind, the one that
   * says a constraint has been lifted and 5× the bytes can be given back.
   */
  it('embeds a PNG data URL and silently drops a JPEG one (the constraint behind PHOTO_FORMAT)', async () => {
    const base = fixtures[0].resume
    const png = await renderResume(
      { ...base, basics: { ...base.basics, photoUrl: PHOTO } },
      { templateId: 'modern-eu' },
    )
    /**
     * A real baseline JPEG of a 1×1 white pixel. Hand-pasted because generating one needs a canvas, and
     * what matters is only that it is a valid JPEG the renderer could embed if it knew how.
     */
    const jpeg =
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDIzM//AABEIAAEAAQMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/aAAwDAQACEQMRAD8A9/ooooA//9k='
    const asJpeg = await renderResume(
      { ...base, basics: { ...base.basics, photoUrl: jpeg } },
      { templateId: 'modern-eu' },
    )

    expect(imageCount(png.bytes)).toBe(1)
    expect(imageCount(asJpeg.bytes)).toBe(0)
  })

  it('keeps the name ahead of everything, with the photo last in the markup', async () => {
    // Reading order is the whole reason the image is the final child of the masthead row.
    const resume = withPhoto()
    const { bytes } = await renderResume(resume, { templateId: 'modern-eu' })
    const { text } = await extractPdfText(bytes)

    const name = text.indexOf(resume.basics.fullName)
    const firstEmployer = text.indexOf(resume.work[0].company)
    expect(name).toBeGreaterThanOrEqual(0)
    expect(name).toBeLessThan(firstEmployer)
  })
})

describe('document metadata', () => {
  it('sets Title and Author, which recruiters and parsers both read', async () => {
    const fixture = fixtures[0]
    const { bytes, filename } = await renderResume(fixture.resume)
    const pdf = await getDocumentProxy(new Uint8Array(bytes))
    const { info } = (await pdf.getMetadata()) as {
      info: { Title?: string; Author?: string }
    }

    expect(info.Title).toContain(fixture.resume.basics.fullName)
    expect(info.Author).toBe(fixture.resume.basics.fullName)
    // Diacritics stripped so the filename survives every mail client and filesystem.
    expect(filename).toMatch(/^[A-Za-z0-9-]+-CV\.pdf$/)
  })
})

describe('every theme is renderable', () => {
  it.each(THEME_IDS)(
    '%s produces a parseable PDF',
    async (themeId: ThemeId) => {
      const fixture = fixtures[0]
      const { bytes } = await renderResume(fixture.resume, { themeId })
      const { text } = await extractPdfText(bytes)
      expect(text).toContain(fixture.resume.basics.fullName)
    },
  )
})

describe('every registered template is covered by this suite', () => {
  it('has no template without a round-trip test', () => {
    const covered = new Set(combos.map((c) => c.templateId))
    for (const id of TEMPLATE_IDS) {
      expect(covered.has(id), `${id} is untested`).toBe(true)
    }
    expect(Object.keys(templates).length).toBe(TEMPLATE_IDS.length)
  })
})
