# 09 — Decisions and Open Questions

ADR-style log. Append, don't rewrite. Date every entry.

---

## ADR-001 — Canonical `Resume` schema as the system contract

**2026-08-13 · Accepted**

One Zod schema sits between ingestion, editing, optimization and rendering.
JSON Resume shape as the base, diverged where it is weak (dates, skills, provenance).

_Why:_ four modules must agree on something. If they agree on a schema, each can be
replaced independently; if they agree on nothing, every feature touches everything.
Also makes fixtures trivial (plain JSON) and templates pure functions.

_Cost:_ schema migrations once resumes are persisted. Accepted — `schemaVersion` is
in the schema from day one.

---

## ADR-002 — pdfcn on the Takumi renderer

**2026-08-13 · Accepted**

_Why Takumi over Forme:_ public Rust upstream (`kane50613/takumi`), documented
benchmarks, its own docs site, edge runtime support. Identical component API, so
the choice is reversible.

_Why pdfcn over the alternatives:_

| Option                 | Verdict                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| **pdfcn + takumi-pdf** | Real text, no Chromium, React templates, themes, `break-inside: avoid`. ✅                                   |
| `@react-pdf/renderer`  | Mature but its own primitives, no theme system, slower, weaker text shaping.                                 |
| Puppeteer + HTML       | Perfect CSS, but ~400 MB image, slow cold start, fragile pagination.                                         |
| LaTeX                  | Best typography, worst iteration speed and hosting story.                                                    |
| Typst                  | Genuinely strong; rejected only because it adds a second language and templates stop being reviewable React. |

_Accepted costs:_ copy-paste means no upstream upgrades; no CV block exists so we
build templates ourselves; a Satori-lineage CSS subset (flex only, no grid).

> **Amendment, 2026-08-13 (Block 3).** Installed the Takumi registry — 16 files, 10
> components + 3 themes. **It does not compile as shipped:** `tsc --noEmit` reported 38
> errors across 13 of the 16 files, and zero elsewhere in the project. Four module paths the
> registry never creates, plus `PDFComponentProps` — a type every component's props extend —
> which is not shipped at all, so five components silently lost `children` and `style`.
>
> Resolved with **five compatibility shims** (new files providing the expected paths) rather
> than edits, so the vendored diff against upstream stays clean. Two one-line patches were
> unavoidable: dead code breaking `noUnusedLocals`, and an invalid `eslint-disable` rule
> reference that config cannot silence. All documented in
> [VENDORED.md](../src/components/pdf/VENDORED.md).
>
> **This raises the maturity estimate of the risk, not the decision.** The theme token system
> is sound and the components work once they resolve — the render path was already proven in
> Block 1. But a registry that ships non-compiling code has probably not been consumed by
> many people, which makes the undocumented license (open question 1) more pressing, not
> less. If a second round of breakage appears in Block 4, reconsider: the components are thin
> wrappers over flex divs, the hand-written JSX in the Block 1 spike rendered perfectly, and
> writing our own primitives against `theme-types` is a contained piece of work.

---

## ADR-003 — Hex color tokens mirrored, not shared

**2026-08-13 · Accepted**

The PDF renderer does not support `oklch`; Tailwind v4 / shadcn tokens are oklch.
`render/themes/*.ts` holds hand-maintained **hex** values with a comment naming the
source token. No build-time conversion, no shared source.

_Why:_ a color-space conversion layer is more failure surface than four themes are
worth, and silent drift in a PDF is invisible until a user complains.

---

## ADR-004 — Stateless v0.1

**2026-08-13 · Accepted**

No database. CV data lives in the browser and in memory server-side for the duration
of a request.

_Why:_ fastest path to a working product, and it removes the entire GDPR surface
from the first release. "We never store your CV" is a real differentiator.

_Cost:_ no saved versions, no application tracking until v0.5.

---

## ADR-005 — TanStack Start, with Next.js as fallback

**2026-08-13 · Accepted — spike passed, fallback not needed**

