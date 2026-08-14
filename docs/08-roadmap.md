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
- **Tracked-out section headings** were losing whole sections, and that is fixed
  (`collapseLetterSpaced` in `src/ingest/sections.ts`). A designed CV sets a heading with heavy
  letter-spacing and the PDF text layer keeps it as real spaces, so `FORMACIÓN` arrives as
  `F O R M A C I Ó N` — nine "words" to the four-word guard that exists to stop a prose sentence
  counting as a section break. Every entry under such a heading was dropped, silently, on exactly the
  kind of CV somebody paid a designer for. Not a Spanish problem: any language, any tracked heading.
- **"No education section in the private Spanish CV" is probably not a defect.** Measured rather than
  assumed: of 103 extracted lines, **zero** contain `formacion`, `educacion`, `estudios` or `academic`
  in any form. So nothing is being missed by the matcher — the words are not in the extracted text.
  Either the extraction loses that region entirely, or that CV has no formal education section, and its
  detected headings (`/ QUIÉN ESCRIBE`, `Sobre mí.`, `Experiencia profesional.`, `WORDPRESS`) look like
  a portfolio-shaped profile that might not carry one. **Edd can answer this in a sentence**; nobody
  should hunt it further until he does.
- MiniMax sometimes returns no provenance.

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

## v0.4 — "It targets a job" · shipped

- ✅ Requirement matching with a **three-way** verdict: matched / weak / missing. `weak` is the one
  that earns its keep — a requirement present only in the skills list, or only in a job that ended
  eight years ago, is a claim with no story behind it, and that is exactly what tailoring exists to
  resurface.
- ✅ The gap report **shows** its evidence rather than asserting it. "You have this" is an opinion;
  "you have this, here" is checkable.
- ✅ Reorder + re-emphasize as a **variant**, never a mutation. Without a model in the loop the only
  moves are reorderings, because a reordering cannot make a CV say something untrue.
- ✅ Transparent rule-based score with a fix checklist. docs/06's weights unchanged; every point
  traces to a rule you can read.
- ✅ Requirement extraction **from pasted prose** (`src/optimize/advert.ts`), with the guard pointed the
  other way: a model that has read a million adverts knows they usually want "excellent communication
  skills" and will supply that whether or not this one asked. Every requirement is checked against the
  advert text, one that is not there is dropped, and the user is shown that it was invented. There is a
  rule reader too (EN/ES/DA headings), so declining the third-party transfer costs accuracy and not the
  feature.
- ✅ Tailored `basics.summary` from existing material (`src/optimize/summary.ts`), carrying **two**
  guards. `findFabrications` catches invented numbers and names; a second check catches the class the
  first cannot see — `"Experienced in inventory control"` invents no number and no proper noun, and is
  a lie if the CV never mentions inventory control. The gap report already knows which requirements have
  nothing behind them, so the forbidden list is not guesswork.

### The thing that was actually wrong with v0.4

All of the above was written, tested, and **imported by nothing but its own unit tests**. `jd.ts`,
`score.ts` and `variant-diff.ts` had no path from the interface: there was no way for a user to paste an
advert, so a feature described here as "mostly shipped" could not be reached at all. It ships now as a
branch off the check step — not a fourth step everybody walks through, because plenty of people want a
cleanly typeset PDF and nothing else (ADR-011).

Matching, scoring and tailoring run **in the browser**, because they are pure functions of two plain
objects. That is a product decision, not a technical one: the requirement list is editable, so every
edit re-matches and re-scores, and doing that on the server would put a network round trip behind a
checkbox.

### What the summary guard is worth, measured

Fifteen runs against the real model, same CV and advert, three prompt versions:

| prompt                                               | suggested | unsupported claims shown |
| ---------------------------------------------------- | --------- | ------------------------ |
| summary-v1                                           | 3 / 5     | **0**                    |
| summary-v2 — keep the CV's own words around a figure | 2 / 5     | **0**                    |
| summary-v3 — v2 plus "do not count things"           | 3 / 5     | **0**                    |

The right-hand column is the one that matters and it never moved. Every refusal was the guard catching
an invented count — the model adding up a career it was asked only to compress, "across two hospitals"
from a CV that names two employers — and in every case the candidate kept their own summary.

