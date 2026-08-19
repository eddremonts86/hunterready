# 12 — DeepSeek v4-pro returns an empty tool input

- **Date:** 2026-08-18 · **Status:** draft (blocked on the vendor) · **Blocks:** 3 · **Author:** Edd

## Objective

Ship v4-pro the day it can fill the real schema, and notice that day without checking manually.

## Context

Edd asked for v4-pro. It does not work. Measured on 2026-08-18 against the real 7,303-character
schema through the Anthropic-compatible endpoint: v4-pro calls the forced tool with an **empty input**
while `deepseek-v4-flash` fills it in 1.8s, same prompt, same endpoint, same `tool_choice`.

Two things were found getting that far and both are worth keeping. v4-pro rejects a forced
`tool_choice` unless `thinking: {type: 'disabled'}` is sent, which is why `Provider.forcesThinking`
exists. And `deepseek-chat` and `deepseek-reasoner` are both accepted with 200 and served as
`deepseek-v4-flash`, so a wrong model name does not error — it silently runs a different model.

Flash shipped. `src/structure/__tests__/deepseek-schema.test.ts` holds the finding.

**Re-verified 2026-08-18, 15:23: still true.** Both assertions pass — pro returns an empty input, flash
fills the schema — in 4.7s.

⚠️ **And running it exposed a claim in this plan that was wrong.** It said the test "is the
notification rather than a reminder to check". It is not. It spends money, so it skips itself without
a credential, which means `pnpm test` reports `2 skipped` and CI never runs it. An opt-in test nobody
runs _is_ a reminder to check. The skip is honest — vitest prints `skipped`, never a false green — but
nothing will tell anybody the day this changes.

So the instrument is this command, and somebody has to type it:

```bash
set -a; . ./.env; set +a; pnpm vitest run deepseek-schema
```

Whether that is good enough is block 3's question, added below.

## Acceptance criteria

- [ ] When `deepseek-schema.test.ts` goes red, a decision is recorded in an ADR: pro as default, or
      pro as a named choice beside flash.
- [ ] Whichever is chosen, `pnpm test:measure` numbers for both are in the ADR before the switch.

## Non-goals

- Putting a paid API call in `pnpm test`. It would spend money on every run and go red when DeepSeek
  is merely down, which trains people to ignore it.
- Working around the vendor. A retry loop against a model that returns `{}` spends money to produce
  nothing, and hides the fault.
- Polling DeepSeek's changelog. The test is the instrument.

## Plan

### Block 1: confirm the test still guards (15 min)

- [ ] Run `pnpm test deepseek-schema` and read what it asserts.
- [ ] **Verify:** point it at `deepseek-v4-flash` instead and watch it go red, then put pro back. A
      test skipped when the key is absent must say `skipped`, never pass quietly.

### Block 2: when it turns (30 min, later)

- [ ] Run `OLLAMA_BASE_URL=… pnpm test:measure` against pro and flash on the same fixtures.
- [ ] Compare cost per CV and the silence rate, and append an ADR with both numbers.
- [ ] **Verify:** ingest one real CV through the chosen model end to end and read the field table.

### Block 3: decide whether a manual check is enough (20 min)

- [ ] Three options, in ascending cost: leave it manual and re-run when it matters; add it to the
      monthly-ish rhythm something else already has; or run it on a schedule that reports only when
      the answer _changes_, which is the only version that is genuinely a notification.
- [ ] **Verify:** whichever is chosen, the date of the last real run is written in this file. That
      date is the actual state of the knowledge, and it is the thing that goes stale.

## Risks

| Risk                                                   | Probability | Impact | Mitigation                                         |
| ------------------------------------------------------ | ----------- | ------ | -------------------------------------------------- |
| The test skips in CI for a missing key and looks green | high        | med    | Assert it reports `skipped`; a skip is not a pass  |
| Pro works but costs several times flash                | med         | med    | Block 2 measures cost before the switch, not after |

## Verification (end-to-end)

An ADR naming the chosen model with its measured cost and silence rate, and one real CV ingested
through it.
