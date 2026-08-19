# 08 — MiniMax sometimes returns no provenance

- **Date:** 2026-08-18 · **Status:** DONE, all four blocks · **Blocks:** 4 · **Author:** Edd

> **2026-08-19: closed. It was never the providers.** `provenance` was **optional in the JSON Schema
> we sent**, while the prompt three paragraphs earlier asked the model to cite a line for every
> field. Requiring it took the aggregate from 45% to 96% and the worst single pass from 0% to 67%.
> DeepSeek, which cited nothing at all on a 75-field document in every pass, now cites 67–96% of it.

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

## Block 1, done 2026-08-18: the number, and it is a spread

Three passes per pairing, real calls, `provenance-report.txt`:

| provider | fixture          | fields | worst | best | passes         |
| -------- | ---------------- | ------ | ----- | ---- | -------------- |
| DeepSeek | plain.txt        | 33     | 0%    | 70%  | 70 · 0 · 0     |
| DeepSeek | nurse-senior.pdf | 75     | 0%    | 0%   | 0 · 0 · 0      |
| MiniMax  | plain.txt        | 35     | 34%   | 97%  | 97 · 34 · 91   |
| MiniMax  | nurse-senior.pdf | 72     | 86%   | 100% | 100 · 100 · 86 |

**The item's title understates it.** "MiniMax sometimes returns no provenance" describes the better
of the two providers. DeepSeek produced **none at all** on the larger document, in every pass.

**One run is not a measurement**, and finding that out cost two runs. The first pair measured
DeepSeek at 0%/0% and MiniMax at 34%/57%; the second, identical code and inputs, gave 65%/0% and
100%/100%. That is the same lesson CLAUDE.md already records about `rewrite-quality` — four runs
measuring silence at 27%, 4%, 15% and 12%. So the instrument repeats and reports a spread, and a
single number from it should be distrusted.

### The hypothesis the numbers point at

**Output length.** DeepSeek manages the 33-field document sometimes and the 75-field one never.
Provenance is the part of the answer with no user-visible consequence if dropped, so it is the part a
model under budget pressure drops first. Block 2 tests that.

### Block 3 was already done, and nobody had noticed

The dangerous part of a missing provenance list is not the absence — it is that the absence looks
like confidence. `flaggedPaths` is `provenance.filter(needsReview)`, so no entries means no flags,
and a screen whose entire job is "here is what to double-check" would say there is nothing to
double-check about a document it could not trace one field of.

`review-form.tsx` already handles it: `unsure = ocr || total === 0` swaps the count for `?` and the
label for "Check everything / we could not tell which fields". It was written for the OCR case and it
covers this one exactly. Nothing was holding that boolean in place, so
`no-provenance-is-honest.test.ts` now does.

## And the question it raised: is MiniMax simply the better provider?

Edd, reading the table above: _"entonces es mejor usar minimax que deepseek"_. On provenance, yes,
and it is not close. So the obvious follow-up was scored rather than assumed, with the same scorer
`accuracy-report.txt` uses, three passes each (`provider-accuracy-report.txt`):

```
  who        fixture              overall   passes
  rules      plain.txt             100%     (deterministic)
  DeepSeek   plain.txt            100-100%  100 100 100
  MiniMax    plain.txt            100-100%  100 100 100
  rules      nurse-senior.pdf      100%     (deterministic)
  DeepSeek   nurse-senior.pdf     100-100%  100 100 100
  MiniMax    nurse-senior.pdf     100-100%  100 100 100
```

**This does not say the providers are equal. It says the instrument cannot tell.** Plain regular
expressions score 100 on the same inputs, and CLAUDE.md already records why: every fixture is
synthesised from the expected result it is scored against, so the synthetic set is easier than
reality by construction. A test that cannot separate a regex from a model cannot separate two models.

So where that leaves the choice, honestly:

- **Provenance: MiniMax, decisively.** 86-100% against 0% on the larger document, three passes each.
- **Accuracy: unknown.** Not "equal" — unmeasurable on what we have.
- **Schema filling: flash works, v4-pro does not** (item 12), which is a DeepSeek-specific fault.
- **Latency and cost per CV: never measured between them.**

MiniMax is the right default on the evidence, and the evidence is one dimension wide. The thing that
would widen it is **roadmap items 05, 06 and 07** — the three real CVs nobody has supplied. They are
listed as ingestion-quality gaps; this is a second reason they matter, and a sharper one, because
without them there is no way to tell whether a model change helped.

## Acceptance criteria

- [x] A measured rate: how many fields lack provenance, across the fixture set, per provider.
- [x] Either the rate drops after a schema or prompt change, or the interface degrades honestly.
      **Both**: the rate went 45% → 96%, and the empty case still degrades honestly.
