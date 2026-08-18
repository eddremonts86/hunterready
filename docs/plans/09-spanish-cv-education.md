# 09 — Does the private Spanish CV have an education section at all?

- **Date:** 2026-08-18 · **Status:** CLOSED, no bug · **Blocks:** 2

> **2026-08-18: CLOSED.** Edd confirmed the file and confirmed it has no education section.
> The evidence below stands and no bug follows from it. This plan is kept for the reasoning, not as work.

## Objective

Answer one question so nobody spends another hour hunting a bug that may not exist.

## Context

Measured, not assumed: of 103 extracted lines from the private Spanish CV, **zero** contain
`formacion`, `educacion`, `estudios` or `academic` in any form, and its headings read like a
portfolio-shaped profile.

So there are exactly two possibilities and they lead in opposite directions. Either extraction loses
the region entirely — a real bug in the region detector, worth finding — or the document has no
formal education section, in which case there is nothing to find and every hour spent is wasted.

**Nobody should look further until this is answered.** It is one sentence from the person who has the
file, and it decides whether an investigation is worth starting.

## Block 1, done 2026-08-18: the evidence disagrees with the answer

Edd answered **yes, it has one**. The file does not support that, and this is written down rather
than acted on, because acting on it is the hour this plan exists to prevent.

`fixtures/private/edd.pdf`, read with `pdftotext -layout`:

- **2 pages, 145 lines.** The project's own pipeline reported 103; both see the same document.
- **No match for any education vocabulary, accent-insensitive**, across fourteen stems: `formaci`,
  `educaci`, `estudio`, `acad`, `titulaci`, `universi`, `grado`, `master`, `máster`, `licenciat`,
  `ingenier`, `curso`, `certificac`, `capacitac`, `escolar`. The accent was the first hypothesis —
  the roadmap searched `educacion` and a document saying `Educación` would have hidden — and it is
  not the answer. There is nothing to normalise.
- **Page 2 is employment**, twelve entries running back to 2007, followed by the skills block. No
  section between them.
- **One image, 320×213 px, on page 1.** A photograph. Too small to be a section of text, so OCR would
  find nothing a section could be hiding in.

So the extraction is not losing a region. There is no region in this file.

### What that probably means

Not that the answer was wrong — that the file and the answer are about **different documents**. This
export is a one-page-plus profile with metrics, twelve jobs and a skills block, which reads like a
targeted CV rather than a complete one. A senior engineer with eighteen years of employment leaving
education off is an ordinary choice, and it may simply be this version.

### What would settle it

One of two things, and both are cheap:

- Confirm this file is the one you meant, in which case item 09 closes: nothing is lost because
  nothing is there.
- Or drop the version that has the education section into `fixtures/private/` and say its filename.
  If a heading exists that the pipeline cannot see, that is the bug, and this becomes worth an hour.

**Do not start block 2 until one of those happens.** That is the whole point of this plan.

## Acceptance criteria

- [ ] Edd states whether the document contains a formal education section.
- [ ] The answer is written into this file with the date.
- [ ] If yes, a bug plan follows. If no, the roadmap item closes and says why.

## Non-goals

- Committing the CV. It is private and stays private; the regression tests already skip themselves
  when the file is absent, which is the existing pattern.
- Guessing from the extraction. The extraction is the thing under suspicion, so it cannot be the
  witness.

## Plan

### Block 1: ask (5 min, Edd)

- [ ] Open the file and answer: is there a section listing degrees, courses or schooling?
- [ ] **Verify:** the answer is in this file, dated.

### Block 2, if the answer is yes: find the loss (30 min)

- [ ] Print the raw text layer and locate the heading by eye.
- [ ] Compare against `src/ingest/labels.ts` — the Spanish vocabulary may lack the exact word used.
- [ ] **Verify:** the accuracy table for that fixture shows the education fields recovered.

### Block 2, if the answer is no: close it (10 min)

- [ ] Close roadmap item 09 with the reason.
- [ ] **Verify:** the roadmap no longer lists it, and this file says why.

## Risks

| Risk                                             | Probability | Impact | Mitigation                                            |
| ------------------------------------------------ | ----------- | ------ | ----------------------------------------------------- |
| It stays unanswered and the item lingers         | high        | low    | It is one sentence; the cost of asking again is small |
| The answer is yes and the vocabulary gap is wide | med         | med    | Block 2 starts from the raw text, not from the score  |

## Verification (end-to-end)

Either the roadmap item is closed with a reason, or the accuracy table shows the education fields.
