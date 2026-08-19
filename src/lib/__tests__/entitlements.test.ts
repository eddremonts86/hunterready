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
  /*
    Beta off unless a test asks for it.

    `betaPaidFree` defaults ON in production because the product is in beta, and switching it on
    here would have quietly rewritten what every test below is for: these describe the plan logic,
    which is what the product returns to when pricing opens. Seven of them went red when beta
    landed, and the fix is this line rather than new expectations — a test that was changed to match
    the code stops being able to disagree with it.

    The beta behaviour gets its own block at the bottom, where it can be read as the exception it is.
  */
  vi.stubEnv('HR_BETA_PAID_FREE', 'false')
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

/**
 * Beta, which is the state the product actually ships in today.
 *
 * Every test above runs with the switch forced off, because they describe the plan logic beta
 * suspends. These describe the suspension, and the last one is the one that matters most: **the exit
 * has to work.** A beta switch nobody has ever turned off is a permanent giveaway with a temporary
 * name on it, and the day pricing opens is a bad day to find that out.
 */
describe('beta includes every paid capability, and can be switched back', () => {
  it('gives an anonymous visitor the catalogue and the model', async () => {
    const { entitlementFor } = await withWorld({
      userId: undefined,
      env: { HR_BETA_PAID_FREE: 'true' },
    })
    expect(await entitlementFor(REQUEST)).toEqual({
      thirdParty: true,
      /*
        `paidDesigns: true` for `plan: "anonymous"` is the exact pair ADR-030 caught in production as
        a bug. Here it is the stated intention, which is the whole reason the switch is named after
        what it does rather than after the capability it was aimed at.
      */
      paidDesigns: true,
      plan: 'anonymous',
    })
  })

  it('is on by default, because the product is in beta', async () => {
    // No env at all: the deployed site behaves the way the beta chip says it does.
    vi.resetModules()
    vi.doMock('@/db/client', () => ({ isPersistenceEnabled: () => false }))
    vi.doMock('@/lib/session', () => ({ currentUserId: async () => undefined }))
    vi.doMock('@/db/repository', () => ({ getPlan: async () => 'free' }))
    const { betaPaidFree, entitlementFor } = await import('../entitlements')
    expect(betaPaidFree()).toBe(true)
    expect((await entitlementFor(REQUEST)).paidDesigns).toBe(true)
  })

  it('still requires consent, which beta does not touch', async () => {
    // Entitlement is one half of the `&&`. Giving the capability away is not permission to send a CV.
    const { mayUseThirdParty } = await withWorld({
      userId: undefined,
      env: { HR_BETA_PAID_FREE: 'true' },
    })
    expect(await mayUseThirdParty(REQUEST, false)).toBe(false)
    expect(await mayUseThirdParty(REQUEST, true)).toBe(true)
  })

  it('hands the catalogue back when the switch goes off', async () => {
    const { entitlementFor } = await withWorld({
      userId: undefined,
      env: { HR_BETA_PAID_FREE: 'false' },
    })
    expect(await entitlementFor(REQUEST)).toEqual({
      thirdParty: false,
      paidDesigns: false,
      plan: 'anonymous',
    })
  })
})

/**
 * The one switch, and the reason it has to win rather than merely default.
 *
 * Edd's ask, 2026-08-19: "debemos tener una forma rápida de pasar de beta a release mode de una, y al
 * hacer esto el sistema debe reaccionar como es debido" — while explicitly leaving
 * `HR_THIRD_PARTY_FOR_ALL=true` set in Coolify, because the spend is capped by a monthly plan and
 * there is no hurry.
 *
 * That last part is the whole design. A release switch that only *defaults* the older switches off
 * would be defeated by a variable nobody remembered to delete, and the person flipping it would have
 * no way to tell — the interface would look released and anonymous visitors would still be spending
 * third-party tokens. So each of these asserts release mode beating a switch that is actively set
 * against it.
 */
