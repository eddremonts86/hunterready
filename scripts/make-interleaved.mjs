/**
 * Generate `fixtures/input/two-column-interleaved.pdf` — the hard case, honestly.
 *
 *   node scripts/make-interleaved.mjs
 *
 * The other two-column fixture is rendered by takumi-pdf, which emits its text layer in DOM order:
 * the whole sidebar, then the whole main column. That is *tidier* than reality, so it never exercised
 * the failure column detection exists for. `fixtures/input/README.md` has said so for two rounds.
 *
 * A real Canva/Enhancv/Word export interleaves, because the layout engine walks the page in visual
 * rows: a sidebar skill is emitted between a job's title and its dates. This writes the content
 * stream by hand so the drawing order is exactly that — every item sorted by baseline across *both*
 * columns — while the coordinates stay correct.
 *
 * Two properties make it a genuine test rather than a prop:
 *
 *  • Item order in the file is interleaved, and the script reports how thoroughly: it prints the
 *    number of column switches in drawing order, which is 2 for a sidebar-then-main layout and 31 here.
 *  • Nothing else is weakened: real base-14 fonts with WinAnsi encoding, so accented characters and a
 *    genuine `/Helvetica-Bold` face both survive — the same signals a real export carries.
 *
 * It is scored against `fixtures/expected/switcher.json`, the same expected result as the DOM-order
 * fixture, so the two can be compared directly: same CV, same content, different text layer.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const OUT = join(ROOT, 'fixtures/input/two-column-interleaved.pdf')

const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842

/** A4 geometry mirroring a designed sidebar template. */
const SIDEBAR_X = 40
const MAIN_X = 232
const TOP = 64

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function fmt(date) {
  if (date === null || date === undefined) return 'Present'
  const [year, month] = date.split('-')
  return month ? `${MONTHS[Number(month) - 1]} ${year}` : year
}

/**
 * Lay out one column, top down. Returns items with absolute coordinates.
 *
 * `y` counts downward from the top for readability here and is flipped to PDF's bottom-left origin
 * only at write time, in one place.
 */
function column(x, startY, blocks) {
  const items = []
  let y = startY
  for (const block of blocks) {
    if (block.gap !== undefined) {
      y += block.gap
      continue
    }
    items.push({
      x,
      y,
      text: block.text,
      size: block.size,
      bold: block.bold === true,
    })
    y += block.size * 1.45
  }
  return items
}

function buildColumns(resume) {
  const basics = resume.basics

  const sidebar = column(SIDEBAR_X, TOP, [
    ...basics.fullName
      .split(' ')
      .map((part) => ({ text: part, size: 17, bold: true })),
    { gap: 14 },
    { text: basics.email, size: 8 },
    { text: basics.phone, size: 8 },
    { text: basics.location?.city ?? '', size: 8 },
    { gap: 16 },
    { text: 'DATOS', size: 9, bold: true },
    ...basics.personalDetails.map((detail) => ({
      text: `${detail.label}: ${detail.value}`,
      size: 8,
    })),
    { gap: 16 },
    // Skill groups: a bold caps label over its own regular-weight list.
    ...resume.skills.flatMap((group) => [
      { text: group.category.toUpperCase(), size: 9, bold: true },
      ...group.items.map((item) => ({ text: item, size: 8 })),
      { gap: 10 },
    ]),
    { text: 'IDIOMAS', size: 9, bold: true },
    ...resume.languages.map((language) => ({
      text: `${language.name} — ${language.raw ?? language.level ?? ''}`,
      size: 8,
    })),
  ])

  const main = column(MAIN_X, TOP, [
    { text: basics.headline ?? '', size: 11, bold: true },
    { gap: 8 },
    // The summary is pre-wrapped: a text layer has no concept of a paragraph.
    ...wrap(basics.summary ?? '', 74).map((line) => ({ text: line, size: 9 })),
    { gap: 16 },
    { text: 'EXPERIENCIA', size: 10, bold: true },
    { gap: 4 },
    ...resume.work.flatMap((job) => [
      { text: job.role, size: 10, bold: true },
      {
        text: `${job.company} · ${fmt(job.startDate)} – ${fmt(job.endDate)}`,
        size: 8,
      },
      ...job.highlights.flatMap((highlight) =>
        wrap(`— ${highlight}`, 78).map((line) => ({ text: line, size: 8.5 })),
      ),
      { gap: 8 },
    ]),
    { text: 'FORMACIÓN', size: 10, bold: true },
    { gap: 4 },
    // Wrapped like everything else. An unwrapped line here ran past the MediaBox, and pdf.js
    // extracts nothing beyond the page edge — so the qualification arrived as "(2022 – 20" and the
    // institution was unrecoverable. Text outside the page does not exist as far as any parser is
    // concerned, which is worth knowing but is not what this fixture is for.
    ...resume.education.flatMap((entry) =>
      wrap(
        `${[entry.degree, entry.field].filter(Boolean).join(', ')} — ${entry.institution} (${fmt(entry.startDate)} – ${fmt(entry.endDate)})`,
        70,
      ).map((line) => ({ text: line, size: 9 })),
    ),
  ])

  return { sidebar, main }
}

