/**
 * DOCX export — v0.6, and the roadmap's highest-value non-obvious item.
 *
 * Many ATS portals require or prefer `.docx`, and several of the worst ones parse it far better than
 * they parse any PDF. A PDF-only tool has a real hole there, and it is not a cosmetic one: a candidate
 * who cannot upload the format the portal asks for does not apply.
 *
 * ## The ruleset decides what is *absent*
 *
 * docs/05's ATS ruleset is binding on this the same way it is binding on a template, and almost every
 * clause is about something not being here:
 *
 *   • **No tables.** Not for experience, not for education, not for a two-column skills list. This is
 *     the single most common way a real CV loses its employment history in a screener.
 *   • **No text boxes, no frames, no drawing objects.** They are commonly dropped entirely.
 *   • **No header or footer.** Many parsers discard those regions, so anything only there is gone.
 *   • **One reading order.** The document is a single flat stream of paragraphs, top to bottom, which
 *     is also the only order this file can be written in.
 *   • **Standard headings** — Experience, Education, Skills… — because real parsers key on them.
 *   • **Dates through `formatRange`**, the same function the PDF path uses, so the two formats cannot
 *     drift into disagreeing about a date range.
 *
 * What is left is deliberately plain: styled paragraphs, bold runs, and a bullet list. That is not a
 * limitation being apologised for — it is the product. A `.docx` that looks designed is a `.docx` that
 * parses badly.
 *
 * ## The print is not ours
 *
 * CLAUDE.md's hardest rule. No Signal Blue, no Figtree: this document uses a neutral ink and a face a
 * recruiter's Word will actually have. `Calibri` with `Carlito` as the metric-compatible fallback,
 * because a font a reader lacks is substituted silently and can reflow the page.
 *
 * ## Verification
 *
 * `docx-roundtrip.test.ts` reads what this emits back with **mammoth** — an independent parser, already
 * a dependency because ingestion reads `.docx` with it — and asserts every critical field survived, in
 * reading order. Identical discipline to the PDF round trip, which is the mechanism the whole product
 * rests on.
 */
import { isSpacer } from '@/schema/resume'
import type { Resume } from '@/schema/resume'
import {
  formatLocation,
  formatRange,
  formatYearMonth,
  joinParts,
  resolveLocale,
} from '../format'
import { documentFilename } from '../filename'
import { strings } from '../locale'
import { zipSync } from './zip'

/* ────────────────────────────────────────────────────────────────────────────────────────────────
   XML plumbing
   ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Escape text for XML content.
 *
 * Also strips the control characters XML 1.0 forbids outright. A CV extracted from a PDF text layer
 * genuinely contains them — a stray U+0001 from a badly encoded source — and one of those makes the
 * whole document unopenable in Word, which is a far worse failure than losing an invisible character.
 */
function xml(text: string): string {
  return (
    text
      // eslint-disable-next-line no-control-regex -- the point is to remove exactly these
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  )
}

/**
 * One text run.
 *
 * `xml:space="preserve"` on every run, without exception. Word collapses leading and trailing
 * whitespace otherwise, which silently joins `Role` and `Company` into `RoleCompany` in exactly the
 * place a parser is looking for the boundary.
 */
function run(
  text: string,
  options: { bold?: boolean; italic?: boolean } = {},
): string {
  const properties =
    options.bold === true || options.italic === true
      ? `<w:rPr>${options.bold === true ? '<w:b/>' : ''}${options.italic === true ? '<w:i/>' : ''}</w:rPr>`
      : ''
  return `<w:r>${properties}<w:t xml:space="preserve">${xml(text)}</w:t></w:r>`
}