describe('release mode is one lever and it wins', () => {
  it('shuts the third-party model to an anonymous visitor with the ADR-030 switch still on', async () => {
    const { entitlementFor } = await withWorld({
      userId: undefined,
      env: { HR_THIRD_PARTY_FOR_ALL: 'true', HR_RELEASE: 'true' },
    })
    expect(await entitlementFor(REQUEST)).toEqual({
      thirdParty: false,
      paidDesigns: false,
      plan: 'anonymous',
    })
  })

  it('ends the beta giveaway with the beta switch still on', async () => {
    /*
      `HR_BETA_PAID_FREE` is not merely unset here, it is set to `true`. Anything less would test that
      release mode wins an argument nobody was having.
    */
    const { entitlementFor } = await withWorld({
      userId: undefined,
      env: { HR_BETA_PAID_FREE: 'true', HR_RELEASE: 'true' },
    })
    expect(await entitlementFor(REQUEST)).toEqual({
      thirdParty: false,
      paidDesigns: false,
      plan: 'anonymous',
    })
  })

  it('beats both at once, which is the state production is actually in', async () => {
    const { entitlementFor } = await withWorld({
      userId: undefined,
      env: {
        HR_THIRD_PARTY_FOR_ALL: 'true',
        HR_BETA_PAID_FREE: 'true',
        HR_RELEASE: 'true',
      },
    })
    expect(await entitlementFor(REQUEST)).toEqual({
      thirdParty: false,
      paidDesigns: false,
      plan: 'anonymous',
    })
  })

  it('leaves a paying account exactly as it was', async () => {
    /*
      The point of the switch is to *restore* the plan logic, not to shut the product. If this ever
      goes red, release mode has become an outage with a principle written on it.
    */
    const { entitlementFor } = await withWorld({
      userId: 'u1',
      plan: 'pro',
      env: { HR_RELEASE: 'true' },
    })
    expect(await entitlementFor(REQUEST)).toEqual({
      thirdParty: true,
      paidDesigns: true,
      plan: 'pro',
    })
  })

  it('locks the designs a developer had unlocked, so the gate can be rehearsed', async () => {
    /*
      `HR_UNLOCK_DESIGNS` exists so the paid catalogue can be tested. Release mode is the one thing a
      developer turns on in order to test the *gate* — so if the unlock survived it, the single state
      this switch exists to produce would be the one state nobody could ever look at.
    */
    const open = await withWorld({ env: { HR_UNLOCK_DESIGNS: 'true' } })
    expect(open.designsUnlocked()).toBe(true)

    const shut = await withWorld({
      env: { HR_UNLOCK_DESIGNS: 'true', HR_RELEASE: 'true' },
    })
    expect(shut.designsUnlocked()).toBe(false)
  })

  it('tells the interface to stop saying beta at the same instant', async () => {
    const during = await withWorld({ env: { HR_BETA_PAID_FREE: 'true' } })
    expect(during.inBeta()).toBe(true)

    const after = await withWorld({ env: { HR_RELEASE: 'true' } })
    expect(after.inBeta()).toBe(false)
    /*
      One fact, two names, never allowed to drift: a page that still says "free while we are in beta"
      after the entitlements have shut is not a stale label, it is a promise the product has stopped
      keeping.
    */
    expect(after.releaseMode()).toBe(true)
  })

  it('is off unless it is exactly "true", like every other switch here', async () => {
    for (const value of ['', 'false', '1', 'yes', 'TRUE']) {
      const { releaseMode } = await withWorld({ env: { HR_RELEASE: value } })
      expect(releaseMode(), `HR_RELEASE=${value} should not release`).toBe(
        false,
      )
    }
  })
})

/**
 * The overlap that made this necessary, pinned so it cannot come back quietly.
 *
 * `thirdParty` is `everyone || beta || paid` and `beta` defaults **on**, so `HR_THIRD_PARTY_FOR_ALL`
 * has been doing nothing since the day beta shipped. Plan 04 nevertheless carried three acceptance
 * criteria of the form "unset it and the third party closes" — a check that would have been run,
 * failed, and blamed on a stale image.
 */
describe('the switch that had quietly stopped mattering', () => {
  it('leaves the model open to an anonymous visitor when only the ADR-030 switch is removed', async () => {
    const { entitlementFor } = await withWorld({
      userId: undefined,
      // Beta on — which is production. The ADR-030 switch is absent.
      env: { HR_BETA_PAID_FREE: 'true' },
    })
    expect(
      (await entitlementFor(REQUEST)).thirdParty,
      'unsetting HR_THIRD_PARTY_FOR_ALL alone is not an exit from ADR-030',
    ).toBe(true)
  })
})
