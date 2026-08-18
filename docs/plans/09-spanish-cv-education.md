# 09 — Does the private Spanish CV have an education section at all?

- **Date:** 2026-08-18 · **Status:** draft (blocked on one sentence from Edd) · **Blocks:** 2

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
