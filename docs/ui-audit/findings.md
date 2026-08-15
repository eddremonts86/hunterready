# UI audit — HunterReady

**Reviewed** 2026-08-15, against the Docker build on `localhost:3100`, authenticated as a `pro`
account with `HR_UNLOCK_DESIGNS=true`. Gate (`pnpm ci:local`) green before and after.

**Stack** TanStack Start (Vite + Nitro), React 19, Tailwind 4, Better Auth, Drizzle/Postgres.
**Router** file-based, 3 UI routes + 17 API endpoints; the five workspace panels are search
params (`?panel=`), not routes. **Design system** `DESIGN.md` — one typeface (Figtree), one blue
(Signal `#1B3BD8`), hairline cards, a written Waiting section. **No dark mode exists**, so the
dark-theme pass is not applicable rather than skipped.

## Route inventory

| Route             | File                  | Auth    | Kind                | Main job                                     | Visited               |
| ----------------- | --------------------- | ------- | ------------------- | -------------------------------------------- | --------------------- |
| `/`               | `routes/index.tsx`    | public  | landing → workspace | upload a CV, correct it, download it         | ✅                    |
| `/?panel=check`   | idem                  | public  | panel               | verify what was read                         | ✅                    |
| `/?panel=wording` | idem                  | public  | panel               | accept stronger bullets; switch language     | ✅                    |
| `/?panel=design`  | idem                  | public  | panel               | choose one of 60 designs                     | ✅                    |
| `/?panel=job`     | idem                  | public  | panel               | target an advert, fit the CV, draft a letter | ✅                    |
| `/?panel=account` | idem                  | session | panel               | save, list and reopen CVs                    | ✅                    |
| `/?compare=true`  | idem                  | public  | overlay             | before/after                                 | ✅                    |
| `/privacy`        | `routes/privacy.tsx`  | public  | content             | say what happens to a CV                     | ✅                    |
| `/s/$token`       | `routes/s.$token.tsx` | public  | shared doc          | read someone's shared CV                     | ⚠️ invalid token only |

---

## Findings

### P0 — 1. `/privacy` understates what the CV is used for _(fixed)_

**Route** `/privacy` · **File** `src/routes/privacy.tsx` ("Where it goes")

The page says: _"To read a CV well we send its text to MiniMax… That is the only place it goes."_
The destination claim is still true. The **purpose** claim is not complete: the same text now also
goes to MiniMax to rewrite bullets, tailor a summary, draft a cover letter, and — added today —
**translate the entire document**, field by field, including sections the reader never sees on
screen.

This is the one finding that matters more here than it would in another product. HunterReady's
whole proposition is being straight about what happens to somebody's CV, and GDPR purpose
limitation asks for the purposes, not just the recipient. A reader who consented to "reading"
has not been told about "translating".

**Damaged job** deciding, with accurate information, whether to accept the transfer.
**Fix** extend "Where it goes" to enumerate the purposes (read · rewrite · tailor · letter ·
translate), and say that declining still gives all of them on the local model except where noted.
**Acceptance** the section names every model-touching feature that exists in `src/optimize/` and
`src/structure/`. **Risk** none — copy only.

### P1 — 2. Mobile tab bar orphans "Account" onto its own line _(fixed)_

**Route** `/` at 375px · **Evidence** observed live in the review session; screenshot not
retained on disk.

Four tabs fit the first row; "Account" wraps alone and lands centred under them. It reads as a
rendering fault rather than a fifth tab.

**Fix** a horizontally scrollable tab strip, or shorter labels at that breakpoint. Existing
`Segmented` already handles wrapping elsewhere — check it covers this before adding anything.
**Acceptance** at 320–430px the five tabs are on one line or one scrollable row, never 4+1.

### P1 — 3. "Fit my CV to this job" looked like it did nothing *(fixed)*

**Route** `/?panel=job` · **File** `src/routes/index.tsx` (`onFitCv`)

`if (targeting)` is a **separate top-level view** that returns before the workspace, so `BeforeAfter`
— which lives in the workspace's document pane — could not be drawn from it. `onFitCv` set
`compare=true`, `diffResumes` had correctly found the changes, and none of it was reachable: the only
visible answer to "fit my CV" was the move list collapsing to "Nothing worth moving", which reads as
nothing having happened.

**The first diagnosis was wrong and is kept here on purpose.** It blamed `diffResumes` for ignoring
array order. It does not — `diffList` calls `isReorder` and reports a `reordered` change, for bullets
and for skills alike. The evidence that corrected it was already in the session: after leaving the
targeting view manually, the toggle read "Just the new one · 2". The view was the problem, not the
diff, and fixing the diff would have been a change to working code in service of a symptom.

**Fixed** the fit now leaves the targeting view. The person lands on their own document with the
comparison already open; `reading` is retained and "Back to this job" returns in one click.
**Verified** advert pasted → Fit my CV → lands on the workspace showing "2 changes since you uploaded
it", with the reworded summary and "Moved up · Clinical skills" itemised underneath.

### P2 — 4. Free-tier rewrite quality is unmeasured after today's fix

**File** `src/optimize/rewrite.ts`

The local path returned `unavailable` for every bullet until today; now it returns suggestions
(13/14 on the nurse fixture, 0 fabrications). In one earlier 5-bullet sample a suggestion imported
content from a different job — the guard passed it because grounding is the **whole** résumé, so a
claim from another employer is "supported". One observation is not a rate.

