# 10 — Execution Plan v0.1

Blocks of ≤30 min each (AI-OS convention). Every block has a **verifier** with
runtime evidence — not "it builds". Run the verifier before moving on.

Order matters: the riskiest unknown (WASM rendering) is Block 1, and the quality
harness (Block 5) lands before any UI is written.

---

## Phase A — Foundation

### Block 0 — Scaffold ✅ done 2026-08-13

Scaffolded with `@tanstack/cli create` (`--framework react --deployment nitro
--toolchain eslint --no-examples`). Actual versions landed: React 19.2, Vite 8,
Nitro 3 (beta), Tailwind 4.1, TypeScript 6, ESLint 9 + Prettier 3.8.

Notes for whoever reads this later:

- The CLI rejects capital letters in the project name — the package is `hunterready`
  while the directory stays `HunterReady`.
- `--force` was needed (the directory already held the planning docs) and it
  **overwrote `README.md` and `.gitignore`**. Both were restored from a backup and the
  scaffold's real `.gitignore` entries merged in. Back these up before re-running.
- `dev` is `vite dev --port 3000`; the Nitro build output is a self-contained Node
  server at `dist/server/index.mjs`, which is what the Coolify image will run.
- Still to add: Vitest + coverage, Zod, `takumi-pdf`, `unpdf`, `mammoth`.

**Verifier:** `pnpm dev` serves a page at a printed localhost URL; `pnpm build` succeeds.

---

### Block 1 — ⚠️ SPIKE: render a real PDF ✅ passed 2026-08-13

**Outcome: the stack holds, and the spike earned its place by failing first.**

`vite dev` rendered a 2-page PDF on the first try. The production Nitro build then
returned **500 ENOENT** on `.output/server/pkg/takumi_pdf_wasm_bg.wasm` — Rollup
bundles `takumi-pdf` into `_libs/` but never emits the 3.7 MB WASM, because the module
loads it through `readFileSync(new URL("../pkg/…", import.meta.url))` rather than an
import. Fixed by `scripts/copy-wasm.mjs`, wired into `pnpm build`.

Verified against the built server, not the dev server:

- `GET /api/pdf/smoke` → `200 application/pdf`, 25,918 bytes, `%PDF-1.7`
- 2 pages; `breakBefore: 'page'` and `breakInside: 'avoid'` both work
- Text extracted by `pymupdf` (an independent parser) in correct reading order
- Metadata written: `title`, `authors`, `creator` — the ATS ruleset's requirement
- 0 embedded images; everything is real text

Artifacts kept: `scripts/spike-render.mjs` (framework-free render check) and
`src/routes/api/pdf/smoke.tsx` (bundler check). Both are throwaway once
`src/render/render.ts` lands in Block 4 — do not build on them.

`pnpm start` was added to package.json (`node .output/server/index.mjs`).

**Still open from this block:** the pdfcn license is not documented on its site, and
pdfcn components were not installed yet — the spike used hand-written JSX to isolate
the renderer from the registry. Install them at the start of Block 4.

<details>
<summary>Original block definition</summary>

- Add the pdfcn registry to `components.json`
- `npx shadcn@latest add @pdfcn/takumi/text @pdfcn/takumi/heading @pdfcn/takumi/section @pdfcn/takumi/stack @pdfcn/takumi/divider @pdfcn/takumi/list @pdfcn/takumi/link @pdfcn/takumi/keep-together @pdfcn/takumi/page-break @pdfcn/takumi/page-number`
- Write `components/pdf/VENDORED.md`: install date, component list, registry URL
- Bundle Inter WOFF2 into `src/render/fonts/`, load from disk (never `googleFonts()` at request time)
- Server route `GET /api/pdf/smoke` → hardcoded 2-page document, `Content-Type: application/pdf`
- **Test it against a production-shaped build, not only `pnpm dev`** — that is where WASM bundling breaks