> **Spike result (Block 1, 2026-08-13).** The predicted failure happened, and was
> fixed. `vite dev` rendered a real 2-page PDF immediately, but the production Nitro
> build returned 500 with
> `ENOENT .output/server/pkg/takumi_pdf_wasm_bg.wasm`. Cause: Rollup bundles
> `takumi-pdf` into `.output/server/_libs/`, but the module loads its WASM at runtime
> via `readFileSync(new URL("../pkg/…wasm", import.meta.url))`, which Rollup does not
> see as an import, so the 3.7 MB binary is never emitted. Fix: `scripts/copy-wasm.mjs`
> copies it to `.output/server/pkg/` as part of `pnpm build`, keeping the output
> self-contained (no `node_modules` needed in the image). Verified: production server
> returns `200 application/pdf`, 2 pages, text extracted in reading order by an
> independent parser.
>
> **The lesson is now a standing rule:** a green `vite build` proves nothing about this
> render path. Only `pnpm build && pnpm start` followed by a real request does.

**Original reasoning below.**

_Why:_ the render path needs a Node server (takumi-pdf is server-side WASM), and
TanStack Start gives that on top of Vite while matching the existing house stack
(wave-template, `tanstack-patterns`, `tanstack-start-coolify-deploy` skills) — one
less ecosystem to reason about, and the Coolify deploy path already exists.

_Risk:_ WASM bundling under Vite/Nitro. **Block 1 of the plan is a spike that must
render a real PDF from a deployed-shaped build before any UI is written.** If it
fails and is not fixable within the block, switch to Next.js (App Router) — pdfcn's
ecosystem assumes it — or isolate the renderer in a standalone Node service.

---

## ADR-006 — Rule-based scoring, not an LLM score

**2026-08-13 · Accepted**

_Why:_ LLM scores are unstable across identical runs and unexplainable. A user
cannot act on "68/100". They can act on "4 of 11 bullets have no outcome".

---

## ADR-007 — Anti-fabrication enforced in three layers

**2026-08-13 · Accepted**

Prompt prohibition + programmatic post-check (every number and proper noun in the
output must exist in the source) + mandatory human accept per change.

_Why:_ prompting alone is not enforcement, and an invented metric on a CV is a
liability for the user in an interview. This is the product's ethical core.

---

## ADR-008 — `.doc` support via LibreOffice headless

**2026-08-13 · Accepted, revisit if image size becomes a problem**

Edd explicitly asked for `.doc`. No usable pure-JS parser for legacy OLE2 exists,
so the Docker image includes `libreoffice-core` and converts to `.docx` first.

_Cost:_ ~450 MB image growth for what is likely a small share of uploads.
_Alternative if that hurts:_ reject `.doc` with "save as .docx or PDF first", or
run the conversion in a separate on-demand container. Instrument the `.doc` share
of uploads and revisit with data.

---

## ADR-009 — Visual world: "The Print Room" (darkroom under amber safelight)

**2026-08-13 · Accepted**

Established through `impeccable`: PRODUCT.md from a confirmed interview, then the
new-work world flow. The concept seed (key `01690489`, mode `operate`) assigned
grounded index 7 — the machine-readable optical form. Edd overrode it on the decision
page and pinned the dealt challenger **Darkroom Safelight Bay**; a user-pinned
direction beats the roll. Full system in [DESIGN.md](../DESIGN.md).

_Why it holds up:_ the darkroom has two native light states, which solves this
product's hardest visual constraint. Amber safelight is the working room; white light
is where a finished print is inspected. The CV preview and the exported PDF live under
white light in neutral print grays, so the design world never bleeds into a nurse's job
application. And the emergence of an image in a developer tray is a metaphor the whole
working population reads without explanation — which the generalist audience requires.

_The one conflict, resolved by rule:_ the world's own reference board says _"Commit to
the pull. There is no undo."_ PRODUCT.md requires recoverable, never-destructive errors.
Fusion rule says product truth wins on conflicts — but the darkroom supplies its own
answer, the **test strip**: a stepped, reversible preview taken before committing a
print. Every variant in the product uses that grammar, and the only irreversible act
happens outside the app when the user sends the file.

_Accepted cost:_ the amber/print separation is a discipline that must be enforced in
review, not just documented. If it leaks, we ruin the output for half the market.

---

## ADR-010 — Both regional CV conventions ship in v0.1

