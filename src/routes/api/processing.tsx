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
import { resolveProvider } from '@/structure/provider'
import { encryptionEnabled } from '@/db/crypto'

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
  if (host.endsWith('openai.com')) return 'OpenAI'
  return host
}

export const Route = createFileRoute('/api/processing')({
  server: {
    handlers: {
      GET: () => {
        const provider = resolveProvider()

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
             * Whether stored CVs are encrypted at rest on *this* installation (ADR-021).
             *
             * Read from the code rather than written into the privacy notice as prose, so the page cannot
             * claim encryption on a deployment that has no `DATA_ENCRYPTION_KEY`. The same reason the
             * provider is fetched instead of hardcoded: a claim about what this server does has to come
             * from the server.
             */
            encryptsAtRest: encryptionEnabled(),
          },
          { headers: { 'cache-control': 'no-store' } },
        )
      },
    },
  },
})
