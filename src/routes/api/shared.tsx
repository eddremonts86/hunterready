/**
 * What a share link shows — the only unauthenticated read of a CV in this product.
 *
 * ## One answer for every failure
 *
 * Unknown token, revoked, expired, or a document since deleted all return the same 404. That is
 * deliberate: telling a visitor that a token *was* valid but has expired confirms the CV exists, and
 * confirming existence to somebody holding a guessed URL is the one thing this endpoint must not do. The
 * page shows one message for all of them.
 *
 * ## What it does not return
 *
 * No owner, no account, no other links, no provenance, no `resumeId`. Only the document, the label the
 * sharer chose, and when the link dies. Anything else would be information the recipient was not given a
 * link to.
 *
 * ## Never indexed
 *
 * `X-Robots-Tag: noindex, nofollow, noarchive` here and a `<meta>` on the page. A CV in a search index is
 * a leak that outlives the link, and a crawler that follows a URL from a pasted email is not hypothetical.
 */
import { createFileRoute } from '@tanstack/react-router'
import { readShare } from '@/db/repository'
import { isPersistenceEnabled } from '@/db/client'
import { event, requestId } from '@/lib/log'

/** Shared by both failure paths, so they cannot drift apart and start leaking the difference. */
function gone(): Response {
  return Response.json(
    { error: 'not_available' },
    {
      status: 404,
      headers: {
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex, nofollow, noarchive',
      },
    },
  )
}

export const Route = createFileRoute('/api/shared')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = requestId()
        if (!isPersistenceEnabled()) return gone()

        const token = new URL(request.url).searchParams.get('token')
        if (token === null || token === '') return gone()

        const shared = await readShare(token)
        if (shared === undefined) {
          // A code, never the token: a token in a log line is a working credential in a log aggregator.
          event('share.miss', { requestId: id })
          return gone()
        }

        event('share.hit', { requestId: id })

        return Response.json(
          {
            resume: shared.resume,
            label: shared.label,
            expiresAt: shared.expiresAt.toISOString(),
          },
          {
            headers: {
              'cache-control': 'no-store',
              'x-robots-tag': 'noindex, nofollow, noarchive',
            },
          },
        )
      },
    },
  },
})
