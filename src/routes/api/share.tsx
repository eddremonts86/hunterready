/**
 * Create, list and revoke public share links — v0.9.
 *
 * ## The one endpoint in this product that creates a public thing
 *
 * Everything else here is reachable only with a session. A share link is readable by anybody holding the
 * URL, which is the point and also the risk, so three decisions are enforced here rather than trusted:
 *
 * **The target must be the caller's.** A token pointing at somebody else's CV would be a data breach with
 * a feature name on it, so ownership is checked against the caller's own library before the row exists —
 * not inferred from ids in the body.
 *
 * **There is no "no expiry".** `days` is clamped in the repository, and the column is `notNull`. A caller
 * asking for ten years gets ninety days rather than an error, because the pressure on this parameter is
 * always toward longer and a ceiling that lives in the store cannot be forgotten.
 *
 * **Revoking is a first-class action, not a delete.** `DELETE` here sets `revokedAt`, so the access log
 * can still explain what a visitor saw last week.
 *
 * Nothing here logs a token. A token in a log line is a working credential sitting in a log aggregator.
 */
import { createFileRoute } from '@tanstack/react-router'
import {
  createShare,
  listResumes,
  listShares,
  listVariants,
  revokeShare,
  SHARE_DAYS,
} from '@/db/repository'
import { isPersistenceEnabled } from '@/db/client'
import { currentUserId } from '@/lib/session'
import { event, requestId } from '@/lib/log'

function noAccount(): Response {
  return Response.json({ error: 'no_account' }, { status: 404 })
}

export const Route = createFileRoute('/api/share')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isPersistenceEnabled()) return noAccount()
        const userId = await currentUserId(request)
        if (userId === undefined) return noAccount()

        return Response.json(
          { links: await listShares(userId), defaultDays: SHARE_DAYS },
          { headers: { 'cache-control': 'no-store' } },
        )
      },

      POST: async ({ request }) => {
        const id = requestId()
        if (!isPersistenceEnabled()) return noAccount()
        const userId = await currentUserId(request)
        if (userId === undefined) return noAccount()

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json(
            {
              error: 'bad_request',
              message: 'That request did not arrive intact.',
            },
            { status: 400 },
          )
        }

        const payload = body as {
          resumeId?: unknown
          variantId?: unknown
          label?: unknown
          days?: unknown
        }
        const resumeId =
          typeof payload.resumeId === 'string' && payload.resumeId !== ''
            ? payload.resumeId
            : undefined
        const variantId =
          typeof payload.variantId === 'string' && payload.variantId !== ''
            ? payload.variantId
            : undefined

        if ((resumeId === undefined) === (variantId === undefined)) {
          // Exactly one. Both would make "what does this link show?" ambiguous; neither shows nothing.
          return Response.json(
            {
              error: 'bad_request',
              message: 'We could not tell which version you want to share.',
            },
            { status: 400 },
          )
        }

        /**
         * Ownership, checked against the caller's own library rather than assumed.
         *
         * The alternative — inserting with the session's `userId` and letting the foreign key succeed —
         * would happily create a link from this account to another account's CV, because the FK only
         * checks that the row *exists*. This is the check that makes that impossible.
         */
        const [ownResumes, ownVariants] = await Promise.all([
          resumeId === undefined ? Promise.resolve([]) : listResumes(userId),
          variantId === undefined ? Promise.resolve([]) : listVariants(userId),
        ])
        const owned =
          resumeId !== undefined
            ? ownResumes.some((row) => row.id === resumeId)
            : ownVariants.some((row) => row.id === variantId)

        if (!owned) {
          // The same answer as "no such row", on purpose: distinguishing them tells a caller which ids
          // exist in other people's accounts.
          return Response.json({ error: 'not_found' }, { status: 404 })
        }

        const { token, expiresAt } = await createShare({
          userId,
          ...(resumeId === undefined ? {} : { resumeId }),
          ...(variantId === undefined ? {} : { variantId }),
          ...(typeof payload.label === 'string'
            ? { label: payload.label.trim().slice(0, 120) }
            : {}),
          ...(typeof payload.days === 'number' ? { days: payload.days } : {}),
        })

        // No token, and no label: a label is text the user typed. Counts and codes only.
        event('share.created', { requestId: id })

        return Response.json(
          { token, expiresAt: expiresAt.toISOString() },
          { headers: { 'cache-control': 'no-store' } },
        )
      },

      DELETE: async ({ request }) => {
        const id = requestId()
        if (!isPersistenceEnabled()) return noAccount()
        const userId = await currentUserId(request)
        if (userId === undefined) return noAccount()

        let body: unknown
        try {
          body = await request.json()
        } catch {
          body = undefined
        }
        const token = (body as { token?: unknown } | undefined)?.token
        if (typeof token !== 'string' || token === '') {
          return Response.json(
            { error: 'bad_request', message: 'We could not revoke that link.' },
            { status: 400 },
          )
        }

        const revoked = await revokeShare({ userId, token })
        if (!revoked)
          return Response.json({ error: 'not_found' }, { status: 404 })

        event('share.revoked', { requestId: id })
        return Response.json(
          { ok: true },
          { headers: { 'cache-control': 'no-store' } },
        )
      },
    },
  },
})