function wrap(text, width) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const word of words) {
    if (line === '') line = word
    else if (`${line} ${word}`.length <= width) line = `${line} ${word}`
    else {
      lines.push(line)
      line = word
    }
  }
  if (line !== '') lines.push(line)
  return lines
}

/**
 * Typographic punctuation → its WinAnsi (CP1252) code point.
 *
 * WinAnsi is single-byte, and these characters live in the 0x80–0x9F range where Latin-1 keeps
 * control codes. Writing the file with `Buffer.from(text, 'latin1')` therefore truncated `–` (U+2013)
 * to the byte 0x13 and the dash simply vanished from the text layer.
 *
 * That silent loss cost real coverage: with no `–` on the metadata line, every employer, every date
 * and every bullet in this fixture failed to parse, and the resulting 43% looked like a column-detection
 * problem rather than an encoding one.
 */
const WINANSI = new Map([
  ['\u2013', '\u0096'], // en dash
  ['\u2014', '\u0097'], // em dash
  ['\u2018', '\u0091'], // left single quote
  ['\u2019', '\u0092'], // right single quote / apostrophe
  ['\u201C', '\u0093'], // left double quote
  ['\u201D', '\u0094'], // right double quote
  ['\u2022', '\u0095'], // bullet
  ['\u2026', '\u0085'], // ellipsis
])

/**
 * PDF string literal, WinAnsi-encoded. Only `\`, `(` and `)` are special inside `( )`.
 *
 * Throws on anything it cannot encode rather than dropping it. A fixture that quietly loses characters
 * is worse than no fixture: it reports a parser defect that does not exist.
 */
function escapeText(text) {
  const encoded = [...text]
    .map((character) => WINANSI.get(character) ?? character)
    .join('')

  const offending = [...encoded].find(
    (character) => character.codePointAt(0) > 0xff,
  )
  if (offending !== undefined) {
    throw new Error(
      `cannot encode U+${offending.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} ` +
        `(${offending}) in WinAnsi — add it to the WINANSI map, in ${JSON.stringify(text)}`,
    )
  }

  return encoded
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function contentStream(items) {
  const operators = ['BT']
  let currentFont = ''
  for (const item of items) {
    const font = `${item.bold ? '/F2' : '/F1'} ${item.size}`
    if (font !== currentFont) {
      operators.push(`${font} Tf`)
      currentFont = font
    }
    // Absolute text matrix per item: no dependence on the previous item's position, so the drawing
    // order can be anything without moving a single glyph.
    operators.push(
      `1 0 0 1 ${item.x.toFixed(2)} ${(PAGE_HEIGHT - item.y).toFixed(2)} Tm`,
    )
    operators.push(`(${escapeText(item.text)}) Tj`)
  }
  operators.push('ET')
  return operators.join('\n')
}

/** Assemble the file with a correct xref table, offsets counted in bytes not characters. */
function buildPdf(stream) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      '/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
  ]

  let pdf = '%PDF-1.4\n'
  const offsets = []
  for (const [index, body] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'))
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  }

  const xrefOffset = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`

  // latin1, because WinAnsiEncoding is a single-byte encoding and the accented characters in this
  // CV ("Rocío", "Logístico", "FORMACIÓN") must reach the file as one byte each.
  return Buffer.from(pdf, 'latin1')
}

const resume = JSON.parse(
  await readFile(join(ROOT, 'fixtures/expected/switcher.json'), 'utf8'),
)
const { sidebar, main } = buildColumns(resume)

/**
 * The whole point: emission order is visual-row order across both columns, not column by column.
 * A stable sort keeps left-before-right for items sharing a baseline, which is what a layout engine
 * walking a row does.
 */
const interleaved = [...sidebar, ...main].sort((a, b) => a.y - b.y || a.x - b.x)

await writeFile(OUT, buildPdf(contentStream(interleaved)))

// How thoroughly the two columns actually alternate. A number near 1 would mean we had accidentally
// rebuilt the DOM-order fixture, and the whole exercise would be pointless.
let runs = 1
for (let i = 1; i < interleaved.length; i++) {
  const previousSide = interleaved[i - 1].x < MAIN_X ? 'L' : 'R'
  const side = interleaved[i].x < MAIN_X ? 'L' : 'R'
  if (side !== previousSide) runs++
}

console.log(
  `wrote fixtures/input/two-column-interleaved.pdf\n` +
    `  ${interleaved.length} text items\n` +
    `  ${runs} column switches in drawing order (2 would mean sidebar-then-main)`,
)
