# 01 — Pricing and payments

- **Date:** 2026-08-18 · **Status:** price range decided, exact figure open · **blocks 6 → 7** · **Blocks:** 6 · **Author:** Edd

## Objective

Let somebody pay, and let the payment set `auth_users.plan` to `pro`.

## Context

The only item between here and v1.0. docs/09 question 7 settled the shape, so this is work plus two
numbers rather than a design question: **what it costs** and **what the free tier keeps**.

Most of the machinery already exists and that is the thing to notice before estimating this. `plan` is
a column. `THIRD_PARTY_PLANS` is a `Set` with one member. `entitlementFor` reads the plan and returns
two independent flags. The paywall is enforced at `/api/render` and proved against a built server by
`production-parity.parity.test.ts`. Every Pro surface is already labelled. **What is missing is a
provider, a webhook, and an endpoint that writes one column.**

The free tier is already defined by what is not `paid` in `DESIGNS`: twelve designs across three
structures, plus the model on our own hardware. That is a real product and it is the honest half of
the pricing page.

## Acceptance criteria

- [ ] A person can pay and reach `plan: 'pro'` without anyone touching the database by hand.
- [ ] A failed or disputed payment removes the plan, verified by replaying the provider's webhook.
- [ ] The pricing page states the price, the currency, VAT handling, and what the free tier keeps.
- [ ] Cancelling is reachable from the account panel in no more than two clicks.

## Non-goals

- Usage metering or per-CV billing. One plan, one price. Metering arrives with item 16 if ever.
- Annual plans, coupons, trials, referral credit. Each is a second price to reason about.
- Invoicing companies. This is a consumer product; a B2B invoice flow is another product.

## Plan

### Block 0: the name is settled and searched (Edd, added 2026-08-19)

- [ ] The name that will be on the invoice is decided.
- [ ] A trademark search against EUIPO and the Danish register for that name, in classes 9 and 42,
      recorded with the register, the classes and the date.
- [ ] **Verify:** the search is in [plan 03](03-name-and-domain.md), with its date.

Moved here from plan 03, where it sat behind "needed by v1.0" — too late and too vague. **This is
the last moment a rename is cheap.** Once somebody pays, the name is on an invoice, on a payment
provider's account and on a card statement, and changing it stops being a find-and-replace. Today it
is 20 occurrences across 7 files, all documentation.

A clean search is not a legal opinion, and this block does not pretend otherwise. It is the
difference between an unknown and a known.

### Block 1: the two numbers (30 min, Edd)

- [x] **2026-08-18: EUR 10-19 per month.** Edd's range, chosen as professional-tool rather than
      consumption pricing, which sets an expectation about what the plan has to include.
- [ ] Pick the exact figure inside that range. A range is enough to write the plan; a pricing page
      needs one number.
- [ ] Decide whether the free tier keeps all twelve designs. Currently it does, and the catalogue
      section on the landing page says so out loud, so changing it is a copy change too.
- [ ] **Verify:** the exact price is written into this file, and the free-tier answer with it.

### Block 2: choose the provider (30 min)

- [ ] Stripe unless there is a reason. Confirm it supports DK VAT (MOSS/OSS) without extra work,
      because a consumer subscription across the EU is a VAT question before it is a code question.
- [ ] **Verify:** an ADR naming the provider and why, appended not rewritten.

### Block 3: checkout (30 min)

- [ ] A hosted checkout, not a card form. **Never handle card details in this codebase.**
- [ ] `POST /api/billing/checkout` creates a session for the signed-in user and returns its URL.
- [ ] **Verify:** a test-mode payment reaches the provider's success page.

### Block 4: the webhook that sets the plan (30 min)

- [ ] `POST /api/billing/webhook`, signature-verified, idempotent by event id.
- [ ] On subscription active → `plan = 'pro'`. On cancelled, expired or disputed → `plan = 'free'`.
- [ ] **Verify:** replay the same event twice and confirm one row change. Replay a cancellation and
      confirm the entitlement drops on the next `/api/processing`.

### Block 5: the pricing surface (30 min)

- [ ] A pricing section that names the price and what free keeps. The Pro tags already tell somebody
      what they are buying, so this is the number and the list, not a sales page.
- [ ] Cancel from the account panel.
- [ ] **Verify:** in the browser, signed in, on a phone width.

### Block 6: flip beta off (see plan 02)

- [ ] **Verify:** plan 02's end-to-end check.

## Risks

| Risk                                           | Probability | Impact | Mitigation                                                      |
| ---------------------------------------------- | ----------- | ------ | --------------------------------------------------------------- |
| Card data touches this codebase                | low         | severe | Hosted checkout only. No card fields in any form, ever          |
| Webhook replays double-charge or double-grant  | med         | high   | Idempotency by event id, asserted by a test that replays        |
| A cancelled subscription keeps its entitlement | med         | high   | Block 4 verifies the drop, not just the grant                   |
| VAT handled wrong across the EU                | med         | high   | Chosen in block 2 as a provider requirement, not solved in code |
| Beta flips off before checkout works           | med         | high   | Block 6 is last and depends on block 4's verify                 |

## Verification (end-to-end)

A test-mode subscription taken from the pricing page moves an account to `pro`, a paid design renders
for it, cancelling moves it back to `free`, and the same design then returns 402.
