/**
 * GDPR Article 15 — download everything we hold, as JSON.
 *
 * Returns **404 when there is no account**, which the UI renders as "there is nothing stored to
 * download". That is the honest answer for the stateless path and it is also the common one: most
 * people will use this product without ever signing in.
 *
 * Identity comes from the session, never from a query parameter. An export endpoint that takes a user
 * id from the URL is a data-breach endpoint with a compliance label on it.
 */
import { createFileRoute } from '@tanstack/react-router'
import { exportEverything } from '@/db/repository'
import { isPersistenceEnabled } from '@/db/client'
import { currentUserId } from '@/lib/session'
import { event, requestId } from '@/lib/log'

export const Route = createFileRoute('/api/account/export')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = requestId()
        if (!isPersistenceEnabled()) {
          return Response.json({ error: 'no_account' }, { status: 404 })
        }
        const userId = await currentUserId(request)
        if (userId === undefined) {
          return Response.json({ error: 'no_account' }, { status: 404 })
        }

        const dump = await exportEverything(userId)
        if (dump === undefined) {
          return Response.json({ error: 'no_account' }, { status: 404 })
        }

        // A count, never content. This is the request most likely to be read in an incident review.
        event('account.exported', {
          requestId: id,
          resumes: dump.resumes.length,
          variants: dump.variants.length,
        })

        return new Response(JSON.stringify(dump, null, 2), {
          headers: {
            'content-type': 'application/json',
            'content-disposition':
              'attachment; filename="hunterready-my-data.json"',
            'cache-control': 'no-store',
          },
        })
      },
    },
  },
})
