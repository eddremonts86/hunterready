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

## ADR-020 — Sign-in is Better Auth, and the hand-rolled session is deleted

**2026-08-14 · Accepted · completes ADR-019**

ADR-019 left persistence built and deliberately unreachable: no way to create a session. Edd chose
Better Auth, and checking the reference app first turned that from a preference into the house answer —
`builderhunt` already runs Better Auth 1.6 with `@better-auth/drizzle-adapter`.

### What was deleted, and why that is the point

`src/lib/session.ts` hand-rolled a signed cookie: an HMAC over a user id, compared in constant time.
It worked. Deleting it was still right. Session rotation, CSRF, cookie flags, password hashing and the
verification table all have known-correct answers, and every one is a place where a small mistake is
invisible until it is exploited. Two hundred lines of our own auth is two hundred lines nobody reviews
again.

### One identity table

The first draft of the v0.5 schema had its own `users` table. Better Auth brings `auth_users`, and
keeping both would have meant **two places to honour an erasure request** — exactly the shape of bug a
GDPR obligation cannot survive. So `auth_users` _is_ the user table, `resumes`, `variants` and
`access_log` reference it, and the retention columns live on it with defaults so Better Auth inserts
without knowing they exist.

Verified end to end against a real Postgres, with a real account: one row in each of five tables →
**zero in all five** after one `DELETE`, and the audit row surviving with its subject nulled.

### What is not copied from the reference app

builderhunt's auth configuration runs to hundreds of lines: organizations, device fingerprinting,
abuse hooks, step-up auth, disposable-email gates. Every one solves a multi-tenant SaaS's problem.
HunterReady is one person and one CV. Inheriting that would be complexity with nothing behind it, and
the reference is there to copy from again if teams ever arrive.

### Email and password, not magic links

Magic links are arguably better for a product holding CVs — no password to leak. They need a working
email sender, which this deployment does not have. So this is the honest available choice rather than
the ideal one, and `sendResetPassword` is deliberately absent: offering a reset flow that silently
cannot send an email is worse than not offering one. Minimum length is raised to 10.

### A lesson worth more than the feature

The retention sweep shipped broken. When the schema moved to `auth_users` it still said `users`, and
because the orchestrator treats a retention failure as **soft** — correctly, so a sweep never blocks a
release — the deploy went green while the sweep silently did nothing. A sweep matching no rows looks
identical to a sweep with nothing to do.

The first fix was worse than the bug: a `--check` mode with **its own copy of the queries**, which
passed while the real ones were still broken. _A check that duplicates the thing it checks does not
check it._ There is now one list of targets that both paths read, and `--check` was verified to fail
when a table name is wrong.

---

## ADR-021 — Encryption at rest, with its limit stated rather than implied

**2026-08-14 · Accepted · closes the last open item of ADR-018**

ADR-018 refused to ship this, and the refusal was correct at the time: _"encrypted with the key in the
same env file beside the data is a compliance sentence, not a protection."_ Edd accepted the trade on
2026-08-14 with that sentence in front of him, so what follows is the honest accounting of it.

### What it protects

- a stolen disk, or a leaked volume snapshot
- a backup copied off the host, or a `pg_dump` that ends up somewhere it should not
- anybody with read access to the database but not to the application's environment — which includes
  the `hunterready_readonly` role this schema already creates

### What it does not protect

An attacker who has the application's environment. They have the key. On a single-host Coolify
deployment there is no arrangement that changes this, and pretending otherwise is the failure mode of
the phrase "encrypted at rest".

The realistic threat for a deployment this size is the first list. A leaked backup is how this kind of
data actually escapes, and until today every byte of it was plaintext.

### The shape

AES-256-GCM, a fresh 12-byte IV per write, stored as a JSON envelope **inside the existing `jsonb`
column** — so no migration and no column type change:

```json
{ "v": 1, "iv": "…", "ct": "…", "tag": "…" }
```

GCM rather than CBC because it authenticates: a tampered ciphertext fails to decrypt instead of
producing plausible garbage that then flows into a `Resume` and out into somebody's CV.

