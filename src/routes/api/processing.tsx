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
import { designsUnlocked, entitlementFor } from '@/lib/entitlements'

/**
 * Host → the company's name as a person would recognise it.
 *
 * An unknown host falls back to its bare hostname rather than to a friendly lie. "api.example.com"
 * is a worse answer than "MiniMax" and a much better one than "our AI partner".
 */
function displayName(label: string): string {
  const host = label.replace(/^https?:\/\//, '').replace(/[/:].*$/, '')
  if (host === 'anthropic' || host.endsWith('anthropic.com')) return 'Anthropic'
  if (host.endsWith('minimax.io') || host.endsWith('minimaxi.com')) {
    return 'MiniMax'
  }
  if (host.endsWith('deepseek.com')) return 'DeepSeek'
  if (host.endsWith('openai.com')) return 'OpenAI'
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
            /** Whether a third-party model is configured *at all*, so the UI can offer the upgrade. */
            thirdPartyAvailable: resolveProvider() !== undefined,
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
