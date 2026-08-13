# 08 — Roadmap

Estimates assume focused solo work with AI assistance. They are sizing, not commitments.

HunterReady is a real, monetized product (confirmed 2026-08-13), so v0.5 and v1.0 are
commitments rather than aspirations — the accounts, payments and GDPR work gets built.

## v0.1 — "It works" (≈2 weeks) · in progress

The scope Edd asked for, nothing more.

- Upload `.pdf` / `.docx` / `.doc` / `.txt` / `.md`
- Extraction → `Resume` schema with per-field confidence
- Review + edit form, low-confidence fields highlighted
- 2 templates (`modern-intl` + `modern-eu`, both regional conventions) × 3 themes
- Live preview + download
- Stateless, no auth, no persistence
- ATS round-trip test green in CI
- Deployed to Coolify

**Done so far (2026-08-13):** Block 0 scaffold, Block 1 render-path spike — the
production WASM bug found and fixed. Next: Block 1b production-parity test.

Detailed blocks: [10-plan-v0.1.md](10-plan-v0.1.md).

**Done means:** Edd runs his own CV through it and would send the output.

## v0.2 — "It's reliable" · in progress

Quality, not features. The gap between a demo and something usable.

**Reprioritised by evidence.** Two real CVs (a Danish table-based `.docx`, a Spanish designed `.pdf`)
were run through the pipeline first, and what they broke set the order — not this list. Done so far,
all recorded in ADR-015:

- word-space reconstruction in the PDF text layer (per-item letter-space collapse, character-width
  threshold) — the defect that poisoned everything downstream
- field-label vocabulary for table-shaped CVs (`src/ingest/labels.ts`), DA/ES/EN
- date-first entry layouts, and the detail-before-next-entry rule
- language/level pairing with CEFR inference from Danish and Spanish proficiency words
- tolerant link targets: a real CV's `profile.example.dk` was failing schema validation and costing
  the entire extraction
- deterministic recovery of prose job descriptions the model drops (0 → 27 highlights)
- provider-shape guards after MiniMax returned `content: null`
- 8 regression tests over the two real CVs, skipped when the private files are absent

Then the measurement instrument and what it drove:

- **accuracy suite** (`src/structure/accuracy.ts` + its test) — field-level scoring against the
  hand-written expected results, printed as a table and written to `accuracy-report.txt`. Scores the
  _rule-based_ path so the number is deterministic, free and identical in CI. Floors are gates: raise
  one when a change earns it, never lower one to make a red suite green.
- employers recovered from the metadata line when the title carries none (0/3 → 3/3 on the designed CV)
- a structural heading rule — caps line over a short list — so a sidebar's own category labels are
  found even when nothing typographic distinguishes them (skills 0/10 → 5/10)
- Word heading **levels** respected: h3 is a job title, not a section. Promoting every level turned
  twelve job titles into twelve sections and scored 44% on a real `.docx`.
- `compact` theme, and `executive` verified — both automatically covered by the ATS round-trip suite
- content-fit estimation with plain-language page advice (`src/render/fit.ts`), shown live in the
  inspection window

### The scorer was wrong, and it was flattering us

Closing out v0.2 started by reading the extractor's actual output instead of its score, and the first
thing that turned up was in the ruler. `similar()` accepted a containment match of any length, so
`"Account Manager, Northgate Supplies (Jan 2024"` counted as a hit for `"Account Manager"`. Date
scoring paired every expected job to the _first_ actual job whose employer matched, so with two jobs at
one employer — a promotion, the most ordinary thing on a CV — the second job's dates could never score.

Corrected, the honest baseline was **92 / 56 / 68 / 98 / 83**, not 92 / 96 / 84 / 76 / 74. The test
asserting "we always recover the identity fields" went red immediately: `fullName` had been
`"Tom Whitfield Account Manager"` on three of five fixtures, with the headline left empty, for two
rounds. See ADR-016.

### Then eight defects it had been hiding

- **name absorbed the headline** — the continuation rule accepted any next line of ≤2 words, which
  cannot tell a second name line from a two-word job title. A wrapped name is recognisable because
  _every_ fragment is one word; that is now the only case that continues.
- **role/company split on the date separator** — `Role, Employer (Jan 2024 - Present)` split on the
  `-` inside its own date range, giving employer `Present)`. Dates are stripped first now, and only a
  _trailing_ range whose right side is a date or means "present", so `Consultant 2019 – Acme Corp`
  keeps its employer.
- **ISO dates on a metadata line** — `2024-01 - Present` did not match, so no second entry opened and
  two jobs merged into one with five bullets and no start date. An entire employment, gone.
- **a wrapped bullet became a job** — a text layer has no paragraphs, so `wanted.` on its own line
  opened a phantom fourth employment. Found by the new interleaved fixture on its first run.
- **a wrapped summary was cut mid-sentence**, ending at "…the induction of new".
- **the city was offered as a profession** — a one-word positional guess put `Zaragoza` in `headline`.
  A headline guess now needs two words; nothing is invented.
- **a sentence was listed as a language spoken** — in a two-column CV the main column's summary lands
  inside the sidebar's last section, and splitting it on commas produced `with route`.
- **`nivel intermedio` was not a proficiency level at all** — the lists matched bare words only.

### And two bugs in the fixtures themselves

Both are ADR-016 material: the generator was inventing difficulties reality does not have. The
two-column PDF registered only Arial Regular, so it contained **no bold text anywhere** — which is why
a sidebar's labels looked identical to their own list items and two heading heuristics existed to work
around it. Fixing the font, then tightening the heading rules the fix exposed, took skills from 5/10 to
10/10.