- [x] A test that fails if provenance coverage falls below the recorded floor.

## Non-goals

- Inventing provenance. A guessed line number is worse than none: it is a claim, and this codebase
  refuses claims it cannot support (`optimize/fabrication.ts` exists for exactly this reflex).
- Switching provider to dodge it. Measure both, then decide.

## Plan

### Block 1: measure it (30 min)

- [ ] Count fields with and without provenance across the fixtures, per provider.
- [ ] **Verify:** a table in this file. "Sometimes" is not a number.

### Block 2, done 2026-08-19: it was the schema, and it was one line

- [x] Check whether `provenance` is `required` in the JSON Schema sent.
- [x] **Verified:** re-measured, same harness, same fixtures, three passes.

**It was not required.** `ExtractionPayload.provenance` carries `.default([])`, so
`z.toJSONSchema(…, { io: 'input' })` emitted `required: ["resume"]`. The code even documented this as
correct — _"fields with defaults are optional rather than required"_ — which is true of a validator
and wrong of a request.

And the prompt, in the same call, says: _"For each field you fill, report how sure you are that you
read it correctly, and the index of the line you took it from."_

**The prompt asked and the schema excused.** Provenance is the only part of the answer with no
visible consequence if it is dropped, so a model resolving that tension takes the excuse.

|                                  | before      | after           |
| -------------------------------- | ----------- | --------------- |
| DeepSeek · plain.txt (32)        | 0% · 94%    | **100% · 100%** |
| DeepSeek · nurse-senior.pdf (75) | **0% · 0%** | **67% · 96%**   |
| MiniMax · plain.txt (33)         | 68% · 100%  | **100% · 100%** |
| MiniMax · nurse-senior.pdf (72)  | 22% · 96%   | **97% · 100%**  |
| aggregate over all 12 passes     | **45%**     | **96%**         |

The fix asks strictly and accepts leniently: the tool schema demands `provenance`, and the runtime
parse keeps its `.default([])`, so a model that ignores the demand costs the person their citations
and never their CV. Trading a whole read for a side channel would be the worse bargain, and block 3
already made the empty case honest on screen.

**The output-length hypothesis was half right and not the cause.** Length still shows — DeepSeek
manages 100% of a 32-field document and 67–96% of a 75-field one — but it is now a degradation
rather than a total absence, and the total absence was ours.

### What this item was called

_"MiniMax sometimes returns no provenance."_ MiniMax was the **better** of the two providers
throughout, and neither was the problem. The title described a symptom of our own request, and the
plan's own hypothesis pointed at model behaviour for two blocks before anybody read the emitted
schema. Worth remembering the next time a provider looks unreliable.

### Block 3: degrade honestly (30 min)

- [ ] Where provenance is absent, the review step says so rather than showing nothing. A field whose
      source is unknown is a field worth a second look, which is the same idea as the scan warning.
- [ ] **Verify:** in the browser, on a CV with a field the model gave no provenance for.

### Block 4, done 2026-08-19: pin the floor, twice

- [x] A test asserting coverage stays at or above the measured rate.
- [x] **Verified:** raised the floor above the real rate and watched it go red.

Two tests, because the useful one and the cheap one are not the same test.

**`provenance-coverage.test.ts` holds the floor**: aggregate ≥ 80% and no single pass below 50%.
Both bounds are loose on purpose — the numbers are a spread across three passes of identical code,
and CLAUDE.md records what happens to a threshold tightened onto one lucky run. They sit in the gap
between 45%/0% and 96%/67% with room on both sides. Raising them to 100/99 goes red with a message
naming the provider and the fixture.

⚠️ **But it costs money and four minutes, so it is opt-in and never runs in CI** — which makes it
useless against the thing most likely to happen: somebody simplifying `toolSchema` back to a single
`z.toJSONSchema` call. So **`provenance-is-required.test.ts`** is free, hermetic, runs on every push
and holds the real exported schema rather than a mirror of it. Deleting the `required` entry fails
it immediately.

## Risks

| Risk                                              | Probability | Impact | Mitigation                                                                |
| ------------------------------------------------- | ----------- | ------ | ------------------------------------------------------------------------- |
| The rate varies run to run and the floor is flaky | high        | med    | Aggregate across fixtures with a loose ceiling, as `rewrite-quality` does |
| A fix for MiniMax breaks DeepSeek                 | med         | med    | Measure both in block 1 and again in block 2                              |
| The honest-degrade copy reads as an error         | med         | low    | Caution, never Alert. It is a question, not a fault                       |

## Verification (end-to-end)

The measured table exists, a test holds the floor, and a CV with missing provenance shows the honest
label in the browser rather than a blank.
