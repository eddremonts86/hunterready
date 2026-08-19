/**
 * `GET /v1/capabilities` — what this key can actually do, before it tries.
 *
 * A machine cannot read a consent gate or notice a locked design card. Without this it discovers its
 * limits by getting a 402 halfway through a user's flow, which is the worst moment and the least
 * informative signal. So the questions a client would otherwise guess at are answered up front:
 * which companies it may name, whether paid designs render, whether the larger model is reachable.
 *
 * **It says nothing about the account behind the key** beyond the capabilities themselves. No email,
 * no plan name, no identity: a partner needs to know what will work, not who is paying.
 */
import { createFileRoute } from '@tanstack/react-router'

import { availableProviders } from '@/structure/provider'
import { designsUnlocked, entitlementFor } from '@/lib/entitlements'
import { encryptionEnabled } from '@/db/crypto'
import { enterV1, v1Json } from '@/lib/v1'

export const Route = createFileRoute('/v1/capabilities')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const entry = await enterV1(request, 'capabilities')
        if ('refusal' in entry) return entry.refusal

        const { thirdParty, paidDesigns } = await entitlementFor(request)

        return v1Json(entry.ok.id, {
          /**
           * Companies this key may name in `X-HunterReady-Consent`. Empty means the third-party
           * model is not reachable and every CV will be read here whatever the header says.
           */
          providers: thirdParty
            ? availableProviders().map((p) => ({ id: p.id, name: p.name }))
            : [],
          /** Whether `/v1/render` will accept a paid design or a custom typeface and colour. */
          paidDesigns: designsUnlocked() || paidDesigns,
          /** Stored CV content is encrypted at rest. Nothing posted to `/v1/cv` is stored at all. */
          encryptsAtRest: encryptionEnabled(),
          /** Per key, per endpoint. Matches `docs/api/README.md`. */
          rateLimit: { requests: 12, windowMinutes: 10 },
          /** So a client can log which contract it was talking to when something surprised it. */
          version: 'v1',
        })
      },
    },
  },
})
