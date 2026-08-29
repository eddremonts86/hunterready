/**
 * `POST /api/billing/portal` — a URL where somebody can cancel, in two clicks.
 *
 * ## Why cancelling is Stripe's page and not ours
 *
 * The plan's acceptance criterion is "cancelling is reachable from the account panel in no more than
 * two clicks", and the shortest honest route to that is Stripe's own billing portal: it cancels,
 * shows invoices, updates the card, and it is the same page whatever we later change here.
 *
 * Building our own would mean a confirmation dialog nobody tested, a `subscriptions.cancel` call that
 * can fail halfway, and a person who clicked cancel and does not know whether it worked. **A
 * cancellation that is hard to be sure of is a cancellation people call their bank about**, which is
 * a chargeback, which is the one billing event that costs more than the subscription.
 *
 * Nothing here grants or removes a plan. The portal produces webhook events like anything else and
 * `/api/billing/webhook` is still the only path to the `plan` column — one door, so a cancellation
 * made here and one made in Stripe's dashboard cannot behave differently.
 */
import { createFileRoute } from '@tanstack/react-router'

import { billingIdentity } from '@/db/repository'
import { currentUserId } from '@/lib/session'
import { errorEvent, event, requestId } from '@/lib/log'
import { stripe } from '@/lib/stripe'

export const Route = createFileRoute('/api/billing/portal')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const id = requestId()

        const userId = await currentUserId(request)
        if (userId === undefined) {
          return Response.json(
            { error: 'unauthorized', message: 'Sign in first.', requestId: id },
            { status: 401 },
          )
        }

        const client = stripe()
        const account = await billingIdentity(userId)

        /*
          No customer means they have never been through checkout, so there is no portal to open and
          nothing to cancel. `404` rather than `503`: the deployment is fine, this person simply has
          no subscription — and telling them "billing is unavailable" would be a lie they might act
          on.
        */
        if (client === undefined || account?.customerId === undefined) {
          return Response.json(
            {
              error: 'no_subscription',
              message: 'There is no subscription on this account.',
              requestId: id,
            },
            { status: 404 },
          )
        }

        const { origin } = new URL(request.url)

        try {
          const session = await client.billingPortal.sessions.create({
            customer: account.customerId,
            return_url: `${origin}/`,
          })
          event('billing.portal_opened', { requestId: id })
          return Response.json(
            { url: session.url, requestId: id },
            { headers: { 'cache-control': 'no-store' } },
          )
        } catch (error: unknown) {
          // The code, never the message: Stripe quotes the request back, customer id included.
          errorEvent('billing.portal_failed', {
            requestId: id,
            code: error instanceof Error ? error.name : 'unknown',
          })
          return Response.json(
            {
              error: 'portal_failed',
              message: 'We could not open the billing page. Please try again.',
              requestId: id,
            },
            { status: 502 },
          )
        }
      },
    },
  },
})
