# 10 — Model routing: build it or retire it

- **Date:** 2026-08-18 · **Status:** draft · **Blocks:** 3 · **Author:** Edd

## Objective

Decide whether the per-task model table in docs/06 gets built or deleted, and make the docs true
either way.

## Context

docs/06 describes routing each task to a model chosen for it — a small model for classification, a
large one for rewriting, and so on. Verified on 2026-08-18: **no such code exists.** There is no
`modelFor`, no routing table, nothing outside `__tests__`.

Documentation describing code that does not exist is the failure mode this project has already been
bitten by four times, and CLAUDE.md opens with it: `variant-diff`, all of v0.4's targeting, all of
v0.5's persistence and `basics.photoUrl` each shipped as schema plus prose with no path to them. A
described-but-absent routing table is the same thing one step earlier.

The decision got easier since docs/06 was written. There are now three providers and a per-person
choice by name, so "which model" is partly the user's answer, not only ours. Routing would sit
underneath that choice, not replace it — which narrows what it could usefully do.

## Acceptance criteria

- [ ] An ADR recording the decision and its reason, appended not rewritten.
- [ ] If retired: docs/06 no longer describes it, and the roadmap item closes.
- [ ] If built: a task reaches a different model than the default, proved at runtime.

## Non-goals

- Building it because it is written down. That is the reasoning that produced the four ghost features.
- Routing across providers by price. That is metering, and it belongs with items 01 and 16.

## Plan

### Block 1: what would it buy, in numbers (30 min)

- [ ] For each task in the docs/06 table, state what a different model would change: latency, cost,
      or quality. `pnpm test:measure` gives the quality half for rewriting.
- [ ] **Verify:** a table with numbers. A row with no number is a row arguing for retirement.

### Block 2: decide (20 min)

- [ ] Append an ADR. If any row shows a real gain, that row is the scope — not the whole table.
- [ ] **Verify:** the ADR names the rows kept and the rows dropped.

### Block 3a, if retiring: make the docs true (20 min)

- [ ] Remove the table from docs/06 and say what replaced it: the person chooses the provider by name.
- [ ] **Verify:** grep docs/ for the table's language and find nothing.

### Block 3b, if building: the smallest useful version (30 min)

- [ ] One task, one override, honouring the person's provider choice above it.
- [ ] **Verify:** run that task and confirm from the logs which model answered. Naming a model in
      code is not evidence that it was called.

## Risks

| Risk                                                | Probability | Impact | Mitigation                                                    |
| --------------------------------------------------- | ----------- | ------ | ------------------------------------------------------------- |
| Built because it is documented, not because it pays | med         | med    | Block 1 requires a number per row before block 2              |
| Routing overrides the person's named choice         | med         | high   | ADR-023: consent is to a named company. Routing sits below it |
| Retired, and the reasoning is lost                  | low         | med    | The ADR is the record; docs/06 gets the pointer               |

## Verification (end-to-end)

Either docs/06 no longer describes routing and the ADR says why, or one task demonstrably reaches a
different model with the person's provider choice still respected.
