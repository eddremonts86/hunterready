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