Three decisions inside that are load-bearing:

- **Plaintext rows keep reading.** `decryptJson` returns anything that is not an envelope unchanged.
  Not laziness — a rolling deploy has both versions of the code live at once, and every row already in
  the table is plaintext. Without this, switching the key on would make every existing CV unreadable.
  Rows encrypt on their next write.
- **A wrong key throws.** Not "return the envelope" (that hands ciphertext to the schema parser) and
  not "return undefined" (which looks exactly like an empty CV and could be saved back over the real
  one). The message names the key, because the reflex on a decryption failure is "the data is corrupt"
  and acting on that reflex is how somebody deletes rows that were fine.
- **`schemaVersion` stays in the clear.** A future migration has to be able to find rows of a given
  version without holding the key.

### What is encrypted, and what deliberately is not

| encrypted                                                                                            | left readable                                                   |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `resumes.document`                                                                                   | `schemaVersion`, `label`                                        |
| `variants.document`                                                                                  | `company`, `role`, `status`                                     |
| `variants.gapReport` — it **quotes the CV back**, its `found` arrays are the candidate's own bullets | `variants.jobDescription` — a public job advert somebody pasted |

The gap report is the one worth naming. It is CV content wearing a different name, and it would have
been easy to miss.

### The cost, which is the whole of the objection that remains

**Losing the key loses every stored CV.** There is no recovery path and there should not be one — a
recoverable encryption key is a key with a second copy somewhere. That makes backing up the key a real
operational obligation, and it is written into the deploy runbook rather than left as folklore.

### No key configured

Writes stay plaintext, and the application says which at startup rather than assuming. `/privacy` reads
`encryptionEnabled()` from the server, so the page **cannot claim encryption on an installation that has
no key** — the same discipline as naming the provider rather than hardcoding it. An installation that
believes it is encrypting and is not is worse than one that knows it is not.

---

## ADR-022 — Cyrillic and Greek are a font-format problem, not a subset list

**2026-08-14 · Accepted · shipped the same day the finding was recorded**

Recorded because the obvious fix is wrong and three plausible approaches were ruled out by measurement.
Whoever picks this up should not repeat them.

### The estimate that was wrong