**Verifier:** `curl -s localhost:3000/api/pdf/smoke -o /tmp/smoke.pdf` after
`pnpm build && pnpm start`; open it; text is selectable; page 2 exists; page numbers
render. Confirm the pdfcn license while here (open question 1).

**If this block fails:** stop and switch per ADR-005 (Next.js, or an isolated Node
renderer service). Do not proceed with a broken render path — everything downstream
depends on it.

</details>

---

### Block 1b — Production-parity test ✅ done 2026-08-13

`tests/production-parity.parity.test.ts`, run by `pnpm test:parity` (separate config so
the fast loop stays fast). 4 tests: the WASM is emitted and >1 MB, the shell serves, the
render route returns real `%PDF` bytes, and the server log is free of `ENOENT`/`unhandled`.

**Verifier executed:** stripped `&& node scripts/copy-wasm.mjs` from the build script and
deleted `.output`. 3 of the 4 tests failed with exactly the Block 1 `ENOENT`. The 4th —
the app shell — kept passing, which is the correct signature: the app loads, only the
render route dies. Restored, green again.

**Second bug found while building it.** The first run failed with
`TypeError: (0, import_jsx_dev_runtime.jsxDEV) is not a function` on every route. Cause:
Vitest sets `NODE_ENV=test`, and inheriting that into the build makes Vite's React plugin
emit the _development_ JSX transform into a bundle that runs against production React.
The test now pins `NODE_ENV=production` for both the build and the server. Worth knowing
before writing the Dockerfile in Block 14 — the image must set it too.

The build itself is 0.85s (Vite 8), so the whole parity suite runs in ~1.5s. Cheap enough
to put in CI on every PR.

<details>
<summary>Original block definition</summary>

The WASM bug was invisible to `pnpm dev` and to a green `pnpm build`. That class of
failure will recur — a new dependency, a Nitro upgrade, a changed export map — so it
gets a guard rather than a memo.

- Vitest suite that runs `pnpm build`, boots `.output/server/index.mjs` on an ephemeral
  port, requests `/api/pdf/smoke`, and asserts `200 application/pdf` + `%PDF` magic bytes
- Assert `.output/server/pkg/takumi_pdf_wasm_bg.wasm` exists and is >1 MB
- Runs in CI on every PR; slow, so it is a separate script from `pnpm test`

**Verifier:** delete the `copy-wasm` step from the build script and confirm the suite
fails. Restore it and confirm it passes.

</details>

---

### Block 2 — Schema + fixtures ✅ done 2026-08-13 (input fixtures partial)

- [`src/schema/resume.ts`](../src/schema/resume.ts) — the canonical contract. Two additions
  beyond the doc, both forced by ADR-010's European variant: `basics.photoUrl` and
  `basics.personalDetails` (free-form label/value, never inferred — we do not build a
  taxonomy of personal data we have no business modelling). Also
  `certifications[].identifier` for licence/registration numbers, which regulated
  professions carry and a tech-only fixture set would never have surfaced.
- [`src/schema/provenance.ts`](../src/schema/provenance.ts) — sidecar + `needsReview()`
  and `CONFIDENCE_REVIEW_THRESHOLD = 0.7`.
- `fixtures/expected/`: 3 hand-written resumes, deliberately sector-spread —
  `nurse-senior` (2 pages, 12 years, licences, CEFR), `sales-junior` (1 page, 3 years),
  `switcher` (Spanish, EU personal details, projects, volunteer, custom section).
- `fixtures/input/`: 4 of 8 generated by [`scripts/make-fixtures.mjs`](../scripts/make-fixtures.mjs).
  **The other 4 need real-world files** and the gap is documented in
  [fixtures/input/README.md](../fixtures/input/README.md) rather than hidden.

**Verifier passed:** 26 tests green (`pnpm test`). Beyond "does it parse", the suite
asserts the doc's promises: `endDate` defaults to `null`, `YearMonth` rejects
`2019-06-01`/`2019-13`/`2019-6`, `schemaVersion` is pinned so a migration cannot be
skipped silently, every array is present after parse so templates never guard for
`undefined`, and — a guard against the project's main drift risk — **fewer than half the
fixtures may be tech roles**.

