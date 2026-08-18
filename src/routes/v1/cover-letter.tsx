/**
 * `POST /v1/cover-letter` — the versioned contract over `api/cover-letter`.
 *
 * The work lives in `coverLetterHandler`, exported from that route and called here. What this file adds is
 * the four things an API needs and a browser does not: a key, a rate-limit bucket that belongs to
 * that key, a request id on the response, and a path that will not move when the interface does.
 */
import { createFileRoute } from '@tanstack/react-router'

import { coverLetterHandler } from '@/routes/api/cover-letter'
import { enterV1 } from '@/lib/v1'
import { delegateWithConsent } from '@/lib/v1-delegate'

export const Route = createFileRoute('/v1/cover-letter')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const entry = await enterV1(request, 'cover-letter')
        if ('refusal' in entry) return entry.refusal
        return delegateWithConsent(request, coverLetterHandler, entry.ok.id)
      },
    },
  },
})
