/**
 * The webhook, driven end to end with signatures we compute ourselves.
 *
 * ## What this can prove without a Stripe account, and what it cannot
 *
 * It **can** prove the whole path: a signature verified against real bytes, an event mapped to an
 * entitlement, a customer resolved to an account, one column moved, and a redelivery doing nothing.
 * Stripe's signing scheme is HMAC-SHA256 over `timestamp.payload` with a shared secret, which is
 * arithmetic — so a signature built here is the same signature Stripe builds, and
 * `constructEventAsync` cannot tell the difference. That is the part where a bug would cost money or
 * grant a plan to a stranger.
 *
 * It **cannot** prove that Stripe's API accepts our checkout payload, or that a live event has the
 * shape asserted here. Those need keys and a dashboard, and the plan's block 3 verify says so.
 *
 * Against a real Postgres, because the idempotency this asserts *is* a primary key and the atomicity
 * *is* a transaction.
 */
import { createHmac } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Sql } from 'postgres'

const URL_ENV = (
  process.env.DATABASE_MIGRATION_URL ??
  process.env.DATABASE_URL ??
  ''
).trim()

/** Not a real secret and shaped so a scanner cannot mistake it for one — see `deepseek-schema.test.ts`. */
const SECRET = 'whsec_test_fixture_not_a_credential_0000'

/**
 * A Stripe signature header, computed the way Stripe computes it.
 *
 * `t=<unix>,v1=<hmac-sha256 of "t.body">`. Written out rather than taken from the SDK's test helper
 * so that this test would still fail if the SDK's verification were replaced with something that
 * accepted anything.
 */
function sign(
  body: string,
  secret = SECRET,
  at = Math.floor(Date.now() / 1000),
) {
  const mac = createHmac('sha256', secret).update(`${at}.${body}`).digest('hex')
  return `t=${at},v1=${mac}`
}

function subscriptionEvent(input: {
  id: string
  type: string
  customer: string
  status: string
}) {
  return JSON.stringify({
    id: input.id,
    object: 'event',
    api_version: '2026-07-29.dahlia',
    created: Math.floor(Date.now() / 1000),
    type: input.type,
    data: {
      object: {
        id: `sub_${Math.random().toString(36).slice(2, 10)}`,
        object: 'subscription',
        customer: input.customer,
        status: input.status,
      },
    },
  })
}

