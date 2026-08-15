# UI audit — HunterReady

**Reviewed** 2026-08-15, against the Docker build on `localhost:3100`, authenticated as a `pro`
account with `HR_UNLOCK_DESIGNS=true`. Gate (`pnpm ci:local`) green before and after.

**Stack** TanStack Start (Vite + Nitro), React 19, Tailwind 4, Better Auth, Drizzle/Postgres.
**Router** file-based, 3 UI routes + 17 API endpoints; the five workspace panels are search
params (`?panel=`), not routes. **Design system** `DESIGN.md` — one typeface (Figtree), one blue
(Signal `#1B3BD8`), hairline cards, a written Waiting section. **No dark mode exists**, so the
dark-theme pass is not applicable rather than skipped.

## Route inventory

| Route | File | Auth | Kind | Main job | Visited |
| --- | --- | --- | --- | --- | --- |
| `/` | `routes/index.tsx` | public | landing → workspace | upload a CV, correct it, download it | ✅ |
| `/?panel=check` | idem | public | panel | verify what was read | ✅ |
| `/?panel=wording` | idem | public | panel | accept stronger bullets; switch language | ✅ |
| `/?panel=design` | idem | public | panel | choose one of 60 designs | ✅ |
| `/?panel=job` | idem | public | panel | target an advert, fit the CV, draft a letter | ✅ |
| `/?panel=account` | idem | session | panel | save, list and reopen CVs | ✅ |
| `/?compare=true` | idem | public | overlay | before/after | ✅ |
| `/privacy` | `routes/privacy.tsx` | public | content | say what happens to a CV | ✅ |
| `/s/$token` | `routes/s.$token.tsx` | public | shared doc | read someone's shared CV | ⚠️ invalid token only |

---

## Findings

### P0 — 1. `/privacy` understates what the CV is used for

**Route** `/privacy` · **File** `src/routes/privacy.tsx` ("Where it goes")

The page says: *"To read a CV well we send its text to MiniMax… That is the only place it goes."*
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

### P1 — 2. Mobile tab bar orphans "Account" onto its own line

**Route** `/` at 375px · **Evidence** observed live in the review session; screenshot not
retained on disk.

Four tabs fit the first row; "Account" wraps alone and lands centred under them. It reads as a
rendering fault rather than a fifth tab.

**Fix** a horizontally scrollable tab strip, or shorter labels at that breakpoint. Existing
`Segmented` already handles wrapping elsewhere — check it covers this before adding anything.
**Acceptance** at 320–430px the five tabs are on one line or one scrollable row, never 4+1.

### P1 — 3. "Fit my CV to this job" can look like it did nothing

**Route** `/?panel=job` · **File** `src/routes/index.tsx` (`onFitCv`), `src/optimize/variant-diff.ts`

When the only tailoring move is a **skills reorder**, `diffResumes` reports zero changes — it
compares values, not array order. `onFitCv` sets `compare=true`, the guard added earlier today
correctly refuses to draw an empty comparison, and the result is: the URL changes, the move list
collapses to "Nothing worth moving", and nothing else visibly happens. Observed live.

**Damaged job** knowing whether the thing you asked for happened.
**Fix** either count order changes in `diffResumes` (they are real changes to what a recruiter
reads first), or confirm in place — "Reordered your skills to lead with what this job asks for".
The first is truer. **Acceptance** every `applyTailoring` move produces either a visible diff or a
stated confirmation. **Risk** low; `diffResumes` is covered by tests.

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

**Route** `/s/no-existe` — returns HTTP 200. What it *renders* was not confirmed (the page is
client-rendered and the check was a `curl` grep).

**Fix** confirm the rendered state first; a "this link has expired" page at 200 is a legitimate
choice, a blank frame is not.

---

## Fixed during this pass (not counted as open findings)

| | Route | Evidence |
| --- | --- | --- |
| Duplicate stage row on the waiting screen | `/` uploading | `520faf1` |
| "A few seconds" — a duration promise DESIGN.md forbids, measured at 50s in production | `/` uploading | `520faf1` |
| Indeterminate bar reading as progress stuck at 0% | `/` uploading | `520faf1` |
| Every local Wording bullet failing (`unavailable` × 14) | `/?panel=wording` | `900eded` |
| The rewrite prompt defeating the KV cache (3.6×) | — | `900eded` |

## Slop sweep

Clean. No emoji-as-icon, no colours outside tokens (the one hex in `index.tsx` is a comment
quoting DESIGN.md), one icon family, no nested cards, no badge that changes no decision. The two
`btn-primary` on the landing page are the **same** action repeated down a long page, not two
competing primaries.

## Gaps — what this pass did not cover

1. **The free and anonymous experience.** Everything above was seen as a `pro` account with the
   developer design unlock on. The commonest visitor (ADR-023) sees padlocks on 48 designs and a
   slower local model, and none of that was walked. **This is the largest gap.**
2. **Ingestion error states.** `no_text_layer`, `image_unreadable`, `parse_failed`,
   `legacy_office_unsupported` and four more exist in `src/ingest/`; none were provoked.
3. **`/s/$token` with a valid link.** Only the invalid-token path was touched.
4. **Keyboard tab order** on the review form and the design gallery.
5. **Load timing** on the landing page; no measurement taken.
