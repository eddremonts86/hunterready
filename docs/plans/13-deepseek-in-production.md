# 13 — DeepSeek is configured nowhere in production

- **Date:** 2026-08-18 · **Status:** draft · **Blocks:** 2 · **Author:** Edd

## Objective

Make DeepSeek appear in production's provider list, and make its absence loud instead of silent.

## Context

The 2026-08-18 release shipped DeepSeek as a third model. Production's `/api/processing` came back
with `providers: [{"id":"minimax","name":"MiniMax"}]` and nothing else, because `deepseek()` in
`src/structure/provider.ts` returns `undefined` when `DEEPSEEK_API_KEY` is absent.

**That silence is the real defect.** The app starts clean, health is green, and a model somebody
deliberately added is simply not there. `docker-compose.yml` already passes all three variables; only
the Coolify environment is missing them. A feature that disappears without a log line is the same
class of problem as a feature nobody can reach.

## Acceptance criteria

- [ ] `/api/processing` on production lists DeepSeek alongside MiniMax.
- [ ] Boot logs one line naming every provider that was configured and every one that was skipped.

## Non-goals

- Making DeepSeek the default. That is item 12's decision, and it depends on v4-pro.
- Failing to boot when a provider is missing. Running with one model is a valid deployment.

## Plan

### Block 1: the credentials (10 min, Edd)

- [ ] Add `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL` and `DEEPSEEK_MODEL` in Coolify and restart.
- [ ] **Verify:** `curl -s https://hunterready.eduardoinerarte.dk/api/processing` lists DeepSeek.

### Block 2: make the absence audible (25 min)

- [ ] At startup, log one line: which providers resolved and which were skipped for a missing key.
      Names only. **No key material, no fragment of one, not even a length.**
- [ ] **Verify:** boot locally with `DEEPSEEK_API_KEY` unset and read the line; then set it and read
      it again. Grep the log for the key's value and find nothing.

## Risks

| Risk                                      | Probability | Impact | Mitigation                                                     |
| ----------------------------------------- | ----------- | ------ | -------------------------------------------------------------- |
| A key reaches the log                     | low         | high   | Log names from a fixed list, never a value; assert in the test |
| The base URL is wrong and calls fail late | med         | med    | Block 1's verify reads the live list rather than the config    |

## Verification (end-to-end)

Production lists two third-party providers, the consent gate offers both by name, and one ingest
through DeepSeek returns a filled `Resume`.
