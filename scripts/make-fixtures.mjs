/**
 * Generate the input fixtures we can synthesize, from the hand-written expected JSON.
 *
 *   node scripts/make-fixtures.mjs
 *
 * Honest limitation, stated up front: a PDF we render ourselves emits its text layer in
 * DOM order, which is *tidier* than a real Canva/Enhancv/Word export. So the generated
 * two-column fixture is a weak proxy for the hard case — useful for wiring the pipeline,
 * not sufficient for proving column detection. See fixtures/input/README.md for the
 * fixtures that still need real-world files.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { render } from 'takumi-pdf'

const ROOT = new URL('..', import.meta.url).pathname
const OUT = join(ROOT, 'fixtures/input')
const FONT = '/System/Library/Fonts/Supplemental/Arial.ttf'
const FONT_BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'

/**
 * Both weights, and this matters more than it looks.
 *
 * Registering only the regular face meant every `font-weight:700` in these fixtures rendered in
 * regular — so the generated PDFs contained **no bold text anywhere**, and the ingestion pipeline saw
 * a document flatter than any real CV. Two heading rules were then built to work around an absence
 * that was our own doing: the sidebar's category labels were indistinguishable from their own list
 * items, and five of ten skills were unrecoverable by construction.
 *
 * A fixture must not be *harder* than reality in ways reality never is.
 */
const fonts = [
  { name: 'Arial', data: await readFile(FONT), weight: 400 },
  { name: 'Arial', data: await readFile(FONT_BOLD), weight: 700 },
]
const base = {
  size: 'a4',
  margin: { top: 48, right: 44, bottom: 48, left: 44 },
  fonts,
}

const load = async (name) =>
  JSON.parse(await readFile(join(ROOT, 'fixtures/expected', name), 'utf8'))

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

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

/** "2019-03" → "Mar 2019"; null → "Present" — the format the ATS ruleset mandates. */
function fmt(d) {
  if (d === null || d === undefined) return 'Present'
  const [y, m] = d.split('-')
  return m ? `${MONTHS[Number(m) - 1]} ${y}` : y
}

const contact = (b) =>
  [
    b.email,
    b.phone,
    [b.location?.city, b.location?.country].filter(Boolean).join(', '),
  ]
    .filter(Boolean)
    .join('  ·  ')

/** Single column, the layout every parser handles. The baseline case. */
function singleColumn(r) {
  const b = r.basics
  const section = (title, body) => `
    <div style="display:flex;flex-direction:column;gap:6px;margin-top:18px">
      <div style="font-size:11px;font-weight:700;letter-spacing:1.4px">${esc(title)}</div>
      <div style="height:1px;background:#999999"></div>
      ${body}
    </div>`

  const job = (w) => `
    <div style="display:flex;flex-direction:column;gap:2px;margin-top:10px;break-inside:avoid">
      <div style="font-size:12px;font-weight:700">${esc(w.role)} — ${esc(w.company)}</div>
      <div style="font-size:9.5px;color:#666666">${fmt(w.startDate)} – ${fmt(w.endDate)}${w.location ? ` · ${esc(w.location)}` : ''}</div>
      ${w.highlights.map((h) => `<div style="font-size:10px;margin-top:2px">• ${esc(h)}</div>`).join('')}
    </div>`

  return `
    <div style="display:flex;flex-direction:column;font-family:Arial;color:#111111">
      <div style="font-size:24px;font-weight:700">${esc(b.fullName)}</div>
      ${b.headline ? `<div style="font-size:12px;color:#444444;margin-top:2px">${esc(b.headline)}</div>` : ''}
      <div style="font-size:9.5px;color:#666666;margin-top:6px">${esc(contact(b))}</div>
      ${b.summary ? `<div style="font-size:10px;margin-top:12px">${esc(b.summary)}</div>` : ''}
      ${section('EXPERIENCE', r.work.map(job).join(''))}
      ${section(
        'EDUCATION',
        r.education
          .map(
            (e) =>
              `<div style="font-size:10.5px;margin-top:6px">${esc([e.degree, e.field].filter(Boolean).join(' '))} — ${esc(e.institution)} <span style="color:#666666">(${fmt(e.startDate)} – ${fmt(e.endDate)})</span></div>`,
          )
          .join(''),
      )}
      ${section(
        'SKILLS',
        r.skills
          .map(
            (s) =>
              `<div style="font-size:10px;margin-top:4px"><span style="font-weight:700">${esc(s.category)}:</span> ${esc(s.items.join(', '))}</div>`,
          )
          .join(''),
      )}
      ${r.certifications.length ? section('CERTIFICATIONS', r.certifications.map((c) => `<div style="font-size:10px;margin-top:3px">${esc(c.name)}${c.issuer ? ` — ${esc(c.issuer)}` : ''} <span style="color:#666666">${fmt(c.date)}</span></div>`).join('')) : ''}
      ${r.languages.length ? section('LANGUAGES', `<div style="font-size:10px;margin-top:4px">${esc(r.languages.map((l) => `${l.name} (${l.raw ?? l.level ?? ''})`).join(' · '))}</div>`) : ''}
    </div>`
}