The roadmap's "non-Latin script coverage" was assessed as two jobs: CJK (expensive, 10–16 MB per weight)
and Cyrillic/Greek (_"cheap and already licensed — subsets of Source Sans 3, which we already bundle,
about 100 KB, no layout change"_). The first half of that is right. **The second half was wrong**, and the
error was assuming that bundling the files makes the renderer use them.

### What was measured

Adding `cyrillic`, `cyrillic-ext`, `greek`, `greek-ext` to the bundler's `SUBSETS` copies 43 files
instead of 22 and changes nothing about the output. Every one of these failed with
`MissingGlyphs("М (U+041C), …")`:

| approach                                                          | result          |
| ----------------------------------------------------------------- | --------------- |
| all six subsets registered under one family name                  | `MissingGlyphs` |
| distinct family names plus a comma fallback chain                 | `MissingGlyphs` |
| **only** the Cyrillic subset loaded, under the family name in use | `MissingGlyphs` |

The third is what rules out the family-name and fallback theories: a font file containing Cyrillic,
loaded alone, under exactly the name the theme asks for, still cannot draw Cyrillic.

Two control runs located the cause:

- the Cyrillic subset file renders **Latin** text fine — so it loads and parses
- a full system TTF (`Arial Unicode.ttf`) renders Latin, Cyrillic **and** Greek fine

So the renderer is not the problem and the family plumbing is not the problem.
**takumi-pdf 0.6.4 cannot reach the glyphs in fontsource's range-subset `woff2` files** beyond Latin. It
loads them and consults its own coverage instead.

### One good thing this surfaced

The renderer **fails loudly**. A CV with a Cyrillic name today produces a clear `MissingGlyphs` error
naming the exact codepoints, not a PDF full of tofu. The current state is unsupported, not silently
broken, and that is the difference between a bug report and a candidate posting a boxed-out CV.

### The remaining path, and why it is a decision

Ship **full TTFs** for `Source Sans 3` and `Source Serif 4` instead of range subsets. Both cover Latin,
Greek and Cyrillic upstream and are OFL, so licensing is not the question. The question is:

- roughly **2.4 MB** of vendored binaries (2 families × 3 weights × ~400 KB) against today's 460 KB
- where they come from — fontsource publishes no TTF for these faces, so it means either a new
  dependency or committing binaries fetched from Adobe's releases
- and `pnpm build`'s asset copy, the Dockerfile and the round-trip suite all get bigger with them

That is a decision about the deployed image and about vendoring, not a line in a list. It is not blocked
on anything technical, and the second estimate should be trusted more than the first only because this
one was measured.

### What shipped

Edd chose to subset rather than vendor the full fonts, and the numbers came out better than either
estimate: `scripts/make-fonts.mjs` fetches Adobe's pinned releases and restricts each weight to the
ranges a CV in this product's markets needs, giving **1.24 MB for six faces** — against 2.4 MB for the
full fonts and 460 KB for the Latin-only subsets it replaces.

The loader **prefers** a `-full-*.ttf` over the per-range `woff2` for the same weight and skips the
subsets entirely when it finds one. Skipping is not tidiness: registering both puts two fonts under one
family and weight, and which one gets consulted is not ours to decide. Written as a preference rather
than a replacement so the change is additive — a checkout that has not run the generator behaves exactly
as before.

The order of work is the part worth keeping: the subsetted TTF was **proved to render Cyrillic and Greek
through takumi before a single file was vendored**. The previous attempt bundled fonts the renderer could
not use, and only a failing render revealed it.

### One more trap, caught before it shipped

`scripts/copy-assets.mjs` filtered on `.woff2`. The new TTFs would have been left out of `.output`, so
the loader would have found only the Latin subsets **in production only** — the source tree has the
files, so every local test would have passed. That is the worst shape a font bug can take, and it was one
line.

---

## ADR-031 — Model routing is retired; the person chooses the company

**2026-08-18 · Accepted**

docs/06 carried a table mapping each task to a model: Haiku 4.5 for extraction, Opus 5 for bullet
rewriting, Sonnet 5 for reading a job advert, none for scoring. It was never implemented. It is now
removed rather than implemented.

### Why not build it

Measured against the code on 2026-08-18, not against the document:

| Task                      | Table says | Today                    | Routing would change |
| ------------------------- | ---------- | ------------------------ | -------------------- |
| Extraction / structuring  | Haiku 4.5  | `provider.model`         | nothing available    |
| Bullet rewriting          | Opus 5     | `provider.model`         | nothing available    |
| JD requirement extraction | Sonnet 5   | `provider.model`         | nothing available    |
| Scoring                   | none       | `score.ts`, 0 model refs | already true         |

**Three of four rows name Anthropic models this deployment does not use.** Production runs MiniMax;
DeepSeek and a local Ollama are the alternatives; the Anthropic provider exists in `provider.ts` and
serves nobody. Those rows are not unbuilt, they are unbuildable as written.

**The fourth row is already true**, and it got there without routing. `src/optimize/score.ts` has no
client and no message.

**There is one model per provider, not per task.** `provider.model` is a single string from
`MINIMAX_MODEL` / `DEEPSEEK_MODEL` / `OLLAMA_MODEL`, and every call site takes it. Per-task selection
would first require each provider to expose several models — configuration that does not exist and
that nobody has asked for.

### What replaced it, deliberately

ADR-023. The person picks a named company at the consent gate, because docs/07 requires consent to a
named provider. Routing could only ever sit _underneath_ that choice: overriding it would mean the
product deciding where somebody's CV goes after asking them where it should go.

### What was kept

The useful idea in that table was never about vendors — it was **cheap work here, expensive work
away**. That is alive as the exit from ADR-030 and it is filed in
`docs/plans/04-adr-030-exit.md`. What blocks it is the blocking model call, not the absence of a
lookup table.

### The reason this is an ADR and not a deletion

Four features have shipped in this project as schema plus prose with no code and no path from the
interface — `variant-diff`, v0.4's targeting, v0.5's persistence, `basics.photoUrl` — and CLAUDE.md
opens with that list. A described-but-absent routing table was the same failure one step earlier. It
is removed so that the documentation stops describing a product that does not exist, and recorded
here so the removal is not mistaken later for an oversight.

## ADR-030 — The third-party model is open to everyone, until the box can serve the local one

**2026-08-15 · Accepted · temporary, with a stated exit**

ADR-023 made the third-party model the paid capability and our own hardware the default, and gave the
free tier the more private half of the deal. That is still the design this product wants. It is
suspended, not repealed, behind `HR_THIRD_PARTY_FOR_ALL=true`.

### What forced it

Measured on production the day v0.10 shipped, as an anonymous visitor, twice:

|                                   |                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Reading one job advert            | **102 s**, then **171 s**                                                                                                 |
| Result both times                 | fell back to the rule engine, and said so on screen                                                                       |
| Requirements matched by the rules | **0 of 4** — including "Experience running a picking floor" against a CV saying "Ran the late shift on the picking floor" |
| "Fit my CV to this job"           | **never appeared** — the button needs matches to act on                                                                   |

That is the part worth being precise about. The free tier was not slow; the feature **did not exist**
for the commonest visitor. A privacy default that costs somebody the product is not a privacy
default, it is an outage with a principle written on it.

### What is suspended, and what is not

**Suspended:** the plan half of `mayUseThirdParty`. Everyone is now entitled, account or not.

**Not suspended — and this is the whole of why this is acceptable:** consent. `mayUseThirdParty` is
still `consented && entitled`, and the gate now _appears_ for everyone, because `/api/processing`
names a provider only to somebody who can reach it. Nobody's CV goes anywhere without them being
asked; the change is that the question is now worth asking. Declining still lands on our own model,
still works, and still costs only accuracy and time.

The copy moved with the decision rather than after it. `/privacy` said the transfer could not happen
without a paid plan, full stop — false for the commonest visitor the moment this shipped, and a
privacy notice carrying a comforting sentence that no longer holds is worse than one that never made
the promise.

### An env var, not a code change

Turning this off is one Coolify edit and a restart, not a release. That is deliberate: a temporary
measure that needs a deploy to undo stops being temporary.

### The exit

Set `HR_THIRD_PARTY_FOR_ALL=false` when the local model can serve an advert read in a few seconds.
ADR-027 already named the lever and it is not a faster engine: **take the model call off the blocking
path**, where the rule engine already scores 100% on the extraction fixtures. Until that lands, this
switch is what stands between an anonymous visitor and a feature they cannot use.

### What it costs

Every anonymous visitor now spends third-party tokens. `/api/rewrite` already rate-limits; ingestion
does not, and that is the next thing to watch if the bill moves.

---

## ADR-029 — Translation sends `personalDetails`, and the page says so

**2026-08-15 · Accepted · Edd's decision, and it is closed**

The whole-document translation sends `basics.personalDetails` field by field. On a European CV that is
exactly where **date of birth, nationality and marital status** live — more sensitive than the phone
number `redactForLlm` goes out of its way to strip on the first read.

Two options were put to Edd: withhold those fields and tell the person to translate them by hand, or
send them and say so. **He chose being straight with the user**, and this ADR exists so it is not
re-opened by the next person who notices.

### Why it holds up

The person asked for **their whole document** in another language. Those lines are printed on it. A
translation that silently skipped them would hand back a document that is wrong in a way the person
cannot see — which is the failure this product exists to not commit — and one that says "we left
these out for your safety" makes a decision about somebody's own data on their behalf.

What makes it defensible is not the sending; it is the saying. `/privacy` enumerates what leaves and
for which purpose, so the transfer is a thing the person can decline (ADR-023: declining leaves them
on our own hardware, where the document never leaves the machine).

### What would re-open it

A jurisdiction where transferring special-category data needs its own explicit consent, separate from
the general processing consent. That is a legal question, not a design one; the fields are already
isolated in one array, so the change would be one filter and one sentence.

---

## ADR-028 — A claim has to belong to the job it is claimed for

**2026-08-15 · Accepted · measured**

The anti-fabrication guard grounds a rewrite on the **whole résumé**, and ADR-017 and docs/06 are
right about why: if somebody's skills list says `Salesforce` and a bullet about their pipeline
mentions it, that is their own word resurfacing, not an invention. Narrowing the grounding to the
single bullet would reject the useful half of the feature.

That decision has a blind spot with a precise shape, and this ADR closes it.

### What was measured

`src/optimize/__tests__/rewrite-quality.test.ts` — the local model, one call per bullet, across the
three fixtures (26 bullets). Four runs before this change:

|       | drift observed                                                           |
| ----- | ------------------------------------------------------------------------ |
| run 1 | `Plejecenter`, `Sølund` — a previous employer's name, on a Herlev bullet |
| run 2 | none                                                                     |
| run 3 | `40`, `ten` — another job's figures, on a Northgate bullet               |
| run 4 | none                                                                     |

Roughly **one run in two**, one suggestion each time. Every token was in the document, so the guard
passed all of them. Nothing was invented and each sentence was still false — a claim moved to the
wrong employer is the failure a reader would call lying, and it is the failure this product exists to
not commit.

### The rule

A **number** must be grounded in the bullet's own job. A **name** must not be another job's
identifying material — its employer, its job title, its tools.

Everything belonging to the _person_ stays grounded exactly as before: summary, skills, education,
certifications, and anything they typed into an answer. Only the other employers' facts are withdrawn.

### Why the check and the metric are the same function

`findCrossJobDrift` is called by the guard **and** by the measurement suite. A metric that
paraphrases the rule it measures drifts away from it silently; sharing the code means the suite's
`drifted: 0` is a statement about the guard rather than about a second implementation of it.

### The false positive that shaped the definition

The first version counted every capitalised word the narrowed grounding did not cover, and flagged
**"Led"** — an ordinary verb, grounded in the full résumé only because another bullet opens with it.
A metric that counts vocabulary reports drift forever while pointing at nothing. Hence "identifying
material" rather than "any word from another job", with the case kept as a test.

### Cost

A rejection costs one retry and, at worst, the candidate's own wording — the same trade the guard
already makes, and the one docs/06 states plainly: a false positive costs a better sentence, a false
negative costs somebody their credibility in an interview.

---

## ADR-027 — vLLM is the wrong lever on a 4-vCPU ARM box; the model is not where the time goes

**2026-08-15 · Accepted · measured**

Edd asked whether swapping Ollama for vLLM would buy the advertised 2–5×. It would not, and
measuring produced a more useful answer than the question expected.

### The box

Production is a Hetzner `cax21`: **ARM64 (Ampere Altra), 4 vCPU, 8 GB RAM**, shared with a dozen
other apps. Measured there today: **50.2 s** for one local extraction of the nurse fixture.

### Why vLLM cannot help here

- **Architecture.** vLLM's CPU speed comes from AVX512/AMX on x86. On ARM it asks only for NEON and
  is the least-optimised path. Apple Silicon GPU support exists solely in the separate `vLLM-Metal`
  project, which is irrelevant to a Linux VPS.
- **Memory.** The CPU backend takes FP32/FP16/BF16 plus AWQ/GPTQ — **no GGUF**. `qwen2.5-3b` in
  bf16 is ~6 GB, plus a 4 GB default KV cache, against 8 GB total shared with Postgres and the app.
  Ollama's GGUF Q4 is 1.9 GB. The arithmetic does not close.
- **Its actual advantage does not apply.** Continuous batching wins when compute sits idle. Measured
  on ARM64 at 4 threads, running the real 14-bullet Wording pass: sequential 9.1 s → concurrent
  12.5 s on 3b (**0.7×**), 5.6 s → 4.5 s on 1.5b (1.2×). Four cores are already saturated by one
  request.

### What was measured instead (ARM64, 4 threads, same architecture as production)

| Lever                                           | Effect                                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `qwen2.5:3b` → `1.5b`                           | **1.7×** (60 → 102 tok/s)                                                                      |
| `3b` → `0.5b`                                   | 3.1× — quality too low to use                                                                  |
| 14 separate calls → one batched call            | 1.5× on 3b, 1.0× on 1.5b                                                                       |
| Concurrency                                     | 1.0×, and 0.7× on 3b                                                                           |
| `OLLAMA_FLASH_ATTENTION` + `KV_CACHE_TYPE=q8_0` | no measurable effect (prompts are short)                                                       |
| `qwen3:1.7b`                                    | 1.5× faster, but emits reasoning tokens through this API even with `/no_think` — not a drop-in |

### The finding that matters more than any of them

`accuracy.test.ts` scores the **rule engine alone at 100% on all six fixtures**, including both
two-column layouts. The local model's job on the extraction path is to file corrections onto that
baseline — and it costs 50 s of somebody's first impression to do it. The lever is not which engine
runs the model; it is **whether that model call belongs in the blocking path at all**.

⚠️ Before acting on that: the fixtures are synthetic and grew up alongside the rule engine
(ADR-016), so 100% may flatter it. Verify against a wider corpus of real documents before moving
the model off the critical path.

### Decision

Keep Ollama. Do not adopt vLLM on this hardware. If the local path needs to be faster, in order:
right-size the model to `1.5b`, take the model call out of the blocking path where rules already
answer, batch multi-item work into single calls, and only then buy cores (`cax31` doubles them).
A benchmark that uses `--cpus` to simulate a smaller box is invalid — Docker's CFS quota throttled
llama.cpp 40× (46 → 1.1 tok/s) and made every model look identical. Limit threads instead.

## ADR-026 — The sidebar layout exists, honestly rated, with the DOM fighting for the parser

**2026-08-15 · Accepted · Edd's decision**

The two-column CV with a full-height colored panel is what every reference gallery sells and what
Edd's own CV looks like. docs/05 rule 1 forbids it for _verified_ templates, and that rule stands —
what changed is that the product now offers the layout under the rating that has existed for it all
along: **design-first**, with a warning that says the real risk in plain language (a position-sorting
parser reads a page line by line across both columns).

Honesty is not a licence to make the risk worse. The main column — name, summary, the whole career —
comes first in the document tree and `row-reverse` puts the sidebar on the visual left, so a
content-order extractor reads the entire history before the first sidebar item. The template passes
the full round-trip suite, reading-order assertion included; the badge exists for the parsers the
suite cannot speak for.

The full-height column is the measured construction from ADR-025 with split margin bands:
sidebar-colored for the column's width, page-colored for the rest, per page. `onyx` (light type on a
dark ground) rides the same tinted-paper machinery, and watermarks are pure geometry — takumi renders
no SVG images, so a "marca de agua" is absolutely-positioned circles and rings at single-digit
opacity, painted before the text and absent from the text layer.

