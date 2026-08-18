# Current Spec — none active

**Status:** no active Spec · **Updated:** 2026-08-16

The v0.1 Spec was archived to `ai-os/archive/2026-08-16-hunterready-v0.1.md` on 2026-08-16, per its
own §8. It had been reporting "v0.1 complete except the Coolify deploy" while the product ran v0.10 in
production — a stale Spec is worse than no Spec, because it answers "what are we doing?" with
confidence and the wrong answer.

## Where the work actually is

**[docs/08-roadmap.md → What is actually open](../docs/08-roadmap.md#what-is-actually-open)** is the
maintained list. Everything above that section in the roadmap is the record of a shipped release, kept
for its reasoning, not a queue.

**[docs/plans/](../docs/plans/)** holds one plan per open item, numbered to match. They are plans, not
a queue either: nothing there is started, and this file is where one goes when it becomes the active
Spec.

The short version, as of 2026-08-18: **pricing and payments** is still the only thing between here and
v1.0, and sixteen items are open. Four of them were found by verifying the 2026-08-18 deploy rather
than by planning it, and one is new work Edd asked for: an API another application can call.

## Starting the next one

Copy `~/Projects/ai-os/specs/spec_template.md` over this file and fill it in — objective, context,
acceptance criteria, non-goals, blocks of ≤30 min each with a **Verify** line apiece, risks, and
end-to-end verification.

Two constraints this project has learned the hard way and a new Spec should carry:

- **Runtime evidence, not builds.** `pnpm build` exiting 0 is not verification here; that exact
  reading is what put a 500 in production in Block 1. Render work means opening the PDF, ingestion work
  means the accuracy table, UI work means the browser. See CLAUDE.md.
- **A feature is not shipped until a person can reach it.** Four features shipped as schema and
  documentation with no path from the interface. Acceptance criteria should name the screen, not the
  module, and the grep for a module's importers outside `__tests__` costs one command.

## Definition of archive

When a Spec's verifier checks pass, move it to `ai-os/archive/YYYY-MM-DD-hunterready-<name>.md` with a
one-line summary and reset this file to this template. A check that cannot be run is recorded as
**unrun**, never as passed, and carried to the roadmap's open list — that is how the v0.1 Sentry check
was handled.
