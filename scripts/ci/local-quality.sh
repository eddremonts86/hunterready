#!/usr/bin/env bash
#
# Runs the `quality` job from .github/workflows/quality.yml on this machine.
#
# The point is not to re-type the commands — it is to reproduce the *environment*, because that is
# where this project's divergences actually come from:
#
#   * **NODE_ENV.** Vitest sets `NODE_ENV=test` by default, which makes Vite emit the *development*
#     JSX transform into a bundle running against production React: every SSR render then dies with
#     "jsxDEV is not a function". Found in v0.1 Block 1b. Pinned to production here and in the
#     workflow, and the two must agree.
#   * **System binaries.** LibreOffice (`.doc`), Tesseract and poppler (OCR) live in the Docker image
#     and deliberately not on a laptop (ADR-012). `pnpm test` therefore *skips* those suites on a
#     developer machine and reports green on code it never executed — 176 tests instead of 183. The
#     Docker `test` stage is the only place they run, so it is a step here rather than an optional
#     extra.
#   * **The WASM render path.** `vite build` exits 0 without emitting the renderer's WASM; only a
#     real request against a built server proves it. That is what `test:parity` does, and it is the
#     one failure this project has actually shipped to production.
#   * **A database.** `repository.test.ts`, `webhook.test.ts` and `already-paying.test.ts` skip
#     themselves without a connection string — 42 tests, including every assertion about erasure,
#     encryption at rest and Stripe. The workflow now runs a Postgres service, so without this the
#     local gate would measure 42 fewer tests than the thing it exists to reproduce.
#
# Usage:
#   pnpm ci:local            # every step
#   pnpm ci:local --fast     # skip the two Docker steps (the slow tail)
#
# `--fast` is for iterating on a unit-test failure. It is not a gate: it cannot see anything that
# needs LibreOffice, Tesseract, or a built server.

set -uo pipefail

cd "$(dirname "$0")/../.." || exit 1

FAST=0
for arg in "$@"; do
  [ "$arg" = "--fast" ] && FAST=1
done

# Pinned, for the reason in the header. Never inherit this one.
export NODE_ENV=production

# The `db` service the dev loop already needs, if it happens to be up. Not started here: a gate that
# starts containers is a gate that leaves them running.
DB_PORT="${HR_DB_PORT:-5433}"
DB_UP=0
if (exec 3<>"/dev/tcp/127.0.0.1/${DB_PORT}") 2>/dev/null; then
  # ⚠️ Only this one line out of `.env`, never `set -a; . ./.env`. Sourcing the file drags in
  # `HR_THIRD_PARTY_FOR_ALL` and the provider keys, which flip eight entitlement and DeepSeek
  # assertions and read exactly like a regression in code that is fine. Cost an hour once.
  DB_PASSWORD="$(sed -n 's/^POSTGRES_PASSWORD=//p' .env 2>/dev/null | head -1)"
  if [ -n "${DB_PASSWORD}" ]; then
    export DATABASE_MIGRATION_URL="postgres://hunterready_owner:${DB_PASSWORD}@localhost:${DB_PORT}/hunterready"
    # Without it the two ADR-021 assertions go red rather than skipping — see the note in the
    # workflow. Generated, unless the shell already carries one.
    export DATA_ENCRYPTION_KEY="${DATA_ENCRYPTION_KEY:-$(openssl rand -hex 32)}"
    DB_UP=1
  fi
fi

failed=()
step() {
  local name="$1"
  shift
  echo
  echo "── $name ─────────────────────────────────────────────────────────────"
  if "$@"; then
    echo "   ✓ $name"
  else
    echo "   ✗ $name" >&2
    failed+=("$name")
  fi
}

# Every step runs even after one fails, so a push reports the whole picture rather than the first
# thing to break. Iterating one failure at a time is what makes a gate feel slow.
step "format"    pnpm exec prettier --check .
step "lint"      pnpm exec eslint
step "typecheck" pnpm exec tsc --noEmit

# Applied before the suites read it, the same way the workflow and the deploy do. Idempotent, but it
# is a write against the dev database — so a branch carrying an unmerged migration leaves it applied
# after you switch away, which is also the only state in which its tests could have run.
if [ "$DB_UP" -eq 1 ]; then
  step "schema" pnpm db:migrate
else
  echo
  echo "── no database on :${DB_PORT} ─────────────────────────────────────────"
  echo "   42 persistence, billing and encryption tests will skip. CI runs them."
  echo "   docker compose -f docker-compose.yml -f docker-compose.local.yml up -d db"
fi

step "unit"      pnpm exec vitest run

if [ "$FAST" -eq 1 ]; then
  echo
  echo "── skipped (--fast): docker-suite, parity ─────────────────────────────"
  echo "   These cover the .doc, OCR and WASM render paths. --fast cannot gate them."
else
  # The suites that need system binaries. Same Dockerfile the deploy builds, so a pass here is also
  # evidence the image still builds.
  step "docker-suite" bash -c 'docker build --target test -t hunterready:test . && docker run --rm hunterready:test'
  # Builds, boots a server, requests the real routes.
  step "parity" pnpm exec vitest run --config vitest.parity.config.ts
fi

echo
if [ ${#failed[@]} -eq 0 ]; then
  echo "ci:local — green."
  exit 0
fi

echo "ci:local — ${#failed[@]} step(s) failed:" >&2
for name in "${failed[@]}"; do echo "  ✗ $name" >&2; done
exit 1
