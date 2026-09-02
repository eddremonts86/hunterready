/**
 * A paying account cannot buy the same plan twice.
 *
 * ## The defect this was written for
 *
 * Pressing `Get Pro` on a real build as a `pro` account created a second Checkout Session and said
 * nothing. Stripe would have honoured it: two subscriptions on one customer, both billed monthly.
 * `checkout.tsx` is careful never to create a second *customer* — it passes `customer` or
 * `customer_email` and never both, with a comment about paying twice and cancelling once — and the
 * plan was the half nobody checked. The pricing card offered the button because its three branches
 * were beta, checkout-open and not-open, and "already has it" was not among them.
 *
 * ## Why the assertion is the status code and not the absence of a session
 *
 * `409` and not `502` is the whole proof, exactly as `anonymous.test.ts` argues for its `401`. Stripe
 * *is* configured here as far as the code can tell, with a fixture key that any real call would fail
 * on — so a `502` would mean the handler carried on to `checkout.sessions.create`, reached the
 * network, and was refused by somebody else's error page rather than by us. A guard that only holds
 * because the key is fake is not a guard.
 *
 * ## Identity by API key, not by cookie
 *
 * `currentUserId` takes either, deliberately (ADR-032: one function, two ways to identify). The key
 * path needs a row and a hash; the cookie path needs Better Auth, a session table and a signed
 * cookie, to assert nothing this test is about. The route cannot tell the difference, which is the
 * property that makes the substitution honest rather than convenient.
 *
 * Against a real Postgres, because the plan being read is a column.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Sql } from 'postgres'

const URL_ENV = (
  process.env.DATABASE_MIGRATION_URL ??
  process.env.DATABASE_URL ??
  ''
).trim()

/** Not real, and shaped so a scanner cannot mistake either for a credential. */
const KEY = 'sk_test_fixture_not_a_credential_0000'
const PRICE = 'price_fixture_not_a_credential_0000'

type Handler = (context: { request: Request }) => Promise<Response>

describe.skipIf(URL_ENV === '')(
  'the checkout, asked by somebody who already pays',
  () => {
    let checkout: Handler
    let sql: Sql
    /*
      The real minter, not a hand-rolled string. `keyFromHeader` filters on `KEY_PREFIX` before it
      touches the database, so a key shaped by hand here passes the hash lookup and fails the filter
      — which is a 401 that looks exactly like "the guard did not run".
    */
    let mint: () => { secret: string; secretHash: string; prefix: string }
    const suffix = `paid-${Date.now()}`

    beforeAll(async () => {
      process.env.DATABASE_URL = URL_ENV
      process.env.STRIPE_SECRET_KEY = KEY
      process.env.HR_STRIPE_PRICE_ID = PRICE

      const route = await import('../checkout')
      checkout = (
        route.Route.options as unknown as {
          server: { handlers: { POST: Handler } }
        }
      ).server.handlers.POST

      mint = (await import('@/lib/api-key')).mint
      const postgres = (await import('postgres')).default
      sql = postgres(URL_ENV, { max: 1, onnotice: () => {} })
    })

    afterAll(async () => {
      // The key rows go with the user: `api_keys.user_id` cascades on delete.
      await sql`DELETE FROM auth_users WHERE email LIKE ${`%${suffix}%`}`
      await sql.end()
    })

    async function seed(plan: string): Promise<string> {
      const userId = `u_${Math.random().toString(36).slice(2, 12)}`
      const key = mint()
      await sql`INSERT INTO auth_users (id, email, plan, stripe_customer_id)
                VALUES (${userId}, ${`${userId}-${suffix}@example.invalid`}, ${plan}, ${`cus_${userId}`})`
      await sql`INSERT INTO api_keys (user_id, secret_hash, prefix, label)
                VALUES (${userId}, ${key.secretHash}, ${key.prefix}, 'already-paying test')`
      return key.secret
    }

    const ask = (secret: string) =>
      checkout({
        request: new Request('http://localhost/api/billing/checkout', {
          method: 'POST',
          headers: { authorization: `Bearer ${secret}` },
        }),
      })

    it('refuses a second subscription, before reaching Stripe', async () => {
      const response = await ask(await seed('pro'))

      expect(response.status).toBe(409)
      expect(response.status).not.toBe(502)

      const body = (await response.json()) as Record<string, unknown>
      expect(body.error).toBe('already_subscribed')
      // docs/07: a message a person can read, an id to correlate, and nothing about them in it.
      expect(typeof body.requestId).toBe('string')
      expect(JSON.stringify(body)).not.toContain(suffix)
      expect(JSON.stringify(body)).not.toContain(KEY)
    })

    it('still lets a free account through to Stripe', async () => {
      /*
        The other half, and the reason this test is worth its lines: a guard that refuses everybody
        would pass the assertion above while breaking the product completely. `502` is the *success*
        here — it means the handler went all the way to `checkout.sessions.create` and only the
        fixture key stopped it.
      */
      const response = await ask(await seed('free'))

      expect(response.status).toBe(502)
      expect(response.status).not.toBe(409)
    })
  },
)
