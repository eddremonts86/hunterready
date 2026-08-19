/**
 * `POST /api/billing/webhook` — Stripe says what happened; one column moves.
 *
 * ## The signature is the authentication, and it is the only one
 *
 * This endpoint is public by necessity: Stripe cannot present a cookie or a key. What stands between
 * it and anybody on the internet granting themselves `pro` is the HMAC over the raw body, so two
 * things matter more here than anywhere else in the app.
 *
 * **The body must stay raw.** `constructEventAsync` verifies bytes, and a body that has been parsed
 * and re-serialised is different bytes — key order, whitespace, number formatting. `request.text()`
 * and nothing before it.
 *
 * **An unverified request never reaches the database.** Not to be logged with its contents, not to be
 * "handled leniently" while we work out why the secret is wrong. It is a `400` and it is over.
 *
 * ## Why it answers 200 to events it did nothing about
 *
 * Stripe retries anything that is not `2xx`, for days. An event we have no rule for is not a failure
 * — answering `500` to it would earn an escalating retry storm about a receipt. So the endpoint
 * distinguishes *we could not accept this* (`400`, never retried usefully) from *accepted, and
 * nothing needed doing* (`200`), and writes the second to the ledger so the redelivery is a no-op too.
 */
import { createFileRoute } from '@tanstack/react-router'

import {
  applyBillingEvent,
  linkStripeCustomer,
  userIdForStripeCustomer,
} from '@/db/repository'
import { entitlementFromEvent, stripe, webhookSecret } from '@/lib/stripe'
import { errorEvent, event, requestId } from '@/lib/log'

export const Route = createFileRoute('/api/billing/webhook')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const id = requestId()
        const client = stripe()
        const secret = webhookSecret()

        if (client === undefined || secret === undefined) {
          /*
            503 rather than 200. An unconfigured deployment receiving live webhooks is a
            misconfiguration somebody needs to see, and Stripe's retry is what surfaces it — the
            opposite of the reasoning about unknown event types below, because this is our fault.
          */
          event('billing.webhook_unconfigured', { requestId: id })
          return new Response(null, { status: 503 })
        }

        const signature = request.headers.get('stripe-signature')
        if (signature === null) {
          return Response.json({ error: 'unsigned' }, { status: 400 })
        }

        // Raw. Nothing may parse this before the signature has been checked against it.
        const body = await request.text()

        let stripeEvent
        try {
          stripeEvent = await client.webhooks.constructEventAsync(
            body,
            signature,
            secret,
          )
        } catch {
          /*
            No detail, in the log or the response. A verification failure is either a
            misconfiguration or somebody probing, and telling the second which part was wrong is
            free help. `log.ts` would redact the body anyway; not passing it is the belt.
          */
          errorEvent('billing.webhook_bad_signature', { requestId: id })
          return Response.json({ error: 'bad_signature' }, { status: 400 })
        }

        const outcome = entitlementFromEvent(stripeEvent)

        /*
          A dispute names a charge, not a customer — `Stripe.Dispute` has no customer field — so this
          is the one path that needs the API before it can decide whose plan moves. Resolved here
          rather than in the mapping, so the single place that touches the network is visible.
        */
        let customerId = outcome.customerId
        if (
          customerId === undefined &&
          outcome.lookupChargeCustomer !== undefined
        ) {
          try {
            const charge = await client.charges.retrieve(
              outcome.lookupChargeCustomer,
            )
            customerId =
              typeof charge.customer === 'string'
                ? charge.customer
                : (charge.customer?.id ?? undefined)
          } catch {
            errorEvent('billing.dispute_lookup_failed', { requestId: id })
          }
        }

        /*
          Two ways to know who this is, and the order matters. `client_reference_id` is ours and only
          `checkout.session.completed` carries it; everything after names the customer. Learning the
          link on that first event is what makes every later one resolvable.
        */
        let userId = outcome.userId
        if (userId !== undefined && customerId !== undefined) {
          await linkStripeCustomer({ userId, customerId })
        } else if (userId === undefined && customerId !== undefined) {
          userId = await userIdForStripeCustomer(customerId)
        }

        const applied = await applyBillingEvent({
          eventId: stripeEvent.id,
          provider: 'stripe',
          kind: stripeEvent.type,
          ...(userId === undefined ? {} : { userId }),
          ...(outcome.active === undefined ? {} : { active: outcome.active }),
        })

        /*
          The event type is allowlisted for strings in `log.ts` under `kind`; the outcome is a closed
          vocabulary. No customer, no e-mail, no amount — the same rule the ledger's columns enforce.
        */
        event('billing.webhook', {
          requestId: id,
          billingKind: stripeEvent.type,
          billingOutcome: applied.outcome,
          applied: applied.applied,
        })

        return Response.json({ received: true, requestId: id })
      },
    },
  },
})
