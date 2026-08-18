# 15 — Production cannot say which commit it is serving

- **Date:** 2026-08-18 · **Status:** draft · **Blocks:** 2 · **Author:** Edd

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

### Block 1: get the commit into the Coolify build (25 min)

- [ ] Read `docs/operations/deploy-runbook.md` §"Coolify configuration" for how build args are set.
- [ ] Prefer Coolify's own commit variable if it exposes one; fall back to a build arg set by the
      deploy workflow, which already knows `github.sha`.
- [ ] **Verify:** deploy and read `/api/health`. The SHA must equal `git rev-parse HEAD` on `master`.

### Block 2: point `pnpm stale` at a URL (20 min)

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
