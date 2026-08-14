/**
 * GDPR Article 17 — delete everything, now.
 *
 * POST rather than GET, so no prefetcher, link scanner or mail client can erase somebody's account by
 * following a URL. The confirmation is in the interface; the method is what makes it un-triggerable by
 * accident.
 *
 * The deletion is a single statement and the database enforces the cascade — see the comment on
 * `deleteEverything`. What survives is one audit row with its subject nulled, because being unable to
 * show that an erasure happened is its own compliance problem.
 */
import { createFileRoute } from '@tanstack/react-router'
import { deleteEverything } from '@/db/repository'
import { isPersistenceEnabled } from '@/db/client'
import { clearSession, currentUserId } from '@/lib/session'
import { event, requestId } from '@/lib/log'

export const Route = createFileRoute('/api/account/delete')({
  server: {
    handlers: {
      /**
       * Explicitly 405, rather than left undefined.
       *
       * With no GET handler this route falls through to the SPA shell and answers **200 with HTML** —
       * verified, not assumed. Nothing is deleted, because no handler runs, but a destructive URL that
       * answers 200 to a GET is a URL somebody will eventually mistake for a working one: in a browser
       * address bar, in a link checker's report, in a support script. Say no out loud.
       */
      GET: () =>
        new Response(
          JSON.stringify({
            error: 'method_not_allowed',
            message: 'Deleting an account requires POST. Nothing was changed.',
          }),
          {
            status: 405,
            headers: { 'content-type': 'application/json', allow: 'POST' },
          },
        ),

      POST: async ({ request }) => {
        const id = requestId()
        if (!isPersistenceEnabled()) {
          return Response.json({ error: 'no_account' }, { status: 404 })
        }
        const userId = await currentUserId(request)
        if (userId === undefined) {
          return Response.json({ error: 'no_account' }, { status: 404 })
        }

        const deleted = await deleteEverything(userId)
        event('account.deleted', { requestId: id, deleted })

        // The cookie goes with the data. Leaving a session pointing at a deleted account would show
        // the next visitor a signed-in shell with nothing in it.
        return new Response(JSON.stringify({ deleted }), {
          status: deleted ? 200 : 404,
          headers: {
            'content-type': 'application/json',
            'set-cookie': clearSession(),
            'cache-control': 'no-store',
          },
        })
      },
    },
  },
})
