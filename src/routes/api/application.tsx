/**
 * Save one tailored CV against the job it was tailored for — v0.5's application tracker.
 *
 * ## The question this exists to answer
 *
 * "What did I actually send them?" A recruiter rings back five weeks later about a version of a CV the
 * candidate no longer has a copy of, because they have since tailored it four more times. That is the
 * whole reason a variant is stored as its own row holding its own document rather than as a diff or a
 * set of moves: the artifact has to be reproducible verbatim, months later, without replaying anything.
 *
 * It is also why the advert text is stored beside it. The gap report is only interpretable against the
 * requirements it was computed from, and "why did I reorder it that way?" is unanswerable without them.
 *
 * ## Saving an application saves the base CV first
 *
 * `variants.resumeId` is a foreign key, so a variant cannot exist without a base row. Rather than make
 * the interface teach that ordering — a "save your CV before you can save an application" error is our
 * schema leaking into someone's afternoon — this endpoint accepts both documents and does it in order.
 *
 * ## What is not stored
 *
 * The `status` vocabulary stops at what we can observe. `draft` is a variant that exists; `sent` is one
 * the candidate has told us they sent. There is no `interviewing`, `rejected` or `offer`, because this
 * product has no way to know any of those and a tracker that quietly asks people to maintain their own
 * pipeline by hand is a different product with a different amount of work in it.
 */
import { createFileRoute } from '@tanstack/react-router'
import { Resume } from '@/schema/resume'
import { saveResume, saveVariant, setApplicationStatus } from '@/db/repository'
import { isPersistenceEnabled } from '@/db/client'
import { currentUserId } from '@/lib/session'
import { event, requestId } from '@/lib/log'

/** What the tracker can honestly say about a row. See the note above on why it stops here. */
const STATUSES = new Set(['draft', 'sent'])

/** Long enough for any advert, and the same bound `/api/target` accepts. */
const MAX_ADVERT_CHARS = 15_000

function text(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed.slice(0, limit)
}

export const Route = createFileRoute('/api/application')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const id = requestId()
        if (!isPersistenceEnabled()) {
          return Response.json({ error: 'no_account' }, { status: 404 })
        }
        const userId = await currentUserId(request)
        if (userId === undefined) {
          return Response.json({ error: 'no_account' }, { status: 404 })
        }

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
          resume?: unknown
          baseResume?: unknown
          resumeId?: unknown
          company?: unknown
          role?: unknown
          advert?: unknown
          gapReport?: unknown
          status?: unknown
        }

        const tailored = Resume.safeParse(payload.resume)
        if (!tailored.success) {
          return Response.json(
            {
              error: 'invalid_resume',
              message: 'We could not read that version of your CV.',
            },
            { status: 400 },
          )
        }

        /**
         * The base row, created on demand.
         *
         * `baseResume` is the untailored document when the client has one; otherwise the tailored one
         * stands in as the base. That fallback is honest rather than convenient: a variant is a
         * reordering of *something*, and if the only document we were given is the tailored one, then
         * that is the CV this person has.
         */
        let resumeId = text(payload.resumeId, 64)
        if (resumeId === undefined) {
          const base = Resume.safeParse(payload.baseResume)
          resumeId = await saveResume({
            userId,
            resume: base.success ? base.data : tailored.data,
          })
        }

        const status =
          typeof payload.status === 'string' && STATUSES.has(payload.status)
            ? payload.status
            : 'draft'

        const company = text(payload.company, 200)
        const role = text(payload.role, 200)
        const advert = text(payload.advert, MAX_ADVERT_CHARS)

        const variantId = await saveVariant({
          userId,
          resumeId,
          resume: tailored.data,
          ...(company === undefined ? {} : { company }),
          ...(role === undefined ? {} : { role }),
          ...(advert === undefined ? {} : { jobDescription: advert }),
          ...(payload.gapReport === undefined
            ? {}
            : { gapReport: payload.gapReport }),
          status,
        })

        // No role, no company, no advert — a job title is not the candidate's data but it is a detail
        // of their job hunt, and this file's rule is counts and codes (docs/07-privacy.md).
        event('application.saved', { requestId: id, status })

        return Response.json(
          { variantId, resumeId },
          { headers: { 'cache-control': 'no-store' } },
        )
      },

      /**
       * Move one application between `draft` and `sent`.
       *
       * Status is the only thing a PATCH may touch. The stored document is immutable by design — it is
       * the record of what a recruiter is holding, and a tracker that lets you edit history is not a
       * record of anything.
       */
      PATCH: async ({ request }) => {
        const id = requestId()
        if (!isPersistenceEnabled()) {
          return Response.json({ error: 'no_account' }, { status: 404 })
        }
        const userId = await currentUserId(request)
        if (userId === undefined) {
          return Response.json({ error: 'no_account' }, { status: 404 })
        }

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

        const payload = body as { variantId?: unknown; status?: unknown }
        const variantId = text(payload.variantId, 64)
        if (
          variantId === undefined ||
          typeof payload.status !== 'string' ||
          !STATUSES.has(payload.status)
        ) {
          return Response.json(
            {
              error: 'bad_request',
              message: 'We could not apply that change.',
            },
            { status: 400 },
          )
        }

        const changed = await setApplicationStatus({
          userId,
          variantId,
          status: payload.status as 'draft' | 'sent',
        })
        if (!changed) {
          // Not found *or* not theirs, answered identically on purpose: distinguishing the two tells
          // an attacker which ids exist.
          return Response.json({ error: 'not_found' }, { status: 404 })
        }

        event('application.status', { requestId: id, status: payload.status })
        return Response.json(
          { ok: true },
          { headers: { 'cache-control': 'no-store' } },
        )
      },
    },
  },
})
