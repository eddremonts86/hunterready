# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: job seekers across all sectors** — not tech-specific. A nurse, an
electrician, a sales director, a teacher and a backend engineer are all first-class
users. Confirmed 2026-08-13.

Their situation: they already have a CV as a file — often written years ago in Word,
or built once in Canva — and they are applying to jobs now. They suspect it
undersells them, and they have heard that "the robots reject it" without knowing
whether that is true of their own document.

Their job: turn the CV they already have into something that both a recruiter and an
automated screener read correctly, without having to become a designer or learn what
an ATS is.

Markets: EU and US. English first; Spanish and Danish are planned output languages
(v1.0), which means the product cannot assume English source documents either.

## Product Purpose

Ingest an existing CV (`.pdf`, `.docx`, `.doc`, `.txt`, `.md`), extract it into a
canonical structured record the user reviews and corrects, and render a
well-designed PDF that is **verifiably parseable** by automated screening systems.

Later: optimize the content against a specific job posting — restructuring and
sharpening what the candidate actually did, never inventing what they did not.

Success means the user downloads the result and sends it, and later reports that
they stopped being filtered out before a human ever saw the document.

## Positioning

Two mechanisms a neighboring product cannot truthfully copy without doing the work:

1. **The parse-back guarantee.** Every template is verified by an automated
   round-trip test — render the PDF, read it back with an independent parser, assert
   that every critical field survives in reading order. A template that fails does
   not ship. Competitors claim "ATS-friendly"; this is a test suite that can be shown.
2. **Enforced no-fabrication.** The AI may restructure, compress and sharpen the
   candidate's own material. It may never introduce a number, employer, date,
   technology or outcome that is not already there. Enforced in code, not only in a
   prompt, and every change requires human acceptance.

This is a real, monetized product (confirmed 2026-08-13), not a demo — accounts,
persistence, payments and full GDPR obligations are in scope.

## Operating Context

- **The input is legacy and messy.** Files produced by Word, Google Docs, Canva,
  LaTeX and template sites, sometimes exported to PDF years ago, sometimes scanned.
  Two-column and table-based layouts are common, not edge cases.
- **The output is consumed twice:** first by an automated screener that extracts
  text, then by a human who spends seconds on it. Optimizing for one at the expense
  of the other is the failure mode the product exists to prevent.
- **ATS portals** (Workday, Greenhouse, Lever, Teamtailor) are where the file lands.
  Some require or prefer `.docx`, which is why DOCX export is on the roadmap and not
  optional forever.
- **Two conflicting regional conventions, both supported from v0.1** (confirmed
  2026-08-13):
  - _US / international:_ no photo, no personal details (age, nationality, marital
    status), one page under ~8 years of experience.
  - _EU / Nordic:_ photo is normal, two pages are normal, nationality and date of
    birth sometimes expected.
    Neither is a default that can be imposed on the other. The choice is a first-class
    toggle in the UI, not a hidden setting.
- **Sector-neutral by necessity.** Nothing in the vocabulary, the skill taxonomy, the
  template language or the sample content may assume a software career.
- **CV content is dense personal data** — full name, address, phone, employment
  history, sometimes photo, date of birth and nationality. Operating from the EU
  means GDPR applies to every design decision about storage and third parties.
- Users often work on this at night, under stress, sometimes on a phone.

## Capabilities and Constraints

**Confirmed capabilities (v0.1):** five input formats with magic-byte detection;
layout-aware text normalization including two-column PDFs; structured extraction to
a canonical schema with per-field confidence; a review/edit step that highlights
what was uncertain; template + theme selection; live preview; PDF download. Stateless
— nothing persisted.

**Confirmed later:** AI bullet rewriting with anti-fabrication enforcement; job
description tailoring with a gap report; transparent rule-based scoring; accounts and
saved variants; DOCX export; EN/ES/DA output.

**Technical constraints:**

- PDF rendering is server-side. The renderer (`takumi-pdf`, WASM) cannot run in a
  static client build, which means the app requires a server runtime.
- PDF colors must be hex. The renderer rejects `oklch`, so the app palette and the
  PDF palette cannot share tokens.
- PDF layout is a flexbox-only CSS subset. No CSS grid in document templates.
- Legacy `.doc` requires LibreOffice headless in the container.

**Terminology:** the schema is named `Resume` in code. User-facing wording differs by
market — "CV" in EU English, "resume" in US English. **Undecided:** whether the UI
switches this by locale or picks one globally.

**Explicitly undecided:** pricing model and tiers; domain and trademark availability
for the name; the license of the `pdfcn` component registry.

## Brand Commitments

- **Name: HunterReady.** Confirmed. Meaning: ready for the job hunt.
- No logo, wordmark, palette, typeface or brand asset exists. Verified — the
  repository currently contains planning documents only.
- No voice or personality has been established or made binding.
- No visual references, competitors-to-emulate or style constraints have been pinned
  by the user.

## Evidence on Hand

- **None yet, and this must not be fabricated.** There are no customers, no
  testimonials, no case studies, no press, no usage numbers, no benchmarks and no
  "trusted by" logos. Any surface that needs social proof must either earn it later
  or do without it.
- **What will become real evidence:** the ATS round-trip test result. Once it lands
  (v0.1, Block 5), "here is the test, here is the extracted text, every field
  survived" is a demonstrable claim. It is the only proof point worth building a
  marketing surface around, and it will be genuine.
- **Fixture CVs:** Edd's own CV plus public samples, needed for accuracy testing.
  Real CVs are PII and stay out of version control; committed fixtures must be
  anonymized.

## Product Principles

1. **The candidate owns every word.** The product restructures and sharpens; it never
   invents facts, numbers or history. When a metric would strengthen a claim, ask the
   candidate for it.
2. **Machine-readable is a tested guarantee, not a marketing claim.** If a template
   cannot be parsed back, it does not ship.
3. **Sector-neutral by default.** A nurse's CV and an engineer's CV both come out
   right. Any feature that only makes sense for one industry is wrong by default.
4. **Honest about tradeoffs.** When a visual choice hurts parseability, or a regional
   convention conflicts with another, say so in the interface instead of hiding it.
5. **Process, don't hoard.** The CV is the user's. Default to not storing it, and when
   storage arrives, make deletion a button rather than a support request.

## Accessibility & Inclusion

WCAG 2.2 Level AA is the standard, treated as a requirement rather than a target.
Reasons specific to this product:

- **The audience is the general working population**, not a technical one. The
  review/edit step is the critical path and must be usable by someone who has never
  filled in a 40-field form. Plain language, no jargon, no unexplained "ATS".
- **High-stakes and stressful.** Errors must be recoverable and never destructive;
  nothing about a failure should imply the user did something wrong.
- **Screen-reader users are job seekers too**, and the review form is where they
  either succeed or leave.
- **Mobile is a real usage scene** for upload and review, even though the output is a
  print document.
- **Non-English and non-Latin source documents** occur. Font coverage for non-Latin
  scripts is a known v0.1 gap to state, not to paper over.

---

_Written 2026-08-13 from a confirmed three-question interview (primary user,
product ambition, regional CV convention) plus the planning documents in `docs/`.
No facts here are inferred without a stated source._