**2026-08-13 · Accepted**

Confirmed by Edd. `modern-intl` (no photo, no personal details, 1-page target) and
`modern-eu` (photo slot, optional personal-details block, 2-page target) are peers, not
a default and an override.

_Why:_ US and EU norms genuinely conflict, and picking one silently makes the product
wrong for half the market. With a generalist audience across both regions, there is no
defensible default.

_Cost:_ Block 4 of v0.1 builds two variants instead of one, and the round-trip verifier
runs against both. The photo becomes the only `PdfImage` in the system — a carve-out in
the ATS ruleset that must stay a carve-out.

---

## ADR-011 — Value before questions; the questions come from the parse

**2026-08-13 · Accepted**

Edd supplied a 20-step onboarding flow as reference. We adopt its mechanics — one question per
screen, honest progress, always-available back, interstitial pacing, chips, in-context hints —
and reject its ordering.

**Decision:** the user sees a rendered CV before we ask them anything optional. The questions
in the review phase are **generated from the extraction's own uncertainty** (`confidence < 0.7`
or `inferred` in the provenance sidecar), not from a fixed script.

_Why:_ the reference sells the automation of drudgery, whose value is invisible until it runs,
so it must be promised across 20 screens. We sell a document that is visible in fifteen
seconds. Twenty questions before any output would be our worst funnel and, for a stressed job
seeker, an insult — they arrive with a file and a fear, and we would answer with a survey.

_Consequence, and the part worth keeping:_ the review length becomes proportional to how messy
their file was. A clean PDF yields two screens; a decade-old Word table yields nine. Every
question can answer "why are you asking me this?" with a specific source line. A fixed 20 is a
fixed insult to whoever brought a clean file.

_Where the mechanic pays off most:_ v0.3's bullet rewriting, where the anti-fabrication rule
forces the model to emit a _question_ instead of an invented metric. One question, one screen,
one input — and the answer is the candidate's own evidence.

Also refused, explicitly, and recorded so it does not creep back: fabricated social proof
(stock avatars, unearned customer logos), auto-apply, questions that serve our analytics
rather than the document, and the reference's visual language — royal blue on white, pill
buttons, soft document illustrations — which is precisely the category default ADR-009's world
exists to refuse. Full argument in [11-flow.md](11-flow.md).

---

## ADR-012 — System dependencies live in the Docker image, never on a developer's machine

**2026-08-13 · Accepted** (Edd's instruction, verbatim: LibreOffice and anything of that kind must
be in a Docker image so it can be reproduced in a remote production environment.)

The image is the runtime, and the host contributes nothing:

- **LibreOffice** (`libreoffice-core` + `libreoffice-writer`) for the `.doc` conversion path.
  LibreOffice is _not_ installed on the Mac, so the `.doc` path is verified **in the container** —
  which is better than the alternative, since that is where it actually runs.
- **Fonts bundled into the repo**, not read from `/System/Library/Fonts`. This replaced a working
  implementation: a render must produce identical bytes on a Mac and on Linux, and a macOS font
  path is not a dependency you can deploy. `scripts/bundle-fonts.mjs` copies five OFL faces out of
  node_modules; `scripts/copy-assets.mjs` puts them in the build output alongside the WASM.
- **No Chromium.** takumi-pdf is WASM, which is why the image is ~920 MB _with_ LibreOffice
  rather than ~1.5 GB with a headless browser as well.

_Verified in the container:_ health endpoint reports `wasm: true, fonts: true`; a legacy `.doc`
round-trips through LibreOffice and extracts correctly; the `.doc` and `.docx` fixtures were
themselves generated by the container's own LibreOffice, so the toolchain is self-hosting.

---

## ADR-013 — Model provider is configurable; MiniMax-M3 for now