describe.skipIf(URL_ENV === '')(
  'the billing webhook, signature and all',
  () => {
    let post: (body: string, signature?: string | null) => Promise<Response>
    let repo: typeof import('@/db/repository')
    let sql: Sql
    const suffix = `wh-${Date.now()}`

    beforeAll(async () => {
      process.env.DATABASE_URL = URL_ENV
      process.env.STRIPE_SECRET_KEY = 'sk_test_fixture_not_a_credential_0000'
      process.env.STRIPE_WEBHOOK_SECRET = SECRET

      const route = await import('../webhook')
      const handler = (
        route.Route.options as unknown as {
          server: {
            handlers: { POST: (c: { request: Request }) => Promise<Response> }
          }
        }
      ).server.handlers.POST

      post = (body, signature = sign(body)) =>
        handler({
          request: new Request('http://localhost/api/billing/webhook', {
            method: 'POST',
            body,
            headers:
              signature === null ? {} : { 'stripe-signature': signature },
          }),
        })

      repo = await import('@/db/repository')
      const postgres = (await import('postgres')).default
      sql = postgres(URL_ENV, { max: 1, onnotice: () => {} })
    })

    afterAll(async () => {
      await sql`DELETE FROM billing_events WHERE provider = 'stripe' AND kind LIKE '%subscription%'`
      await sql`DELETE FROM auth_users WHERE email LIKE ${`%${suffix}%`}`
      await sql.end()
    })

    async function seed(): Promise<{ userId: string; customerId: string }> {
      const userId = `u_${Math.random().toString(36).slice(2, 12)}`
      const customerId = `cus_${Math.random().toString(36).slice(2, 12)}`
      await sql`INSERT INTO auth_users (id, email, stripe_customer_id) VALUES (${userId}, ${`${userId}-${suffix}@example.invalid`}, ${customerId})`
      return { userId, customerId }
    }

    describe('an unverified request never reaches the database', () => {
      it('refuses a body with no signature', async () => {
        const res = await post(
          subscriptionEvent({
            id: 'evt_unsigned',
            type: 'customer.subscription.created',
            customer: 'cus_nobody',
            status: 'active',
          }),
          null,
        )
        expect(res.status).toBe(400)
      })

      it('refuses a signature computed with the wrong secret', async () => {
        /*
        The one that matters. Without verification this endpoint is "anybody on the internet can
        grant themselves the paid plan", because Stripe cannot present a cookie or a key and the HMAC
        is the whole authentication.
      */
        const { userId, customerId } = await seed()
        const body = subscriptionEvent({
          id: `evt_forged_${Math.random().toString(36).slice(2, 8)}`,
          type: 'customer.subscription.created',
          customer: customerId,
          status: 'active',
        })

        const res = await post(body, sign(body, 'whsec_attacker_guess_0000'))
        expect(res.status).toBe(400)
        expect(
          await repo.getPlan(userId),
          'a forged webhook granted the paid plan',
        ).toBe('free')
      })

      it('refuses a body edited after it was signed', async () => {
        const { userId, customerId } = await seed()
        const honest = subscriptionEvent({
          id: `evt_tamper_${Math.random().toString(36).slice(2, 8)}`,
          type: 'customer.subscription.created',
          customer: customerId,
          status: 'canceled',
        })
        const signature = sign(honest)
        // Same signature, a status that would grant instead of drop.
        const tampered = honest.replace('"canceled"', '"active"')

        const res = await post(tampered, signature)
        expect(res.status).toBe(400)
        expect(await repo.getPlan(userId)).toBe('free')
      })
    })

    describe('a verified event moves exactly one column', () => {
      it('grants pro on an active subscription and drops it on deletion', async () => {
        const { userId, customerId } = await seed()

        const on = await post(
          subscriptionEvent({
            id: `evt_on_${Math.random().toString(36).slice(2, 8)}`,
            type: 'customer.subscription.created',
            customer: customerId,
            status: 'active',
          }),
        )
        expect(on.status).toBe(200)
        expect(await repo.getPlan(userId)).toBe('pro')

        const off = await post(
          subscriptionEvent({
            id: `evt_off_${Math.random().toString(36).slice(2, 8)}`,
            type: 'customer.subscription.deleted',
            customer: customerId,
            status: 'canceled',
          }),
        )
        expect(off.status).toBe(200)
        expect(await repo.getPlan(userId)).toBe('free')
      })

      it('treats past_due as not paying and a trial as paying', async () => {
        const { userId, customerId } = await seed()

        await post(
          subscriptionEvent({
            id: `evt_trial_${Math.random().toString(36).slice(2, 8)}`,
            type: 'customer.subscription.created',
            customer: customerId,
            status: 'trialing',
          }),
        )
        expect(
          await repo.getPlan(userId),
          'a trial is a subscription somebody agreed to',
        ).toBe('pro')

        await post(
          subscriptionEvent({
            id: `evt_late_${Math.random().toString(36).slice(2, 8)}`,
            type: 'customer.subscription.updated',
            customer: customerId,
            status: 'past_due',
          }),
        )
        expect(
          await repo.getPlan(userId),
          'past_due is a payment that failed, so they are not currently paying',
        ).toBe('free')
      })

      it('answers 200 and changes nothing for an event it has no rule for', async () => {
        /*
        Stripe retries anything that is not 2xx, for days. A receipt we have no opinion about is not
        a failure, and answering 500 to it would earn an escalating retry storm about an invoice.
      */
        const { userId, customerId } = await seed()
        const body = JSON.stringify({
          id: `evt_noise_${Math.random().toString(36).slice(2, 8)}`,
          object: 'event',
          api_version: '2026-07-29.dahlia',
          created: Math.floor(Date.now() / 1000),
          type: 'invoice.payment_succeeded',
          data: {
            object: { id: 'in_x', object: 'invoice', customer: customerId },
          },
        })

        const res = await post(body)
        expect(res.status).toBe(200)
        expect(await repo.getPlan(userId)).toBe('free')
      })

      it('ignores an event about a customer that is not ours', async () => {
        const body = subscriptionEvent({
          id: `evt_stranger_${Math.random().toString(36).slice(2, 8)}`,
          type: 'customer.subscription.created',
          customer: `cus_stranger_${Math.random().toString(36).slice(2, 8)}`,
          status: 'active',
        })
        const res = await post(body)
        expect(res.status).toBe(200)
        const [row] =
          await sql`SELECT outcome FROM billing_events WHERE id = ${JSON.parse(body).id}`
        expect(row.outcome).toBe('ignored')
      })
    })

    describe('redelivery', () => {
      it('does not re-grant a stale active that arrives after the cancellation', async () => {
        const { userId, customerId } = await seed()
        const activeBody = subscriptionEvent({
          id: `evt_race_${Math.random().toString(36).slice(2, 8)}`,
          type: 'customer.subscription.created',
          customer: customerId,
          status: 'active',
        })

        await post(activeBody)
        await post(
          subscriptionEvent({
            id: `evt_racecancel_${Math.random().toString(36).slice(2, 8)}`,
            type: 'customer.subscription.deleted',
            customer: customerId,
            status: 'canceled',
          }),
        )
        expect(await repo.getPlan(userId)).toBe('free')

        // Stripe retries the one it never got a 2xx for. It is signed again, and it is legitimate.
        const late = await post(activeBody, sign(activeBody))
        expect(late.status).toBe(200)
        expect(
          await repo.getPlan(userId),
          'a redelivered active restored a cancelled plan',
        ).toBe('free')
      })
    })

    describe('checkout.session.completed is where the two ids meet', () => {
      it('links the customer so later events can find the account', async () => {
        const userId = `u_${Math.random().toString(36).slice(2, 12)}`
        const customerId = `cus_${Math.random().toString(36).slice(2, 12)}`
        // No stripe_customer_id yet: this is somebody's first payment.
        await sql`INSERT INTO auth_users (id, email) VALUES (${userId}, ${`${userId}-${suffix}@example.invalid`})`

        const completed = JSON.stringify({
          id: `evt_checkout_${Math.random().toString(36).slice(2, 8)}`,
          object: 'event',
          api_version: '2026-07-29.dahlia',
          created: Math.floor(Date.now() / 1000),
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_x',
              object: 'checkout.session',
              customer: customerId,
              client_reference_id: userId,
            },
          },
        })
        expect((await post(completed)).status).toBe(200)

        /*
        It grants nothing by itself — the subscription event that follows does. What it must do is
        tie the ids together, because every event after this one names only the customer.
      */
        expect(await repo.getPlan(userId)).toBe('free')
        expect(await repo.userIdForStripeCustomer(customerId)).toBe(userId)

        await post(
          subscriptionEvent({
            id: `evt_after_${Math.random().toString(36).slice(2, 8)}`,
            type: 'customer.subscription.created',
            customer: customerId,
            status: 'active',
          }),
        )
        expect(
          await repo.getPlan(userId),
          'the subscription event could not find the account the checkout named',
        ).toBe('pro')
      })
    })
  },
)
