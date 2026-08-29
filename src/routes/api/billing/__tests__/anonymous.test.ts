/**
 * Neither billing endpoint will do anything for a caller with no account.
 *
 * ## Why this is worth a test when `webhook.test.ts` needs a database and these do not
 *
 * The webhook is the endpoint that moves money's consequence, so it is tested against a real Postgres.
 * These two are tested for the one property that needs no database at all and matters most:
 * **identity is checked before anything else happens.**
 *
 * For `/api/billing/checkout` that is a security property, not a tidiness one. `client_reference_id`
 * is our user id travelling out to Stripe and back, and it is what `checkout.session.completed` uses
 * to tie a Stripe customer to an account. A session created without one produces a subscription that
 * belongs to nobody: somebody has paid, the webhook arrives naming a customer we have never seen, and
 * the plan cannot be granted to anybody — a charge with no product, and a refund conversation.
 *
 * ## What makes these hermetic
 *
 * Both keys are set to fixtures before the routes load, so Stripe *is* configured as far as the code
 * can tell. The assertion is then that the answer is `401` and not `502` — which is the shape a real
 * network call with a fake key would produce. **A 401 with Stripe configured is the proof of ordering**:
 * nothing reached the network, because the guard ran first.
 *
 * No mocking anywhere, in keeping with the rest of this suite: there is no `vi.mock` in this repo, and
 * a mock here would assert my beliefs about the order of two `if` statements rather than their order.
 *
 * What this deliberately does not cover: the `503` on an unconfigured deployment and the `404` for an
 * account with no customer. Both need a signed-in caller, which needs Better Auth and a database, which
 * is `webhook.test.ts`'s territory. Block 3's verify — a live test-mode payment — is nobody's test.
 */
import { beforeAll, describe, expect, it } from 'vitest'

type Handler = (context: { request: Request }) => Promise<Response>

/** Not real. Shaped so a secret scanner cannot mistake either for a credential. */
const KEY = 'sk_test_fixture_not_a_credential_0000'
const PRICE = 'price_fixture_not_a_credential_0000'

/** The route's own POST, reached the way `webhook.test.ts` reaches it. */
function handlerOf(route: { options: unknown }): Handler {
  return (
    route.options as {
      server: { handlers: { POST: Handler } }
    }
  ).server.handlers.POST
}

describe('the billing endpoints, asked by nobody in particular', () => {
  let checkout: Handler
  let portal: Handler

  beforeAll(async () => {
    /*
      Configured on purpose. With no key the checkout would answer 503 and the test would pass without
      proving anything about identity — it would only prove that an unconfigured deployment refuses,
      which is a different sentence.
    */
    process.env.STRIPE_SECRET_KEY = KEY
    process.env.HR_STRIPE_PRICE_ID = PRICE
    /*
      No `BETTER_AUTH_SECRET` and no `DATABASE_URL` are set here, and none are needed: with sign-in
      switched off `currentUserId` answers undefined for every request, which is the same answer it
      gives a real deployment for a request carrying no cookie. That is the case being tested.
    */
    checkout = handlerOf((await import('../checkout')).Route)
    portal = handlerOf((await import('../portal')).Route)
  })

  const anonymous = () =>
    new Request('https://hunterready.test/api/billing/checkout', {
      method: 'POST',
    })

  it('will not start a checkout for a caller it cannot name', async () => {
    const response = await checkout({ request: anonymous() })
    expect(response.status).toBe(401)

    const body = (await response.json()) as Record<string, unknown>
    expect(body.error).toBe('unauthorized')
    /*
      401 rather than 502 is the whole assertion. A 502 would mean the handler carried on to
      `checkout.sessions.create`, reached the network with a fixture key, and refused only because
      Stripe did — which is a paywall enforced by somebody else's error page.
    */
    expect(response.status).not.toBe(502)
    expect(response.status).not.toBe(503)
  })

  it('will not open a billing portal for one either', async () => {
    const response = await portal({ request: anonymous() })
    expect(response.status).toBe(401)
    const body = (await response.json()) as Record<string, unknown>
    expect(body.error).toBe('unauthorized')
  })

  it('says who to ask about it without saying anything about anybody', async () => {
    /*
      docs/07: an error body is a place personal data leaves by. There is no session here so there is
      nothing to leak yet, but the shape is what a later change would inherit — a `requestId` to
      correlate against the logs, a message a person can read, and no third field.
    */
    const body = (await (await checkout({ request: anonymous() })).json()) as {
      requestId?: unknown
      message?: unknown
    }
    expect(typeof body.requestId).toBe('string')
    expect(typeof body.message).toBe('string')
    expect(JSON.stringify(body)).not.toContain(KEY)
    expect(JSON.stringify(body)).not.toContain(PRICE)
  })
})