/** Sidebar left, content right — the designed-template shape the parser must survive. */
function twoColumn(r) {
  const b = r.basics
  const side = `
    <div style="display:flex;flex-direction:column;width:180px;background:#2f3b46;color:#ffffff;padding:22px 16px;gap:16px">
      <div style="font-size:18px;font-weight:700;line-height:1.15">${esc(b.fullName)}</div>
      <div style="display:flex;flex-direction:column;gap:3px;font-size:8.5px">
        ${[b.email, b.phone, b.location?.city]
          .filter(Boolean)
          .map((v) => `<div>${esc(v)}</div>`)
          .join('')}
      </div>
      ${b.personalDetails.length ? `<div style="display:flex;flex-direction:column;gap:3px"><div style="font-size:9px;font-weight:700;letter-spacing:1px">DATOS</div>${b.personalDetails.map((p) => `<div style="font-size:8.5px">${esc(p.label)}: ${esc(p.value)}</div>`).join('')}</div>` : ''}
      ${r.skills.map((s) => `<div style="display:flex;flex-direction:column;gap:2px"><div style="font-size:9px;font-weight:700;letter-spacing:1px">${esc(s.category.toUpperCase())}</div>${s.items.map((i) => `<div style="font-size:8.5px">${esc(i)}</div>`).join('')}</div>`).join('')}
      ${r.languages.length ? `<div style="display:flex;flex-direction:column;gap:2px"><div style="font-size:9px;font-weight:700;letter-spacing:1px">IDIOMAS</div>${r.languages.map((l) => `<div style="font-size:8.5px">${esc(l.name)} — ${esc(l.raw ?? l.level ?? '')}</div>`).join('')}</div>` : ''}
    </div>`

  const main = `
    <div style="display:flex;flex-direction:column;flex-grow:1;padding:22px 20px;gap:4px">
      ${b.headline ? `<div style="font-size:12px;font-weight:700;color:#2f3b46">${esc(b.headline)}</div>` : ''}
      ${b.summary ? `<div style="font-size:9.5px;margin-top:6px">${esc(b.summary)}</div>` : ''}
      <div style="font-size:10px;font-weight:700;letter-spacing:1.2px;margin-top:14px;color:#2f3b46">EXPERIENCIA</div>
      ${r.work
        .map(
          (
            w,
          ) => `<div style="display:flex;flex-direction:column;gap:1px;margin-top:8px;break-inside:avoid">
            <div style="font-size:11px;font-weight:700">${esc(w.role)}</div>
            <div style="font-size:9px;color:#555555">${esc(w.company)} · ${fmt(w.startDate)} – ${fmt(w.endDate)}</div>
            ${w.highlights.map((h) => `<div style="font-size:9px;margin-top:1px">— ${esc(h)}</div>`).join('')}
          </div>`,
        )
        .join('')}
      ${r.projects.length ? `<div style="font-size:10px;font-weight:700;letter-spacing:1.2px;margin-top:14px;color:#2f3b46">PROYECTOS</div>${r.projects.map((p) => `<div style="display:flex;flex-direction:column;margin-top:6px"><div style="font-size:10px;font-weight:700">${esc(p.name)}</div><div style="font-size:9px">${esc(p.description ?? '')}</div></div>`).join('')}` : ''}
      <div style="font-size:10px;font-weight:700;letter-spacing:1.2px;margin-top:14px;color:#2f3b46">FORMACIÓN</div>
      ${r.education.map((e) => `<div style="font-size:9.5px;margin-top:5px">${esc([e.degree, e.field].filter(Boolean).join(', '))} — ${esc(e.institution)} (${fmt(e.startDate)} – ${fmt(e.endDate)})</div>`).join('')}
    </div>`

  return `<div style="display:flex;flex-direction:row;font-family:Arial;color:#111111;min-height:100%">${side}${main}</div>`
}

/** Plain text — no structure at all beyond blank lines. */
function plainText(r) {
  const b = r.basics
  const lines = [
    b.fullName.toUpperCase(),
    b.headline ?? '',
    contact(b),
    '',
    'PROFILE',
    b.summary ?? '',
    '',
    'EXPERIENCE',
  ]
  for (const w of r.work) {
    lines.push(
      `${w.role}, ${w.company} (${fmt(w.startDate)} - ${fmt(w.endDate)})`,
    )
    for (const h of w.highlights) lines.push(`  - ${h}`)
    lines.push('')
  }
  lines.push('EDUCATION')
  for (const e of r.education) {
    lines.push(
      `${[e.degree, e.field].filter(Boolean).join(' ')}, ${e.institution} (${fmt(e.startDate)} - ${fmt(e.endDate)})`,
    )
  }
  lines.push('', 'SKILLS')
  for (const s of r.skills) lines.push(`${s.category}: ${s.items.join(', ')}`)
  /**
   * Certifications and languages belong here too.
   *
   * Leaving them out made the accuracy suite score this input against an expected result containing
   * a language the file did not mention — so the ceiling sat below 100% for a reason that had nothing
   * to do with extraction, and the missing point looked like a parser weakness. A fixture and its
   * expected result have to describe the same document.
   */
  if (r.certifications.length > 0) {
    lines.push('', 'CERTIFICATIONS')
    for (const c of r.certifications) {
      lines.push([c.name, c.issuer, fmt(c.date)].filter(Boolean).join(' — '))
    }
  }
  if (r.languages.length > 0) {
    lines.push('', 'LANGUAGES')
    for (const l of r.languages) {
      lines.push(`${l.name} (${l.raw ?? l.level ?? ''})`)
    }
  }
  return lines.join('\n') + '\n'
}

