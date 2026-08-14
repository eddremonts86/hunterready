# 05 — PDF Rendering with pdfcn

Research date: 2026-08-13. Sources at the bottom.

## What pdfcn actually is

A **shadcn-style registry of copy-paste React components that render to PDF**.
Not an npm dependency — you install components into your own tree and own them:

```bash
npx shadcn@latest add @pdfcn/takumi/text
```

`components.json`:

```json
{
  "registries": {
    "@pdfcn": "https://pdfcn.dev/r/{name}.json"
  }
}
```

Usage shape:

```tsx
import { Document, Page } from '@/components/pdf/pdf-primitives'
import { PdfcnThemeProvider } from '@/components/pdf/theme-provider'
import { Text } from '@/components/pdf/text'

export function Cv({ resume }) {
  return (
    <Document>
      <Page size="A4">
        <PdfcnThemeProvider>
          <Text variant="title">{resume.basics.fullName}</Text>
        </PdfcnThemeProvider>
      </Page>
    </Document>
  )
}
```

### Inventory (24 components, per renderer)

Alert · Badge · Card · Data Table · Divider · Form · Graph · Heading ·
**Keep Together** · Key Value · Link · List · **Page Break** · Page Footer ·
Page Header · **Page Number** · PDF Image · QR Code · **Section** · Signature ·
Stack · Table · Text · Watermark

The four in bold are the ones a CV actually lives or dies on.

### 9 themes

`professional` · `modern` · `minimal` · `executive` · `corporate` · `elegant` ·
`vivid` · `forest` · `blueprint`

### Blocks

6 invoice templates + 4 report templates. **There is no résumé/CV block.**

## Verdict: use it — with eyes open

### Why it fits

- **Vector PDF with real, selectable, searchable text** and embedded font subsets.
  This is non-negotiable for ATS and it is exactly what `takumi-pdf` produces.
- **No Chromium.** `takumi-pdf` is a Rust engine compiled to WASM; runs on Node,
  Bun and Cloudflare Workers. Small image, fast cold start, cheap to host — versus
  a Puppeteer pipeline that is ~400 MB and slow.
- **Templates are React + Tailwind classes.** A CV template becomes a testable
  pure function `Resume → JSX`, reviewable in a normal PR.
- **`break-inside: avoid` / `Keep Together`** solves the single most annoying CV
  layout bug: a job entry split across a page boundary.
- **Themes give us "vistoso" for free** on day one, and a token surface to build on.

### Real caveats — plan around these

1. **No CV block exists.** We build the CV templates ourselves. This is a cost in
   v0.1 and an asset afterwards: the templates are our differentiator, not pdfcn's.
2. **Copy-paste means no upgrades.** Once vendored, upstream fixes do not flow in.
   Mitigation: keep `components/pdf/` untouched, note the install date and
   component list in `components/pdf/VENDORED.md`, and re-run the CLI deliberately.
3. **The project is young.** License and maintenance guarantees are not documented
   on the site. Before committing, confirm the license (see open questions in
   [09-decisions.md](09-decisions.md)). The blast radius is bounded — `takumi-pdf`
   underneath is a normal npm package with an active upstream repo, so worst case
   we keep the vendored components and drop the registry.
4. **`oklch` is not supported.** Colors must be hex (`rgb()`/`hsl()` also work).
   Tailwind v4 / shadcn tokens are oklch by default, so the app palette and the PDF
   palette **cannot share tokens**. Maintain `render/themes/*.ts` as an explicit hex
   mirror with a comment pointing at the source token. Do not try to be clever here.
5. **CSS is a Tailwind-ish subset with explicit flexbox** (Satori lineage). No grid,
   no `position: sticky`, limited pseudo-elements. Templates must be written
   flex-first from the start; retrofitting is painful.
6. **WASM bundling under Vite/Nitro is the top technical risk.** Verified in Block 1
   of the plan before anything is built on top. Fallback: Next.js, or isolate the
   renderer in a tiny standalone Node service.

### Renderer choice: Takumi, not Forme

pdfcn ships the same 24 components against two backends. Take **Takumi**:
it has a public Rust upstream (`kane50613/takumi`), documented benchmarks, edge
runtime support, and its own docs site. Forme is opaque by comparison. The
component API is identical, so this is reversible if Takumi disappoints.

### The renderer API

