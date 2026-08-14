/**
 * ⭐ The DOCX round-trip test — the PDF verifier's twin, and binding the same way.
 *
 * Render a CV to `.docx` → read it back with **mammoth**, an independent parser we did not write and
 * which is already a dependency because ingestion reads `.docx` with it → assert every critical field
 * survived, in reading order.
 *
 * The same rule applies as to `ats-roundtrip.test.ts`: if you change the writer and this fails, the
 * writer is wrong, not the test. A `.docx` is the format the crudest portals ask for, so it is the one
 * where a lost employment history is most likely and least visible.
 *
 * ## What is asserted beyond the fields
 *
 * The absences. A parser cannot tell you what a document does *not* contain, so those are checked
 * against the XML directly: no table, no text box, no header or footer reference. Every one of those is
 * a documented way for an ATS to lose a section, and each is one edit away from creeping back in.
 */
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import mammoth from 'mammoth'
import { Resume } from '@/schema/resume'
import { docxFilename, renderDocx } from '../docx'
import { formatRange, formatYearMonth, resolveLocale } from '../../format'

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
 * Pull one part out of the archive without a zip library.
 *
 * Reading it back through our own writer would be circular, so this walks the local file headers
 * directly — which incidentally proves the headers are well formed, since a wrong length or offset
 * makes the scan fail rather than silently return the wrong bytes.
 */
function readPart(archive: Uint8Array, path: string): string {
  const wanted = new TextEncoder().encode(path)
  const view = new DataView(
    archive.buffer,
    archive.byteOffset,
    archive.byteLength,
  )
  let offset = 0

  while (offset + 30 <= archive.length) {
    if (view.getUint32(offset, true) !== 0x04034b50) break
    const method = view.getUint16(offset + 8, true)
    const compressed = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    const name = archive.subarray(nameStart, nameStart + nameLength)

    const matches =
      name.length === wanted.length && name.every((b, i) => b === wanted[i])
    const dataStart = nameStart + nameLength + extraLength
    if (matches) {
      const data = archive.subarray(dataStart, dataStart + compressed)
      const bytes = method === 8 ? inflateRawSync(data) : data
      return new TextDecoder().decode(bytes)
    }
    offset = dataStart + compressed
  }

  throw new Error(`part not found in archive: ${path}`)
}

/** The text a screener would see. Whitespace normalized; content never rewritten. */
async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const { value } = await mammoth.extractRawText({
    buffer: Buffer.from(bytes),
  })
  return value.replace(/\s+/g, ' ').trim()
}

const fixtures = await loadFixtures()

describe('every fixture survives a round trip through .docx', () => {
  it('has fixtures to test', () => {
    expect(fixtures.length).toBeGreaterThan(0)
  })

  for (const { name, resume } of fixtures) {
    describe(name, () => {
      const bytes = renderDocx(resume)

      it('is a document mammoth can open', async () => {
        const text = await extractDocxText(bytes)
        expect(text.length).toBeGreaterThan(100)
      })

      it('keeps the identity fields as text', async () => {
        const text = await extractDocxText(bytes)
        expect(text).toContain(resume.basics.fullName)
        if (resume.basics.email !== undefined) {
          expect(text).toContain(resume.basics.email)
        }
        if (resume.basics.phone !== undefined) {
          expect(text).toContain(resume.basics.phone)
        }
      })

      it('keeps every employer, role and date range', async () => {
        const text = await extractDocxText(bytes)
        for (const job of resume.work) {
          expect(text).toContain(job.company)
          expect(text).toContain(job.role)
          const range = formatRange(
            job.startDate,
            job.endDate,
            resolveLocale(resume.locale),
          )
          if (range !== '') {
            // Whitespace-normalized on both sides, because the separator is an en dash with spaces.
            expect(text).toContain(range.replace(/\s+/g, ' '))
          }
        }
      })

      it('keeps every bullet whole', async () => {
        const text = await extractDocxText(bytes)
        for (const job of resume.work) {
          for (const highlight of job.highlights) {
            expect(text).toContain(highlight.replace(/\s+/g, ' '))
          }
        }
      })

      it('keeps every skill', async () => {
        const text = await extractDocxText(bytes)
        for (const group of resume.skills) {
          for (const item of group.items) {
            expect(text).toContain(item)
          }
        }
      })

      it('preserves reading order', async () => {
        // The property the whole single-column rule exists to guarantee. A two-column layout or a table
        // reorders the stream, and a recruiter's screener reads it in the order it extracts.
        const text = await extractDocxText(bytes)
        const positions = resume.work.map((job) => text.indexOf(job.company))
        for (const position of positions) expect(position).toBeGreaterThan(-1)
        const sorted = [...positions].sort((a, b) => a - b)
        expect(positions).toEqual(sorted)
      })

      it('contains none of the structures an ATS drops', () => {
        const document = readPart(bytes, 'word/document.xml')
        // Each of these is a documented way to lose a section. A parser cannot report their absence,
        // so the absence is asserted here.
        expect(document).not.toMatch(/<w:tbl[ >]/)
        expect(document).not.toMatch(/<w:txbxContent/)
        expect(document).not.toMatch(/<w:drawing/)
        expect(document).not.toMatch(/<w:pict/)
        expect(document).not.toMatch(/headerReference/)
        expect(document).not.toMatch(/footerReference/)
      })

      it('names the document for the recruiter and the parser', () => {
        const core = readPart(bytes, 'docProps/core.xml')
        expect(core).toContain(resume.basics.fullName)
        expect(readPart(bytes, '[Content_Types].xml')).toContain(
          'wordprocessingml.document.main+xml',
        )
      })
    })
  }
})

