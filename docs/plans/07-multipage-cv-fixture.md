# 07 — A genuine multi-page CV fixture

- **Date:** 2026-08-18 · **Status:** draft (blocked on a real file) · **Blocks:** 3 · **Author:** Edd

## Objective

Get one real multi-page CV and settle the page-break verifier that Block 4 is still owed.

## Context

A missing input. Every fixture is one page, so the page-break path is exercised only by documents this
project made.

Two reasons it is worth more than it looks. Page breaks have already produced one real bug: the break
worked in the PDF and not in the _preview_, because the preview is a second renderer paginating by
measured height and it stepped over a zero-height instruction. `paginate()` is a pure function with
ten tests now, and none of those tests is a real CV.

And a long history is the ordinary case for the audience this product is for. Twelve years of shift
work is more entries than a page holds.

## Acceptance criteria

- [ ] One real multi-page CV in `fixtures/input/`, three pages or more, with its expected result.
- [ ] The accuracy table prints for it and the score is recorded here.
- [ ] Rendered through at least one design, the PDF's page count matches the preview's.

## Non-goals

- Fixing pagination in the same pass. Measure first.
- Testing all 28 structures against it. One is enough to find a break; a sweep is a later decision.

## Plan

### Block 1: obtain one (30 min, Edd)

- [ ] A real CV of three pages or more. Synthetic content is fine; the _structure_ is what must be
      real — entries that run past a page boundary mid-section.
- [ ] **Verify:** `pdfinfo` reports three or more pages and at least one section spans a boundary.

### Block 2: extraction (30 min)

- [ ] Expected result, then the accuracy table.
- [ ] **Verify:** the table prints and no entry is lost at a page boundary, which is the specific
      failure a single-page fixture cannot catch.

### Block 3: render it back (30 min)

- [ ] Render through `modern-intl` and compare the PDF's page count with the preview's.
- [ ] **Verify:** open the PDF and describe what you saw. Counts that agree on a one-page document
      prove nothing; this is the first document where they can disagree.

## Risks

| Risk                                          | Probability | Impact | Mitigation                                                 |
| --------------------------------------------- | ----------- | ------ | ---------------------------------------------------------- |
| Real employment history enters the repo       | med         | high   | Synthetic content, real structure. Check before committing |
| The round-trip test slows noticeably          | med         | low    | It runs 28 structures; measure before adding to all        |
| Preview and PDF disagree and the fix is large | med         | med    | Record the disagreement; fixing it is a separate item      |

## Verification (end-to-end)

The accuracy table includes a three-page CV, and its rendered PDF and on-screen preview report the
same number of pages.
