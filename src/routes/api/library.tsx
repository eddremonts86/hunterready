/**
 * The signed-in user's saved CVs and applications — the route v0.5 was missing.
 *
 * ## What was wrong
 *
 * v0.5 shipped the tables, the repository, the auth configuration, the GDPR endpoints and the
 * retention sweep. Every one was verified against a real Postgres. And **none of it was reachable**:
 * `saveResume`, `listResumes`, `saveVariant` and `listVariants` were imported by nothing but their own
 * tests, and `SignIn` was rendered on no screen, so no session could be created in the first place.
 *
 * That combination had a consequence worse than a missing feature. `/privacy` says "if you sign in so
 * we can remember your CV between visits, then we do store it" — and nothing stored anything. A privacy
 * notice describing data handling the code does not perform is wrong even when it over-discloses,
 * because it is the document people use to decide whether to trust us. This route is what makes that
 * sentence true.
 *
 * ## GET returns the library, POST saves the base CV
 *
 * Identity comes from the session, never from the body. A save endpoint that takes a user id from the
 * request is a way to write into someone else's account; `saveResume` puts the owner in the SQL
 * predicate rather than in an `if` above it, for the same reason.
 *
 * ## 404 rather than 401 when there is no account
 *
 * Matching `/api/account/export`. Most people will use this product without ever signing in, and for
 * them "there is nothing stored" is not an error — it is the design (ADR-004). The UI renders it as an
 * invitation, not a failure.
 */
import { createFileRoute } from '@tanstack/react-router'
import { Resume } from '@/schema/resume'
import { listResumes, listVariants, saveResume } from '@/db/repository'
import { isPersistenceEnabled } from '@/db/client'
import { currentUserId } from '@/lib/session'
import { event, requestId } from '@/lib/log'

/** A label the user did not have to type. Never the file name — that is theirs and often their name. */
const DEFAULT_LABEL = 'My CV'

export const Route = createFileRoute('/api/library')({
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

        const [resumes, variants] = await Promise.all([
          listResumes(userId),
          listVariants(userId),
        ])

        // Counts only. A label can be anything the user typed, so it never reaches a log line.
        event('library.read', {
          requestId: id,
          resumes: resumes.length,
          variants: variants.length,
        })

        return Response.json(
          {
            resumes: resumes.map((row) => ({
              id: row.id,
              label: row.label,
              updatedAt: row.updatedAt,
              resume: row.resume,
            })),
            applications: variants.map((row) => ({
              id: row.id,
              resumeId: row.resumeId,
              company: row.company,
              role: row.role,
              status: row.status,
              createdAt: row.createdAt,
            })),
          },
          { headers: { 'cache-control': 'no-store' } },
        )
      },

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
          resumeId?: unknown
          label?: unknown
        }
        const parsed = Resume.safeParse(payload.resume)
        if (!parsed.success) {
          return Response.json(
            { error: 'invalid_resume', message: 'We could not read that CV.' },
            { status: 400 },
          )
        }

        const label =
          typeof payload.label === 'string' && payload.label.trim() !== ''
            ? payload.label.trim().slice(0, 120)
            : DEFAULT_LABEL

        const resumeId = await saveResume({
          userId,
          resume: parsed.data,
          label,
          ...(typeof payload.resumeId === 'string' && payload.resumeId !== ''
            ? { resumeId: payload.resumeId }
            : {}),
        })

        event('library.saved', {
          requestId: id,
          // Whether this replaced a row or created one, as a boolean rather than an id: a row id is
          // not CV content, but it is a handle to it, and logs are the wrong place for handles.
          updated:
            typeof payload.resumeId === 'string' && payload.resumeId !== '',
        })

        return Response.json(
          { resumeId },
          { headers: { 'cache-control': 'no-store' } },
        )
      },
    },
  },
})