## ADR-025 — Character axes: tinted papers, section chips, name faces, ten families

**2026-08-14 · Accepted · Edd's decision**

ADR-024 gave each theme an accent and a heading treatment; Edd's bar moved to Apple Pages' CV
gallery: whole pages of tinted stock, colored masthead bands, a different hue per section, and
typefaces with a point of view. "No importa el peso" — the font-size budget is explicitly spent.

### The bleed construction

takumi has no page-background option and its margins are unpainted page, so a tinted paper is
built from three painted pieces: zero side margins with the horizontal margins moved into the
content box as padding; tinted header and footer bands exactly filling the vertical margins,
repeated per page by the renderer; and the content box grown to a whole number of usable pages
— `measure()` first, then `height: pages × usable - 2` (the probe caught an exact-boundary
slice spilling a phantom blank page, hence the two pixels). Continuation pages keep real
margins, the counter lives in the tinted footer band, and the text layer is untouched
throughout. `theme.spacing.page` stays the single source of truth: the preview and the fit
estimator read the same numbers whether the paper is white or tinted.

### The other axes

Per-section heading accents (`sectionAccents`) give carnival its orange/brick/forest chips —
the words in the chips never change, so EXPERIENCE on orange extracts exactly as EXPERIENCE. A
name-only face (`nameFontFamily`) lets brush hand-write the one string the round-trip suite
scores on every build. A masthead accent (`mastheadAccent`) lets a band differ from the chips.

