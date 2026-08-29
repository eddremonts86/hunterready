/**
 * Who processes a CV, so the consent gate can name them.
 *
 * docs/07-privacy.md requires "explicit consent before the first call, **naming the provider** — not
 * buried in a ToS checkbox". A gate that says "a third-party AI provider" satisfies the checkbox and
 * not the requirement: the person is agreeing to a transfer to a company, and they are entitled to
 * know which one before they agree, not after.
 *
 * The provider is a deploy-time decision, so the browser cannot know it without asking. This endpoint
 * exists for that one question.
 *
 * It returns a **host name at most** — never a base URL with credentials in it, never a model id, and
 * nothing that reveals whether a key is valid. `resolveProvider().label` is already constrained to
 * that, and the mapping below narrows it further to a name a person would recognise.
 */
import { createFileRoute } from '@tanstack/react-router'
import { availableProviders, resolveProvider } from '@/structure/provider'
import { encryptionEnabled } from '@/db/crypto'
import { PRICING, hasCheckout } from '@/lib/pricing'
import { designsUnlocked, entitlementFor, inBeta } from '@/lib/entitlements'

/**
 * Host → the company's name as a person would recognise it.
 *
 * An unknown host falls back to its bare hostname rather than to a friendly lie. "api.example.com"
 * is a worse answer than "MiniMax" and a much better one than "our AI partner".
 */
/**
 * The hosts this deployment can be pointed at, and the company each one belongs to.
 *
 * A table rather than a chain of `endsWith`, because the chain had a bug the chain could not show:
 * `endsWith('minimax.io')` is also true of `evilminimax.io`. Not an attack surface — the label comes
 * from our own environment, not from a request — but a typo in a base URL would have been reported
 * to somebody as a company name while deciding whether to send that company their CV. `match` below
 * accepts the domain itself or a subdomain of it, and nothing else.
 */
const VENDORS: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['Anthropic', ['anthropic.com', 'anthropic']],
  // Three MiniMax hosts. The `.chat` one was found in production, not in a doc: see the test.
  ['MiniMax', ['minimax.io', 'minimaxi.com', 'minimaxi.chat']],
  ['DeepSeek', ['deepseek.com']],
  ['OpenAI', ['openai.com']],
]

const match = (host: string, domain: string): boolean =>
  host === domain || host.endsWith(`.${domain}`)

export function displayName(label: string): string {
  const host = label.replace(/^https?:\/\//, '').replace(/[/:].*$/, '')
  for (const [name, domains] of VENDORS) {
    if (domains.some((domain) => match(host, domain))) return name
  }
  return host
}

export const Route = createFileRoute('/api/processing')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        /**
         * A provider is only named when this caller could actually reach it — consent gate included.
         *
         * ADR-023 makes the third-party model a paid capability, so for an anonymous or free visitor
         * the honest answer is that nothing leaves the server. Returning `null` for them is not
         * hiding a capability: it is reporting theirs. It also switches the consent gate off by
         * itself, because `needsConsent` requires a named provider — and asking permission for a
         * transfer that cannot happen is theatre.
         */
        const { thirdParty, paidDesigns, plan } = await entitlementFor(request)
        const provider = thirdParty ? resolveProvider() : undefined

        return Response.json(
          {
            /**
             * Null means no model is configured, and that is not a degraded state to hide: nothing
             * leaves the server at all, extraction runs on the deterministic rules path, and asking
             * for consent to a transfer that will not happen would be theatre.
             */
            provider:
              provider === undefined ? null : displayName(provider.label),
            /**
             * Every model this visitor could choose, named.
             *
             * `provider` above is the deployment's default and stays for anything reading one answer.
             * This is the list the consent gate draws, because the choice is the person's now — and
             * docs/07's requirement is consent to a *named company*, so a list of names is exactly the
             * shape that requirement takes once there is more than one.
             *
             * Empty for a caller who is not entitled, the same as `provider` is: a menu of transfers
             * nobody may make is an offer the server would refuse.
             */
            providers: thirdParty ? availableProviders() : [],
            /**
             * Whether stored CVs are encrypted at rest on *this* installation (ADR-021).
             *
             * Read from the code rather than written into the privacy notice as prose, so the page cannot
             * claim encryption on a deployment that has no `DATA_ENCRYPTION_KEY`. The same reason the
             * provider is fetched instead of hardcoded: a claim about what this server does has to come
             * from the server.
             */
            encryptsAtRest: encryptionEnabled(),
            /**
             * What tier this caller is on, for the interface — never a reason shown to somebody with no
             * account, who simply sees that their CV stays here.
             */
            plan,
            /**
             * Whether a third-party model is configured *at all*, so the UI can offer the upgrade.
             *
             * ⚠️ Renamed from `thirdPartyAvailable` on 2026-08-19, because that name described the
             * wrong thing and had already misled the only reader it ever had. Plan 04 wrote three
             * acceptance criteria of the form "unset the switch and this goes false" — and it never
             * would have, because a configured MiniMax makes it true for everybody, entitled or not.
             * The check would have been run, failed, and blamed on a stale image.
             *
             * Nothing in the app reads it. It is a diagnostic, and a diagnostic whose name is a lie
             * is worse than no diagnostic.
             */
            thirdPartyConfigured: resolveProvider() !== undefined,
            /**
             * Whether **this caller** may use it. The question the other field looked like it
             * answered.
             *
             * This is the one that goes false for an anonymous visitor the moment `HR_RELEASE=true`,
             * and the one worth curling after a deploy. `provider` and `providers` already encode it
             * — `null` and `[]` — but only by absence, and "the field I expected is empty" is a much
             * weaker signal than a boolean that says no.
             */
            thirdPartyForYou: thirdParty,
            /**
             * Whether the product still calls itself beta.
             *
             * Here so the interface can stop saying "free for everyone while HunterReady is in beta"
             * at the same instant it stops being true, rather than in a cleanup commit somebody
             * remembers to write afterwards. One switch, `HR_RELEASE`, moves this and the
             * entitlements above together — see `releaseMode` in `src/lib/entitlements.ts`.
             */
            beta: inBeta(),
            /**
             * Whether this deployment can take money at all, and what it would charge.
             *
             * Both travel over the wire rather than being imported into the bundle, because
             * `hasCheckout()` reads `process.env` and a client build has no such thing — the price
             * would be right and the boolean would be a crash or a quiet `false`. One source, and it
             * is the server, exactly like `provider` and `encryptsAtRest` above.
             *
             * `false` is the normal state today: beta shipped before pricing did. The surface reads
             * this and says so plainly instead of rendering a button that answers 503.
             */
            checkoutOpen: hasCheckout(),
            price: PRICING.display,
            pricePeriod: PRICING.period,
            /**
             * Whether this caller may use the paid designs.
             *
             * Its **own** entitlement, not `thirdParty`. One plan buys both today, and reading one flag
             * for both was still wrong: ADR-030's suspension opened the model to everyone and handed
             * the paid catalogue away with it, silently, until `/api/processing` was read in
             * production. A switch aimed at one capability must not be able to move another.
             *
             * The gallery uses it to draw padlocks. It is **not** the gate — `/api/render` is, because
             * this endpoint's answer is advisory and a client can ignore it.
             */
            paidDesigns: designsUnlocked() || paidDesigns,
          },
          { headers: { 'cache-control': 'no-store' } },
        )
      },
    },
  },
})
