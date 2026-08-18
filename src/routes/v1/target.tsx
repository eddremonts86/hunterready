/**
 * `POST /v1/target` — the versioned contract over `api/target`.
 *
 * The work lives in `targetHandler`, exported from that route and called here. What this file adds is
 * the four things an API needs and a browser does not: a key, a rate-limit bucket that belongs to
 * that key, a request id on the response, and a path that will not move when the interface does.
 */
import { createFileRoute } from '@tanstack/react-router'

import { targetHandler } from '@/routes/api/target'
import { enterV1 } from '@/lib/v1'
import { delegateWithConsent } from '@/lib/v1-delegate'

export const Route = createFileRoute('/v1/target')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const entry = await enterV1(request, 'target')
        if ('refusal' in entry) return entry.refusal
        return delegateWithConsent(request, targetHandler, entry.ok.id)
      },
    },
  },
})
