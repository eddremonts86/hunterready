# 16 — An API a machine can use

- **Date:** 2026-08-18 · **Status:** blocks 1-7 done · **Blocks:** 8 · **Author:** Edd

> **2026-08-19: the contract became browsable.** `GET /v1/openapi.json` is generated from the Zod
> schemas the runtime validates against, and `/docs` renders it. Block 8 is still Edd's.

> **2026-08-18: blocks 1 to 7 done.** Block 8 is Edd's — pointing his other application at it. The
> walkthrough in `docs/api/README.md` was followed end to end against a booted build, and doing so
> found a contract bug that had been live in production: the model and the rule engine emitted two
> different provenance path formats, and neither the review form nor `shiftProvenance` matched the
> model's. Fixed at the boundary, tested, documented.

## Objective

Let another application do what this one does, over HTTP, authenticated as a machine — starting with
Edd's own app and designed so third parties need a migration of nobody's data, only a new key.

## Context

**Most of this is already built, and that is the first thing to know before sizing it.** Fifteen
routes already cover the whole product: `ingest`, `render`, `render-letter`, `rewrite`, `target`,
`translate`, `cover-letter`, `share`, `shared`, `library`, `resume`, `application`, `processing`,
`progress`, `health`. They take JSON, they return JSON or a PDF, and `/api/render` already answers a
plain `GET` with a fixture.

What is missing is everything around them. Verified on 2026-08-18: **there is no API key anywhere in
this repo.** Every authenticated route reads a session cookie through `currentUserId`. So a machine
can reach the anonymous surface and nothing else, and even that has no stable contract, no version, no
quota and no way to tell one caller from another.

### The question this raises that nothing else on the roadmap does

ADR-023 makes the third-party model conditional on **two** things: entitlement, and the person's own
consent to a **named company**. docs/07 requires that consent be to a named provider, not to "an AI
partner". The consent gate exists because a human is there to answer it.

**A machine is not a person and cannot consent on that person's behalf.** So an API has to answer:
whose CV is this, and who agreed to send it to MiniMax? Three shapes are possible, and the choice is
the architectural decision this plan really contains:

1. **Local model only for API callers.** No transfer, so no consent question. Honest and slow, and it
   makes the free tier the API tier.
2. **The calling application asserts consent**, and records it on its own side. This is what a
   platform integration normally does, and it moves a legal obligation onto a partner by contract.
3. **The end user consents through us** — the API creates a session the person completes in a browser.
   Correct and heavy, and it stops being a machine-to-machine API.

This must be an ADR before any endpoint work. Choosing it by accident inside a handler is how a
privacy promise becomes untrue quietly.

### Decided already

Edd's answer on audience: **both, starting with mine.** So the key model is designed for third
parties and only one key is issued at first. That costs design time now and avoids a migration later.

## Acceptance criteria

- [ ] An ADR answering the consent question above, before any endpoint work.
- [ ] A key can be issued, used, rotated and revoked, and revocation takes effect immediately.
- [ ] `POST /v1/cv` with a file returns a `Resume`; `POST /v1/render` with a `Resume` returns a PDF.
- [ ] Every response includes a request id, and no CV content appears in any log.
- [ ] Rate limits are per key, and exceeding one returns 429 with a retry hint.
- [ ] A key with no plan gets the same entitlements as an anonymous browser visitor, no more.
- [ ] Documentation a stranger can use without reading this repository.

## Non-goals

- Rebuilding the endpoints. They exist; this wraps them.
- Public sign-up for keys. One key for Edd's app first. The model is designed for more, the tap is off.
- Metering and billing per call. That is item 01's shape once it exists, and premature here.
- A GraphQL surface, an SDK, or webhooks out. Each is a second contract to keep.

## Plan

### Block 1: the consent ADR (30 min)

- [ ] Write it. Pick one of the three shapes and say why the other two were refused.
- [ ] **Verify:** the ADR states what an API caller may do with a CV, in one sentence a lawyer could
      read.

### Block 2: the key model (30 min)

- [ ] A table: id, owner, hashed secret, label, created, last used, revoked. **Store a hash, never
      the key.** Show the secret once at creation.
- [ ] A prefix so a leaked key is greppable in logs and recognisable in a paste.
- [ ] **Verify:** a migration runs and rolls back cleanly on a copy of production's schema.

### Block 3: authentication middleware (30 min)

- [ ] `Authorization: Bearer <key>` resolves to an owner, exactly like a session does, so
      `entitlementFor` needs no second code path. **One entitlement function, two ways to identify.**
- [ ] Revocation checked per request, not cached.
- [ ] **Verify:** a revoked key returns 401 on the very next call.

### Block 4: version the surface (30 min)

- [ ] `/v1/*` routes, thin wrappers over the existing handlers. The unversioned routes stay for the
      browser and are explicitly not the contract.
- [ ] **Verify:** `/v1/health` answers, and the browser app still works untouched.

### Block 5: the two that matter (30 min)

- [ ] `POST /v1/cv` — a file in, a `Resume` out, with provenance.
- [ ] `POST /v1/render` — a `Resume` plus a design in, a PDF out. Paid designs obey the same gate.
- [ ] **Verify:** from a second machine, with `curl`, using only the docs. Open the PDF.

### Block 6: limits and observability (30 min)

- [ ] Per-key rate limits reusing `src/lib/rate-limit.ts`. 429 with a retry hint.
- [ ] A request id on every response, and last-used updated per key.
- [ ] **Verify:** exceed a limit deliberately and read the 429. Grep the logs for CV content and find
      none — this is item 11's guard doing double duty.

### Block 7: documentation (30 min)

- [ ] `docs/api/` with authentication, the two endpoints, errors, limits, and a worked `curl`.
- [ ] **Verify:** somebody follows it without opening `src/`. If they cannot, it is not done.

### Block 8: the first real caller (30 min)

- [ ] Point Edd's other app at it and ingest one CV end to end.
- [ ] **Verify:** the CV renders in that app. A passing integration test is not this check.

## Risks

| Risk                                                       | Probability | Impact | Mitigation                                                               |
| ---------------------------------------------------------- | ----------- | ------ | ------------------------------------------------------------------------ |
| Consent decided implicitly in a handler                    | med         | severe | Block 1 gates everything. No endpoint work before the ADR                |
| A key is stored in plaintext                               | low         | severe | Hash at rest, shown once, and a test asserting the column is not the key |
| The API leaks CV content into logs                         | med         | severe | Item 11's guard runs over the API paths too                              |
| `/v1` and the browser routes drift into two products       | high        | med    | `/v1` wraps the same handlers; a duplicated handler is the smell         |
| Third-party keys arrive and the model does not fit         | med         | high   | Designed for many owners now, issued for one                             |
| An API caller spends third-party tokens with nobody paying | high        | high   | Block 3: a key with no plan gets anonymous entitlements, no more         |

## Verification (end-to-end)

From a machine that has never seen this repository: issue a key, `POST /v1/cv` with a real CV, get a
`Resume` with provenance, `POST /v1/render` it, open the PDF and read it back with `pdftotext`. Then
revoke the key and watch the next call return 401.
