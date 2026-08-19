# Plans

One file per open item in
[docs/08-roadmap.md → What is actually open](../08-roadmap.md#what-is-actually-open). The numbers
match: item 7 in the roadmap is `07-*.md` here. When an item closes, close it in the roadmap and say
so at the top of its plan; do not delete the plan, because the reasoning is the part worth keeping.

Each follows `~/Projects/ai-os/specs/spec_template.md`: objective, context, acceptance criteria,
non-goals, blocks of at most 30 minutes with a **Verify** line apiece, risks, end-to-end verification.

**These were plans, not a queue.** That stopped being true on 2026-08-18, when most of them were
worked through in one pass; each one's status header says where it stands and the table below
summarises it. `specs/current_spec.md` is where a plan goes when it becomes the active one, and only
one is active at a time.

Two constraints every plan below inherits from CLAUDE.md, because they were both learned by shipping
the mistake:

- **Runtime evidence, not builds.** `pnpm build` exiting 0 is not verification. Render work means
  opening the PDF, ingestion work means the accuracy table, UI work means the browser.
- **A feature is not shipped until a person can reach it.** Four features have shipped as schema plus
  documentation with no path from the interface. Acceptance criteria name the screen, not the module.

## The sixteen

| #                                       | Plan                                | Size    | Blocked on            |
| --------------------------------------- | ----------------------------------- | ------- | --------------------- |
| [01](01-pricing-and-payments.md)        | Pricing and payments                | weeks   | one number from Edd   |
| [02](02-beta-exit.md)                   | The exit from `HR_BETA_PAID_FREE`   | minutes | item 01               |
| [03](03-name-and-domain.md)             | Name and domain                     | hours   | Edd                   |
| [04](04-adr-030-exit.md)                | The exit from ADR-030               | minutes | Coolify, Edd (5 of 5) |
| [05](05-overlapping-columns-fixture.md) | Overlapping-column fixture          | hours   | a real file           |
| [06](06-photographed-cv-fixture.md)     | Photographed CV fixture             | hours   | a real photo          |
| [07](07-multipage-cv-fixture.md)        | Multi-page CV fixture               | hours   | a real file           |
| [08](08-minimax-provenance.md)          | MiniMax returns no provenance       | —       | **closed, was ours**  |
| [09](09-spanish-cv-education.md)        | Does the Spanish CV have education? | —       | **closed, no bug**    |
| [10](10-model-routing.md)               | Model routing: build or retire      | —       | **closed, ADR-031**   |
| [11](11-verifier-5-instrument.md)       | Verifier 5 has no instrument        | minutes | a decision (4 of 4)   |
| [12](12-deepseek-v4-pro.md)             | DeepSeek v4-pro empty tool input    | minutes | the vendor            |
| [13](13-deepseek-in-production.md)      | DeepSeek configured in production   | minutes | Coolify, Edd (1 of 2) |
| [14](14-provider-display-name.md)       | `provider` returns a hostname       | —       | **closed**            |
| [15](15-production-commit-stamp.md)     | Production reports `build: unknown` | minutes | Coolify, Edd (1 of 2) |
| [16](16-public-api.md)                  | An API a machine can use            | hours   | Edd (8 of 8)          |

"(n of m)" is the block still open. Four are closed, and **not one of the twelve left is waiting on
code** — they want a price, a domain, three real CV files, four Coolify variables, a vendor fix, or
one decision.

## What is left that is actually code

**Nothing**, as of 2026-08-19.

Every remaining item is waiting on a price, a domain, three real CV files, a Coolify variable, a
vendor fix, or one decision about an error reporter. The last two code items closed on the same day:
04 took the model call off the blocking path, and 08 turned out to be one missing entry in a JSON
Schema we were sending ourselves.