### Five families vendored, probed first

Playfair Display, EB Garamond, Space Grotesk, Lora, Josefin Sans — all OFL, all through
`bundle-fonts.mjs`, all exercised by the round-trip matrix (112 combinations) before the
catalogue offered them. Sixteen themes, fifty-two designs, the free twelve unchanged.

## ADR-024 — Documents own an accent palette; the ban is on chrome colors, not on color

**2026-08-14 · Accepted · Edd's decision**

The first design catalogue shipped thirty pairings that were one grey document in thirty spacing
configurations, and Edd's verdict was the correct one: nobody pays for that. The cause was an
over-reading of DESIGN.md's hardest rule. "The print is not ours" bans **our brand** from the
document — Signal Blue, the chrome greys, Figtree — because a CV carrying our accent carries our
brand into someone else's job application. It was implemented as "documents are monochrome",
which bans something the rule never mentioned: color that belongs to the document itself.

### The rule, restated precisely

- Documents draw from their own print palette: seven accent inks (teal, navy, graphite, rust,
  forest, maroon, slate) plus their washes, all in `ALLOWED_PRINT_COLORS`, all enforced by test.
- The chrome's colors are banned **by value** in `ROOM_COLORS` — now including Signal Blue
  `#1B3BD8` alongside the retired darkroom ambers — and the themes test walks both `colors` and
  the style block against the allowed list.