v2 is recorded even though it measured worse, because the reason is the lesson: it was aimed at a
**false** positive (the CV said "precepted 14 newly graduated nurses", the model wrote "14 new
graduates"), and fixing the rarer failure did nothing for the common one. v3 found the common one by
reading the rejections instead of reasoning about them, and the rule it needed had existed in
`prompt.ts` since rewrite-v2 and simply had not been carried across. ADR-016, again.

### Two defects this work surfaced elsewhere

- **A tight `max()` on explanatory text rejected the whole payload.** The first genuinely good tailored
  summary was thrown away because its _rationale_ ran forty characters over a 300-character cap, and the
  candidate was told the feature was unavailable. `rewrite.ts` had the identical latent defect in
  production. Neither field ever becomes part of the CV, so a limit on it should clamp, not reject.
- **The fabrication guard read a number's unit forwards only.** All three of the product's languages
  write `a team of 14`, so the counted noun is frequently _behind_ the figure — and a recomposed sentence
  then failed to ground the candidate's own number. Fixed by reading backwards through a linking
  preposition, which is narrower than it sounds: a plain backwards window picked up the verb and let
  "Handled a 1,200-strong portfolio" ground "Handled 1200 accounts", the exact fabrication the check
  exists to catch.

## v0.5 — "It remembers" · shipped

Two contradictory `v0.5` sections used to sit here: one saying the work was blocked on a Convex
deployment, one planning it on Convex. Both were stale. ADR-019 replaced Convex with Drizzle + Postgres
(the house stack — there were never any Convex credentials), and ADR-019/ADR-020 record Edd's
authorisation on 2026-08-14 to store CVs and delete them after 90 days of inactivity.

- ✅ **Accounts.** Better Auth 1.6 with the Drizzle adapter, matching `builderhunt` (ADR-020). One
  identity table: `auth_users` _is_ the user table, because two would mean two places to honour an
  erasure request.
- ✅ **Saved base CV, and one variant per application**, with the tracker. `/api/library` and
  `/api/application`.
- ✅ **Version history and diffs between variants** (`src/optimize/variant-diff.ts`) — pure functions of
  two documents, so they needed no storage and were written before it existed.
- ✅ **GDPR controls**: export, delete-everything, 90-day retention from `lastSeenAt`, and an access log
  that survives erasure with its subject nulled.
- ⬜ **Encryption at rest.** Still open, and still for the reason ADR-018 gave: "encrypted" with the key
  in the same env file beside the data is a compliance sentence, not a protection. It needs a
  key-management decision, not code.

### What was actually wrong with v0.5

The tables, the repository, the auth configuration, the GDPR endpoints and the retention sweep were all
built and all verified against a real Postgres. **None of it was reachable.** `saveResume`,
`listResumes`, `saveVariant` and `listVariants` were imported by nothing but their own tests, and
`SignIn` was rendered on no screen — so no session could be created, so nothing was ever saved, so
`/api/account/export` and `/api/account/delete` answered `no_account` to every visitor.

That had a consequence beyond a missing feature. `/privacy` said "if you sign in so we can remember your
CV between visits, then we do store it", and nothing stored anything. A privacy notice that describes
handling the code does not perform is wrong even when it **over**-discloses, because it is the document
somebody reads to decide whether to trust us. Wiring the route is what made the sentence true.

This is the third release in a row where a complete, tested layer shipped with no path from the
interface — v0.3's `variant-diff`, v0.4's whole targeting feature, and now v0.5's persistence. The
pattern is worth naming: **a feature is not shipped until a person can reach it**, and a unit test
proves the opposite of that convincingly enough to hide it. The check that would have caught all three
is cheap — grep for a module's importers outside `__tests__` — and it is now the first thing done when a
version is called complete.

### Verified with real data, through the interface

Not by injecting rows. A signed-in account created from the sign-in card, then: one CV saved (one row,
one `resume.created` audit row), one application saved against a real advert with the employer and the
gap report attached, marked as sent, exported (1 CV, 1 variant, 3 audit rows), and deleted — **zero rows
in all five tables**, with the audit log surviving and its subject nulled.

One defect found by doing it: saving an application created a _second_ copy of the base CV, because the
row id lived inside the library component and never reached `/api/application`. Five applications would
have left six copies of one CV in somebody's library.

## v0.6 — "It exports what portals want" · shipped

**DOCX export** (`src/render/docx/`). Same `Resume`, same ATS ruleset, round-trip verified with mammoth
the way the PDF path is verified with unpdf — the guarantee is the test, not the format. Hand-written
OOXML and ZIP rather than a document library, because the guarantee turns on what is _absent_ and a
library that helpfully emits a table would break it invisibly. No template or theme choice: there is one
ATS-safe Word layout, and offering a design in the format uploaded to the crudest portals would be
selling a decision that cannot be honoured. Details and the three defects found in
[05-pdf-rendering.md](05-pdf-rendering.md#docx-export--v06).

## v0.7 — "It writes the letter" · shipped

Cover letter generation from the CV and the advert (`src/optimize/cover-letter.ts`), reusing v0.4's
requirements and carrying **three** guards where the summary needed two.

The third is the one specific to the form, and the reason it exists is worth stating: the classic
cover-letter sentence is flattery — _"I have long admired your work in paediatric oncology"_ — which
invents nothing about the candidate, passes a CV-only fabrication check cleanly, and is a claim about the
world they cannot defend. An interviewer asking "what do you know about our paediatric unit?" is asking
about a sentence a machine wrote.

It needed no new checker. `buildGrounding(resume, advert)` takes an `extraSource`, so the advert joins the
grounding set: the letter may name the hospital _because the advert names it_, and may not name a
specialty, an award or a value the advert never mentioned. That is the right grounding set for a letter
and the wrong one for a CV bullet.

A refusal returns nothing rather than a fallback, because unlike a rewrite there is no original to keep —
and it says what it caught. The greeting and sign-off are assembled in code, not by the model: a model
asked for a greeting invents a surname, and "Dear Ms Jensen" to whoever actually opens the envelope is a
small disaster. The draft is editable and the edit is what downloads, as `.docx` through the v0.6 writer.

**Verified against the real model**: a letter that named the employer from the advert, claimed only the two
evidenced requirements, and left the missing one alone. Its own rationale showed the retry loop working —
attempt one used `ICU`, which is in neither document, and attempt two wrote it out.

## v0.8 — "It speaks the language"

Multi-language output: EN / ES / DA. The _document_, not just the chrome — section headings, date
formats and regional conventions per locale. Latin-Extended coverage is already proven in the fonts.

## v0.9 — "It can be shown" · shipped

A public share link (`shares` table, `/api/share`, `/api/shared`, `/s/$token`) — the only unauthenticated
read of a CV in this product, so its limits are structural rather than conventional:

- **`expiresAt` is `notNull`.** There is no code path that creates a share without an expiry. Fourteen
  days by default, ninety at most, and a request for longer is _clamped_ rather than refused — the
  pressure on this parameter is always toward longer, so the ceiling lives in the store.
- **The token is the primary key**, a `gen_random_uuid()`. The URL is the credential; a sequential id
  would have made every CV ever shared readable by counting.
- **Revoking sets `revokedAt` rather than deleting**, so the access log can still explain what a visitor
  saw last week — and it takes effect on the next read.
- **Unknown, revoked, expired and deleted are one answer.** Byte-identical 404s, because telling a
  visitor that a token _was_ valid confirms the CV exists to somebody holding a guessed URL.
- **The document is referenced, not snapshotted.** Correcting the CV fixes what a live link shows;
  a frozen copy per link would leave a typo in circulation with no way to withdraw it.
- **Views are counted, never logged per visit.** One audit row per view against the _owner_, flagged
  `by_other`. No visitor identity exists anywhere — that would be a record of people reading a CV.
- `noindex, nofollow, noarchive` on both the API and the page.

Sharing requires the CV to be saved first and **says so** rather than saving silently: publishing an
employment history is not a side effect of clicking a button. Share links are in the Article 15 export,
cascade away with the account, and the retention sweep drops rows 28 days past their expiry.

**Verified end to end** against real Postgres: created from the UI, read with no cookies at all as a
recruiter would, no owner or account or session field in the response, an unauthenticated `DELETE`
refused while the link still worked, revoked from the owner's screen, and then a 404 byte-identical to a
token that never existed. Eighteen repository tests cover expiry, revocation, cross-account isolation and
erasure.

## v1.0 — "It's a product" · one item shipped, two open

- ✅ **Encryption at rest** (`src/db/crypto.ts`, ADR-021) — AES-256-GCM in the existing `jsonb` column, so
  no migration. Protects a stolen disk, a leaked snapshot, a copied backup, and anyone with database read
  access but not the application's environment. Does **not** protect someone who has that environment;
  `/privacy` states the limit in the same paragraph and reads the real state from the server so it cannot
  claim encryption on an installation with no key. **Losing the key loses every stored CV** — the runbook
  carries the backup obligation.
- ⬜ **Pricing and payments.** The numbers are Edd's, and docs/09's open question 7 now lays out three
  concrete shapes rather than an open field. The architecture already draws the line for one of them: the
  free stateless path stores nothing (ADR-004), and everything that costs money — model calls, storage —
  needs an account.
- ✅ **Cyrillic and Greek** (`scripts/make-fonts.mjs`, ADR-022). Not the subset list it looked like:
  takumi-pdf 0.6.4 cannot reach the glyphs in fontsource's range-subset `woff2` files, so adding
  `cyrillic` to the bundler copies twelve files and changes nothing. The fix is a format change —
  Adobe's TTFs, subsetted to the ranges these markets need: **1.24 MB for six faces**, against 2.4 MB
  for the full fonts. Proved to render through takumi _before_ anything was vendored, because the first
  attempt bundled fonts the renderer could not use. A Bulgarian, Greek, Ukrainian or Serbian name now
  renders in both PDF and `.docx`, in every template.
- ⬜ **CJK.** A separate question, and still a real one: no Source face has it and Noto Sans CJK is
  10–16 MB per weight. That is a decision about the deployed image and about which market it is for.
  Right-to-left needs more than a font — the renderer's bidi behaviour is unverified.

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