describe('the archive itself', () => {
  const [first] = fixtures
  const resume = first.resume

  it('starts with [Content_Types].xml, as the OPC specification requires', () => {
    const bytes = renderDocx(resume)
    // Byte 30 onward is the first entry's name. Word is forgiving about the order; some strict
    // readers are not, and a document that opens everywhere is the whole point of this format.
    const name = new TextDecoder().decode(bytes.subarray(30, 30 + 19))
    expect(name).toBe('[Content_Types].xml')
  })

  it('renders the same bytes twice', () => {
    // No clock anywhere, so a re-render is comparable. Without this a content-addressed cache would be
    // impossible and this suite could not tell a real change from a passing second.
    expect(renderDocx(resume)).toEqual(renderDocx(resume))
  })

  it('escapes what would otherwise make the file unopenable', async () => {
    const hostile = Resume.parse({
      ...resume,
      basics: {
        ...resume.basics,
        fullName: 'Ampersand & <Angle> "Quote"',
        // A real control character, of the kind a PDF text layer genuinely yields. XML 1.0 forbids it
        // outright, and one of these makes Word refuse the whole document.
        headline: 'Nurse\u0007 — Intensive Care',
      },
    })
    const bytes = renderDocx(hostile)
    const document = readPart(bytes, 'word/document.xml')
    expect(document).toContain('Ampersand &amp; &lt;Angle&gt;')
    // `includes`, not a regex: `no-control-regex` flags the escape as well as the literal, and
    // silencing the rule to assert one character is a worse trade than not using a pattern.
    expect(document.includes('\u0007')).toBe(false)
    // And it still parses.
    const text = await extractDocxText(bytes)
    expect(text).toContain('Ampersand & <Angle> "Quote"')
  })

  it('builds a portal-safe filename from a Nordic or Spanish name', () => {
    /**
     * `ø` is not an accented `o` — it is U+00F8, with no NFD decomposition, and so are `æ` and `ß`.
     * Stripping combining marks alone produced `Marta-S-rensen-CV.docx`: a Danish nurse's name mangled
     * in the filename of the document she is about to send to a Danish hospital.
     */
    const named = (fullName: string) =>
      docxFilename(
        Resume.parse({ ...resume, basics: { ...resume.basics, fullName } }),
      )

    expect(named('Marta Sørensen')).toBe('Marta-Sorensen-CV.docx')
    expect(named('Mads Kjærgaard')).toBe('Mads-Kjaergaard-CV.docx')
    expect(named('Åse Bjørn')).toBe('Ase-Bjorn-CV.docx')
    expect(named('Rocío Muñoz')).toBe('Rocio-Munoz-CV.docx')
    // Still ASCII-only, and never an empty or dot-leading name a portal would refuse.
    expect(named('林 建宏')).toBe('CV.docx')
  })
})

describe('every date in the document has one shape', () => {
  /**
   * ATS ruleset 7: `MMM YYYY`, consistently everywhere. It is not a style preference — a parser that
   * has locked onto one date shape stops recognising the other, so the odd one out loses its date.
   *
   * Found by reading a rendered document rather than by testing: the certifications line printed
   * `2014-07` in a CV whose every other date said `Jul 2014`, because `cert.date` is a raw `YYYY-MM`
   * string in the schema and it was passed straight through.
   */
  for (const { name, resume } of fixtures) {
    it(`${name} contains no raw YYYY-MM date of our own making`, async () => {
      /**
       * Personal details are excluded, and the distinction is the point: `Date of birth: 1988-04-12` on
       * a European-convention CV is a `label: value` pair **the candidate typed**. Reformatting it would
       * be editing their document, which this product does not do without being asked. The rule binds
       * the dates *we* produce — employment, education, certifications.
       */
      const text = await extractDocxText(renderDocx(resume))
      const ours = resume.basics.personalDetails.reduce(
        (rest, detail) => rest.split(detail.value).join(''),
        text,
      )
      // A bare `2014-07`, but not a year range like `2010 – 2014`.
      expect(ours).not.toMatch(/\b\d{4}-\d{2}\b/)
    })

    it(`${name} formats every certification date`, async () => {
      const text = await extractDocxText(renderDocx(resume))
      for (const cert of resume.certifications) {
        if (cert.date === undefined) continue
        expect(text).toContain(
          formatYearMonth(cert.date, resolveLocale(resume.locale)),
        )
      }
    })
  }

  it('keeps a qualification and its field as one phrase', async () => {
    // `BSc — Nursing — Institution` reads as three separate things; the degree's name is `BSc Nursing`.
    const [{ resume }] = fixtures
    const withDegree = Resume.parse({
      ...resume,
      education: [
        {
          institution: 'Københavns Professionshøjskole',
          degree: 'BSc',
          field: 'Nursing',
        },
      ],
    })
    const text = await extractDocxText(renderDocx(withDegree))
    expect(text).toContain('BSc Nursing — Københavns Professionshøjskole')
  })
})