- Identity is drawing, never typesetting tricks: bands, bars, rules, frames and washes are shapes
  with no glyphs in them. `letterSpacing` stays banned on text (rule 13; the round-trip once read
  a tracked heading back as "E x p e r i e n c e").

### Why themes carry a `style` block instead of thirty template files

`PdfcnTheme` is vendored and cannot gain fields, so each theme exports `DocTheme = PdfcnTheme &
{ style }` — masthead construction (`plain`/`centered`/`band`/`sideline`), section-heading
treatment (`hairline`/`underline`/`shortline`/`bar`/`band`/`tint`/`flanked`/`framed`/`plain`),
and where the accent lands (name, headings, bullets, role line). One template factory executes
the vocabulary; eight themes speak it differently; the round-trip suite proves all 184
combinations still parse. A test now asserts no two themes share an accent or a heading look —
the test Edd's complaint wrote.

## ADR-023 — The third-party model is the paid capability; our own hardware is the default

**2026-08-14 · Accepted · Edd's decision**

Until now `resolveProvider()` returned MiniMax whenever it was configured, so **any** visitor who
accepted the consent gate had their CV sent to another company. The local model — the thing that makes
declining cost accuracy instead of the whole feature (ADR-019) — was the exception rather than the rule.
That is inverted.

### The rule