**Known gap, deliberate:** the generated two-column fixture extracts column-sequentially,
not interleaved, so it does not reproduce the hard case Block 7 exists for. A real
Canva/Enhancv export is still required. Do not mark Blocks 6–10 done without it.

---

## Phase B — Render path (before ingestion, so there is something to look at)

### Block 3 — Document theme tokens ✅ done 2026-08-13

pdfcn installed (moved up from Block 4, since the real `PdfcnTheme` interface is what this
block types against). **The registry does not compile as shipped** — 38 TypeScript errors
across 13 of 16 files, fixed with 5 compatibility shims and 2 documented one-line patches.
Full account in [VENDORED.md](../src/components/pdf/VENDORED.md); the amendment to ADR-002
in [09-decisions.md](09-decisions.md) records what it means for the decision.

Shipped:

- [`src/render/themes/tokens.ts`](../src/render/themes/tokens.ts) — the print palette,
  plus `ROOM_COLORS` naming what is forbidden and `NEUTRALIZED_SEMANTICS`.
- `modern` / `professional` / `executive` themes + [registry](../src/render/themes/index.ts)
  with plain-language labels (the picker is read by nurses, not designers).
- [`src/render/fonts/index.ts`](../src/render/fonts/index.ts) — family → file registration.
  takumi has no base-14: an unregistered family renders as **nothing**, silently. Currently
  macOS system paths; Block 3b bundles WOFF2.

**A finding worth keeping:** `ColorTokens` requires `destructive`, `success`, `warning`,
`info` and `accent`, and pdfcn's own themes give them real hues (`#3b82f6`, `#dc2626`). A CV
has no alerts — so if any component ever touches one of those tokens, a colored chip lands
in a user's job application. All three of our themes neutralize them to ink. That is the
Amber rule generalized: **the document gets no hue from us, ours or anyone's.**

**Verifier passed:** 30 new tests (56 total). Beyond the token rules, the suite greps the
theme _source files_ for room-color hex literals and for `oklch(` — an object-level check
would miss a hardcoded value inside a template literal. Plus render evidence:
`node scripts/render-themes.mjs` produces 3 distinct PDFs from one fixture (50.6 / 66.4 /
65.2 KB), and the executive render was inspected visually — serif throughout, correct
hierarchy, zero color, and Danish `ø`/`å` surviving font subsetting.

<details>
<summary>Original block definition</summary>

- `src/render/themes/{modern,professional,executive}.ts` — hex only (ADR-003)
- Bound by DESIGN.md's **Amber Never Touches The Print Rule**: document themes draw
  from Print Black `#0D0D0D`, Silver Gray `#BDBDBD`, Developer Gray `#6E6E6E`,
  Tray Enamel `#F3E6C4` and white. No Safelight Amber anywhere in a document.
- `PdfcnTheme` typing wired to `PdfcnThemeProvider`

**Verifier:** render the same fixture under all three themes; three visibly different
PDFs, no color parse warnings in the server log. Grep the rendered PDF text layer and
theme files for `FFB100` / `B36A00` — zero hits.

</details>

---

### Block 3b — App chrome tokens (the room side)

Separate from Block 3 on purpose: the room and the print are different systems
([DESIGN.md](../DESIGN.md), The Two Lights Rule).

- Tailwind v4 `@theme` tokens for the safelight palette and the white-light palette
- Resolve the four font families (grease-pencil display, typewriter mono body,
  condensed engraved caps labels, seven-segment numerals) against DESIGN.md's
  banned-defaults list; check licenses — this is a commercial product
- The tray-rim primitive (1px inner line inset from the edge) as a utility
- Amber-falloff depth utilities; **no `box-shadow` tokens at all**