```ts
import { render } from "takumi-pdf";
import { writeFile } from "node:fs/promises";

const pdf: Uint8Array = await render(<Cv resume={resume} />, {
  size: "a4",                              // "a4" | "letter" | { width, height }
  margin: { top: 48, right: 40, bottom: 48, left: 40 },
  fonts: bundledFonts,                     // load from disk, NOT googleFonts() at request time
  footer: (
    <div tw="flex w-full justify-end text-[8px] text-gray-400">
      <span className="pageNumber" />/<span className="totalPages" />
    </div>
  ),
});
```

For multiple font sets, `PdfRenderer` + `registerFont()` allows reuse across
requests — worth it once there is more than one template.

---

## The ATS ruleset (binding on every template)

These are constraints, not suggestions. A template that violates them does not ship.

**Layout**

1. **Single column for all content an ATS must read.** A decorative sidebar may
   hold only redundant information (a repeat of the location, a photo).
2. **No layout tables** for experience or education. `Table`/`Data Table` are for
   genuinely tabular data only.
3. Reading order must equal visual order — top to bottom, one stream.

**Text**

4. Contact details as **text**, never inside `PdfImage`.
5. Icons never carry meaning alone. `✉ ei@…` is fine; a bare `✉` is not.
6. Standard section headings: `Experience`, `Education`, `Skills`, `Projects`,
   `Certifications`, `Languages`. Creative headings ("My Journey") are penalized
   by real parsers. Template-level override allowed only with a warning in the UI.
7. Dates as `MMM YYYY – MMM YYYY`, `Present` for current, consistent everywhere.
8. No skill rating bars/dots — they extract as noise and communicate nothing.
9. No headers/footers containing information that appears nowhere else. Many ATS
   drop the header region entirely.

**Document**

10. Set PDF metadata: `Title = "<Full Name> — <Headline>"`, `Author = "<Full Name>"`.
    Free wins for both recruiters and parsers.
11. Embed font subsets (takumi-pdf default). No exotic ligature-heavy display faces
    for body text.
12. Target 1 page under 8 years' experience, 2 pages otherwise. Warn at 3+.

## The ATS round-trip test — the core verifier

The differentiating mechanism of the whole product. In CI, per template, per fixture:

```
Resume fixture ──▶ render() ──▶ PDF bytes ──▶ extract text (unpdf, independent parser)
                                                        │
                                                        ▼
   assert: fullName, email, phone present
   assert: every work[].company and work[].role present
   assert: every date range present in "MMM YYYY" form
   assert: every skills[].items[] entry present
   assert: reading order — work[0].company appears before work[1].company
   assert: no critical string is split by a stray newline mid-token
```

Any failure fails the build. Run it against the v0.1 template before writing UI —
it is much cheaper to discover a layout constraint now than after four templates
depend on the same broken pattern.

## DOCX export — v0.6

Many ATS portals require or prefer `.docx`, and several of the worst ones parse it better than they
parse any PDF, so a PDF-only tool has a real hole. `src/render/docx/` fills it.

**The ruleset above is binding on it**, and almost every clause turns into an absence:

| clause                                      | in the `.docx`                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| single column, reading order = visual order | one flat stream of paragraphs; there is no other order it _can_ be written in                           |
| no layout tables                            | no `<w:tbl>` anywhere — not for experience, not for education, not for skills                           |
| contact details as text                     | a plain paragraph; the separator is `·` and never `\|`, which several parsers read as a column boundary |
| standard headings                           | `Heading1` styles carrying real outline levels, so a parser sees a heading rather than a bold paragraph |
| `MMM YYYY – MMM YYYY`                       | the same `formatRange` the PDF path uses, so the two formats cannot drift                               |
| no header/footer information                | no `headerReference` or `footerReference` at all                                                        |
| document metadata                           | `dc:title` and `dc:creator` in `docProps/core.xml`                                                      |

No template or theme choice. There is one ATS-safe Word layout, and `?format=docx` deliberately ignores
`template` and `theme` rather than selling a design decision the format cannot honour.

### Hand-written, and why

Both the OOXML and a ~150-line ZIP writer, rather than a document library. The guarantee here turns on
what is _not_ in the file, and a library that helpfully wraps an experience block in a table would break
it invisibly. The same trade was already made once in this project, writing a PDF content stream by hand
for the interleaved fixture. It is only safe because of the test below.

The archive carries no timestamps, so rendering the same CV twice produces byte-identical output — which
is what lets the suite tell a real change from a passing second.

### The DOCX round-trip test

Identical discipline to the PDF one, in `src/render/docx/__tests__/`. Render → read back with
**mammoth**, an independent parser already present because ingestion reads `.docx` with it → assert every
critical field survived, in reading order.

