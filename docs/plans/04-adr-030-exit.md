# 04 — The exit from ADR-030

- **Date:** 2026-08-18 · **Status:** draft · **Blocks:** 5 · **Author:** Edd

## Objective

Get the model call off the blocking path so the local model is usable, and turn
`HR_THIRD_PARTY_FOR_ALL` off.

## Context

**The only item on the list actively spending money.** `HR_THIRD_PARTY_FOR_ALL=true` means every
anonymous visitor's ingest, advert read and rewrite spends third-party tokens. Confirmed still on in
production on 2026-08-18: `thirdPartyAvailable: true` for `plan: anonymous`.

It went on for a measured reason. Reading one job advert on the local model took **102 and 171
seconds** on the `cax21`, both times timing out into the rule engine, and the rule engine then matched
0 of 4 requirements. "Fit my CV to this job" was not slow for an anonymous visitor; the button never
appeared.

ADR-027 already named the lever and it is not a faster engine: **take the model call off the blocking
path.** A request that returns a job id and streams progress can take ninety seconds without anybody
staring at a spinner, and `/api/progress` already exists for the narration.

The concern ADR-030 itself recorded is closed: `/api/ingest`, `/api/target`, `/api/translate` and
`/api/cover-letter` all rate-limit now.

## Acceptance criteria

- [ ] An anonymous visitor on the local model can target an advert and get a real result.
- [ ] Nothing in the interface blocks for longer than it takes to show progress.
- [ ] `HR_THIRD_PARTY_FOR_ALL` is unset in production and `/api/processing` reports
      `thirdPartyAvailable: false` for an anonymous visitor.

## Non-goals

- A faster local model, a bigger box, or vLLM. CLAUDE.md already measured that vLLM's headline is
  throughput under concurrent load on CUDA, and this app deliberately runs one request at a time.
- A queue service. In-process is enough for one box; introducing infrastructure to fix a UX shape is
  the expensive version of this.

## Plan

### Block 1: measure it again before changing anything (20 min)

- [ ] Time an advert read and an ingest on production's local model as it stands today.
- [ ] **Verify:** two numbers in this file. ADR-030's are from a different deploy and may be stale in
      either direction.

### Block 2: a job id instead of an answer (30 min)

- [ ] `/api/target` accepts the advert, returns `{jobId}` immediately, and does the work after.
- [ ] Results land where `/api/progress` can report them; keep them in memory with a TTL, since a CV
      is personal data and ADR-004 says an anonymous visitor stores nothing.
- [ ] **Verify:** `curl` returns a job id in under 200ms and the result arrives on the progress stream.

### Block 3: the same shape for ingest (30 min)

- [ ] `/api/ingest` returns a job id. This is the one on the critical path for a first-time visitor.
- [ ] **Verify:** upload a real CV on the local model and watch the waiting screen narrate it.

### Block 4: make the wait honest (30 min)

- [ ] The waiting screen already narrates what the model is reading (`src/structure/narrate.ts`).
      Confirm it works when the answer is ninety seconds away rather than ten.
- [ ] **Verify:** in the browser, on the local model, with the network throttled.

### Block 5: flip it off (15 min)

- [ ] Unset `HR_THIRD_PARTY_FOR_ALL` in Coolify, restart.
- [ ] **Verify:** `/api/processing` reports `thirdPartyAvailable: false` for anonymous; a signed-in
      `pro` account still gets the larger model; an anonymous ingest still produces a real `Resume`.

## Risks

| Risk                                                     | Probability | Impact | Mitigation                                                     |
| -------------------------------------------------------- | ----------- | ------ | -------------------------------------------------------------- |
| A ninety-second wait is still unacceptable even narrated | med         | high   | Block 1's numbers decide this before the work, not after       |
| In-memory results lost on restart mid-job                | high        | low    | TTL plus a clear failure; the visitor retries. Do not persist  |
| An anonymous CV outlives the request in memory           | med         | high   | Short TTL, no disk, no logs. ADR-004 is the constraint         |
| The local model degrades quality even when it finishes   | high        | med    | Measure with `pnpm test:measure`; the free tier must be honest |

## Verification (end-to-end)

With `HR_THIRD_PARTY_FOR_ALL` unset, an anonymous visitor uploads a CV, targets an advert and gets a
real requirement list, with the waiting screen narrating throughout and no request blocking.
