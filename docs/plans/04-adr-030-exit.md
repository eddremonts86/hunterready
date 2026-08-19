# 04 — The exit from ADR-030

- **Date:** 2026-08-18 · **Status:** blocks 1-4 done · **Blocks:** 5 · **Author:** Edd

> **2026-08-19: blocks 3 and 4 done. Nothing in the interface blocks on a model any more.** Ingest
> answers in 7ms with a job id, exactly as targeting already did, and the waiting screen was watched
> narrating a real upload for over two minutes without a request being held open. **Block 5 —
> unsetting `HR_THIRD_PARTY_FOR_ALL` in Coolify — is Edd's, and it is now unblocked.**
>
> **2026-08-18: blocks 1 and 2 done.** Reading an advert no longer blocks: the POST answers in 3ms
> with a job id and the reading is collected from `/api/result`.

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

## Block 1, done 2026-08-18: measured again, and the failure has changed

Against production, forcing the local model with `processing: local`:

| operation                      | today                            | ADR-030, 2026-08-15                |
| ------------------------------ | -------------------------------- | ---------------------------------- |
| read an advert (`/api/target`) | 101s, then 52s · `source: model` | 102s and 171s · fell back to rules |
| ingest a CV (`/api/ingest`)    | 57s · `method: local`            | not recorded                       |
| requirements matched           | 3                                | **0 of 4**                         |

**The failure ADR-030 was written about is gone.** Its case was not "slow": it was that the local
model timed out into the rule engine, and the rule engine then matched nothing, so an anonymous
visitor's targeting button produced a useless answer or never appeared. Today the model answers, and
the answer is real — `source: model`, three requirements pulled out of the advert.

What remains is latency: **52 to 101 seconds**, with a 2x spread between two identical requests a
minute apart. That is unusable as a blocking request and entirely usable as a job with progress,
which is what ADR-027 said and what blocks 2 to 4 build. **No model change is needed.** The remaining
work is a request shape.

That also narrows the risk that mattered most in this plan. "A ninety-second wait is still
unacceptable even narrated" was listed as the thing block 1's numbers would decide. They decide it in
favour of proceeding: a wait that produces a correct answer can be narrated, and one that produces
nothing cannot.

⚠️ Measured against production rather than a laptop, deliberately. CLAUDE.md records that the brew
Ollama on Metal is roughly 4x the container's CPU, so a local number would have been optimistic by
about that much and would have made this look easier than it is.

## Acceptance criteria

- [ ] An anonymous visitor on the local model can target an advert and get a real result.
- [ ] Nothing in the interface blocks for longer than it takes to show progress.
- [ ] `HR_RELEASE=true` in production and `/api/processing` reports `thirdPartyForYou: false` for an
      anonymous visitor. (Was "`HR_THIRD_PARTY_FOR_ALL` is unset"; see block 5 for why that could
      never have worked.)

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

### Block 3, done 2026-08-19: the same shape for ingest

- [x] `/api/ingest` returns a job id. This is the one on the critical path for a first-time visitor.
- [x] **Verified:** a real CV uploaded on the local model, watched narrating in the browser.

One handler serves both shapes. The pipeline moved into a `run()` that **returns** its failures
rather than throwing them, because both mid-pipeline failures already carry a status, a code and a
sentence written for a person — and both shapes need all three. A thrown error would keep the status
and lose the sentence, so somebody whose scan could not be read would be told "something went wrong"
instead.

`job-result.ts` gained the test suite it shipped without. That was defensible while the worst thing
in it was a list of requirements from a public advert; this block puts a **`Resume`** in there. Ten
tests, one per promise in its own docstring, and three of them were written after breaking the module
on purpose: read-once, the five-minute TTL, and the cap. The fourth — that a bad id is not _stored_ —
was written after the obvious version of it **passed with the guard deleted**, because `collect`
refuses a bad id too and "never stored" and "stored but unreadable" look identical from outside.

### Block 4, done 2026-08-19: make the wait honest

- [x] Confirm the narration works when the answer is far away rather than ten seconds away.
- [x] **Verified:** in the browser, on a local model slow enough to make the point.

Watched on a CPU-backed local model rather than a throttled network, which is harsher and more like
the `cax21`. The waiting screen narrated for **126 seconds** and kept counting — four stages, the
last one live, and the line about the phone number and street address having been removed before the
text was sent. No request was held open for any of it.

**Then it ran past the four-minute ceiling, which is the half worth reporting.** `collectResult`
gives up at 4 minutes, and what the person reads is _"That took longer than we can wait for. Trying
again usually works, and nothing was saved."_ — followed by the normal upload page, not a dead end.
Production's local model takes 57s, so the ceiling sits at roughly four times the real wait; the
model that hit it was a stray CPU container, not the one we deploy.

### Block 5: flip it off — rewritten 2026-08-19, because it was wrong

- [ ] Set `HR_RELEASE=true` in Coolify, restart. **Not** "unset `HR_THIRD_PARTY_FOR_ALL`".
- [ ] **Verify:** `/api/processing` reports `thirdPartyForYou: false` and `beta: false` for anonymous;
      a signed-in `pro` account still gets the larger model; an anonymous ingest still produces a real
      `Resume`.

⚠️ **Both halves of the original were wrong, and they would have failed quietly.** `thirdParty` is
`everyone || beta || paid` and beta defaults **on**, so unsetting `HR_THIRD_PARTY_FOR_ALL` changes
nothing at all. And `thirdPartyAvailable` reported whether a provider was _configured_, never whether
this caller could use one — so it was true for everybody either way. The check would have been run,
seen to fail, and blamed on a stale image.

The field is now `thirdPartyConfigured`, with `thirdPartyForYou` beside it carrying the entitlement,
and the exit is one switch that overrides the leftovers (ADR-033).

**Deliberately not flipped:** Edd, 2026-08-19 — the spend is capped by a monthly plan, so there is no
hurry. This waits for pricing, which makes it the same flip as plan 02's.

## Risks

| Risk                                                     | Probability | Impact | Mitigation                                                     |
| -------------------------------------------------------- | ----------- | ------ | -------------------------------------------------------------- |
| A ninety-second wait is still unacceptable even narrated | med         | high   | Block 1's numbers decide this before the work, not after       |
| In-memory results lost on restart mid-job                | high        | low    | TTL plus a clear failure; the visitor retries. Do not persist  |
| An anonymous CV outlives the request in memory           | med         | high   | Short TTL, no disk, no logs. ADR-004 is the constraint         |
| The local model degrades quality even when it finishes   | high        | med    | Measure with `pnpm test:measure`; the free tier must be honest |

## Verification (end-to-end)

With `HR_RELEASE=true`, an anonymous visitor uploads a CV, targets an advert and gets a
real requirement list, with the waiting screen narrating throughout and no request blocking.
