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
- [x] **2026-08-19: EUR 12 per month.** The low end of the range — less friction for a product whose
      name is not known yet, and it leaves room to go up when the plan visibly includes more than it
      does today. Written into `PRICING` in `src/lib/pricing.ts`, not into any page's copy.
- [ ] Decide whether the free tier keeps all twelve designs. Currently it does, and the catalogue
      section on the landing page says so out loud, so changing it is a copy change too.
- [ ] **Verify:** the exact price is written into this file, and the free-tier answer with it.

### Block 2, done 2026-08-19: Stripe, with the VAT obligation named out loud

- [x] **The block's premise was wrong and that is the finding.** "Stripe unless there is a reason,
      confirm it supports DK VAT without extra work" — it does not, and no payment _processor_ does.
      Stripe is not a merchant of record: Stripe Tax calculates and can file, but registering for
      OSS, remitting and filing stays with the seller, from the first consumer sale into the EU.
- [x] **Verify:** ADR-034, which priced the alternative at about €0.50 per subscriber per month
      (€52/month at a hundred) and recommended a merchant of record.
- [x] **Edd chose Stripe and takes the OSS obligation.** Recorded in the ADR rather than hidden in a
      commit, with the volume at which it was going to be revisited anyway.

`automatic_tax` is enabled on the checkout session so the **rate charged** is correct from the first
sale. The registration and the quarterly return are Edd's, and no configuration makes them ours.

### Block 3, built 2026-08-19 · verify open (needs keys)

- [x] A hosted checkout, not a card form. **No card field exists anywhere in this codebase.**
- [x] `POST /api/billing/checkout` creates a session for the signed-in user and returns its URL.
      `automatic_tax` on; `client_reference_id` carries our user id out and back.
- [ ] **Verify:** a test-mode payment reaches Stripe's success page. **Needs `STRIPE_SECRET_KEY` and
      `HR_STRIPE_PRICE_ID`, which is Edd's.** Nothing here proves Stripe accepts the payload.

### Block 4, done 2026-08-19

- [x] `POST /api/billing/webhook`, signature-verified, idempotent by event id.
- [x] Active or trialing → `pro`. Cancelled, paused, `past_due` or disputed → `free`.
- [x] **Verified:** nine tests against a real Postgres, with signatures computed in the test —
      `t=<unix>,v1=hmac-sha256("t.body")` is arithmetic, so the signature built there is the one
      Stripe builds. Replay changes nothing; a stale `active` redelivered after a cancellation does
      not restore the plan; a forged secret and a body edited after signing are both `400` with the
      plan untouched.

Broken deliberately: `constructEventAsync` → `JSON.parse` turns the two forgery tests red, and adding
`past_due` to the paying set turns the third red.

**`Stripe.Dispute` carries no customer.** The first version passed `payment_intent` through as one,
which resolves to no account and files the event as `ignored` — a chargeback that leaves the plan
intact and writes a row claiming otherwise.

### Block 5, done 2026-08-19

- [x] `#pricing` on the landing page: €12, and what free keeps.
- [x] Cancel from the account panel — "Subscription and invoices", which opens Stripe's billing
      portal. Not "Cancel": somebody wanting an invoice or a new card looks in the same place, and a
      cancellation people are unsure worked is a cancellation they call their bank about.
- [x] **Verified in the browser, in both states that exist today:**

| build              | heading                                              | button                               |
| ------------------ | ---------------------------------------------------- | ------------------------------------ |
| beta               | "Free while we are in beta, and one plan afterwards" | none — "Included for everyone"       |
| release, no Stripe | "One plan, and a free tier that is a real product"   | none — "Paid plans are not open yet" |

The third state — released **and** configured, which shows "Get Pro" — needs keys.

**The free column is first and the numbers are derived.** The first version read `4 designs` because
it used `VOICES`, the curated strip further up the page, instead of the catalogue. On a pricing page
that is not an off-by-one: it understates the free tier by two thirds. It now counts `FREE_DESIGNS`
and the structures they span — 12 across 3 — so the sentence cannot go stale when a design is added.

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
