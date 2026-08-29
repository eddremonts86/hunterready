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

| #                                       | Plan                                | Size    | Blocked on                              |
| --------------------------------------- | ----------------------------------- | ------- | --------------------------------------- |
| [01](01-pricing-and-payments.md)        | Pricing and payments                | weeks   | the name, one answer, three Stripe keys |
| [02](02-beta-exit.md)                   | The exit from beta                  | minutes | block 1 nothing, block 2 item 01        |
| [03](03-name-and-domain.md)             | Name and domain                     | hours   | ten minutes at DKPTO                    |
| [04](04-adr-030-exit.md)                | The exit from ADR-030               | minutes | Coolify, Edd (5 of 5)                   |
| [05](05-overlapping-columns-fixture.md) | Overlapping-column fixture          | hours   | a real file                             |
| [06](06-photographed-cv-fixture.md)     | Photographed CV fixture             | hours   | a real photo                            |
| [07](07-multipage-cv-fixture.md)        | Multi-page CV fixture               | hours   | a real file                             |
| [08](08-minimax-provenance.md)          | MiniMax returns no provenance       | —       | **closed, was ours**                    |
| [09](09-spanish-cv-education.md)        | Does the Spanish CV have education? | —       | **closed, no bug**                      |
| [10](10-model-routing.md)               | Model routing: build or retire      | —       | **closed, ADR-031**                     |
| [11](11-verifier-5-instrument.md)       | Verifier 5 has no instrument        | minutes | a decision (4 of 4)                     |
| [12](12-deepseek-v4-pro.md)             | DeepSeek v4-pro empty tool input    | minutes | `DEEPSEEK_API_KEY` — same as 13         |
| [13](13-deepseek-in-production.md)      | DeepSeek configured in production   | minutes | `DEEPSEEK_API_KEY` — same as 12         |
| [14](14-provider-display-name.md)       | `provider` returns a hostname       | —       | **closed**                              |
| [15](15-production-commit-stamp.md)     | Production reports `build: unknown` | minutes | one deploy (code done 2026-08-23)       |
| [16](16-public-api.md)                  | An API a machine can use            | hours   | Edd (8 of 8)                            |

"(n of m)" is the block still open. Four are closed.

**The tick boxes below the banners are not maintained, and the banner is the truth.** Two conventions
grew side by side: some plans tick as they go (01, 03, 04, 08, 15), others record progress only in the
`>` note at the top and never tick (11, 13, 16). So 08, 09, 10 and 14 read DONE with 4, 10, 11 and 5
boxes unticked, and 16 says blocks 1–7 are done above 27 unticked boxes. Read the banner, then the
block headings, and treat a bare box as unknown rather than as open.

## What is left that is actually code

**This section said "Nothing, as of 2026-08-19" and it was already wrong when it was written.**

Plan 01's blocks 2 to 5 had shipped that same day, and three code defects were sitting inside them,
found on 2026-08-23 by reading `src/` instead of these status headers:

- `docker-compose.yml` passed **none** of the three Stripe variables, so setting them in Coolify would
  have done nothing — and an unset variable and an unreachable one produce the same sentence on the
  pricing page, so block 3's verify would have been debugged in Stripe's dashboard.
- Nothing read `?billing=done`. A person paid and came back to a page that acknowledged it in no way.
- `pricing.test.ts` was named in a docblock and did not exist.

Two more followed from the same reading: `/api/render` told a Hebrew CV to "try again" forever
(ADR-035), and item 15 was parked behind Edd on a premise that was false — Coolify injects
`SOURCE_COMMIT` and nobody has to set anything.

The claim was not a lie. It was **inferred from the plans rather than checked against the code**, which
is the same failure the roadmap has had twice, one level up. The honest version:

> Every remaining item is waiting on a price, a name, three real CV files, one credential, a vendor
> fix, a deploy, or a decision — **as far as anybody has looked.** The last time that sentence was
> written it survived four days before `src/` disproved it, so re-derive it, do not inherit it.