function paragraph(
  runs: string,
  options: { style?: string; list?: boolean; spacingAfter?: number } = {},
): string {
  const parts = [
    options.style === undefined ? '' : `<w:pStyle w:val="${options.style}"/>`,
    options.list === true
      ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'
      : '',
    options.spacingAfter === undefined
      ? ''
      : `<w:spacing w:after="${options.spacingAfter}"/>`,
  ].join('')
  const properties = parts === '' ? '' : `<w:pPr>${parts}</w:pPr>`
  return `<w:p>${properties}${runs}</w:p>`
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
   The static parts
   ──────────────────────────────────────────────────────────────────────────────────────────────── */

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`

/**
 * Styles, in half-points and twentieths of a point — Word's units, not ours.
 *
 * `Heading1`/`Heading2` carry `w:styleId` values Word and every parser recognise as outline levels.
 * That is not decoration: a parser deciding where the Experience section starts looks for a heading
 * style, and a bold paragraph that merely *looks* like a heading is body text to it.
 *
 * `Calibri` with `Carlito` as the fallback: metric-compatible, so a Linux reader without Calibri gets
 * the same line breaks rather than a reflowed page.
 */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>
<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Carlito" w:eastAsia="Calibri"/>
<w:sz w:val="21"/><w:szCs w:val="21"/><w:color w:val="1A1A1A"/>
</w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/>
<w:pPr><w:spacing w:after="40"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="40"/><w:color w:val="000000"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/>
<w:pPr><w:spacing w:after="120"/></w:pPr>
<w:rPr><w:sz w:val="24"/><w:color w:val="333333"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>
<w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
<w:pPr><w:outlineLvl w:val="0"/><w:spacing w:before="280" w:after="80"/>
<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="2" w:color="BFBFBF"/></w:pBdr></w:pPr>
<w:rPr><w:b/><w:caps/><w:sz w:val="22"/><w:color w:val="000000"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/>
<w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
<w:pPr><w:outlineLvl w:val="1"/><w:spacing w:before="160" w:after="0"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Meta"><w:name w:val="Meta"/>
<w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr>
<w:rPr><w:color w:val="474747"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/>
<w:basedOn w:val="Normal"/>
<w:pPr><w:ind w:left="360" w:hanging="180"/><w:spacing w:after="40"/></w:pPr></w:style>
</w:styles>`

/**
 * One bullet list definition.
 *
 * A real `w:numPr` list, not a hyphen typed at the start of a line. Word renders both the same and a
 * parser does not: a genuine list gives it item boundaries, where a hyphen leaves it guessing whether
 * the line is a new point or a continuation of the last one.
 */
const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>
<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/>
<w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="180"/></w:pPr>
<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:hint="default"/></w:rPr></w:lvl>
</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`

function coreProperties(resume: Resume): string {
  // Same metadata the PDF path sets (ATS ruleset 10). Free wins for recruiters and parsers alike.
  const title = joinParts(
    [resume.basics.fullName, resume.basics.headline],
    ' — ',
  )
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>${xml(title)}</dc:title>
<dc:creator>${xml(resume.basics.fullName)}</dc:creator>
<cp:lastModifiedBy>${xml(resume.basics.fullName)}</cp:lastModifiedBy>
</cp:coreProperties>`
}