**Fix** measure across fixtures before trusting it; if it recurs, ground each bullet on its own job
plus the summary rather than the whole document. **Acceptance** a measured cross-job drift rate,
recorded like the accuracy table.

### P2 — 5. An invalid share token answers `200`

**Route** `/s/no-existe` — returns HTTP 200. What it _renders_ was not confirmed (the page is
client-rendered and the check was a `curl` grep).

**Fix** confirm the rendered state first; a "this link has expired" page at 200 is a legitimate
choice, a blank frame is not.

---

## Anonymous / free walk — second pass

Signed out for real (the first attempt cleared `document.cookie` and got nowhere: the session cookie
is `httpOnly`, so the "anonymous" walk was still `plan: pro` and nearly produced a false finding).
Dev unlock turned off. What the commonest visitor (ADR-023) actually meets:

**Good, and worth not breaking.** The landing page comes first — no gate, no sign-in wall — because
`needsConsent` requires a non-empty `provider` and an anonymous visitor has none. Nothing will leave
the server for them, so there is nothing to consent to, and the product correctly asks nothing. The
upload works, the review works, the download works, with no account.

### P0 — 6. The consent gate promised a change of mind it never allowed _(fixed)_

**File** `src/components/consent-gate.tsx`

The gate said _"You can change your mind on the next upload."_ The answer is persisted to
`localStorage`, `needsConsent` requires the answer to be **absent**, and `reset` was exported and
called from **nowhere in the app** (`grep` across every screen: no hits). So the single decision this
product asks a person to make about their own data was permanent and invisible, and the sentence
promising otherwise was false — in the product whose entire proposition is being straight about this.

Fixed in this pass: a standing **"Who reads your CV"** control in the Account panel, changeable at any
moment, and the gate's copy now points at it instead of promising a question that never comes.

### P0 — 7. The third-party option was offered to people the server would overrule _(fixed)_

**File** `src/components/consent-gate.tsx`, `src/lib/entitlements.ts`

`mayUseThirdParty` is an `&&` of plan **and** consent, so without an entitled account the server sends
nothing outward whatever the client asked. The gate offered the choice anyway. A visitor could pick
the larger model, watch the local one run, and never be told — a button that lies, in the one place
this product cannot afford one.

Fixed: the option is drawn, plainly **disabled**, with the reason under it, and the control shows the
**effective** state rather than the stored one — a stale `granted` on an account that lost its plan
reads as local, because local is what will happen.

### P2 — 8. Free-tier speed is the experience, and it is not set up for

Anonymous means the local model, which on the production `cax21` measured **50.2s** for one extraction
and would be minutes for a Wording pass. The narrated stages make the wait legible but do not make it
short. See ADR-027: the lever is taking the model call off the blocking path where the rule engine
already scores 100%, not a faster engine.

## Fixed during this pass (not counted as open findings)

|                                                                                       | Route             | Evidence  |
| ------------------------------------------------------------------------------------- | ----------------- | --------- |
| Duplicate stage row on the waiting screen                                             | `/` uploading     | `520faf1` |
| "A few seconds" — a duration promise DESIGN.md forbids, measured at 50s in production | `/` uploading     | `520faf1` |
| Indeterminate bar reading as progress stuck at 0%                                     | `/` uploading     | `520faf1` |
| Every local Wording bullet failing (`unavailable` × 14)                               | `/?panel=wording` | `900eded` |
| The rewrite prompt defeating the KV cache (3.6×)                                      | —                 | `900eded` |

## Slop sweep

Clean. No emoji-as-icon, no colours outside tokens (the one hex in `index.tsx` is a comment
quoting DESIGN.md), one icon family, no nested cards, no badge that changes no decision. The two
`btn-primary` on the landing page are the **same** action repeated down a long page, not two
competing primaries.

## Open question for Edd, found while correcting the privacy copy

`redactForLlm` — the pass that strips a phone number and street address before anything is sent —
runs **only in `src/structure/extract.ts`**, on the first read of a file. Rewriting, targeting, the
letter and the translation do not call it. In practice they send less: the rewrite context is the
headline, summary and bullets; the translation's slot list deliberately excludes name, employer,
institution, email and URL.

But the translation **does** send `basics.personalDetails` — which on a European CV is exactly where
date of birth, nationality and marital status live. That is defensible (the person asked for their
whole document in another language, and those lines are printed on it) and it is more sensitive than
the phone number the product goes out of its way to strip. The new copy says what is sent rather
than implying redaction everywhere, so nothing on the page is false — but whether those fields
should travel at all is a product decision, not mine.

## Gaps — what this pass did not cover

1. ~~The free and anonymous experience.~~ **Closed** — walked in the second pass above, signed out
   with the dev unlock off. It produced the two P0s numbered 6 and 7.
2. **Ingestion error states.** `no_text_layer`, `image_unreadable`, `parse_failed`,
   `legacy_office_unsupported` and four more exist in `src/ingest/`; none were provoked.
3. **`/s/$token` with a valid link.** Only the invalid-token path was touched.
4. **Keyboard tab order** on the review form and the design gallery.
5. **Load timing** on the landing page; no measurement taken.
