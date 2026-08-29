/**
 * What the plan costs, in one place, so no page invents a second answer.
 *
 * ## Why a module and not a string in the pricing section
 *
 * The number appears on the pricing surface, in the checkout the person is sent to, and on whatever
 * receipt Stripe emails them. Two of those three come from Stripe's Price object, and if this file
 * disagreed with it the interface would advertise one figure and charge another — which is the one
 * pricing bug you cannot apologise your way out of.
 *
 * So this is the **display** copy of a number whose authority lives in Stripe, and
 * `pricing.test.ts` exists to say that out loud rather than to check arithmetic. When the price
 * changes it changes in the Stripe dashboard first and here second, and `HR_STRIPE_PRICE_ID` is what
 * ties the two together.
 *
 * ## The free tier is half the pricing page
 *
 * `DESIGNS` already defines it: everything not marked `paid`. Twelve designs across three
 * structures, plus the model on our own hardware — which is the *more private* half, because that
 * CV never leaves this infrastructure (ADR-023). That is a real product and the page says so.
 * Nothing here needs to list it; it is derived, and a hand-written list would go stale the first
 * time a design is added.
 */

/** EUR 12 per month. Edd, 2026-08-19, the low end of the €10–19 range (plan 01, block 1). */
export const PRICING = {
  amount: 12,
  currency: 'EUR',
  /** For copy. `Intl` would localise the separator per visitor and the price is one figure, not a range. */
  display: '€12',
  period: 'month',
} as const

/**
 * The Stripe Price the checkout charges. **Authority for the amount, unlike the constant above.**
 *
 * Absent is a supported state and it is the one every deployment starts in: `hasCheckout()` is false,
 * the pricing surface says so plainly, and nothing 500s. That matters because beta ships before
 * pricing does, and a missing environment variable must not be the reason a landing page breaks.
 */
export function stripePriceId(): string | undefined {
  const id = process.env.HR_STRIPE_PRICE_ID
  return id === undefined || id === '' ? undefined : id
}

/** Whether this deployment can actually take money. Both halves, because one without the other is a dead button. */
export function hasCheckout(): boolean {
  const key = process.env.STRIPE_SECRET_KEY
  return key !== undefined && key !== '' && stripePriceId() !== undefined
}