**Measured now** (rule-based baseline, `accuracy-report.txt`): **100% on all eight fixtures**, under
the corrected scorer. Floors raised from 0.7–0.88 to 0.95, and verified to fail: breaking the comma
split drops `plain.txt` to 64% and the suite goes red. That 100% is a statement about the _fixtures_ —
every input is synthesized from the expected result it is scored against, so the synthetic set no
longer discriminates. Harder inputs are the next move, not a higher number.

### Done, from the original list

- **OCR for scans and photos** (ADR-017). Tesseract + poppler in the image (+48 MB), TSV output so OCR
  produces the same positioned items as a text layer, `scanned.pdf` generated and verified legible by
  its own generator, and scoring 100%. A JPEG or PNG is now accepted outright — a phone is the device
  most of our audience has. The review step drops its confidence counter entirely for a scan and says
  "check everything" instead, because confidence describes the extraction, not the reading.
- **The interleaved two-column layer**, by writing the content stream by hand
  (`scripts/make-interleaved.mjs`), plus a unit test proving the normalizer ignores item order
  altogether — which is the property the whole two-column effort rests on and was previously assumed.
- **Skills groups 10/10** on the designed CV.
- **Every ingestion failure mode walked through the UI**: oversized, empty, zip, RTF, GIF, unknown
  type, too-little-text, corrupt PDF. All eight render an actionable message, none leaks a machine
  code, none contains CV content.
- **A `test` stage in the Dockerfile**, because the OCR and `.doc` suites skipped themselves on every
  machine: the runtime image has the tools but no `node_modules`, the build stage has `node_modules` but
  no tools. `pnpm test:docker` runs all 180 tests with nothing skipped.

Still to do:

- A real Canva/Enhancv export. Interleaved _ordering_ is now covered; a table-based sidebar with
  genuinely **overlapping** column spans is not, and that defeats a different rule.
- A real photographed CV — perspective skew, uneven lighting, shadow. `scanned.pdf` is a clean
  rasterization and cannot fake any of it.
- A genuine multi-page CV, still owed to Block 4's page-break verifier.
- No education section is found in the private Spanish CV, and MiniMax sometimes returns no provenance.

## v0.3 — "It improves the CV" · in progress

The first feature a competitor cannot trivially copy.

### Shipped

- **Bullet rewriting with all three enforcement layers.** The prompt asks (layer 1), deterministic
  code checks (layer 2), and the candidate accepts one line at a time (layer 3). A suggestion that
  adds a fact is discarded, retried once with the violation named, and if the second attempt also
  invents, the original wording stands. Nothing that fails the guard reaches the screen.
- **Side-by-side diff, per-bullet accept/reject.** Accept-all exists and defaults off. A suggestion
  the guard threw away is _shown_, saying what it added — the only place a user sees the guard work
  for them.
- **The `questions` flow.** Every generic AI CV tool answers "this bullet has no outcome" by
  inventing one; this asks the candidate instead, so the number stays theirs.
- **Consent gate + privacy notice.** Names the provider, and declining changes what the server does
  rather than what the screen says: `useProvider: false` means no request leaves the process. A
  missing field is not consent.

### What the guard is worth, measured

Three consecutive runs against the real model, same four bullets:

| run                                               | suggested | fabricated |
| ------------------------------------------------- | --------- | ---------- |
| rewrite-v1                                        | 1         | 2          |
| rewrite-v2 — prompt taught the two observed traps | 2         | 1          |
| v2 + explanatory text checked for numbers only    | **3**     | **0**      |

Both corrections came from running it, not from reasoning about it. The model abbreviated
`Sales Development Representative` to `SDR` and counted something the CV never counted; separately,
the guard flagged `Led` and `Supported` as invented names because a rationale quotes the wording it
changed. See ADR-016's rule: the failure you have observed beats the one you imagined.

### Still to do

- Template `showcase` (2-column, honestly labelled design-first)
- Answers to `questions` fed back as source material — they are asked, not yet captured
- A cache in front of the rewrite call. `rewriteCacheKey` exists and nothing uses it yet, so a
  re-run pays for every bullet again.
- Model routing per docs/06: extraction and rewriting currently share one provider.

## v0.4 — "It targets a job" (≈2 weeks)

- Paste a job description → requirement extraction
- Matched / weak-evidence / missing gap report
- Reorder + re-emphasize, generating a **variant** rather than mutating
- Transparent rule-based score with a fix checklist
- Tailored `basics.summary` from existing material

## v0.5 — "It remembers" (≈2 weeks)

The first release with a real backend. Persistence and compliance ship together.

- Accounts (Convex, matching the existing house stack)
- Saved base CV + one variant per application, with a light application tracker
- Version history and diffs between variants
- GDPR controls: export, delete-everything, 90-day retention default
- Encryption at rest, audit log of record access

## v1.0 — "It's a product" (≈3 weeks)

- **DOCX export.** Many ATS portals require or prefer `.docx`. A PDF-only tool has
  a real hole here; this is the highest-value non-obvious item on the roadmap.
- Cover letter generation from the CV + JD (same anti-fabrication rules)
- Multi-language output: EN / ES / DA
- Public share link with an expiry
- Landing page, pricing, payments
- Non-Latin script font coverage

## Deliberately parked

Recorded so they stop resurfacing as ideas:

- LinkedIn import/scraping — ToS risk
- Auto-apply / job board — different product, different risk
- Recruiter-side tooling — different customer
- Free-form drag-and-drop layout editor — destroys the ATS guarantee
- Interview prep, salary data — scope creep with no shared infrastructure

## The one metric that matters

**Mean number of fields the user corrects per ingested CV.** It measures the parser
honestly, it is cheap to instrument (count form edits, content never leaves the
browser), and driving it toward zero is what makes the product feel like magic.
