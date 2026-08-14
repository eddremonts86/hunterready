/**
 * GET the live stage list for an id the client itself generated.
 *
 * No auth on purpose, and it is not a hole: the id is a UUID the browser minted a moment ago and sent
 * with its own upload — unguessable, short-lived, and the payload is stage labels and counts with no CV
 * content in them by construction (see `src/lib/progress.ts`). Requiring a session here would break the
 * exact case this exists for: an anonymous visitor's first upload, which ADR-023 makes the commonest.
 */
import { createFileRoute } from '@tanstack/react-router'
import { isProgressId, progressGet } from '@/lib/progress'

export const Route = createFileRoute('/api/progress')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get('id')
        if (!isProgressId(id)) {
          return Response.json({ steps: [] }, { status: 400 })
        }
        return Response.json(
          { steps: progressGet(id) },
          { headers: { 'cache-control': 'no-store' } },
        )
      },
    },
  },
})