It also asserts the **absences** directly against `word/document.xml`, because a parser cannot report
what a document does not contain: no `w:tbl`, no `w:txbxContent`, no `w:drawing`, no `w:pict`, no header
or footer reference.

Two defects it did not catch, both found by opening a rendered document and reading it:

- **`2014-07` in the certifications line**, in a CV whose every other date said `Jul 2014`. `cert.date`
  is a raw `YYYY-MM` string in the schema and it was passed straight through — the exact mixture clause 7
  forbids. There is now a test that no date _we produce_ has that shape. Personal details are excluded
  from it on purpose: `Date of birth: 1988-04-12` is a value the candidate typed, and reformatting it
  would be editing their document.
- **`BSc — Nursing — Institution`**, which reads as three separate things. `BSc Nursing` is one phrase.

And one the test did catch, which matters for two of the three languages this product targets: `ø` has no
NFD decomposition — it is U+00F8, not an accented `o` — so stripping combining marks turned
`Marta Sørensen` into `Marta-S-rensen-CV.docx`. Same for `æ` and `ß`; there is a transliteration map now.

## Template plan

| id            | Name                   | Look                                                                             | ATS rating      | Ships |
| ------------- | ---------------------- | -------------------------------------------------------------------------------- | --------------- | ----- |
| `modern-intl` | Modern (International) | single column, generous whitespace, no photo, no personal details, 1-page target | ✅ verified     | v0.1  |
| `modern-eu`   | Modern (European)      | same skeleton, photo slot + optional personal-details block, 2-page target       | ✅ verified     | v0.1  |
| `executive`   | Executive              | serif headings, formal, both convention variants                                 | ✅ verified     | v0.2  |
| `compact`     | Compact                | tighter scale, fits 12+ years on 2 pages                                         | ✅ verified     | v0.2  |
| `showcase`    | Showcase               | 2-column with decorative sidebar, portfolio-oriented                             | ⚠️ design-first | v0.3  |

**Both regional conventions ship in v0.1** (confirmed 2026-08-13). They are not a
default plus an override — they are two peers, chosen by the user:

- _International:_ no photo, no personal details (age, nationality, marital status),
  one page under ~8 years of experience.
- _European / Nordic:_ photo is normal, two pages are normal, nationality and date of
  birth sometimes expected.

Neither can be imposed on the other, so `modern-intl` and `modern-eu` share one
skeleton and differ in which blocks render. The photo is the only `PdfImage` in the
system, and the ATS ruleset above still holds: nothing but the photo may be an image,
and the round-trip test runs against both variants independently.

The ATS rating is shown in the UI. `showcase` carries an explicit "may not parse
cleanly in older ATS — use for direct/human applications" warning. Being honest
about this is a feature.

Each theme from pdfcn is exposed as a **color/type preset** independent of the
template, giving 5 templates × 9 themes without 45 hand-built files.

### Templates use print-side tokens only

Binding, from [DESIGN.md](../DESIGN.md)'s **Amber Never Touches The Print Rule**: a CV
template may use Print Black (`#0D0D0D`), Silver Gray (`#BDBDBD`), Developer Gray
(`#6E6E6E`) and Tray Enamel (`#F3E6C4`) or white. Safelight Amber and Amber Shadow are
the room's colors and are forbidden inside a document. pdfcn's 9 themes are the user's
choice of document palette and are exempt — they are the print's ink, not our brand.

Convenient consequence: every print-side token is already hex, which is what the
renderer requires anyway.

---

## Sources

- [pdfcn docs](https://www.pdfcn.dev/docs) — [installation](https://www.pdfcn.dev/docs/installation), [registry](https://www.pdfcn.dev/docs/registry), [components](https://www.pdfcn.dev/docs/components), [blocks](https://www.pdfcn.dev/docs/blocks), [Takumi theming](https://www.pdfcn.dev/docs/theming/takumi), [llms.txt](https://www.pdfcn.dev/llms.txt)
- [takumi-pdf docs](https://takumi.kane.tw/docs/pdf) · [Takumi intro](https://takumi.kane.tw/docs) · [comparison](https://takumi.kane.tw/docs/pdf/comparison)
- [kane50613/takumi on GitHub](https://github.com/kane50613/takumi)
- pdfcn ships a shadcn MCP integration ([docs/mcp](https://www.pdfcn.dev/docs/mcp)) — worth wiring into the AI-OS MCP config so component installs are agent-driven.
