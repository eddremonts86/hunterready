/**
 * The Stripe client, and the one rule that shapes both endpoints that use it.
 *
 * **No card details, ever, anywhere in this codebase.** Not a field, not a placeholder, not a
 * disabled input in a mockup. The checkout is a URL we send somebody to and the card is typed on
 * Stripe's page. That is not caution about PCI paperwork — it is the same instinct as
 * `no-cv-in-logs.test.ts`: the strongest guarantee about data you must not hold is that there is
 * nowhere for it to land.
 *
 * ## Absent is a supported state
 *
 * `resolve()` returns undefined without a key, exactly as `structure/provider.ts` does. Beta ships
 * before pricing does, so a deployment with no Stripe configuration has to boot clean, render the
 * pricing surface honestly, and refuse the checkout with a sentence rather than a 500. It is also
 * every developer's machine.
 *
 * The absence is **announced at startup** — names only, never key material, not even a length — for
 * the same reason `announceProviders` exists: DeepSeek shipped and did not appear in production, and
 * nothing was broken enough to log.
 */
import Stripe from 'stripe'

import { event } from '@/lib/log'

let cached: Stripe | undefined
let announced = false

/**
 * The API version is pinned deliberately.
 *
 * Stripe's SDK defaults to whatever version the *account* is set to in the dashboard, which means
 * the shape of a webhook payload can change because somebody clicked a button in a browser. Pinning
 * moves that change into a diff. When it is bumped, `webhook.test.ts` is what says the event shapes
 * still parse.
 */
const API_VERSION = '2026-07-29.dahlia' as const

export function stripe(): Stripe | undefined {
  const key = process.env.STRIPE_SECRET_KEY
  if (key === undefined || key === '') {
    if (!announced) {
      announced = true
      event('billing.unconfigured', { code: 'no_key' })
    }
    return undefined
  }
  cached ??= new Stripe(key, { apiVersion: API_VERSION })
  return cached
}

/** The signing secret for `/api/billing/webhook`. Separate from the API key and separately absent. */
export function webhookSecret(): string | undefined {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  return secret === undefined || secret === '' ? undefined : secret
}

/**
 * Which Stripe subscription statuses count as paying.
 *
 * `trialing` is included and `past_due` is not, and both are decisions rather than defaults.
 * A trial is a subscription somebody agreed to and Stripe will bill; refusing it during the trial
 * would sell them nothing. `past_due` is a payment that failed — Stripe retries for a while, and
 * during that window the honest answer is that they are not currently paying. If a retry succeeds,
 * the `updated` event flips them back with no action from us.
 *
 * Everything not on this list is not paying, including statuses Stripe has not invented yet, which
 * is the safe direction for a list like this to fail.
 */
const PAYING = new Set(['active', 'trialing'])

export function isPaying(status: string): boolean {
  return PAYING.has(status)
}

/**
 * What one Stripe event means for entitlement, as a fact rather than a branch in a handler.
 *
 * Exported and pure, so `webhook.test.ts` can assert the mapping against real event fixtures without
 * a database, an HTTP request or a signature. The handler then does one thing: apply it.
 *
 * `undefined` for `active` means "this event says nothing about entitlement" — a receipt, an address
 * change, a payment method updated. Those still get written to the ledger, so a redelivery of one is
 * also a no-op and so that "seen and ignored" stays distinguishable from "never arrived".
 */
export function entitlementFromEvent(received: Stripe.Event): {
  active?: boolean
  customerId?: string
  userId?: string
  /**
   * A charge whose customer has to be looked up before this event can be applied.
   *
   * ⚠️ Only disputes, and only because **`Stripe.Dispute` carries no customer** — it has `charge` and
   * `payment_intent` and neither is one. The first version of this passed `payment_intent` through as
   * a customer id, which resolves to no account and records the event as `ignored`: a chargeback that
   * silently leaves the plan intact, with a ledger row saying we handled it.
   *
   * Returned as a *request* rather than resolved here, so this function stays pure and the one place
   * that needs the network is visible in the handler instead of hidden in a mapping.
   */
  lookupChargeCustomer?: string
} {
  switch (received.type) {
    /*
      The only event carrying both identifiers: our `client_reference_id` and Stripe's customer.
      It grants nothing on its own — the subscription events that follow do — but it is where the
      two ids are tied together, and without that every later event is about a stranger.
    */
    case 'checkout.session.completed': {
      const session = received.data.object
      return {
        customerId: customerIdOf(session.customer),
        userId: session.client_reference_id ?? undefined,
        // A completed checkout for a subscription is followed by `customer.subscription.created`.
        // Granting here as well would be two sources for one fact.
        active: undefined,
      }
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.resumed': {
      const subscription = received.data.object
      return {
        customerId: customerIdOf(subscription.customer),
        active: isPaying(subscription.status),
      }
    }

    case 'customer.subscription.deleted':
    case 'customer.subscription.paused': {
      const subscription = received.data.object
      return { customerId: customerIdOf(subscription.customer), active: false }
    }

    /*
      A dispute is the plan's own requirement — "on cancelled, expired or disputed → free" — and it
      is the one that is not a subscription event. Somebody charging back is somebody who should not
      keep the capability while it is argued about.
    */
    case 'charge.dispute.created': {
      const dispute = received.data.object
      const charge =
        typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id
      return { lookupChargeCustomer: charge, active: false }
    }

    default:
      return {}
  }
}

/** Stripe hands back either an id or an expanded object depending on the event and the API version. */
function customerIdOf(
  value: string | { id: string } | null | undefined,
): string | undefined {
  if (value === null || value === undefined) return undefined
  return typeof value === 'string' ? value : value.id
}