Reading a CV, rewriting a bullet, tailoring a summary, writing a letter: all of it runs on the `llm`
service in our own stack **unless both** of these hold:

1. the person is signed in on a paid plan, and
2. they have consented to the transfer

Two independent conditions, and the `&&` is the whole point of `src/lib/entitlements.ts`. Consent
without entitlement is somebody agreeing to something that will not happen. Entitlement without consent
is us deciding on their behalf because they paid. Neither is acceptable alone.

### Why this is the line the tiers are drawn on

The outside API is the only thing in the product with a **per-CV marginal cost**. Storage is cheap and
bounded by the retention policy; a model on our own box is a fixed cost paid whether anybody uploads or
not. So it is the natural boundary — and it lands with the free tier being the _more_ private one, which
is the opposite of how this normally goes. That is worth keeping rather than apologising for.

### Anonymous means local, always

No account, so no plan, so no entitlement, so nothing leaves the server. The statelessness promise
(ADR-004) and the transfer promise become the **same promise** for the commonest kind of visitor.

`/api/processing` therefore reports `provider: null` to anonymous and free callers, which switches the
consent gate off by itself — `needsConsent` requires a named provider. That falls out of the existing
rule rather than needing a new one, and it is the right behaviour: asking permission for a transfer that
cannot happen trains people to click through consent screens.