const APP_PROPERTIES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Application>HunterReady</Application>
</Properties>`

/* ────────────────────────────────────────────────────────────────────────────────────────────────
   The document
   ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Standard section headings come from the CV's own locale — v0.8.
 *
 * Not configurable beyond that. A PDF template may override a heading with a warning shown in the UI; a
 * `.docx` goes to the portals that parse most crudely, so this is the one place the override is not
 * offered. Localizing them is not an exception to ATS ruleset 6 but the correct reading of it: a Danish
 * screener keys on `Erfaring`, and an English heading on a Danish CV was the violation.
 */

function section(title: string, body: Array<string>): Array<string> {
  if (body.length === 0) return []
  return [paragraph(run(title), { style: 'Heading1' }), ...body]
}

function bullets(items: Array<string>): Array<string> {
  return items
    .filter((item) => item.trim() !== '')
    .map((item) => paragraph(run(item), { style: 'ListBullet', list: true }))
}

function buildBody(resume: Resume): string {
  const { basics } = resume
  const locale = resolveLocale(resume.locale)
  const local = strings(locale)
  const paragraphs: Array<string> = []

  // ── Identity. Contact details as text, never an image (ATS ruleset 4). ──
  paragraphs.push(paragraph(run(basics.fullName), { style: 'Title' }))
  if (basics.headline !== undefined && basics.headline !== '') {
    paragraphs.push(paragraph(run(basics.headline), { style: 'Subtitle' }))
  }

  /**
   * The contact line, with a separator that survives extraction.
   *
   * `·` rather than `|`: a pipe is a column separator to several parsers, which read the line as a
   * one-row table and lose the fields. The email and phone are plain text so they are found by the
   * pattern-matchers that look for them.
   */
  const contact = joinParts(
    [
      basics.email,
      basics.phone,
      formatLocation(basics.location),
      ...basics.links.map((link) => link.url),
    ],
    '  ·  ',
  )
  if (contact !== '') {
    paragraphs.push(paragraph(run(contact), { style: 'Meta' }))
  }

  // European convention: personal details when the CV carries them, as label/value text.
  if (basics.personalDetails.length > 0) {
    paragraphs.push(
      paragraph(
        run(
          basics.personalDetails
            .map((detail) => `${detail.label}: ${detail.value}`)
            .join('  ·  '),
        ),
        { style: 'Meta' },
      ),
    )
  }

  if (basics.summary !== undefined && basics.summary !== '') {
    paragraphs.push(
      ...section(local.headings.summary, [paragraph(run(basics.summary))]),
    )
  }

  // ── Experience. One flat stream: heading, meta line, bullets. No table anywhere. ──
  const work = resume.work.flatMap((job) => {
    const out: Array<string> = []
    /**
     * Role and company in one heading paragraph, separated by an en dash.
     *
     * Two paragraphs read as two entries to some parsers, and a table cell each reads as neither. One
     * heading line holding both is the shape that survives most consistently, and the bold run makes
     * the boundary visible to a human at the same time.
     */
    out.push(
      paragraph(
        run(joinParts([job.role, job.company], ' — '), { bold: true }),
        { style: 'Heading2' },
      ),
    )
    const meta = joinParts(
      [formatRange(job.startDate, job.endDate, locale), job.location],
      '  ·  ',
    )
    if (meta !== '') out.push(paragraph(run(meta), { style: 'Meta' }))
    if (job.summary !== undefined && job.summary !== '') {
      out.push(paragraph(run(job.summary)))
    }
    out.push(...bullets(job.highlights))
    if (job.tech.length > 0) {
      out.push(
        paragraph(
          [run('Tools: ', { bold: true }), run(job.tech.join(', '))].join(''),
        ),
      )
    }
    return out
  })
  paragraphs.push(...section(local.headings.work, work))

  // ── Education ──
  const education = resume.education.flatMap((study) => {
    const out: Array<string> = []
    out.push(
      paragraph(
        /**
         * Degree and field joined by a space, then the institution by an em dash.
         *
         * `BSc — Nursing — Københavns Professionshøjskole` reads as three separate things and was what
         * came out of a naive three-way join. `BSc Nursing` is one phrase — it is the qualification's
         * name, and a parser looking for a degree wants it whole.
         */
        run(
          joinParts(
            [joinParts([study.degree, study.field], ' '), study.institution],
            ' — ',
          ),
          { bold: true },
        ),
        { style: 'Heading2' },
      ),
    )
    const meta = joinParts(
      [
        formatRange(study.startDate, study.endDate, locale),
        study.location,
        study.grade,
      ],
      '  ·  ',
    )
    if (meta !== '') out.push(paragraph(run(meta), { style: 'Meta' }))
    out.push(...bullets(study.highlights))
    return out
  })
  paragraphs.push(...section(local.headings.education, education))

  /**
   * Skills as `Category: a, b, c` — one paragraph per group.
   *
   * Not a two-column layout and not rating dots (ATS ruleset 8). A comma-separated line is what a
   * keyword matcher reads best, and it is also what a human skims fastest.
   */
  const skills = resume.skills
    .filter((group) => group.items.length > 0)
    .map((group) =>
      paragraph(
        [
          run(`${group.category}: `, { bold: true }),
          run(group.items.join(', ')),
        ].join(''),
      ),
    )
  paragraphs.push(...section(local.headings.skills, skills))

  // ── Projects ──
  const projects = resume.projects.flatMap((project) => {
    const out: Array<string> = [
      paragraph(
        run(joinParts([project.name, project.role], ' — '), { bold: true }),
        {
          style: 'Heading2',
        },
      ),
    ]
    if (project.description !== undefined && project.description !== '') {
      out.push(paragraph(run(project.description)))
    }
    out.push(...bullets(project.highlights))
    return out
  })
  paragraphs.push(...section(local.headings.projects, projects))

  // ── Certifications. Named in full: an abbreviation alone loses the keyword. ──
  const certifications = resume.certifications.map((cert) =>
    paragraph(
      run(
        joinParts(
          [
            cert.name,
            cert.issuer,
            /**
             * Through `formatYearMonth`, not raw.
             *
             * `cert.date` is a `YYYY-MM` string in the schema, and passing it straight through printed
             * `2014-07` in a document whose every other date said `Jul 2014`. ATS ruleset 7 forbids
             * exactly that mixture, and for a reason: a parser that has locked onto one date shape
             * stops recognising the other, so the certification loses its date entirely.
             */
            formatYearMonth(cert.date, locale),
            cert.identifier,
          ],
          '  ·  ',
        ),
      ),
    ),
  )
  paragraphs.push(...section(local.headings.certifications, certifications))

  // ── Languages ──
  const languages =
    resume.languages.length === 0
      ? []
      : [
          paragraph(
            run(
              resume.languages
                .map((language) => {
                  const level = language.level ?? language.raw
                  return level === undefined
                    ? language.name
                    : `${language.name} (${level})`
                })
                .join('  ·  '),
            ),
          ),
        ]
  paragraphs.push(...section(local.headings.languages, languages))

  /**
   * The remaining schema sections, so nothing on the CV is silently dropped.
   *
   * `awards` and `publications` are `CustomSection` (`{ title, items }`) and `volunteer` is a full
   * `WorkItem` — the schema's shapes, not the ones these names suggest. Worth stating, because writing
   * this from the names alone produced three type errors and would have produced three empty sections
   * if the fields had happened to be optional.
   */
  const grouped = (entries: Array<{ title: string; items: Array<string> }>) =>
    entries.flatMap((entry) => [
      paragraph(run(entry.title, { bold: true }), { style: 'Heading2' }),
      ...bullets(entry.items),
    ])

  paragraphs.push(...section(local.headings.awards, grouped(resume.awards)))
  paragraphs.push(
    ...section(
      local.headings.volunteer,
      resume.volunteer.flatMap((entry) => {
        const out: Array<string> = [
          paragraph(
            run(joinParts([entry.role, entry.company], ' — '), { bold: true }),
            { style: 'Heading2' },
          ),
        ]
        const meta = formatRange(entry.startDate, entry.endDate, locale)
        if (meta !== '') out.push(paragraph(run(meta), { style: 'Meta' }))
        out.push(...bullets(entry.highlights))
        return out
      }),
    ),
  )
  paragraphs.push(
    ...section(local.headings.publications, grouped(resume.publications)),
  )

  /**
   * `custom` sections last, with their own headings.
   *
   * Real CVs carry "Speaking", "Patents", "Military service", and the schema has an escape hatch for
   * them (ADR-001). Dropping them here would lose content the candidate deliberately kept.
   */
  for (const custom of resume.custom) {
    /*
      A spacer contributes nothing here, deliberately.

      Word has no pixels and this file has one fixed layout by design — `template` and `theme` are
      ignored for `.docx` because offering a choice of designs in the format uploaded to the crudest
      portals would be selling a decision that cannot be honoured. Emitting an empty paragraph to
      approximate the gap would put a stray blank line into exactly the document most likely to be
      machine-read. Skipping it loses no content: a spacer has none.
    */
    if (isSpacer(custom)) continue
    paragraphs.push(...section(custom.title, bullets(custom.items)))
  }

  /**
   * A4 with 2cm margins, and **no header or footer** (ATS ruleset 9).
   *
   * `w:sectPr` is the last child of the body, which is where the format requires it. The absence of
   * `<w:headerReference>` and `<w:footerReference>` is the point: a parser that discards those regions
   * cannot discard anything, because nothing is in them.
   */
  const sectionProperties =
    '<w:sectPr>' +
    '<w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="0" w:footer="0" w:gutter="0"/>' +
    '</w:sectPr>'

  return paragraphs.join('') + sectionProperties
}

/**
 * Render a `Resume` as `.docx` bytes.
 *
 * Deterministic: the same resume produces byte-identical output, because the archive carries no
 * timestamps (see `zip.ts`) and nothing here reads a clock.
 */
export function renderDocx(resume: Resume): Uint8Array {
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${buildBody(resume)}</w:body></w:document>`

  return zipSync([
    // `[Content_Types].xml` first, which the OPC specification requires.
    { path: '[Content_Types].xml', data: CONTENT_TYPES },
    { path: '_rels/.rels', data: ROOT_RELS },
    { path: 'word/document.xml', data: document },
    { path: 'word/_rels/document.xml.rels', data: DOCUMENT_RELS },
    { path: 'word/styles.xml', data: STYLES },
    { path: 'word/numbering.xml', data: NUMBERING },
    { path: 'docProps/core.xml', data: coreProperties(resume) },
    { path: 'docProps/app.xml', data: APP_PROPERTIES },
  ])
}

