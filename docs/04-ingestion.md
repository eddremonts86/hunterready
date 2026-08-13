# 04 — Ingestion: file → Resume

This is the hard part of the product. PDF rendering is deterministic and testable;
parsing arbitrary human CV layouts is not. Budget accordingly: expect ingestion to
consume more time than everything else in v0.1 combined.

## Stage 1 — detect

Never trust the file extension. Sniff magic bytes:

| Format            | Signature                                     | Route to                      |
| ----------------- | --------------------------------------------- | ----------------------------- |
| PDF               | `%PDF`                                        | `adapters/pdf.ts`             |
| DOCX              | `PK\x03\x04` + `word/document.xml` in the zip | `adapters/docx.ts`            |
| DOC (legacy OLE2) | `\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1`            | `adapters/doc.ts`             |
| RTF               | `{\rtf`                                       | reject in v0.1, clear message |
| Plain / Markdown  | valid UTF-8, no signature                     | `adapters/text.ts`            |

Reject with an actionable message, never a generic error. Hard limits: 10 MB,
20 pages. A 40-page academic CV is a different product.

## Stage 2 — extract raw text (+ layout hints)

### PDF — `unpdf` (bundles a serverless-friendly pdfjs build)

Extract the text layer per page. Critically, also capture **layout hints**, because
the text layer of a two-column CV interleaves the columns and the LLM will happily
merge a job title from column A with a date from column B.

Minimum viable hint set per text item: `{ text, x, y, width, height, fontSize, fontName, bold }`.
Then:

1. Cluster items into lines by `y` (tolerance ≈ 0.3 × fontSize).
2. Detect column count via a histogram of `x` starts. A clear bimodal distribution
   with a gap = two columns → process each column as an independent stream, left first.
3. Mark likely headings: font size above the document median, or bold, or ALL CAPS,
   and short (< 40 chars).

Feed the LLM a **normalized, order-corrected text** with `## heading` markers, not
the raw dump. This single preprocessing step is worth more than any prompt tuning.

**Scanned PDFs and photos:** if the extracted text is under ~200 characters across the
whole document, it is an image. **Shipped in v0.2 (ADR-017):** the pixels go through
Tesseract, and a JPEG or PNG upload is accepted outright. Tesseract's `tsv` output
carries a bounding box per word, so OCR produces the same positioned items as a real
text layer and reuses column detection, line clustering and heading inference
unchanged — see `src/ingest/adapters/ocr.ts`.

Two things it must keep doing. It **degrades**: without the binaries, or on a scan that
is genuinely unreadable, the original message stands, so this can only turn a refusal
into a result. And it **says so**: the `ocr` flag reaches the review step and replaces
the confidence counter with "check everything", because confidence describes how sure
the extraction was about text it was given, not whether that text was read off the page
correctly.

### DOCX — `mammoth`

Convert to semantic HTML, not to plain text. `mammoth` preserves `<h1>`/`<h2>`,
`<ul>`/`<li>` and `<strong>`, which are exactly the signals needed for section
boundaries and bullet detection. Then flatten that HTML into the same normalized
`## heading` + `- bullet` markdown-ish form used for PDFs, so **one prompt handles
every input format**.

### DOC (legacy binary)

No usable pure-JS parser. Convert first:

```bash
soffice --headless --convert-to docx --outdir /tmp/hr-$REQ_ID input.doc
```

Then hand off to the DOCX adapter. Requires `libreoffice-core` in the image
(+~450 MB) — the tradeoff is recorded in [09-decisions.md](09-decisions.md).
Run it with a timeout (10 s) and in a scratch dir that is deleted in a `finally`.

### TXT / MD

Passthrough. Markdown headings already are the hint markers.

## Stage 3 — structure (LLM → schema)

```
normalized text ──▶ LLM (structured output, Resume schema) ──▶ Zod parse
                                                                   │
                                              ┌── ok ──────────────┤
                                              │                    └── fail
                                              ▼                         │
                                        heuristics pass                 ▼
                                                             repair loop (max 2):
                                                             feed Zod errors back
```

Notes that will save time later:

- **Force structured output** (Anthropic tool-use / JSON schema mode) rather than
  parsing prose. Convert the Zod schema with `zod-to-json-schema`, single source of truth.