/**
 * The HTML the Word fixtures are converted from, written to `fixtures/src/`.
 *
 * It exists because it was missing. `sales-word.docx` and `legacy.doc` were produced from a source
 * that was never committed, so nobody could regenerate them — and the file that generated them said
 * different things from the expected result they are scored against: ISO dates instead of month names,
 * and no languages section at all. A fixture whose provenance is lost is a fixture you cannot trust.
 *
 * Semantic markup on purpose: `h2` for sections, `h3` for job titles, real `ul`/`li` for bullets. That
 * is what makes `mammoth` yield genuine structural hints, which is the whole point of having a Word
 * fixture rather than another PDF.
 */
function wordSource(r) {
  const b = r.basics
  const job = (w) => `
    <h3>${esc(w.role)} — ${esc(w.company)}</h3>
    <p>${fmt(w.startDate)} – ${fmt(w.endDate)}${w.location ? ` · ${esc(w.location)}` : ''}</p>
    <ul>${w.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>`

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(b.fullName)}</title></head>
<body>
  <h1>${esc(b.fullName)}</h1>
  <p>${esc(b.headline ?? '')}</p>
  <p>${esc(contact(b))}</p>
  <p>${esc(b.summary ?? '')}</p>
  <h2>Experience</h2>
  ${r.work.map(job).join('')}
  <h2>Education</h2>
  ${r.education.map((e) => `<p>${esc([e.degree, e.field].filter(Boolean).join(' '))} — ${esc(e.institution)} (${fmt(e.startDate)} – ${fmt(e.endDate)})</p>`).join('')}
  <h2>Skills</h2>
  ${r.skills.map((s) => `<p>${esc(s.category)}: ${esc(s.items.join(', '))}</p>`).join('')}
  ${r.certifications.length ? `<h2>Certifications</h2>${r.certifications.map((c) => `<p>${esc([c.name, c.issuer, fmt(c.date)].filter(Boolean).join(' — '))}</p>`).join('')}` : ''}
  ${r.languages.length ? `<h2>Languages</h2>${r.languages.map((l) => `<p>${esc(l.name)} (${esc(l.raw ?? l.level ?? '')})</p>`).join('')}` : ''}
</body></html>
`
}

await mkdir(OUT, { recursive: true })
await mkdir(join(ROOT, 'fixtures/src'), { recursive: true })

const sales = await load('sales-junior.json')
const nurse = await load('nurse-senior.json')
const switcher = await load('switcher.json')

const written = []

async function pdf(name, html, meta) {
  const bytes = await render(html, { ...base, metadata: meta })
  await writeFile(join(OUT, name), bytes)
  written.push(`${name}  ${(bytes.byteLength / 1024).toFixed(1)} KB`)
}

await pdf('clean-single-column.pdf', singleColumn(sales), {
  title: `${sales.basics.fullName} — ${sales.basics.headline}`,
  authors: [sales.basics.fullName],
})
// Named for the career stage, not a page count: at 10.5pt on A4 this content still fits
// one page. A genuine multi-page fixture is still owed to Block 4 — see README.
await pdf('nurse-senior.pdf', singleColumn(nurse), {
  title: `${nurse.basics.fullName} — ${nurse.basics.headline}`,
  authors: [nurse.basics.fullName],
})
await pdf('two-column-designed.pdf', twoColumn(switcher), {
  title: `${switcher.basics.fullName}`,
  authors: [switcher.basics.fullName],
})

await writeFile(join(OUT, 'plain.txt'), plainText(sales), 'utf8')
written.push('plain.txt')

await writeFile(
  join(ROOT, 'fixtures/src/sales-word.html'),
  wordSource(sales),
  'utf8',
)
written.push('../src/sales-word.html')

console.log('wrote:\n  ' + written.join('\n  '))
console.log(
  "\nThe Word pair is converted by the container's own LibreOffice — the same binary that\n" +
    'converts a user upload (ADR-012). From the project root:\n\n' +
    '  docker run --rm -v "$PWD/fixtures:/w" -w /w hunterready:local \\\n' +
    '    soffice --headless --convert-to "docx:MS Word 2007 XML" --outdir input src/sales-word.html\n' +
    '  docker run --rm -v "$PWD/fixtures:/w" -w /w hunterready:local \\\n' +
    '    soffice --headless --convert-to "doc:MS Word 97" --outdir input input/sales-word.docx\n',
)
