# 10 — Model routing: build it or retire it

- **Date:** 2026-08-18 · **Status:** DONE — retired, ADR-031 · **Blocks:** 3 · **Author:** Edd

> **2026-08-18: closed.** Edd chose to retire it. The table is gone from docs/06, ADR-031 records
> why, and roadmap item 10 is struck through. The kept idea moved to plan 04.

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

## Block 1, done 2026-08-18: what it would buy

Measured against the code, not against the doc.

**The table in docs/06:**

| Task                      | Doc says  | Today                    | Routing would change |
| ------------------------- | --------- | ------------------------ | -------------------- |
| Extraction / structuring  | Haiku 4.5 | `provider.model`         | nothing available    |
| Bullet rewriting          | Opus 5    | `provider.model`         | nothing available    |
| JD requirement extraction | Sonnet 5  | `provider.model`         | nothing available    |
| Scoring                   | none      | `score.ts`, 0 model refs | already true         |

**Three of the four rows name a vendor this product does not use.** Haiku, Opus and Sonnet are
Anthropic models. Production runs MiniMax; DeepSeek and a local Ollama are the alternatives; the
Anthropic provider exists in `provider.ts` and is not what anybody is served. So those rows are not
"unbuilt" — as written they are unbuildable, because the models they name are not in the deployment.

**The fourth row is already true.** `src/optimize/score.ts` contains zero references to a provider, a
client or a message. Scoring is deterministic code, exactly as the table says, and needed no routing
to get there.

**And there is one model per provider, not per task.** `provider.model` is a single string set by
`MINIMAX_MODEL`, `DEEPSEEK_MODEL` or `OLLAMA_MODEL`, and all 17 call sites take it. Choosing a
different model per task would mean each provider exposing several, which is a configuration surface
that does not exist and that nobody has asked for.

**The thing that replaced it, and did so deliberately.** ADR-023 made the model choice the _person's_:
they pick a named company at the consent gate, because docs/07 requires consent to a named provider.
A routing table that overrode that would be the product deciding where somebody's CV goes after
asking them. Routing could only ever sit _underneath_ that choice, which leaves it very little to do.

### Recommendation

**Retire the table.** Not because routing is a bad idea in general, but because this specific table
describes a product with a different provider lineup, and the one row of it that made sense is done.

**Keep one idea out of the wreckage**, and put it where it is live rather than in docs/06: _local
model for cheap work, third-party for expensive_. That is not vendor routing, it is the shape of
plan 04's exit from ADR-030, and it belongs there.

Block 2 is Edd's decision. This block exists so it costs a minute.

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
