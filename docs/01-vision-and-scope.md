# 01 — Vision and Scope

## The problem, stated honestly

"Upload a CV, get a pretty PDF" is a solved and crowded problem
(Rezi, Teal, Kickresume, Enhancv, Resume.io, FlowCV, Jobscan, Resume Worded).
Building only that produces a product with no reason to exist.

There are, however, two real and unsolved pains:

1. **Pretty and machine-readable are in tension.** The designs that look best —
   two columns, sidebars, icon rows, skill bars, contact details in a graphic
   header — are exactly the ones applicant tracking systems mangle or drop.
   Most tools either ignore this or claim "ATS-friendly" without ever verifying it.
2. **Rewriting is where the value is, and where tools cheat.** Generic AI
   rewriting invents metrics ("increased revenue by 35%") the candidate never
   achieved. That is a liability in an interview, not a feature.

## Our angle

Three things, in order of importance:

1. **Verified ATS-safety.** Every template ships with an automated round-trip
   test: render the PDF → extract its text with an independent parser → assert
   that name, contact, every employer, every role, every date range and every
   skill come back out, in reading order. A template that fails does not ship.
   This is testable, demonstrable, and nobody advertises it because nobody does it.
2. **No fabrication, ever.** The AI may restructure, compress, re-emphasize and
   improve the language of what the candidate wrote. It may not invent numbers,
   employers, dates, technologies or outcomes. When a bullet would be stronger
   with a metric, we _ask the candidate for the number_ instead of inventing one.
3. **Design that is actually good.** pdfcn's themes plus a small set of
   hand-built CV templates, not 40 mediocre ones. The visual world is committed in
   [DESIGN.md](../DESIGN.md) — a print room under amber safelight — and its hardest
   rule exists to serve this audience: the room's accent color never touches the
   user's document. A nurse's CV must not carry our brand into her application.

## Target user

**Job seekers across all sectors** — confirmed 2026-08-13, and deliberately not
tech-specific. A nurse, an electrician, a sales director, a teacher and a backend
engineer are all first-class users. Markets: EU + US, English first, with Spanish
and Danish as planned output languages.

This is the single most constraining product decision on the page. It means:

- No skill taxonomy, template name, sample content, tone or microcopy may assume a
  software career. "Tech stack" is not a section; "Skills" is.
- Test fixtures must span sectors, or the parser will quietly overfit to CVs that
  list programming languages (see [04-ingestion.md](04-ingestion.md)).
- Templates must survive a CV with no projects, no certifications and no GitHub link,
  because most of the working population has none of those.
- The word "ATS" cannot appear unexplained anywhere in the interface.

HunterReady is a **real, monetized product** (confirmed 2026-08-13), not a portfolio
piece — accounts, persistence, payments and full GDPR obligations are in scope, and
the v0.5 and v1.0 milestones get built.

## Non-goals

Explicitly out of scope, to keep the product from dissolving:

- **No job board / no scraping / no auto-apply.** Different business, different risk.
- **No LinkedIn scraping.** ToS problem. Manual paste or profile export only.
- **No recruiter-side product.** Candidate-side only.
- **No WYSIWYG drag-and-drop layout editor.** Templates + tokens, not a design tool.
  A free-form editor destroys the ATS guarantee, which is the whole differentiator.
- **No "one-click perfect CV" claim.** The human reviews and owns every word.

## Success criteria for v0.1

Concrete and checkable:

1. A real-world 2-page PDF CV is ingested and ≥90% of its fields land in the
   right schema slots without manual correction.
2. The rendered PDF passes the ATS round-trip test with zero missing critical fields.
3. Full path — upload to download — under 20 seconds.
4. Edd looks at the output next to the input and would send the output.

## Product name

HunterReady = ready for the job hunt. Domain and trademark not yet checked
(see [09-decisions.md](09-decisions.md) open questions).
