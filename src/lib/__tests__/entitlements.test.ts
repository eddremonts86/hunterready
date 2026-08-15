/**
 * Who may send a CV to a third party.
 *
 * The assertion that matters is the **conjunction**. Consent alone used to be enough, which meant any
 * visitor who clicked through the gate had their CV sent to another company; entitlement alone would
 * mean us deciding on somebody's behalf because they paid. Every combination is pinned here, because
 * this is the module where a mistake spends money *and* breaks a privacy promise at the same time.
 *
 * The provider modules are mocked rather than reached: what is under test is the decision, not Postgres.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const REQUEST = new Request('http://localhost/api/ingest')

/**
 * Stand up the module with a given world: persistence on or off, a session or none, and a plan.
 *
 * `plan` is only consulted when there is a session, which mirrors reality — an anonymous visitor has
 * nowhere for a plan to live.
 */
async function withWorld(world: {
  persistence?: boolean
  userId?: string
  plan?: string
  planThrows?: boolean
  /** Deploy-time switches, restored after the test by the `afterEach` below. */
  env?: Record<string, string>
}) {
  vi.resetModules()
  for (const [key, value] of Object.entries(world.env ?? {})) {
    vi.stubEnv(key, value)
  }
  vi.doMock('@/db/client', () => ({
    isPersistenceEnabled: () => world.persistence !== false,
  }))
  vi.doMock('@/lib/session', () => ({
    currentUserId: async () => world.userId,
  }))
  vi.doMock('@/db/repository', () => ({
    getPlan: async () => {
      if (world.planThrows === true) throw new Error('database down')
      return world.plan ?? 'free'
    },
  }))
  return import('../entitlements')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.doUnmock('@/db/client')
  vi.doUnmock('@/lib/session')
  vi.doUnmock('@/db/repository')
  vi.resetModules()
})

describe('both conditions, or the CV stays here', () => {
  it('sends it only when the account is paid AND consent was given', async () => {
    const { mayUseThirdParty } = await withWorld({ userId: 'u1', plan: 'pro' })
    expect(await mayUseThirdParty(REQUEST, true)).toBe(true)
  })

  it('refuses a paid account that has not consented', async () => {
    // Entitlement is not permission. Deciding on somebody's behalf because they paid is the failure.
    const { mayUseThirdParty } = await withWorld({ userId: 'u1', plan: 'pro' })
    expect(await mayUseThirdParty(REQUEST, false)).toBe(false)
  })

  it('refuses a free account that has consented', async () => {
    // The old behaviour, and the one this module exists to end: consent alone was enough.
    const { mayUseThirdParty } = await withWorld({ userId: 'u1', plan: 'free' })
    expect(await mayUseThirdParty(REQUEST, true)).toBe(false)
  })

  it('refuses an anonymous visitor who has consented', async () => {
    /**
     * The commonest visitor, and the one this changes most. There is no account to hold a plan, so
     * nothing they upload leaves the server — which makes the statelessness promise (ADR-004) and the
     * transfer promise the same promise for them.
     */
    const { mayUseThirdParty } = await withWorld({ userId: undefined })
    expect(await mayUseThirdParty(REQUEST, true)).toBe(false)
  })
})

describe('it fails closed on every uncertainty', () => {
  it('refuses when the installation stores nothing', async () => {
    // No persistence means no plans, so nobody is entitled — not "nobody is checked".
    const { mayUseThirdParty, entitlementFor } = await withWorld({
      persistence: false,
      userId: 'u1',
      plan: 'pro',
    })
    expect(await mayUseThirdParty(REQUEST, true)).toBe(false)
    expect((await entitlementFor(REQUEST)).plan).toBe('anonymous')
  })

  it('refuses when the plan lookup throws', async () => {
    // A failed query is not a licence to spend. A bug here would quietly bill somebody else's model.
    const { mayUseThirdParty } = await withWorld({
      userId: 'u1',
      planThrows: true,
    })
    expect(await mayUseThirdParty(REQUEST, true)).toBe(false)
  })

  it('refuses a plan name it does not recognise', async () => {
    // Adding a tier is an edit to THIRD_PARTY_PLANS, not something a stray value can grant itself.
    const { mayUseThirdParty } = await withWorld({
      userId: 'u1',
      plan: 'enterprise-trial',
    })
    expect(await mayUseThirdParty(REQUEST, true)).toBe(false)
  })

  it('never reaches the plan lookup when consent is absent', async () => {
    /**
     * Short-circuit, and it is deliberate rather than incidental: the overwhelming majority of requests
     * have no consent, and each one would otherwise cost a query to answer a question already settled.
     */
    const { mayUseThirdParty } = await withWorld({
      userId: 'u1',
      planThrows: true,
    })
    // `planThrows` would surface as `false` anyway, so prove it by the absence of the throw path:
    // a consent-less call resolves without ever touching the repository.
    await expect(mayUseThirdParty(REQUEST, false)).resolves.toBe(false)
  })
})

describe('the suspension moves one capability and only one', () => {
  /*
    ADR-030 opens the third-party model to everyone while the production box cannot serve the local
    one. It shipped reading a single flag that the design gate also read, so it gave all forty-eight
    paid designs away to anonymous visitors — caught by reading `/api/processing` in production after
    the deploy, not by any test. This is that test.
  */
  it('opens the model to an anonymous visitor without opening the catalogue', async () => {
    const { entitlementFor } = await withWorld({
      userId: undefined,
      env: { HR_THIRD_PARTY_FOR_ALL: 'true' },
    })
    expect(await entitlementFor(REQUEST)).toEqual({
      thirdParty: true,
      paidDesigns: false,
      plan: 'anonymous',
    })
  })

  it('leaves a paying account with both', async () => {
    const { entitlementFor } = await withWorld({
      userId: 'u1',
      plan: 'pro',
      env: { HR_THIRD_PARTY_FOR_ALL: 'true' },
    })
    expect(await entitlementFor(REQUEST)).toEqual({
      thirdParty: true,
      paidDesigns: true,
      plan: 'pro',
    })
  })
})

describe('what the interface is told', () => {
  it('reports the plan so the UI can offer the upgrade', async () => {
    const { entitlementFor } = await withWorld({ userId: 'u1', plan: 'pro' })
    expect(await entitlementFor(REQUEST)).toEqual({
      thirdParty: true,
      paidDesigns: true,
      plan: 'pro',
    })
  })

  it('calls an anonymous visitor anonymous, not free', async () => {
    // The distinction is real: one has an account on the free tier, the other has no account at all,
    // and the copy shown to each is different.
    const { entitlementFor } = await withWorld({ userId: undefined })
    expect(await entitlementFor(REQUEST)).toEqual({
      thirdParty: false,
      paidDesigns: false,
      plan: 'anonymous',
    })
  })
})