The page copy changed with it. `/privacy` used to explain the no-transfer case as _"this installation has
no AI provider configured"_, which stops being the reason the moment a paid tier exists — a false
explanation of a true fact. It now describes what happens instead of how the server is configured.

### The alarm this made necessary

`ingest.provider_degraded` existed to catch a silent third-party outage. The local path was the
exception then, and its failure meant one person got a worse read. **It is now everybody's default**, so
a broken or unpulled model would drop the entire product to regular expressions with every user still
receiving a plausible CV and nothing anywhere saying why it got worse. `ingest.local_degraded` is the
mirror, and it is worth strictly more than the original.

### `plan` is a column, and there is no endpoint that sets it

`auth_users.plan`, `text` not an enum — an enum needs a migration to add a value and the one certainty
about tiers is that they change. `setPlan` is a repository function and audited. Granting yourself the
paid tier over HTTP is not a feature, and there is no payment provider yet (open question 7).

`entitlementFor` fails closed on every uncertainty: no persistence, no session, an unrecognised plan
name, or a thrown query all resolve to no entitlement. A bug here would spend money on somebody who is
not paying _and_ break a privacy promise in the same breath, so the safe direction is the cheap one.

### Verified

Against the compose container, with a real account:

| caller          | consent  | model used  |
| --------------- | -------- | ----------- |
| paid, signed in | given    | **MiniMax** |
| paid, signed in | declined | local       |
| free, signed in | given    | local       |
| anonymous       | given    | local       |

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
5. ~~**Four font families** for the app chrome — grease-pencil display, typewriter mono
   body, condensed engraved caps labels, seven-segment numerals.~~ **Closed by the v0.6
   world change.** Both this and the question below described the Darkroom Safelight Bay,
   which Edd replaced with Plain Sight. There is now **one** chrome family —
   `Figtree Variable`, SIL Open Font License, so the commercial-licensing concern is
   answered too — in four weights.
6. ~~**Error-state color.** DESIGN.md's One Cone Rule forbids a second accent hue.~~
   **Closed with the same change.** The One Cone Rule went with the darkroom. Plain Sight
   has one accent (Signal Blue `#1B3BD8`) plus three status hues chosen on measured
   contrast: `--color-alert` `#c02424`, `--color-caution` `#9a5b12`,
   `--color-affirm` `#0c7a52`. Kept in the list rather than deleted, because a question
   that was answered by replacing its premise is worth seeing once.
7. **Pricing model and tiers.** The only genuinely blocking item left, and it cannot be
   guessed: the numbers are Edd's. What the code already makes cheap to gate, so that the
   question is concrete rather than open-ended:

   | free could be          | paid could be                                          |
   | ---------------------- | ------------------------------------------------------ |
   | upload, check, one PDF | `.docx`, cover letters, share links                    |
   | the rules-based reader | the model-backed reader (this is the real per-CV cost) |
   | one saved CV           | saved variants and the application tracker             |

   Three shapes that fit what exists:

   - **One-off** — pay per finished CV. Fits somebody applying once; earns nothing from the
     tailoring features, which are the ones a job hunt uses repeatedly.
   - **Subscription with a free stateless tier** — free is the whole current stateless path,
     paid is the account: saved CVs, variants, tracker, share links. Matches where the cost
     actually is (storage and model calls both need an account) and matches ADR-004's
     stance, since the free tier stays the one that stores nothing.
   - **Credits** — a bundle of model-backed actions. Cleanest mapping to cost, and the one
     users understand least.

   The second is the shape chosen (2026-08-14), and **ADR-023 has already built the line it needs**:
   the third-party model is entitlement-gated, the free path runs on our own hardware and stores
   nothing, and `auth_users.plan` decides. What is still open is only the numbers and the payment
   provider. _Needed by: v1.0._

8. **Name and domain.** "HunterReady" — `.dev`/`.app`/`.com` availability and
   trademark not checked. _Needed by: v1.0._