- **Temperature 0.** Extraction is not creative work.
- **One instruction dominates the prompt:** _copy, do not compose._ Every string
  in the output must appear in the input, modulo whitespace. Punish paraphrasing.
  Otherwise the model "cleans up" job titles and quietly changes the user's history.
- **Ask for provenance in the same call:** each extracted item carries the source
  line index. Cheaper and more accurate than a second alignment pass.
- Prompt lives in `structure/prompt.ts` with a `PROMPT_VERSION` constant recorded
  in `ExtractionResult.promptVersion`.

### Deterministic heuristics pass (`structure/heuristics.ts`)

Do not ask the LLM to do what code does reliably:

- Normalize dates: `Jan 2019`, `01/2019`, `2019-01`, `Enero 2019` → `2019-01`.
  Handle `Present`/`Current`/`Actualidad`/`Nu` → `null`.
- Sort `work` and `education` descending by `startDate`.
- Drop items that are entirely empty.
- Deduplicate skills case-insensitively; keep the first casing seen.
- Split a monolithic `skills` blob on `,`/`•`/`|` when no categories were found.
- Validate email/URL syntax and demote confidence instead of dropping bad values.

## Failure modes to handle explicitly

| Input                              | Behavior                                                                                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scanned/image PDF                  | **Read it** (OCR, ADR-017), and say the text came off an image so every field gets checked. Only if OCR is unavailable or the scan is unreadable: "This PDF has no text layer…" |
| A photo of a printed CV (JPEG/PNG) | Accepted and OCR'd. A GIF is rejected, with a message naming JPEG and PNG.                                                                                                      |
| Password-protected PDF             | Catch, ask for an unlocked copy. Never prompt for the password.                                                                                                                 |
| Two-column layout                  | Column detection (above). If ambiguous, warn that review is extra important.                                                                                                    |
| CV in a table (common in DE/DK)    | `mammoth` emits `<table>`; flatten row-wise, mark low confidence.                                                                                                               |
| Non-Latin script                   | takumi-pdf handles CJK/Arabic/Devanagari; the font bundle must include coverage. Note the gap in v0.1 (Latin only) rather than shipping tofu boxes.                             |
| Multiple people in one file        | Out of scope; take the first, warn.                                                                                                                                             |
| 15-page CV                         | Reject over 20 pages with a clear limit message.                                                                                                                                |

## Test fixtures (build these before the parser, not after)

Store in `fixtures/` with a hand-written expected `Resume` JSON per case.

**Sector spread is not optional.** The audience is the whole working population
(see [01-vision-and-scope.md](01-vision-and-scope.md)), and a fixture set full of
engineering CVs will produce a parser that silently overfits to CVs listing
programming languages, then fails on the majority of real users. Each fixture below
names its sector deliberately:

1. `clean-single-column.pdf` — _sales manager._ The easy case, must be ~100%.
2. `two-column-designed.pdf` — _graphic designer, Canva/Enhancv style._ The interesting case.
3. `table-based.docx` — _nurse, European table layout._ Common in DE/DK/ES.
4. `plain.txt` — _warehouse supervisor._ No structure at all.
5. `legacy.doc` — _administrative assistant._ Validates the LibreOffice path.
6. `scanned.pdf` — image-only, no text layer at all. Written as a negative test; since
   ADR-017 it is a **positive** one, scored through OCR like any other input. The
   graceful-failure path is still asserted, by pointing the binaries at a name that
   cannot exist (`src/ingest/__tests__/ocr.test.ts`) — that is the path every local run
   takes, so it is the one that must never rot.
7. `spanish.pdf` — _teacher._ Non-English date and heading vocabulary.
8. `tech-senior.pdf` — _backend engineer._ One tech CV, not seven.

Non-tech CVs stress things a tech CV never will: no projects section, no links, no
certifications, shift patterns and rotations as employment dates, licenses and
registration numbers, "references available on request", and long tenures at one
employer with multiple internal roles. Each of those is a schema question — resolve
them against fixtures, not against intuition.

Metric to track per fixture: **field-level accuracy** against the expected JSON,
not "did it run". Wire it as a Vitest suite that prints a table. This is the only
honest way to know whether a prompt change helped.
