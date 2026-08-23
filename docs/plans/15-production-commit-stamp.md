# 15 — Production cannot say which commit it is serving

- **Date:** 2026-08-18 · **Status:** draft · **Blocks:** 2 · **Author:** Edd

> **2026-08-18: Block 2 done.**
>
> **2026-08-23: Block 1 done in code, and its premise was wrong.** It said "Block 1 needs Coolify to
> pass HR_COMMIT, which the deploy workflow cannot do for it", which parked the item behind Edd for
> five days. Nobody has to pass anything: Coolify injects `SOURCE_COMMIT` on its own and `/api/health`
> reads it at run time. Verified on a real build; **unverified against the live site**, which needs one
> deploy.

## Objective

Make `/api/health` on production report the deployed commit, so `pnpm stale` works against the site
that matters.

## Context

`/api/health` returns `"build":"unknown"` in production. The Dockerfile takes `ARG HR_COMMIT` and the
runtime stage sets it as an env var, `pnpm app` passes it locally, and Coolify passes nothing.

The local half of this shipped on 2026-08-18 and the reason it exists is on the record: three times in
one session, "why don't I see my change?" turned out to be an image built before the change, and each
time it cost a round of guessing at the browser first. Production has no answer to that question at
all, and production is where the guess is expensive.

**One trap already found, in the same shape.** `COPY . .` copies the working tree while `HR_COMMIT`
stamps a commit, so a build started between writing a file and committing it reports the older hash
with the newer code. Whatever mechanism is chosen must read the commit at build time, not at some
earlier moment.

## Acceptance criteria

- [ ] `curl https://hunterready.eduardoinerarte.dk/api/health` returns the deployed commit SHA.
- [ ] `pnpm stale --url https://hunterready.eduardoinerarte.dk` answers correctly for the live site.

## Non-goals

- A version number or a release name. The commit is the useful identifier; a tag is a second thing to
  keep in sync.
- Exposing anything else about the build. A SHA is not sensitive; a build log is.

## Plan

### Block 1, done in code 2026-08-23 · live verify open (needs one deploy)

- [x] **Coolify's own commit variable exists and is the answer**, which is the first bullet this block
      wrote and the one it then talked itself out of. `SOURCE_COMMIT` — "commit hash of the source
      code" — is a predefined variable, so no build arg and no workflow change is needed. The build arg
      stays for `pnpm app`, where it is the more precise of the two.
- [x] **Read at run time, not baked.** Coolify documents that `SOURCE_COMMIT` is withheld from Docker
      builds by default to preserve layer caching, and enabling "Include Source Commit in Build" would
      have been another click for Edd. Reading it from the environment at request time needs neither,
      and `docker-compose.yml` now passes it through.
- [x] **The trap that would have made this a no-op.** `ARG HR_COMMIT=unknown` plus `ENV HR_COMMIT=$HR_COMMIT`
      means the variable exists in every build, holding the string `"unknown"` — so the natural
      `process.env.HR_COMMIT ?? process.env.SOURCE_COMMIT` never reaches the fallback. It would have
      read correctly in review, shipped, and changed nothing. `src/lib/build-stamp.ts` treats `unknown`
      and empty string as absent; that is the third case in `build-stamp.test.ts` and the reason the
      file is worth having.
- [x] **Verified on a real build.** `.claude/launch.json` → `hunterready-release-configured` serves with
      `SOURCE_COMMIT=$(git rev-parse HEAD)` and no build arg, and `/api/health` answered
      `"build": "532e0d79315445d2c50c5241271e937b8c61f342"` — the exact SHA of `HEAD`.
- [ ] **Verify against production:** deploy and read `/api/health`. The SHA must equal
      `git rev-parse origin/master`. This is the half no local rehearsal can stand in for, because what
      it tests is whether Coolify really sets the variable for a compose stack — the docs say
      predefined variables are injected into the application, and the only proof is the site.

### Block 2, done 2026-08-18: point `pnpm stale` at a URL (20 min)

- [ ] Give `scripts/dev/stale.mjs` an optional `--url`, defaulting to `http://localhost:3100`.
- [ ] Compare against `origin/master` rather than local HEAD when the target is not localhost, because
      local HEAD is not what production should be serving.
- [ ] **Verify:** run it against production immediately after a deploy (green) and again with one
      local commit on top (must not report production behind).

## Risks

| Risk                                              | Probability | Impact | Mitigation                                                    |
| ------------------------------------------------- | ----------- | ------ | ------------------------------------------------------------- |
| Coolify rebuilds without the arg and stamps blank | med         | low    | Keep `unknown` as the ARG default; a blank is not a wrong SHA |
| The SHA is read before the merge commit exists    | low         | med    | Use the workflow's `github.sha`, which is the merged commit   |

## Verification (end-to-end)

Deploy, then `pnpm stale --url https://hunterready.eduardoinerarte.dk` prints
`✔ serving HEAD (<sha>)` and the SHA matches `git rev-parse origin/master`.
