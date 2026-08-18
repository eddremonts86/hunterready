# Plans

One file per open item in
[docs/08-roadmap.md → What is actually open](../08-roadmap.md#what-is-actually-open). The numbers
match: item 7 in the roadmap is `07-*.md` here. When an item closes, close it in the roadmap and say
so at the top of its plan; do not delete the plan, because the reasoning is the part worth keeping.

Each follows `~/Projects/ai-os/specs/spec_template.md`: objective, context, acceptance criteria,
non-goals, blocks of at most 30 minutes with a **Verify** line apiece, risks, end-to-end verification.

**These are plans, not a queue.** Nothing here is started. `specs/current_spec.md` is where a plan
goes when it becomes the active one, and only one is active at a time.

Two constraints every plan below inherits from CLAUDE.md, because they were both learned by shipping
the mistake:

- **Runtime evidence, not builds.** `pnpm build` exiting 0 is not verification. Render work means
  opening the PDF, ingestion work means the accuracy table, UI work means the browser.
- **A feature is not shipped until a person can reach it.** Four features have shipped as schema plus
  documentation with no path from the interface. Acceptance criteria name the screen, not the module.

## The sixteen

| #                                       | Plan                                | Size    | Blocked on            |
| --------------------------------------- | ----------------------------------- | ------- | --------------------- |
| [01](01-pricing-and-payments.md)        | Pricing and payments                | weeks   | two numbers from Edd  |
| [02](02-beta-exit.md)                   | The exit from `HR_BETA_PAID_FREE`   | minutes | item 01               |
| [03](03-name-and-domain.md)             | Name and domain                     | hours   | Edd                   |
| [04](04-adr-030-exit.md)                | The exit from ADR-030               | days    | nothing               |
| [05](05-overlapping-columns-fixture.md) | Overlapping-column fixture          | hours   | a real file           |
| [06](06-photographed-cv-fixture.md)     | Photographed CV fixture             | hours   | a real photo          |
| [07](07-multipage-cv-fixture.md)        | Multi-page CV fixture               | hours   | a real file           |
| [08](08-minimax-provenance.md)          | MiniMax returns no provenance       | days    | nothing               |
| [09](09-spanish-cv-education.md)        | Does the Spanish CV have education? | minutes | one sentence from Edd |
| [10](10-model-routing.md)               | Model routing: build or retire      | days    | a decision            |
| [11](11-verifier-5-instrument.md)       | Verifier 5 has no instrument        | days    | a decision            |
| [12](12-deepseek-v4-pro.md)             | DeepSeek v4-pro empty tool input    | minutes | the vendor            |
| [13](13-deepseek-in-production.md)      | DeepSeek configured in production   | minutes | Edd's credentials     |
| [14](14-provider-display-name.md)       | `provider` returns a hostname       | minutes | nothing               |
| [15](15-production-commit-stamp.md)     | Production reports `build: unknown` | minutes | nothing               |
| [16](16-public-api.md)                  | An API a machine can use            | weeks   | nothing               |

## If you only do three

**14, 15 and 13 are an afternoon between them** and two of the three are one line. They are the
cheapest honest progress on this list, and 15 in particular buys back the "is production serving my
change?" question that costs a round of guessing every time it is asked.

Then **04**, because it is the only item on the list actively spending money.
