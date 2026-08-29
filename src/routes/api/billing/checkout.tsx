/**
 * `POST /api/billing/checkout` — a URL to go and pay at, and nothing more.
 *
 * **No card details touch this codebase.** Not a field, not a placeholder, not a disabled input in a
 * mockup. This endpoint asks Stripe for a hosted Checkout Session and hands back its URL; the card is
 * typed on Stripe's page. That is the same instinct as `no-cv-in-logs.test.ts` — the strongest
 * guarantee about data you must not hold is that there is nowhere for it to land.
 *
 * ## Why it refuses rather than 500s when nothing is configured
 *
 * Beta shipped before pricing did, so a deployment with no `STRIPE_SECRET_KEY` is the normal state
 * today and every developer's machine besides. It answers `503` with a sentence a person can read,
 * and the pricing surface asks `/api/processing` first so the button is not there to press.
 */
import { createFileRoute } from '@tanstack/react-router'

import { billingIdentity } from '@/db/repository'
import { currentUserId } from '@/lib/session'
import { errorEvent, event, requestId } from '@/lib/log'
import { hasCheckout, stripePriceId } from '@/lib/pricing'
import { stripe } from '@/lib/stripe'

export const Route = createFileRoute('/api/billing/checkout')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const id = requestId()

        /*
          Signed in, and no way around it. The whole point of the session is that it says *who* is
          paying: a checkout started by an anonymous visitor produces a subscription with no account
          to attach to, and the webhook that follows is about a stranger.
        */
        const userId = await currentUserId(request)
        if (userId === undefined) {
          return Response.json(
            {
              error: 'unauthorized',
              message:
                'Sign in first, so the plan has an account to belong to.',
              requestId: id,
            },
            { status: 401 },
          )
        }

        const client = stripe()
        const price = stripePriceId()
        if (!hasCheckout() || client === undefined || price === undefined) {
          event('billing.checkout_unconfigured', { requestId: id })
          return Response.json(
            {
              error: 'not_configured',
              message: 'Paid plans are not open yet.',
              requestId: id,
            },
            { status: 503 },
          )
        }

        const account = await billingIdentity(userId)
        if (account === undefined) {
          return Response.json(
            {
              error: 'unauthorized',
              message:
                'Sign in first, so the plan has an account to belong to.',
              requestId: id,
            },
            { status: 401 },
          )
        }

        /*
          Whatever origin the person actually reached, not a constant. The same reasoning as
          `/v1/openapi.json`: a hardcoded production URL sends somebody testing a preview build back
          to the live site mid-payment, and the domain is moving this week besides.
        */
        const { origin } = new URL(request.url)

        try {
          const session = await client.checkout.sessions.create({
            mode: 'subscription',
            line_items: [{ price, quantity: 1 }],
            /*
              Our own user id, travelling out and back. `checkout.session.completed` is the only event
              that carries it, and it is where the account and Stripe's customer get tied together —
              every subscription event afterwards names only the customer.
            */
            client_reference_id: userId,
            /*
              An existing customer if there is one, an e-mail if there is not. Never both: Stripe
              rejects the pair, and creating a second customer for somebody who already has one is
              how a person ends up paying twice and cancelling once.
            */
            ...(account.customerId === undefined
              ? { customer_email: account.email }
              : { customer: account.customerId }),
            /*
              ADR-034: Edd took the OSS obligation rather than a merchant of record, so this is what
              makes the *rate charged* correct from the first sale. Registering in Denmark and filing
              the quarterly return is still his, and no flag here changes that.
            */
            automatic_tax: { enabled: true },
            success_url: `${origin}/?billing=done`,
            cancel_url: `${origin}/?billing=cancelled`,
          })

          if (session.url === null) {
            errorEvent('billing.checkout_no_url', { requestId: id })
            return Response.json(
              {
                error: 'checkout_failed',
                message: 'We could not start the checkout. Please try again.',
                requestId: id,
              },
              { status: 502 },
            )
          }

          // Counts and codes. Never the e-mail, never the customer, never the amount.
          event('billing.checkout_created', { requestId: id })
          return Response.json(
            { url: session.url, requestId: id },
            { headers: { 'cache-control': 'no-store' } },
          )
        } catch (error: unknown) {
          /*
            The code, never the message. Stripe's errors quote the request back — including the
            e-mail address we sent — and an error body is a place personal data leaves by (docs/07).
          */
          errorEvent('billing.checkout_failed', {
            requestId: id,
            code: error instanceof Error ? error.name : 'unknown',
          })
          return Response.json(
            {
              error: 'checkout_failed',
              message: 'We could not start the checkout. Please try again.',
              requestId: id,
            },
            { status: 502 },
          )
        }
      },
    },
  },
})