**Verifier:** a tokens page renders both light states side by side with a hard edge.
Contrast-check every text pair: Developer Gray on Tray Enamel is **4.14:1** and is
therefore banned for normal body text — assert that constraint in a test, not a comment.

---

### Block 4 — Templates `modern-intl` + `modern-eu`

Two variants, both shipping in v0.1 (ADR-010) — one skeleton, different blocks.

- `src/render/templates/modern-base.tsx` — shared skeleton, pure `(resume) => JSX`
- `modern-intl`: no photo, no personal-details block, 1-page target
- `modern-eu`: photo slot + optional personal-details block, 2-page target
- Every rule in the [ATS ruleset](05-pdf-rendering.md#the-ats-ruleset-binding-on-every-template)
  applied: single column, text contact line, standard headings, `MMM YYYY` dates,
  no rating bars, `Keep Together` around each work entry. The photo is the **only**
  permitted `PdfImage` in the system.
- Must survive a CV with no projects, no certifications and no links — most of the
  working population has none of those
- PDF metadata: `Title = "<name> — <headline>"`, `Author = "<name>"`
- `src/render/templates/registry.ts` with id, label, convention, atsRating, thumbnail
- `src/render/render.ts` — `(resume, templateId, themeId) => Uint8Array`

**Verifier:** render all 3 fixtures × 2 variants. Visually inspect: no work entry
split across a page boundary, senior fixture fits 2 pages, junior fits 1, and the
`modern-eu` photo slot degrades cleanly when no photo was supplied.

---

### Block 5 — ⭐ ATS round-trip verifier

The core mechanism of the product. Build it now, while there is exactly one
template to fix.

- `src/render/__tests__/ats-roundtrip.test.ts`
- For each (template × fixture): `render()` → extract text with `unpdf` →
  assert every check listed in [05-pdf-rendering.md](05-pdf-rendering.md#the-ats-round-trip-test--the-core-verifier)
- Include the reading-order assertion — it is the one that catches layout mistakes
- Wire into CI as a required check

**Verifier:** `pnpm test ats` green. Then deliberately break it — move the name into
a `PdfImage` — and confirm it fails. A verifier that has never failed is not a verifier.

---

## Phase C — Ingestion

### Block 6 — Detection + text adapters

- `src/ingest/detect.ts` — magic bytes, size/page caps, actionable rejections
- `adapters/pdf.ts` — `unpdf` text items with `{x,y,fontSize,bold}`
- `adapters/docx.ts` — `mammoth` → semantic HTML
- `adapters/text.ts` — passthrough

**Verifier:** for each of the 7 input fixtures, print the extracted character count
and detected type. Scanned PDF correctly reports "no text layer".

---

### Block 7 — Normalizer (the highest-leverage code in the pipeline)

- Line clustering by `y`; column detection via `x` histogram; heading detection by
  relative font size / bold / caps / length
- Output: one normalized `## heading` + `- bullet` text form for **all** formats

**Verifier:** print normalized output for `two-column-designed.pdf` — columns must
appear sequentially, not interleaved. This is the pass/fail signal for the block.

---

### Block 8 — LLM structured extraction

- `structure/prompt.ts` with `PROMPT_VERSION`; the "copy, do not compose" rule is
  the dominant instruction
- `zod-to-json-schema` → Anthropic structured output, temperature 0
- Zod parse → repair loop (max 2 retries, feeding validation errors back)
- Per-item source line index → `provenance`
- Redact phone/street from the LLM payload; recover them locally by regex

**Verifier:** run all fixtures; print field-level accuracy vs `expected/*.json` as
a table. `clean-single-column.pdf` must be ≥95%; `two-column-designed.pdf` ≥85%.

---

### Block 9 — Heuristics pass

- Date normalization incl. `Present`/`Actualidad`/`Nu` → `null`
- Sort work/education descending; drop empties; dedupe skills; split skill blobs
- Demote confidence on malformed email/URL instead of dropping the value

**Verifier:** accuracy table from Block 8 improves; every date in every fixture
output matches `YYYY(-MM)?`.

---

### Block 10 — `.doc` path

- `adapters/doc.ts` — `soffice --headless --convert-to docx`, 10 s timeout,
  scratch dir removed in `finally`
- Add `libreoffice-core` to the Dockerfile (ADR-008)

**Verifier:** `legacy.doc` fixture produces the same `Resume` as its `.docx` twin.
Confirm no leftover files in the scratch dir after the run.

---

## Phase D — UI

### Block 11 — Upload screen

- Dropzone (drag + click), accepted-types list, progress, per-failure-mode error copy
- The one-sentence LLM consent line ([07-privacy.md](07-privacy.md))
- `POST /api/ingest` → `{ resume, provenance, warnings }`
- Rate limit by IP

**Verifier:** upload a real CV in the browser; land on the review screen with
populated data. Screenshot as evidence.

---

### Block 12 — Review + edit form

- `react-hook-form` + `zodResolver(Resume)`, one collapsible card per section
- `useFieldArray` for work/education/skills — add, remove, reorder
- Fields with `confidence < 0.7` or `inferred` are visually marked, with the source
  text on hover
- Warnings banner from ingestion

**Verifier:** correct three deliberately-wrong fields in the browser; form state
still passes `Resume.parse()`; low-confidence markers actually appear.

---

### Block 13 — Preview + download

- Debounced preview (300 ms) → `POST /api/render` → object URL in an `<iframe>`
- Template picker (1 option, showing its ATS rating) + theme picker (3 options)
- Download with filename `<FullName>-CV.pdf`
- Skeleton while rendering; render errors surfaced, not swallowed

**Verifier:** end-to-end in the browser — upload → edit → theme switch → download.
Full path under 20 s. Open the downloaded file and check the text is selectable.

---

## Phase E — Ship

### Block 14 — Docker + Coolify

- Multi-stage Dockerfile, Node 22 slim, `libreoffice-core`, fonts baked in
- `.env` from `dev-env/env-config/.env` conventions; secrets via Coolify env
- Health endpoint; deploy per the `coolify-deploy` skill

**Verifier:** production URL responds; upload a real CV against production and
download the PDF. Report **URL + one-line status** (AI-OS rule).

---

### Block 15 — Hardening

- Sentry (scrubbing CV content), structured logs with `requestId` and no field values
- Metrics: ingestion success by type, fields corrected per CV, render p95
- README quickstart; update `ai-os/context/02_projects.md` with the new project row

**Verifier:** trigger a deliberate error in production; confirm it appears in Sentry
**with no CV content in the payload**.

---

### Blocks 6–10 — Ingestion ✅ done 2026-08-13

`src/ingest/` — detect → adapter → normalize, then `src/structure/` — extract → heuristics.

- **detect.ts** — magic bytes, never the extension (a renamed file is attacker-controlled input).
  Every rejection carries a message a non-technical person can act on, and a test asserts the
  machine code never leaks into it.
- **adapters** — `pdf.ts` keeps per-item geometry (`unpdf`), `docx.ts` converts to semantic HTML
  (`mammoth`) and emits real structural hints, `doc.ts` shells out to LibreOffice **inside the
  container** (ADR-012), `text.ts` handles txt/md.
- **normalize.ts** — the highest-leverage file, and it had to be **rewritten**: clustering lines by
  `y` before finding columns cannot work, because in a sidebar layout a sidebar item and a body item
  share a baseline, so every line straddles the channel and no split is ever found. Columns must be
  separated on the _items_. The first version produced output with a skill sitting between a job
  title and its dates.
- **sections.ts** — heading vocabulary in EN/ES/DA. Added after typography proved unreliable: in a
  real fixture every glyph came back as the same regular face, so bold detection was uniformly
  false and the only signal left was size — which made the **candidate's name** the most
  heading-like line on the page.
- **extract.ts** — schema-constrained tool call, temperature 0, repair loop, provenance.
- **redact.ts** — phone and street address never reach the provider; recovered locally by regex.
  Data minimisation as a measurable act rather than a paragraph.
- **heuristics.ts** — dates, sorting, dedupe, skill-blob splitting. Never asked of the model.
- **fallback.ts** — deterministic extraction with no model at all, so "you can still build your CV"
  is true, and so a prompt change has a baseline to beat.
- **sanity.ts** — cross-field checks. Per-field confidence cannot catch a set of individually
  plausible values that is jointly impossible, and we hit exactly that: two roles both open-ended,
  printing as two "Present" jobs.

**Verifier passed:** 16 ingestion tests, including the one that matters — sidebar content must not
appear between a role and its dates. Live extraction verified through MiniMax against PDF, DOCX and
legacy DOC, the last two via fixtures the container's own LibreOffice generated.

---

### Blocks 11–13 — The flow ✅ done 2026-08-13

`Dropzone` → `/api/ingest` → `ReviewForm` + `PaperPreview` → `POST /api/render`.

Per ADR-011 the first screen is **only** a dropzone: no account, no questionnaire. The review form
marks fields the extraction was unsure about, with the source line on hover. Template and theme are
test strips. "Pull a print" POSTs the _edited_ resume, so the download is what the user is looking at.

**Two honesty fixes made after seeing it run:** education marked ongoing now raises a warning (a
finished qualification printing as "Present" looks like an unfinished one), and an empty provenance
list reads "we could not tell which fields to check — read all of them" rather than "0 to check",
which would have been the opposite of the truth.

**Verifier passed:** a text CV uploaded through the real UI in the container, extracted via MiniMax,
rendered in the review form and the preview. Screenshotted.

---

### Block 14 — Docker ✅ done 2026-08-13

Multi-stage image, Node 22 slim, ~920 MB. `libreoffice-core` + `libreoffice-writer` for `.doc`;
fonts and WASM copied into `.output` by `scripts/copy-assets.mjs`; **no node_modules and no
Chromium** in the runtime layer. Runs as the unprivileged `node` user — this process parses
untrusted files for a living. `NODE_ENV=production` is set at build time because anything else emits
the dev JSX transform (Block 1b).

`HEALTHCHECK` hits `/api/health`, which verifies the _render prerequisites_ rather than just that
the process is listening — a liveness-only check would have reported green throughout the Block 1
outage.

**Not done: the actual deploy.** Coolify needs credentials and a target, and pushing a public
service is the user's call, not mine.

---

### Block 15 — Hardening ✅ partly done 2026-08-13

- `src/lib/log.ts` — structured logs that **refuse** to carry a string on a non-allowlisted field.
  A runtime check, not a convention: conventions do not survive a hurried Friday. Verified: the
  container's logs contain counts, codes and durations, and no CV content.
- `src/lib/rate-limit.ts` — per-IP on `/api/ingest`, the endpoint that parses untrusted files and
  then spends money. Honest limits documented (per-process, memory-only).
- `provider_degraded` is logged when a provider is configured but rules ran anyway — the metric
  that catches a silent outage, since the user still got a CV and nothing else would notice.

**Still open:** Sentry (needs a DSN), and the metrics from the roadmap need somewhere to go.

---

## Critical path

```
0 → 1 (SPIKE) → 2 → 3 → 4 → 5 ─┐
                                ├──▶ 13 → 14 → 15
        6 → 7 → 8 → 9 → 10 → 11 ┘
                                12
```

Blocks 3–5 and 6–10 are independent once Block 2 lands — good candidates for
parallel subagents (max 3, per AI-OS).

## Definition of done for v0.1

1. ATS round-trip test green for `modern-ats` × 3 fixtures.
2. Field accuracy ≥95% on the clean fixture, ≥85% on the two-column fixture.
3. End-to-end in production under 20 s.
4. Zero CV content in any log or error report.
5. Edd would send the output PDF.
