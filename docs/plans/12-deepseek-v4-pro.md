# 12 — DeepSeek v4-pro returns an empty tool input

- **Date:** 2026-08-18 · **Status:** draft (blocked on the vendor) · **Blocks:** 2 · **Author:** Edd

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

Flash shipped. `src/structure/__tests__/deepseek-schema.test.ts` exists to go red when the vendor
fixes pro, which is the notification rather than a reminder to check.

## Acceptance criteria

- [ ] When `deepseek-schema.test.ts` goes red, a decision is recorded in an ADR: pro as default, or
      pro as a named choice beside flash.
- [ ] Whichever is chosen, `pnpm test:measure` numbers for both are in the ADR before the switch.

## Non-goals

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

## Risks

| Risk                                                   | Probability | Impact | Mitigation                                         |
| ------------------------------------------------------ | ----------- | ------ | -------------------------------------------------- |
| The test skips in CI for a missing key and looks green | high        | med    | Assert it reports `skipped`; a skip is not a pass  |
| Pro works but costs several times flash                | med         | med    | Block 2 measures cost before the switch, not after |

## Verification (end-to-end)

An ADR naming the chosen model with its measured cost and silence rate, and one real CV ingested
through it.
