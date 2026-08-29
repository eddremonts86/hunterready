# 02 — The exit from beta

- **Date:** 2026-08-18 · **Status:** block 1 open and not blocked on pricing; block 2 waits for item 01 · **Blocks:** 2 · **Author:** Edd

> **2026-08-19: the switch changed and got bigger, ADR-033.** The exit is now `HR_RELEASE=true`, one
> variable that overrides `HR_BETA_PAID_FREE`, `HR_THIRD_PARTY_FOR_ALL` and `HR_UNLOCK_DESIGNS`
> instead of defaulting them off, and takes the word "beta" out of the interface at the same instant.
> This plan and plan 04 were always the same lever seen from two sides; they are now literally one.
> The blocks below still describe what has to be true before it is flipped — the switch is built and
> proved, the pricing is not.

## Objective

Turn beta off on the day pricing opens, without anyone discovering it by losing a feature.

## Context

Beta gives every Pro capability to everyone: the larger model, all 103 designs, the mixed axes, saved
CVs. It defaults on, so production is running it, and **`HR_RELEASE=true` ends it** — not
`HR_BETA_PAID_FREE=false`, which was the answer when this plan was written and is now only the
finer-grained half of it (ADR-033).

This is not a separate decision from item 01 — it is the same switch seen from the other side. It has
its own plan because it lives in a different file from the checkout and would otherwise be found by a
user rather than by us.

**The label work is already done and it is why this is safe.** Every Pro capability carries a `ProTag`
drawn from the capability and never from the entitlement, so nothing on screen changes meaning when
the switch flips: a person using the design catalogue today can already see it is Pro. That was the
whole point of doing the tag at the same time as the giveaway.

**The off state is already tested**, in both places it can rot: `entitlements.test.ts` pins the plan
logic with beta forced off, and `production-parity.parity.test.ts` boots a second server with
`HR_BETA_PAID_FREE=false` and asserts 402 `axes_locked` and 402 `design_locked` against a real build.

## Acceptance criteria

- [ ] Production sets `HR_RELEASE=true` and `/api/processing` reports `paidDesigns: false` and
      `beta: false` for an anonymous visitor.
- [ ] Anyone who used a Pro capability during beta was told before it stopped, not after.
- [ ] The landing page, the FAQ and the design catalogue no longer say "free while we are in beta".

## Non-goals

- Grandfathering beta users into a free paid tier. That is a pricing decision, not this switch.
- Removing the switch. It stays, because a promotional period is a thing this product will want again.

## Plan

### Block 1: say it before doing it (30 min) — **not blocked on pricing; it can be drafted today**

- [ ] Draft the notice: what becomes paid, when, and what stays free. Twelve designs and the model on
      our own hardware stay free, which is the sentence that matters and is easy to bury.
- [ ] Decide the channel. There is no mailing list; signed-in accounts have addresses and anonymous
      visitors have none, so the landing page carries it for the second group.
- [ ] **Verify:** read the notice against the copy the app has been showing. If any of it is a
      surprise, the tag work failed somewhere and that surface needs finding.

### Block 2: flip it and check both halves (20 min) — **rewritten 2026-08-23, it said the wrong thing**

- [ ] Set **`HR_RELEASE=true`** in Coolify, restart.
- [ ] **Verify:** `/api/processing` reports `paidDesigns: false` **and `beta: false`**;
      `/api/render?template=sidebar&theme=onyx` returns 402 `design_locked`; a free design still
      returns 200; a signed-in `pro` account gets 200 on both.
- [ ] **Verify the word is gone from the interface**, which is now something to check rather than to
      do: load the landing page and confirm no "free while we are in beta" anywhere, and that the
      pricing heading has changed to "One plan, and a free tier that is a real product".

⚠️ **What this block said until 2026-08-23, and why it mattered.** It said "set `HR_BETA_PAID_FREE=false`"
and "remove the beta sentences from the landing page, the FAQ, the axes panel and the gallery". Both
were superseded by ADR-033 on 2026-08-19 — the banner at the top of this file said so while the block
below still gave the old steps, which is the worst arrangement of the two.

Following it would have produced **a partial exit**: `HR_BETA_PAID_FREE=false` closes the beta grant
and leaves `HR_THIRD_PARTY_FOR_ALL` still handing the third-party model to every anonymous visitor,
which is roadmap item 4 and the thing that costs money today. And the copy edits are now done by the
switch: `proNote` and `ProTag` read `useInBeta()`, and the pricing section reads `consent.beta`, which
`/api/processing` fills from `inBeta()`. Hand-editing them would have deleted sentences the code was
already withholding, on a release where the two states have to agree.

## Risks

| Risk                                                               | Probability | Impact | Mitigation                                                        |
| ------------------------------------------------------------------ | ----------- | ------ | ----------------------------------------------------------------- |
| Flipped before a checkout exists, so people lose it and cannot buy | med         | high   | Block 2 happens after item 01 ships, never before                 |
| Copy still promises beta after the flip                            | high        | med    | The `PRO_IN_BETA` constant makes the grep exhaustive              |
| Somebody's saved CV becomes unreachable                            | low         | high   | Saved CVs are storage, not a render gate; confirm before flipping |

## Verification (end-to-end)

An anonymous visitor sees the paywall, a `pro` account does not, the free twelve designs render for
both, and no page still says the word beta about pricing.
