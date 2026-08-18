# 14 — `/api/processing` reports a hostname instead of a name

- **Date:** 2026-08-18 · **Status:** draft · **Blocks:** 1 · **Author:** Edd

## Objective

Make `displayName` recognise MiniMax's `.chat` host so the legacy `provider` field says `MiniMax`.

## Context

Production returns `{"provider":"api.minimaxi.chat", ...}`. `displayName` in
`src/routes/api/processing.tsx` maps `minimax.io` and `minimaxi.com`, and production is configured
against `api.minimaxi.chat`, so the hostname falls through the `return host` at the bottom.

It is a regression from the 2026-08-18 release, and it appeared without anything changing in
`displayName`: the release rewrote how `provider.label` is built, and the label went from a default
constant to the configured base URL.

**Nothing renders it.** Every name on screen comes from `providers[].name`, which is correct, and
`consent-gate.tsx` uses `chosenName` from that list. So this is a field in an API response that no
caller reads yet, which is exactly why it should be fixed before one does — item 16 would inherit it.

## Acceptance criteria

- [ ] `/api/processing` on production returns `"provider":"MiniMax"`.
- [ ] A unit test covers all three MiniMax hosts and fails when one is removed from the map.

## Non-goals

- Removing the legacy `provider` field. Item 16 decides what the API contract keeps.
- Guessing at other vendors' alternate domains. Add hosts when they are observed, not when imagined.

## Plan

### Block 1: the host and its test (20 min)

- [ ] Add `minimaxi.chat` to the `endsWith` chain in `displayName`.
- [ ] Write `src/routes/api/__tests__/processing-display-name.test.ts` covering
      `api.minimax.io`, `api.minimaxi.com`, `api.minimaxi.chat`, `api.deepseek.com`, and an unknown
      host that must fall through to itself.
- [ ] **Verify:** delete one host from the map and watch the new test go red, then put it back.

## Risks

| Risk                                          | Probability | Impact | Mitigation                                         |
| --------------------------------------------- | ----------- | ------ | -------------------------------------------------- |
| Another vendor host appears and falls through | med         | low    | The fallthrough returns the host, which is legible |

## Verification (end-to-end)

After the next deploy: `curl -s https://hunterready.eduardoinerarte.dk/api/processing` shows
`"provider":"MiniMax"`.
