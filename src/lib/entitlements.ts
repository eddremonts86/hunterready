/**
 * The one place that answers: may this request send a CV to a third party?
 *
 * ## The default is our own hardware, for everybody
 *
 * This inverts what the code did before. `resolveProvider()` returned MiniMax whenever it was
 * configured, so any visitor who accepted the consent gate had their CV sent to another company — and
 * the local model, the thing that makes declining cost accuracy instead of the whole feature, was the
 * exception rather than the rule.
 *
 * Now it is the rule. Reading a CV, rewriting a bullet, writing a letter: all of it runs on the `llm`
 * service in our own stack unless **both** of these are true:
 *
 *   1. the person is signed in on a paid plan, and
 *   2. they have consented to the transfer
 *
 * Two independent conditions, deliberately. Consent without entitlement is somebody agreeing to
 * something that will not happen; entitlement without consent is us deciding on their behalf because
 * they paid. Neither is acceptable on its own, so the `&&` is the whole point of this module.
 *
 * ## Why the third-party model is the paid capability
 *
 * It is the one thing in the product with a per-CV marginal cost (ADR-023). Storage is cheap and
 * bounded by the retention policy; a model on our own box is a fixed cost we pay anyway. An outside
 * API is money per document, so it is the natural line, and it happens to be the line that leaves the
 * free tier as the *more* private one — which is the opposite of how this usually goes.
 *
 * ## Anonymous means local, always
 *
 * There is no account to hold a plan, so there is no entitlement, so nothing leaves the server. That
 * makes the statelessness promise (ADR-004) and the transfer promise the same promise for the
 * commonest kind of visitor, and it means `/api/processing` reports no provider to them — which turns
 * the consent gate off by itself, because asking for permission to do something that cannot happen is
 * theatre.
 */
import { isPersistenceEnabled } from '@/db/client'
import { getPlan } from '@/db/repository'
import { currentUserId } from '@/lib/session'

/** Plans that may use the third-party model. A set, so adding a tier is one edit. */
const THIRD_PARTY_PLANS = new Set(['pro'])

/**
 * The developer switch: every design unlocked for this **process**.
 *
 * Edd's complaint was exact: a developer who cannot download and try the paid half of the catalogue
 * cannot test the paid half of the catalogue. So the dev server (`pnpm dev`, NODE_ENV=development)
 * unlocks everything with no configuration, and the local container — which is a production build and
 * knows nothing about dev — gets `HR_UNLOCK_DESIGNS=true` in `docker-compose.local.yml`, a file that is
 * gitignored and machine-local.
 *
 * ⚠️ Never set `HR_UNLOCK_DESIGNS` in Coolify. It is not a plan, it is the absence of the gate. It
 * deliberately unlocks only *designs*: the third-party model keeps its own entitlement, because that
 * switch spends money and moves someone's CV to another company, and no developer convenience is worth
 * defaulting into either.
 */
export function designsUnlocked(): boolean {
  return (
    process.env.HR_UNLOCK_DESIGNS === 'true' ||
    process.env.NODE_ENV === 'development'
  )
}

export type Entitlement = {
  /** Whether the account may use the third-party model at all, before consent is considered. */
  thirdParty: boolean
  /** For copy and diagnostics. Never shown as a reason to a visitor who has no account. */
  plan: 'anonymous' | string
}

/**
 * What this request is entitled to.
 *
 * Fails closed on every uncertainty: no persistence, no session, an unreadable plan, or a thrown query
 * all resolve to `free`. A bug here would silently spend money on somebody who is not paying, so the
 * safe direction is the cheap one.
 */
export async function entitlementFor(request: Request): Promise<Entitlement> {
  if (!isPersistenceEnabled()) return { thirdParty: false, plan: 'anonymous' }

  try {
    const userId = await currentUserId(request)
    if (userId === undefined) return { thirdParty: false, plan: 'anonymous' }

    const plan = await getPlan(userId)
    return { thirdParty: THIRD_PARTY_PLANS.has(plan), plan }
  } catch {
    // A failed lookup is not a licence to spend. See the note above about failing closed.
    return { thirdParty: false, plan: 'free' }
  }
}

/**
 * The decision the endpoints actually need, in one call.
 *
 * `consented` comes from the client — the consent gate's answer — and is never trusted on its own. It
 * is one half of an `&&` whose other half the client cannot influence.
 */
export async function mayUseThirdParty(
  request: Request,
  consented: boolean,
): Promise<boolean> {
  if (!consented) return false
  const { thirdParty } = await entitlementFor(request)
  return thirdParty
}
