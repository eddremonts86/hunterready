/**
 * `POST /v1/translate` — the versioned contract over `api/translate`.
 *
 * The work lives in `translateHandler`, exported from that route and called here. What this file adds is
 * the four things an API needs and a browser does not: a key, a rate-limit bucket that belongs to
 * that key, a request id on the response, and a path that will not move when the interface does.
 */
import { createFileRoute } from '@tanstack/react-router'

import { translateHandler } from '@/routes/api/translate'
import { enterV1 } from '@/lib/v1'
import { delegateWithConsent } from '@/lib/v1-delegate'

export const Route = createFileRoute('/v1/translate')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const entry = await enterV1(request, 'translate')
        if ('refusal' in entry) return entry.refusal
        return delegateWithConsent(request, translateHandler, entry.ok.id)
      },
    },
  },
})
