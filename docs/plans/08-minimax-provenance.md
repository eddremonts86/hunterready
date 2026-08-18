# 08 — MiniMax sometimes returns no provenance

- **Date:** 2026-08-18 · **Status:** draft · **Blocks:** 4 · **Author:** Edd

## Objective

Make the review step able to say "this came from line 14" for every field, or say plainly that it
cannot.

## Context

`provenance` is what lets the check step show the line a field came from, and MiniMax sometimes omits
it. When it does, the affected fields lose their "where did this come from" answer.

That answer is not decoration. The whole product is "see your CV the way the software sees it", and
the review screen's argument is that every detail is traceable to the document the person uploaded.
A field with no provenance is a field the person has to take on trust, which is what this product
exists not to ask for.

Not measured yet: how often, and whether it correlates with document length, with the model, or with
particular field paths. Two of the three third-party providers are now available, so the same CV can
be run through both.

## Acceptance criteria

- [ ] A measured rate: how many fields lack provenance, across the fixture set, per provider.
- [ ] Either the rate drops after a schema or prompt change, or the interface degrades honestly.
- [ ] A test that fails if provenance coverage falls below the recorded floor.

## Non-goals

- Inventing provenance. A guessed line number is worse than none: it is a claim, and this codebase
  refuses claims it cannot support (`optimize/fabrication.ts` exists for exactly this reflex).
- Switching provider to dodge it. Measure both, then decide.

## Plan

### Block 1: measure it (30 min)

- [ ] Count fields with and without provenance across the fixtures, per provider.
- [ ] **Verify:** a table in this file. "Sometimes" is not a number.

### Block 2: try the cheap causes (30 min)

- [ ] Check whether `provenance` is `required` in the JSON Schema sent, and whether the omission
      correlates with input length or with specific paths.
- [ ] **Verify:** re-measure. A change with no measurement after it is a guess.

### Block 3: degrade honestly (30 min)

- [ ] Where provenance is absent, the review step says so rather than showing nothing. A field whose
      source is unknown is a field worth a second look, which is the same idea as the scan warning.
- [ ] **Verify:** in the browser, on a CV with a field the model gave no provenance for.

### Block 4: pin the floor (20 min)

- [ ] A test asserting coverage stays at or above the measured rate.
- [ ] **Verify:** lower the floor artificially and watch it go red.

## Risks

| Risk                                              | Probability | Impact | Mitigation                                                                |
| ------------------------------------------------- | ----------- | ------ | ------------------------------------------------------------------------- |
| The rate varies run to run and the floor is flaky | high        | med    | Aggregate across fixtures with a loose ceiling, as `rewrite-quality` does |
| A fix for MiniMax breaks DeepSeek                 | med         | med    | Measure both in block 1 and again in block 2                              |
| The honest-degrade copy reads as an error         | med         | low    | Caution, never Alert. It is a question, not a fault                       |

## Verification (end-to-end)

The measured table exists, a test holds the floor, and a CV with missing provenance shows the honest
label in the browser rather than a blank.
