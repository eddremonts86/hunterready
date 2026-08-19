# 05 — An overlapping-column fixture

- **Date:** 2026-08-18 · **Status:** draft (blocked on a real file) · **Blocks:** 3 · **Author:** Edd

## Objective

Get one real Canva or Enhancv export whose columns genuinely **overlap**, and find out what it breaks.

## Context

A missing input, not missing code. `two-column-interleaved.pdf` covers interleaved _ordering_: the
text layer alternates between columns and the reader has to reassemble them. Overlap is a different
rule — the x-spans of two columns intersect, so no vertical cut separates them and the column
detector has nothing clean to split on.

Canva and Enhancv are the likely producers because their templates overlap decorative blocks with
text. This is the shape most likely to arrive from a designer, a marketer, or anybody who used a
template site, which is a large slice of "all sectors".

**Read ADR-016 before generating one.** A fixture harder than reality wastes days: the two-column
generator once registered only Arial Regular, so the fixture had no bold text anywhere, and two
heading heuristics existed purely to work around a difficulty that no real CV has.

## Acceptance criteria

- [ ] One real export in `fixtures/input/`, with its expected result hand-written next to it.
- [ ] The accuracy table prints for it, and its score is recorded here whatever the number is.
- [ ] If it fails, the failure is described as a rule, not as a score.

## Non-goals

- Synthesising one. The whole point is that it is real; a generated overlap is a guess about the
  shape of the problem, which is ADR-016's exact failure mode.
- Fixing what it breaks in the same pass. Find first, record, then decide whether it is worth fixing.

## Plan

### Block 1: obtain one (30 min, Edd)

- [ ] Export a CV from Canva and one from Enhancv using a two-column template. Any content;
      **not Edd's own CV** if it is going into the repo.
- [ ] **Verify:** open the text layer with `pdftotext -layout` and confirm the x-spans actually
      intersect. A template that merely looks two-column may cut cleanly, in which case it is not
      this fixture.

### Block 2: expected result and score (30 min)

- [ ] Hand-write the expected extraction into `fixtures/expected/`.
- [ ] Run the accuracy suite and record the field table here.
- [ ] **Verify:** the table prints. A crash is a finding; record it as one.

### Block 3: name the rule that broke (20 min)

- [ ] Describe what the detector did, in terms of the rule rather than the percentage.
- [ ] **Verify:** somebody who has not seen the file can predict the failure from the description.

## Risks

| Risk                                         | Probability | Impact | Mitigation                                                    |
| -------------------------------------------- | ----------- | ------ | ------------------------------------------------------------- |
| The export cuts cleanly and is not this case | med         | low    | Block 1 verifies overlap before any work is done              |
| Real personal data enters the repo           | med         | high   | Synthetic content in a real template; check before committing |
| It scores well and the item looks closed     | low         | med    | One passing file is not coverage; say so in the record        |

## Verification (end-to-end)

`pnpm test` prints the accuracy table including the new fixture, and this file records its score and
what it taught.