/**
 * `Marta Sørensen` → `Marta-Sorensen-CV.docx`. ASCII only: some portals reject non-ASCII names.
 *
 * The transliteration table that used to live here is now in `render/filename.ts`, shared with the PDF
 * path. That path had its own copy which handled `é` and mangled `ø`, so one nurse got two different
 * spellings of her own name from two buttons beside each other. Two copies of a subtle rule drift.
 */
export function docxFilename(resume: Resume): string {
  return documentFilename(resume.basics.fullName, 'docx')
}

/**
 * A cover letter as `.docx` — v0.7.
 *
 * Reuses every part except the body: same styles, same page setup, same absence of headers, tables and
 * text boxes. A letter has no sections to parse, so the ATS ruleset barely applies to it — but the
 * reasons for the *rest* of the file (a document that opens everywhere, no clock, ASCII filename) apply
 * unchanged, and having two ways to write a `.docx` in one codebase would be one too many.
 *
 * Blank lines in the text become empty paragraphs rather than being collapsed: they are the paragraph
 * breaks the writer intended, and a letter run together as one block does not get read.
 */
export function renderLetterDocx(text: string, resume: Resume): Uint8Array {
  const body =
    text
      .split(/\r?\n/)
      .map((line) =>
        line.trim() === '' ? paragraph('') : paragraph(run(line)),
      )
      .join('') +
    '<w:sectPr>' +
    '<w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="0" w:footer="0" w:gutter="0"/>' +
    '</w:sectPr>'

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`

  return zipSync([
    { path: '[Content_Types].xml', data: CONTENT_TYPES },
    { path: '_rels/.rels', data: ROOT_RELS },
    { path: 'word/document.xml', data: document },
    { path: 'word/_rels/document.xml.rels', data: DOCUMENT_RELS },
    { path: 'word/styles.xml', data: STYLES },
    { path: 'word/numbering.xml', data: NUMBERING },
    { path: 'docProps/core.xml', data: coreProperties(resume) },
    { path: 'docProps/app.xml', data: APP_PROPERTIES },
  ])
}

/** `Marta Sørensen` → `Marta-Sorensen-cover-letter.docx`. */
export function letterFilename(resume: Resume): string {
  return docxFilename(resume).replace(
    /-CV\.docx$|\.docx$/,
    '-cover-letter.docx',
  )
}
