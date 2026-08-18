# 11 — Verifier 5 has no instrument

- **Date:** 2026-08-18 · **Status:** draft · **Blocks:** 4 · **Author:** Edd

> **2026-08-18: Blocks 1 to 3 done. Block 4 (whether to adopt an error reporter) is still open and is deliberately a separate decision.** See the commit for what changed and how it was verified.

## Objective

Give the one hard rule with no automated proof behind it an instrument, or replace the check with one
that can actually run.

## Context

The v0.1 spec's privacy verifier was: cause a deliberate production error, confirm the payload
contains no CV content. It assumed an error reporter. There is no Sentry in the repo, verified again
on 2026-08-18 — the only grep hits are `startsEntry` matching the substring.

So the check has never run, and it was correctly carried to the open list as **unrun** rather than
passed, which is the convention `specs/current_spec.md` sets out.

**This is the one rule in CLAUDE.md with no automated proof behind it**: no CV content in logs,
errors, analytics or telemetry. It holds by construction today — `src/lib/log.ts` takes ids and
counts, `narrate.ts` was built so characters only ever accumulate in key position, `/api/render`
stopped returning zod issues because they quote the value they rejected. Every one of those is a
decision somebody made carefully, and none of them is guarded.

The cheaper half is available without any reporter: a **static** guard that greps the codebase for
CV-shaped values reaching a log call, and a **runtime** one that throws errors on purpose in tests and
asserts nothing personal appears in what was captured.

## Acceptance criteria

- [ ] A test that fails when a CV field is passed to a log or error path.
- [ ] The test proved to fail, by adding such a call deliberately and watching it go red.
- [ ] The roadmap item closes with either "instrumented" or an ADR retiring the check.

## Non-goals

- Adding Sentry to satisfy a checklist. An error reporter is a real decision with its own privacy
  surface, and this rule is exactly the wrong reason to adopt one casually.
- Proving the rule for every future line. The guard catches the shapes we know.

## Plan

### Block 1: enumerate the paths (30 min)

- [ ] List every place a value can leave the process: `log.ts`, thrown errors that reach a response
      body, `console.*`, `/api/progress`, and any analytics.
- [ ] **Verify:** the list is in this file. A guard over an incomplete list is a false sense.

### Block 2: the runtime guard (30 min)

- [ ] A test that ingests a fixture with distinctive strings — a rare surname, a phone number — makes
      each path fail, captures everything written, and asserts none of those strings appear.
- [ ] **Verify:** log a CV field on purpose and watch it go red. **CLAUDE.md's rule: a gate that has
      never failed is not working.**

### Block 3: the static guard (30 min)

- [ ] An ESLint rule or a test that flags `Resume` fields reaching a log call.
- [ ] **Verify:** add `event('x', {fullName: resume.basics.fullName})` and watch it fail.

### Block 4: decide about a reporter (20 min)

- [ ] With the guards in place, decide separately whether a reporter is wanted. If yes, an ADR
      covering scrubbing and retention. If no, retire verifier 5 and say the guards replaced it.
- [ ] **Verify:** the ADR exists and the roadmap item closes.

## Risks

| Risk                                               | Probability | Impact | Mitigation                                             |
| -------------------------------------------------- | ----------- | ------ | ------------------------------------------------------ |
| The guard passes because it checks the wrong paths | med         | high   | Block 1 first, and each guard proved by breaking it    |
| A reporter is added and becomes a new leak         | low         | severe | Block 4 is a separate decision with its own ADR        |
| Guards pass while a new path appears untested      | high        | med    | Static rule catches shapes; note the limit in the test |

## Verification (end-to-end)

`pnpm test` includes a privacy guard that has been observed to fail when a CV field reaches a log,
and the roadmap records the rule as instrumented rather than unrun.