**2026-08-13 · Accepted** (Edd's instruction: use MiniMax if possible.)

`src/structure/provider.ts` resolves a provider from the environment in a fixed order, so the
endpoint is an operational decision rather than a code change. Any Anthropic-compatible Messages
API with tool use works.

_What was actually available:_ `ANTHROPIC_API_KEY` in `dev-env/env-config/.env` is **present but
empty**, and the commented-out `ANTHROPIC_AUTH_TOKEN` returns 401 — it is stale. The live
credential is `MINIMAX_API_KEY`, which authenticates against MiniMax's Anthropic-compatible host
`https://api.minimax.io/anthropic` with model `MiniMax-M3`. Verified: forced `tool_choice` works,
so the schema-constrained extraction path needs no changes.

**Honest quality assessment.** MiniMax-M3 extracts well but is _not_ a reliable strict
transcriber. Observed across runs on the same input: a dropped `endDate` on one run and an
**invented** `endDate: "2025"` on another, where the source said "Present". Inventing a date is
precisely what the prompt forbids, and it is non-deterministic.

This does not block v0.1 — the design anticipated it — but it changes what the guards are _for_:

- `src/structure/sanity.ts` catches jointly-impossible field sets (two roles both open-ended, an
  end before a start, education printed as "Present"). Individually plausible, collectively wrong.
- Empty provenance now reads "we could not tell which fields to check — read all of them", never
  "0 to check".
- The rules extractor (`src/structure/fallback.ts`) is the floor when the provider is down, and the
  baseline any prompt change must beat.

_Recommendation:_ for a paid product, run extraction on a frontier model and keep MiniMax as the
cheap path. Revisit when pricing is decided.

---

## ADR-014 — `no-unnecessary-condition` is off, deliberately

**2026-08-13 · Accepted, with tracked debt**

Without `noUncheckedIndexedAccess`, TypeScript types `array[i]` and regex capture groups as
always-present, so the rule reports every runtime guard over one as dead code and asks for its
removal — advice that would delete exactly the checks stopping the CV parser from crashing on a
malformed file. Enabling the compiler flag surfaced **70 errors** across the ingestion pipeline.

Turning the rule off is the coherent half-measure; enabling both together is a v0.2 pass. The
rationale is in `eslint.config.js` next to the setting, not only here.

---

## ADR-015 — Two real CVs drive v0.2, and each defect is now a test

**2026-08-13 · Accepted**

Edd supplied two real CVs. They are personal data, so they live in `fixtures/private/` (gitignored)
and `src/ingest/__tests__/real-cvs.test.ts` skips itself when they are absent — CI has no access and
must not fail for it.

They were worth more than every synthetic fixture combined, because we did not write them:

| CV             | Shape                                                                                                             | What it broke                                                                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Danish `.docx` | 10 Word tables, **zero** heading styles, label/value rows, date-first education, language/level on separate lines | name read as "Personlige oplysninger Navn"; roles read as dates and employers as "nu"; degrees filed as institutions; proficiency words became languages |
| Spanish `.pdf` | 2 pages, heavily designed, letter-spaced headings, `/01` counters, **no bullet glyph anywhere**                   | every word space lost; 12 jobs with 0 content; three repair rounds then silent fallback                                                                  |

### The five root causes, and what each one teaches

**1. My own letter-space fix was destroying word boundaries.** The line-level rule ("mostly tiny
tokens → strip all whitespace") turned the headline into `STAFFFRONTENDENGINEER&LÍDERTÉCNICO`. The
geometry showed why it was avoidable: pdf.js emits `"S T A F F"` and `"F R O N T E N D"` as separate
items 7.6pt apart — **the item boundary is the word boundary**. Collapsing per item fixes both cases
at once. A fix aimed at one document broke every document that was already correct.

**2. The space threshold was the wrong unit.** `fontSize * 0.2` fails on tracked type, where the
per-character advance and the font size disagree by ~5×. It is now derived from the item's own
average character width.

**3. Row-wise table flattening is correct and useless on its own.** `Navn` / `Eline Storm Johnsen`
on consecutive lines needs something that knows `Navn` is a label — hence `src/ingest/labels.ts`
(DA/ES/EN field labels and proficiency words).

**4. Date-first entries are not an edge case.** Danish and German CVs routinely put the date range
_above_ the title. A date-only line now opens an entry, and an entry must collect a detail line
before a bare line can start the next one.

**5. My schema was stricter than reality, and it cost the whole extraction.** `z.string().url()`
rejected `profile.eduardoinerarte.dk` and the bare handles beside LinkedIn/GitHub labels. The model
copied them faithfully — exactly as instructed — and validation rejected it three times before
falling back to rules. **The document was right and the schema was wrong.** Links are now normalized
(`https://` added when it looks like a domain) and bare handles are kept as text.

### One thing the model would not do, so code does it

MiniMax returned 12 job titles with zero highlights on the prose-only CV, and adding explicit prompt
guidance did not change it. `src/structure/recover.ts` now locates each role in the normalized text
and takes the prose beneath it, **verbatim**, marked `inferred` so the review step flags it. Result:
0 → 27 highlights. This is the project's own rule applied honestly — never ask the model to do what
code does reliably.

### Provider robustness

MiniMax also returned `content: null` on one request, which crashed the endpoint with
"Cannot read properties of null". An Anthropic-_compatible_ gateway is not Anthropic, so the response
shape is now checked rather than trusted. Separately: `max_tokens` above ~8k makes the SDK demand
streaming, and 8192 is comfortably enough (3.6k output tokens on the largest CV tested).

### Where both CVs stand now

Both extract through the model, in 30–76s: the Danish CV gives 5 roles / 17 highlights / 3
qualifications / 4 languages with CEFR levels inferred from Danish proficiency words; the Spanish one
gives 12 roles / 27 highlights / 32 skills / 3 languages. Remaining honest gap: no education section
is found in the Spanish CV, and `provenance` is sometimes empty — the review UI says so plainly
rather than claiming there is nothing to check.

---

## ADR-016 — A fixture must never be harder than reality

**2026-08-13 · Accepted**

Two rounds of work were spent fighting difficulties our own fixture generator invented.

| Fixture                       | The invented difficulty                                                                                                                                                                                                                  | What it cost                                                                                                                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `two-column-designed.pdf`     | Only Arial **Regular** was registered, so every `font-weight:700` rendered in regular and the file contained no bold text anywhere                                                                                                       | A sidebar's category labels were typographically identical to their own list items. Two heading heuristics were built to work around it, and 5 of 10 skills were unrecoverable _by construction_ |
| `scanned.pdf` (first attempt) | Rasterized from a **takumi-rendered** page. takumi positions every glyph individually — invisible in a text layer, ruinous in pixels: at 8pt the gap between `Re` and `g` in "Registered" measures 4.8pt against a 5.2pt character width | Tesseract read "Re g iste red Nu rse". Indistinguishable from "OCR is not good enough", and no code change could have fixed it                                                                   |

The rule: **a fixture may be harder than the average real document, but never in a way no real
document is.** A CV PDF with zero bold text does not exist. A printed page with 0.9-character gaps
inside words does not exist.

Two consequences, both now enforced in code rather than in prose:

- `scripts/make-fixtures.mjs` registers both weights of Arial.
- `scripts/make-scanned.mjs` renders through **LibreOffice**, not through our own renderer, and then
  reads its own output back with Tesseract, refusing to write the file unless known words come out of
  it. A generator that cannot prove its output is legible has no business writing a fixture.

The corollary is about measurement, not fixtures: the accuracy suite reported 92% and 96% for two
rounds while three fixtures were returning a candidate's name with their job title welded onto it.
The scorer's containment rule counted `"Account Manager, Northgate Supplies (Jan 2024"` as a match
for `"Account Manager"`. **A ruler that rounds in your favour is worse than no ruler**, because it
converts a defect into a number that looks like progress.

---

## ADR-017 — A scan and a photo are both a CV

**2026-08-13 · Accepted**

`docs/04-ingestion.md` listed the image-only PDF as a _graceful failure_: "upload the original Word
file, or a PDF with selectable text." For the audience PRODUCT.md actually names — all sectors, not
tech — that sentence is often identical to "you cannot use this product". A large share of working
people have one printed CV and a phone.

So an image-only PDF now goes through OCR, and a JPEG or PNG is accepted outright.

- **Both dependencies ship in the image** (`poppler-utils`, `tesseract-ocr` + eng/spa/dan), per
  ADR-012. +48 MB, 922 MB → 970 MB.
- **TSV output, not plain text.** Tesseract's `tsv` carries a bounding box per word, so OCR produces
  the same positioned `TextItem`s as a real text layer and inherits column detection, line clustering
  and heading inference unchanged. Its plain-text output would have meant a second, worse normalizer.
- **It degrades to the old behaviour.** `extractByOcr` returns `undefined` when the binaries are
  absent or the scan is unreadable, and the original message stands. This can only turn a refusal into
  a result, never the reverse.
- **The GIF stays rejected**, with a message that names JPEG and PNG.

Accepting a photo without saying so would be the dishonest version, so the `ocr` flag travels all the
way to the review step and **suppresses the confidence counter entirely**. Confidence scores describe
how sure the extraction was about text it was _given_; they say nothing about whether that text was
read off the page correctly. Printing "8 of 33 to check" beside a banner reading "please check every
field" tells the user two different things, and the smaller number is the one they act on. A scan gets
"Check everything — read from a picture" and no number at all.

Cost, measured: ~23s for one page end to end. The upload copy no longer promises "a few seconds".

---

## ADR-018 — v0.5's persistence is blocked, and the blocker is a promise, not a credential

**2026-08-14 · Accepted**

v0.5 is "It remembers": accounts, a saved base CV, one variant per application, version history,
GDPR controls, encryption at rest, an audit log. Everything before it in this file was buildable by
writing code. This is not, and the reason worth recording is not the missing Convex deployment.

**Shipping persistence makes the product's current promise false.** `/privacy` says, today:

> We do not. Your CV is processed in memory to answer your request and is gone when the request ends
> — it is never written to a disk or a database.

That sentence is load-bearing. `docs/07-privacy.md` calls "we never store your CV" _"a claim
competitors cannot make"_, and requires that if statelessness ever ends, **the copy changes in the
same PR**. So v0.5 is not a feature that adds storage; it is a decision to trade the strongest thing
this product says about itself for the ability to remember a CV between visits. That is Edd's call,
not an implementation detail, and making it quietly by landing a database would be the single most
dishonest thing available here.

Three things are genuinely blocked on it:

1. **A Convex deployment**, its credentials, and whose account holds them.
2. **Key management for encryption at rest.** "Encrypted" with a key sitting beside the data in the
   same env file is a compliance sentence, not a protection.
3. **The retention default.** docs/07 proposes 90 days of inactivity. That is a product decision with
   a real cost either way, and it belongs to the person who will answer for it.

### What was built anyway

The parts that are pure functions of two documents, because they need no storage and are needed the
moment storage exists:

- `src/optimize/variant-diff.ts` — v0.5's "version history and diffs between variants", written and
  tested now. It is useful before persistence too: tailoring produces a variant and rewriting changes
  bullets, and "show me what changed" is a question that does not require an account.

The rest is deliberately not started. A half-built persistence layer holding real CVs is worse than
none, and an in-memory imitation of one would be a lie told to ourselves.

---

## ADR-019 — Persistence lands on Postgres, and the privacy promise changes with it

**2026-08-14 · Accepted · supersedes the "blocked" half of ADR-018**

Edd authorised both open questions on 2026-08-14: store CVs, and delete them after 90 days of
inactivity. What follows from that is recorded here because two parts of it are irreversible.

### Postgres, not Convex

docs/08 said "Accounts (Convex, matching the existing house stack)". That was wrong about this
workspace. The house stack — `builderhunt`, the reference app and the closest thing Edd has to
production — is **Drizzle + Postgres on Coolify**, and there are no Convex credentials anywhere.

Copying the reference app is now the standing instruction, and it buys more than consistency: the
migration workflow, the role model, the deploy orchestrator and the runbooks all already exist and are
already understood. Choosing Convex would have meant a second architecture _and_ a second external
processor to name in the consent gate, immediately after building that gate around minimising them.

### The promise changed, and the copy changed in the same commit

`/privacy` said a CV is _never written to a disk or a database_. docs/07 calls that "a claim
competitors cannot make" and requires the copy to change in the same PR if statelessness ends. It did,
so it has — including the lead sentence, which still read "There is no account and no database" after
the rest of the page was rewritten. That sentence is the first thing a person reads while deciding
whether to trust us, and catching it took loading the page rather than reading the diff.

The promise is now conditional and stated as such: **no account, nothing stored; an account, 90 days
from the last sign-in, then real deletion.** The stateless path is untouched and remains the default —
most people will use this product without ever signing in.

### What enforces each claim

A privacy notice is only worth the mechanism behind it:

| The claim                         | What makes it true                                                                                                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "90 days, then deleted"           | `RETENTION_DAYS` in one module, the `delete_after` column default, and `scripts/db/retention.mjs`. One definition, three consumers.                                                                                                                     |
| "Using it resets the clock"       | every repository read and write moves `lastSeenAt` and `delete_after` together                                                                                                                                                                          |
| "Deleting removes everything"     | one `DELETE FROM users`; every foreign key carries `onDelete: 'cascade'`, so the database enforces it rather than a service remembering the order                                                                                                       |
| "You can delete it yourself"      | `POST /api/account/delete`, and a `GET` on the same URL answers **405** — without a handler that route falls through to the SPA shell and answers 200 with HTML, which on a destructive URL is a 200 somebody will eventually mistake for a working one |
| "We can show a deletion happened" | the audit row is written first and survives with its subject nulled                                                                                                                                                                                     |

### The credential decision, answered by copying

The encryption-key question from ADR-018 is answered by builderhunt's pattern rather than a new one:
runtime roles are created **without passwords** in `drizzle/0001_roles.sql`, and deployment automation
provisions them out of band. No migration file in git contains a credential, and the web service never
holds an identity that can alter the schema.

The consequence has to be respected or the whole thing fails silently: **`drizzle-kit migrate` alone
leaves the app unable to authenticate.** `scripts/deploy/orchestrate.mjs` is the post-deployment
command, and its step 4 exists solely to catch that — builderhunt's runbook records four failed
deploys learning it. Both failure paths were verified to exit 1, not just written.

### Still not done

Sign-in itself. `src/lib/session.ts` issues and verifies a signed cookie, and every endpoint reads
identity from it, but nothing yet _creates_ a session — there is no email link, no OAuth. Persistence
is therefore complete and unreachable from the interface, which is the honest state to leave it in:
the storage, the retention and the erasure are built and tested, and the door is not yet cut.

---

# Open questions — need Edd's answer

These do **not** block starting v0.1. They are listed at the point where each one
starts to matter.

**Resolved 2026-08-13** by the `impeccable init` interview: primary user (all sectors,
not tech — see [01-vision-and-scope.md](01-vision-and-scope.md)), product ambition
(real monetized product, ADR-010's sibling context), and regional CV convention
(both, ADR-010). Those three are closed; the visual world is closed by ADR-009.

Still open:

1. **pdfcn license.** Not stated on the docs site. Blocks nothing technically, but
   confirm before it is load-bearing. _Needed by: v0.1 Block 1._
2. **Scope directory.** Created at `~/Projects/eddremonts86/HunterReady/` per the
   `context/02_projects.md` convention (personal scope). A real monetized product may
   belong in its own repo rather than under a personal-scope folder. _Needed by: before
   the first push._
3. **TanStack Start vs Next.js.** ADR-005 picks TanStack; the Block 1 spike decides
   it empirically. Override now if there is a preference. _Needed by: v0.1 Block 0._
4. **Anthropic API key / budget.** Which key, and what per-request cost ceiling?
   Check `dev-env/env-config/.env` first per AI-OS rules. _Needed by: v0.1 Block 8._
5. **Four font families** for the app chrome — grease-pencil display, typewriter mono
   body, condensed engraved caps labels, seven-segment numerals. DESIGN.md records the
   character and the banned-defaults list; the actual faces are picked at
   implementation. Licensing matters for a commercial product. _Needed by: v0.1 Block 3b._
6. **Error-state color.** DESIGN.md's One Cone Rule forbids a second accent hue.
   Resolution should come from the world's own material (safelight red is a real
   darkroom light) rather than an invented red. _Needed by: v0.1 Block 12._
7. **Pricing model and tiers.** Now that this is a real product, this shapes v0.5
   onward. _Needed by: v0.5._
8. **Name and domain.** "HunterReady" — `.dev`/`.app`/`.com` availability and
   trademark not checked. _Needed by: v1.0._
