# 08 — Roadmap

Estimates assume focused solo work with AI assistance. They are sizing, not commitments.

HunterReady is a real, monetized product (confirmed 2026-08-13), so v0.5 and v1.0 are
commitments rather than aspirations — the accounts, payments and GDPR work gets built.

**Read [What is actually open](#what-is-actually-open) first.** The per-version sections below are a
record of how each release went, and they kept their original "still to do" lists after the work was
done — four items in v0.3 and v0.5 were listed as open here while the code was shipped and reachable,
which is how a stale roadmap manufactures work that already exists. The consolidated list at the
bottom is the one that is maintained; a version section is history.

## v0.1 — "It works" (≈2 weeks) · shipped

The scope Edd asked for, nothing more.

- Upload `.pdf` / `.docx` / `.doc` / `.txt` / `.md`
- Extraction → `Resume` schema with per-field confidence
- Review + edit form, low-confidence fields highlighted
- 2 templates (`modern-intl` + `modern-eu`, both regional conventions) × 3 themes
- Live preview + download
- Stateless, no auth, no persistence
- ATS round-trip test green in CI
- Deployed to Coolify

Detailed blocks: [10-plan-v0.1.md](10-plan-v0.1.md).

**Done means:** Edd runs his own CV through it and would send the output.

**All fifteen blocks shipped, and the deploy with them** — the line that used to sit here ("Block 0
scaffold, Block 1 render-path spike, next Block 1b") outlived its truth by ten releases. The Coolify
deploy is not asserted from the deploy log but from work done _against_ production since: v0.10.1's fit
defect was found walking the live site end to end, and ADR-030's numbers (102 s, then 171 s, as an
anonymous visitor) were measured there.

**One verifier check was never runnable and still is not.** Check 5 — "deliberate production error →
Sentry payload contains no CV content" — assumed an error reporter that was never wired. There is no
Sentry in `src` or in `package.json`. The privacy rule it was standing in for is real and holds by
construction (no CV content in logs, errors or telemetry), but nothing _verifies_ it at runtime, and a
check nobody can run is not a check. Carried to the open list.

## v0.2 — "It's reliable" · shipped, three real-world fixtures owed

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

## v0.3 — "It improves the CV" · shipped

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

### Shipped later, and this list did not say so

Three of the four items below sat under "still to do" long after they were built and reachable —
exactly the failure this file warns about at the top. Corrected 2026-08-16 by checking each against
the code rather than against the list:

- **Template `showcase`** — [`src/render/templates/showcase.tsx`](../src/render/templates/showcase.tsx),
  in the registry and in `designs.ts` as a paid design across three character axes (ADR-026 records the
  honest rating of its sidebar).
- **Answers to `questions` as source material** — captured and joined to the grounding set in
  `rewrite.ts`, and the same pattern reused by `summary.ts` and `cover-letter.ts`.
- **The rewrite cache** — `rewriteCacheKey` is used in `rewrite.ts`, and the key covers the answers as
  well as the bullet, so answering a question does not serve back the pre-answer suggestion.

### Still to do

- **Model routing per [docs/06](06-ai-optimization.md#model-routing-cost).** Still one provider for
  every task: `resolveProvider` / `resolveLocalProvider` split **local vs third-party**, which is the
  entitlement axis from ADR-023, not the per-task cost axis docs/06 tabulates (Haiku for extraction,
  Opus for rewriting, Sonnet for advert reading). This is now a decision before it is work — the two
  ADRs since have made the local/third-party line the one the product actually charges on, so the
  docs/06 table may be worth retiring rather than implementing. Do not leave it stated and unbuilt.

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
- ✅ **Encryption at rest** — deferred out of v0.5 for the reason ADR-018 gave ("encrypted" with the key
  in the same env file beside the data is a compliance sentence, not a protection), then shipped in v1.0
  once that key-management decision was made. See [v1.0](#v10--its-a-product--two-shipped-two-open)
  and ADR-021. This line said `⬜` while the v1.0 section said `✅` — one file, two answers.

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

## v0.8 — "It speaks the language" · shipped

Multi-language output: EN / ES / DA. The _document_, not just the chrome — section headings, date
formats and regional conventions per locale ([`src/render/locale.ts`](../src/render/locale.ts)), in the
PDF templates and in the `.docx` writer. Latin-Extended coverage was already proven in the fonts.

Two things worth keeping:

- **This is the ATS ruleset, not an exception to it.** docs/05 clause 6 mandates standard section
  headings because real parsers key on them — and a Danish screener keys on `Erfaring`, not
  `Experience`. Rendering English headings on a Danish CV was the violation; localizing them is the
  correct reading of the rule.
- **A hand-written month table rather than `Intl`.** `Intl.DateTimeFormat` produces different Spanish
  abbreviations across Node versions and ICU builds (`sept.` or `sep.`), and the ATS round-trip test
  asserts exact strings. Thirty-six abbreviations are cheaper than a document whose dates change shape
  on a runtime upgrade.

**Then its line moved, by its owner.** v0.8 localized furniture only, on the argument that a
mistranslated job title is a wrong claim about someone's career. That argument was about _silent_
translation. Whole-document translation on demand ([`src/optimize/translate.ts`](../src/optimize/translate.ts))
is the opposite — the person picks a language and asks — so it ships with guards instead of a refusal:
digits must survive verbatim, proper nouns are never sent, and a field whose translation fails a guard
keeps its own original. The failure mode is "one line stayed in Danish", never "one line now says
something else". ADR-029 records the `personalDetails` half of the decision.

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

## v1.0 — "It's a product" · two shipped, two open

- ✅ **Encryption at rest** (`src/db/crypto.ts`, ADR-021) — AES-256-GCM in the existing `jsonb` column, so
  no migration. Protects a stolen disk, a leaked snapshot, a copied backup, and anyone with database read
  access but not the application's environment. Does **not** protect someone who has that environment;
  `/privacy` states the limit in the same paragraph and reads the real state from the server so it cannot
  claim encryption on an installation with no key. **Losing the key loses every stored CV** — the runbook
  carries the backup obligation.
- ⬜ **Pricing and payments.** The last genuinely blocking item, and the shape is no longer open: docs/09's
  question 7 chose subscription with a free stateless tier on 2026-08-14, and ADR-023 already built the
  line it needs — the free stateless path stores nothing (ADR-004), the third-party model is
  entitlement-gated, and `auth_users.plan` decides. What is missing is three things, in this order:
  **the numbers**, **a payment provider**, and **an endpoint that sets `plan`** — today the column is
  read everywhere and written nowhere, deliberately (ADR-023: "a paid tier over HTTP is not a feature"),
  so there is currently no way to become a paying customer.
- ✅ **Cyrillic and Greek** (`scripts/make-fonts.mjs`, ADR-022). Not the subset list it looked like:
  takumi-pdf 0.6.4 cannot reach the glyphs in fontsource's range-subset `woff2` files, so adding
  `cyrillic` to the bundler copies twelve files and changes nothing. The fix is a format change —
  Adobe's TTFs, subsetted to the ranges these markets need: **1.24 MB for six faces**, against 2.4 MB
  for the full fonts. Proved to render through takumi _before_ anything was vendored, because the first
  attempt bundled fonts the renderer could not use. A Bulgarian, Greek, Ukrainian or Serbian name now
  renders in both PDF and `.docx`, in every template.
- ⬜ **CJK.** A separate question, and still a real one: no Source face has it and Noto Sans CJK is
  10–16 MB per weight. That is a decision about the deployed image and about which market it is for.
- ⬜ **Right-to-left. Probed 2026-08-23, and the halves are the other way round.** This entry used to
  say "a font is the smaller half: the renderer's bidi behaviour is unverified". The probe
  (`src/render/__tests__/rtl-probe.test.ts`) says the font is the **blocking** half and bidi cannot be
  asked about at all yet: takumi refuses Hebrew and Arabic with `MissingGlyphs` before it lays anything
  out, because none of the ten bundled families carries either block. It fails loudly rather than
  drawing tofu, so no CV of boxes can ship — that part was already right.

  **What the probe found that matters more:** only the PDF needs our fonts. The same CV exports to
  `.docx` and to the self-contained web page with its text intact, because Word and the browser bring a
  face of their own. So these markets are not locked out of the product, they are locked out of one of
  its three downloads — and until 2026-08-23 nothing said so, because `/api/render` answered every
  failure with "please try again", which for a missing glyph is a button somebody can press forever.
  That message now names the two downloads that work, and the failure is a `422` with a distinguishable
  log code rather than a `500` that looked like every other render bug.

  So what is left here is a **decision, and it is now a well-posed one**: bundle a Hebrew and an Arabic
  face (Noto Sans Hebrew and Noto Sans Arabic are the obvious candidates, and unlike CJK they are
  small), then find out what takumi does with reading order. The probe goes red the day a face lands,
  which is the notification that the second question has become askable.

## v0.10 — "It can be written from nothing" · shipped 2026-08-15

The release that stopped assuming everybody arrives with a file, plus the audit's remaining findings
and the first measured numbers for the free tier.

- ✅ **Write a CV from scratch** (`blankResume`, `origin: 'file' | 'blank'`). The editor had done full
  add and remove on every section since v0.5 and the custom sections take any heading a life needs —
  the feature was built and only the door was missing, which quietly excluded a first job, a return to
  work after years out, and every trade where nobody ever wrote one down. The work was not the empty
  document: it was that **every word of the second step is about our reading of a file**, so all of it
  had to learn a second frame. Asks for the name first, because the schema requires one and seeding
  "Your name" would eventually be printed by somebody in a hurry.
- ✅ **Free-tier rewrite quality, measured** (`pnpm test:measure`, ADR-028). Nine runs across three
  fixtures. Confirmed the audit's suspicion — the local model moved claims between employers in about
  one run in two — and found the bigger thing nobody was looking for: 4–27% of bullets come back with
  nothing, and the cause was undiagnosable until `SilenceReason` split one silent `unavailable` into
  four counted ones. It is never transport; it is always the model.
- ✅ **Signing in and the model choice, in the header.** Both were global facts about the session
  stuck inside one tab of one screen — and `?panel=account` only exists once a CV is loaded, so the
  landing page had no way in at all.
- ✅ **The landing page has an argument** (DESIGN.md: the Section type level, One Dark Band, Four
  Grounds). Seven sections alternating between two greys with identical headings is a rhythm with no
  accent in it. Also `docs/12-competitors.md`: JobAssist, Jobscan and Enhancv walked in the browser.
- ✅ **A malformed share token answers 404**, not the unhandled 500 it was answering — the token is a
  `uuid` primary key and anything else reached Postgres.
- ✅ **ADR-029** records Edd's decision on `personalDetails` in translation, so it stops being an open
  question.

### v0.10.1 — the fit had no answer on a CV written from nothing

Found walking production end to end, and it was mine twice over: the audit's P1 fix brought the fit
back to the document, and the from-scratch feature then hid the comparison for authored CVs — each
right on its own, together the original dead end on the new path. The baseline now depends on **what
just happened** rather than on where the document came from: an upload is measured from the upload, a
CV written here is measured from the moment before the fit.

**Cost:** one session. **Left open:** pricing and payments (still the last thing between here and
v1.0), and the free tier's speed on the production box (ADR-027 — the lever is taking the model call
off the blocking path, not a faster engine).

## What is actually open

Checked against the code on 2026-08-19, not against the lists above. **This is the maintained list**;
everything higher in this file is the record of a release. When an item here closes, close it here.

The 2026-08-23 pass read item 1 against the branch that implements it rather than against this file,
which by then was four days and four commits behind. The code for blocks 2 to 5 is written; what it
found was three gaps _inside_ it, none visible from the plan — the container passed none of the three
Stripe variables, nothing read the parameter Stripe sends the browser back with, and a test named in a
docblock did not exist. All three are fixed on `feat/pricing`, with a guard for the first so the class
of failure cannot recur silently. That is the argument for this list being read against `src/`, again.

The 2026-08-19 pass closed item 14 and cut items 4, 11, 13, 15 and 16 down to the part that is
genuinely left, which in four of those five is a decision or a credential rather than code. It found
nothing new. It did find that the list had gone a day stale while the work it describes was landing,
which is the argument for reading it against `src/` and not against the commit messages.

The 2026-08-18 pass added items 11 to 16, all of them born in the release of that day and none of them
found by reading this file. Four came out of verifying a deploy rather than out of planning it, which
is the argument for the verification step and not against the plan.

### Blocking v1.0

1. **Pricing and payments.** **Built as of 2026-08-19, and the code is not what is left.** €12/month
   in `src/lib/pricing.ts`, a hosted Stripe checkout, a signature-verified idempotent webhook that is
   the only writer of `auth_users.plan`, `#pricing` on the landing page, and cancellation through
   Stripe's own portal from the account panel. Three of the plan's four acceptance criteria are met and
   tested (plan 01). What remains, in the order it has to happen:

   - **The name, and a trademark search for it** — item 3, promoted to a precondition rather than a
     parallel task, because the first invoice is the moment a rename stops being 20 lines of
     documentation.
   - **One sentence from Edd:** does the free tier keep all twelve designs? It does today and the
     landing page says so, so changing it is also a copy change.
   - **Three variables in Coolify**, which nothing but Edd can set: `STRIPE_SECRET_KEY`,
     `STRIPE_WEBHOOK_SECRET`, `HR_STRIPE_PRICE_ID`. Until then no test-mode payment has been watched
     through checkout, and nothing in the repo proves Stripe accepts the payload we send.
   - **`HR_RELEASE=true`**, which is item 2 and item 4 as well — one lever, three entries.

   ⚠️ **Two of those variables reached nothing until 2026-08-23.** `docker-compose.yml` lists its
   environment explicitly and passed none of the three, so setting them in Coolify would have been
   inert — and the tell was invisible, because an unset variable and an unreachable one produce the
   same sentence on the pricing page ("Paid plans are not open yet"). Fixed, along with `HR_REASONING`
   and `HR_REASONING_BUDGET`, which had the same problem and made `ask.ts`'s "off without a deploy"
   claim untrue of production. `tests/compose-environment.test.ts` now fails when the code reads a
   variable the `app` service does not declare.

2. **The exit from beta.** Beta hands every Pro capability to everyone: the larger model, all 103
   designs, the mixed axes, saved CVs. Not a separate decision from item 1 — it is the same switch
   seen from the other side, and the day pricing opens it flips. **Since 2026-08-19 it is one switch,
   `HR_RELEASE=true` (ADR-033)**, which overrides `HR_BETA_PAID_FREE`, `HR_THIRD_PARTY_FOR_ALL` and
   `HR_UNLOCK_DESIGNS` rather than defaulting them off, and takes the word "beta" out of the interface
   at the same instant. `entitlements.test.ts` and `production-parity.parity.test.ts` both prove the
   released state against a real build — the latter with both older switches set against it — which
   is the part that would rot silently. Rehearse it with `pnpm host` on `:3012`
   (`.claude/launch.json` → `hunterready-release`).
3. **Name and domain** (docs/09 question 8). **Availability checked 2026-08-19: `hunterready` is free
   on all seven of `.com` `.dev` `.app` `.dk` `.io` `.co` `.net`**, each method controlled against a
   domain that is certainly registered. `.dev` is being bought at Porkbun, where `builderhunt.dev`
   already lives. **The trademark search is deliberately deferred** — Edd is not sure the name
   survives beta — and it has **moved from "needed by v1.0" to a precondition of item 1**, because
   the moment it stops being cheap is the first payment, not the release. Today a rename is 20
   occurrences across 7 files, all documentation and none in `src/`.

### Costing money today

4. **The exit from ADR-030.** `HR_THIRD_PARTY_FOR_ALL=true` means every anonymous visitor spends
   third-party tokens. The switch flips back when the local model can read an advert in seconds, and
   ADR-027 already named the lever: **take the model call off the blocking path**, not a faster engine.
   The concern that ADR remained worried about — "`/api/rewrite` already rate-limits; ingestion does
   not" — is closed: `/api/ingest`, `/api/target`, `/api/translate` and `/api/cover-letter` all
   rate-limit now. **Blocks 1 and 2 done 2026-08-18, and block 1 changed the reasoning.** Re-measured
   against production, the local model now _answers_ — `source: model`, three requirements, 52 to
   101 seconds — where ADR-030 recorded it timing out into the rule engine and matching 0 of 4. The
   failure that ADR was written about is gone; what is left is latency, which is a request shape.
   `/api/target` now answers in 3ms with a job id, and since 2026-08-19 `/api/ingest` answers in 7ms
   with one too. **Blocks 1 to 4 are done and nothing in the interface blocks on a model any more**;
   the waiting screen was watched narrating a real upload for over two minutes. ADR-030's own recorded
   exit condition is therefore met.

   ⚠️ **The exit is not the one this item described, and the difference is not cosmetic.** `thirdParty`
   is `everyone || beta || paid` and beta defaults on, so `HR_THIRD_PARTY_FOR_ALL` has been redundant
   since beta shipped: unsetting it changes nothing measurable. The exit is `HR_RELEASE=true`
   (ADR-033), which is the same switch as item 2 — the two items were always one lever and are now
   literally one. **Deliberately not flipped:** Edd, 2026-08-19, the spend is capped by a monthly plan,
   so there is no hurry and the switch waits for pricing.

### Ingestion quality — the three that are left are missing inputs, not missing code

5. **A real Canva/Enhancv export** with genuinely _overlapping_ column spans. Interleaved ordering is
   covered by `two-column-interleaved.pdf`; overlap defeats a different rule.
6. **A real photographed CV** — perspective skew, uneven lighting, shadow. `scanned.pdf` is a clean
   rasterization and cannot fake any of it.
7. **A genuine multi-page CV**, still owed to Block 4's page-break verifier.
8. ~~**MiniMax sometimes returns no provenance**, which costs the review step its "where did this
   come from" answer on the affected fields.~~ **Closed 2026-08-19, and it was never the providers.**
   `provenance` was **optional in the JSON Schema we sent** — `.default([])` on the Zod side — while
   the prompt in the same call asked the model to cite a line for every field it filled. The prompt
   asked and the schema excused, and provenance is the one part of the answer with no visible
   consequence if dropped. Requiring it in the tool contract, while keeping the runtime parse
   lenient, took the aggregate from **45% to 96%** and the worst single pass from **0% to 67%**.
   MiniMax was the better of the two providers throughout; DeepSeek cited nothing at all on a
   75-field document, three passes running, and now cites 67–96%. A floor holds it
   (`provenance-coverage.test.ts`, opt-in) and a free hermetic test holds the `required` entry itself
   (`provenance-is-required.test.ts`), because the paid one never runs in CI.

### Needs one sentence from Edd

9. ~~**Does the private Spanish CV have a formal education section at all?**~~ **Closed 2026-08-18:
   it does not.** Edd confirmed that `fixtures/private/edd.pdf` is the file, and that it carries no
   education section. So extraction loses nothing: fourteen education stems searched
   accent-insensitively return zero, page 2 is twelve jobs back to 2007 followed by skills, and the
   only image is a 320x213 photograph. A senior engineer with eighteen years of employment leaving
   education off a targeted CV is an ordinary choice. **No bug. Nobody should look again.**

### Stated but unbuilt, so it has to be decided

10. ~~**Model routing (docs/06).**~~ **Closed 2026-08-18: retired, ADR-031.** Three of the four rows
    named Anthropic models this deployment does not use, and the fourth — scoring needs no model —
    was already true. ADR-023 had replaced the idea on purpose: the person picks a named company. The
    one useful part of it, cheap work here and expensive work away, moved to item 04 where it is
    live.
11. **Verifier 5 has no instrument.** The v0.1 spec's privacy check assumed an error reporter that was
    never wired — there is no Sentry in the repo. Either add one and keep the check, or replace the
    check with one that runs against what exists. The rule it protects (no CV content in logs, errors or
    telemetry) is the one rule in CLAUDE.md with no automated proof behind it.
    **Blocks 1 to 3 done 2026-08-18: the rule now has proof.** `no-cv-in-logs.test.ts` drives a
    fixture carrying distinctive strings through every path a value can leave by, captures what each
    one writes, and asserts none of them appear; both guards were verified by breaking them
    deliberately. **What is still open is only the decision** — adopt an error reporter and keep
    verifier 5, or retire it and record that the guards replaced it (plan 11, block 4).

### Found while deploying 2026-08-18, not while planning

12. **DeepSeek v4-pro returns an empty tool input.** Asked for, and it does not work: against the real
    7,303-character schema v4-pro calls the tool with `{}` while `deepseek-v4-flash` fills it in 1.8s.
    Both were measured on the same prompt through the same Anthropic-compatible endpoint, with
    `thinking: {type: 'disabled'}` (v4-pro rejects a forced `tool_choice` otherwise). Flash ships.
    `deepseek-schema.test.ts` goes red the day the vendor fixes it, which is the notification.
    **Decide, once it is fixed:** pro by default, or leave flash and keep pro as a choice.
13. **DeepSeek is configured nowhere in production.** `deepseek()` returns `undefined` without
    `DEEPSEEK_API_KEY`, so the app starts clean and the model is simply absent from
    `/api/processing`'s list — no error, no log line. Coolify needs `DEEPSEEK_API_KEY`,
    `DEEPSEEK_BASE_URL` and `DEEPSEEK_MODEL`; `docker-compose.yml` already passes all three. Verified
    absent on the 2026-08-18 deploy: `providers` came back with MiniMax alone.
    **The silence is fixed (plan 13, block 2): startup now logs which providers resolved and which
    were skipped for a missing key, names only.** The three variables in Coolify are Edd's and are
    what remains.
14. ~~**`/api/processing` reports `provider: "api.minimaxi.chat"`.**~~ **Closed 2026-08-18.**
    `displayName` mapped `minimax.io` and `minimaxi.com` while production runs against a `.chat` host,
    so the hostname fell through. The host list is now a table with `minimaxi.chat` in it, matched
    exactly or as a subdomain rather than by `endsWith`, which also matched `evilminimax.io`.
    `display-name.test.ts` covers both halves.
15. ~~**Production reports `build: "unknown"`.**~~ **Code done 2026-08-23, and it was never Edd's.**
    This item sat under "needs a credential or a click from Edd" on the belief that the only way in was
    a build arg somebody sets in Coolify. It is not: **Coolify already injects `SOURCE_COMMIT`**, its
    own variable naming the commit it deployed, and `/api/health` reads it at run time — which also
    steps around the documented caveat that Coolify withholds `SOURCE_COMMIT` from Docker _builds_ to
    preserve layer caching, because nothing needs it at build time.

    **The obvious version of this fix would have shipped and changed nothing.** The Dockerfile declares
    `ARG HR_COMMIT=unknown` and promotes it to `ENV`, so in any build without the arg the variable is
    _present_ and equal to the string `"unknown"` — `process.env.HR_COMMIT ?? process.env.SOURCE_COMMIT`
    can never reach the second operand. `src/lib/build-stamp.ts` treats `unknown` and empty as the
    absences they are, and `build-stamp.test.ts` has that case as its centre.

    Verified on a real build: with no build arg and `SOURCE_COMMIT` alone, `/api/health` reported the
    exact SHA of `HEAD`. Rehearse it with `.claude/launch.json` → `hunterready-release-configured`.
    **Still unverified against the live site**, which needs one deploy — the acceptance criterion in
    plan 15 stays unchecked until `pnpm stale --url https://hunterready.eduardoinerarte.dk` answers.

16. **A machine cannot use any of this.** Fifteen routes already cover the whole product — ingest,
    render, rewrite, target, translate, cover letter, share, library — and every one authenticates by
    session cookie. There are no API keys anywhere in the repo. So "build an API" is mostly not
    endpoint work: it is machine authentication, a contract somebody can depend on, quotas, and an
    answer to the question ADR-023 raises, which is **who consents when the caller is not a person**.
    See the plan in [docs/plans/](plans/). **Blocks 1 to 7 done 2026-08-18**: `hr_live_` keys, eight
    `/v1` routes behind one door, per-key quotas, a contract in [docs/api/](api/README.md), and
    ADR-032 for the consent question — the caller gets the local model unless it asserts the person's
    consent on the request. Block 8 is Edd's: pointing his other application at it.
    **2026-08-19: the contract is browsable.** `/v1/openapi.json` is generated from the Zod schemas
    the runtime validates against — so a field list cannot drift from what the API accepts — and
    `/docs` renders it. A test reads `src/routes/v1/` off disk and fails in both directions: a route
    nobody described, and a description of a route nobody can reach.

### Not open, despite appearances

- **CJK and RTL** are v1.0 items on the list above, but neither blocks the release the way pricing
  does: they are decisions about which market the deployed image is for. **RTL's status was recorded
  here as _unverified_ for five days and that was one command away from being an answer** — it is now
  probed and the answer changed the shape of the item (see v1.0). Two of the three export formats
  already work in Hebrew and Arabic; the PDF needs a font before bidi is even a question.

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
