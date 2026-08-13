# Input fixtures

Source documents for the ingestion pipeline. Each one has a hand-written expected result in
`fixtures/expected/`.

**No real CVs here.** Every file is synthetic. Real CVs are personal data and are gitignored
(`fixtures/private/`, `*.private.*`) — see [docs/07-privacy.md](../../docs/07-privacy.md).

## Generated

Everything here is reproducible, and that had to be fixed: the Word pair was originally produced from
an HTML source that was never committed, so nobody could regenerate it — and that lost file said
different things from the expected result it was scored against (ISO dates instead of month names, no
languages section at all). A fixture whose provenance is lost is a fixture you cannot trust.

```bash
node scripts/make-fixtures.mjs      # the PDFs, plain.txt, and fixtures/src/sales-word.html
node scripts/make-interleaved.mjs   # two-column-interleaved.pdf
```

The Word pair and the scan need system binaries, so they are generated **inside the container** — the
same LibreOffice and poppler that handle a user's upload (ADR-012):

```bash
docker run --rm -v "$PWD/fixtures:/w" -w /w --entrypoint soffice hunterready:local \
  --headless --convert-to "docx:MS Word 2007 XML" --outdir input src/sales-word.html
docker run --rm -v "$PWD/fixtures:/w" -w /w --entrypoint soffice hunterready:local \
  --headless --convert-to "doc:MS Word 97" --outdir input input/sales-word.docx   # then rename to legacy.doc
docker run --rm -v "$PWD:/app" -w /app -e HOME=/tmp --entrypoint node hunterready:local \
  scripts/make-scanned.mjs
```

| File                         | Sector                | What it stresses                                                                                                                                                                                                                                                           |
| ---------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clean-single-column.pdf`    | Account manager       | The baseline. Extraction must be ~100% here or something is badly wrong.                                                                                                                                                                                                   |
| `nurse-senior.pdf`           | ICU nurse             | 15-year history across 4 roles and 3 employers, licence numbers, CEFR language levels, Danish characters (ø, å, é) that stress font subsetting. A wrapped summary — which is how the "cut off mid-sentence" bug was found.                                                 |
| `two-column-designed.pdf`    | Warehouse → logistics | Sidebar + main column, Spanish headings, EU personal-details block, skills as bare lines with no delimiter, and a name broken across three lines. Text layer is column-sequential.                                                                                         |
| `two-column-interleaved.pdf` | Warehouse → logistics | **The same CV, interleaved.** Content stream written by hand so drawing order is visual-row order across both columns — 33 column switches across 48 items. Two fixtures for one document is the point: identical content, so any score difference is reading order alone. |
| `scanned.pdf`                | Account manager       | Image-only, no text layer at all (asserted with `pdftotext`). 200 dpi grayscale JPEG, the settings a cheap office scanner produces. Exercises OCR end to end.                                                                                                              |
| `plain.txt`                  | Account manager       | No structure beyond blank lines and ALL-CAPS headings.                                                                                                                                                                                                                     |
| `sales-word.docx`            | Account manager       | Real Word XML with heading styles and `<ul>` bullets, so `mammoth` yields genuine structural hints.                                                                                                                                                                        |
| `legacy.doc`                 | Account manager       | Real binary OLE2, exercising the LibreOffice conversion path (ADR-008/012).                                                                                                                                                                                                |

## A fixture must not be harder than reality

Twice, effort went into defeating a difficulty the generator had invented (ADR-016):

- The two-column PDF registered **only Arial Regular**, so every `font-weight:700` rendered in regular
  and the file contained no bold text anywhere. A sidebar's labels were then typographically identical
  to their own list items, and 5 of 10 skills were unrecoverable by construction.
- The first `scanned.pdf` was rasterized from a **takumi-rendered** page. takumi positions every glyph
  individually — invisible in a text layer, ruinous in pixels: at 8pt the gap between `Re` and `g` in
  "Registered" measures 4.8pt against a 5.2pt character width. Tesseract read "Re g iste red Nu rse",
  which is indistinguishable from an OCR quality problem and unfixable in code. The same page laid out
  by LibreOffice OCRs almost perfectly.

So `make-scanned.mjs` renders through LibreOffice and then **reads its own output back**, refusing to
write the file unless Tesseract recovers known words from it.

## Still needed — real-world files

These cannot be synthesized honestly and must be collected (anonymized before commit):

| File                        | Why a real file is required                                                                                                                                                                                                                                                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a genuine **multi-page** CV | Every fixture here fits one A4 page. Block 4's verifier — "no work entry splits across a page boundary" — cannot be tested without content that actually overflows, and `break-inside: avoid` is the layout bug users notice most.                                                                                                                       |
| `two-column-canva.pdf`      | `two-column-interleaved.pdf` covers interleaved _drawing order_, and a unit test proves the normalizer ignores item order entirely (`ingest.test.ts`). What neither covers is a table-based sidebar whose column spans genuinely **overlap**, which would defeat the channel-detection rule rather than the ordering. Export a CV from Canva or Enhancv. |
| `table-based.docx`          | Word **table** layout, common in DE/DK/ES. The `.docx` here uses headings, not a table. The private Danish CV covers it (10 tables, zero heading styles) but is gitignored, so CI never sees this shape.                                                                                                                                                 |
| a **photographed** CV       | `scanned.pdf` is a clean rasterization. A real phone photo adds perspective skew, uneven lighting and shadow — none of which we can fake honestly, and all of which OCR handles worse.                                                                                                                                                                   |

Until these exist, the accuracy suite reports on the eight fixtures above and the gap is stated, not
hidden. All eight scoring 100% means the synthetic set no longer discriminates — not that extraction is
solved.
