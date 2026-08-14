/**
 * POST a cover letter's text and the CV it belongs to; get a `.docx` back — v0.7.
 *
 * A separate route from `/api/render` rather than another flag on it. `/api/render` takes a `Resume` and
 * nothing else; a letter is a `Resume` **plus** a body of text the candidate may have edited, so folding
 * it in would mean one endpoint with two incompatible request shapes and a parameter deciding which.
 *
 * The text comes from the client because the candidate is expected to edit it. The letter this returns
 * is the one on their screen — not a re-draft, which would quietly discard their changes and be
 * indistinguishable from a bug.
 */
import { createFileRoute } from '@tanstack/react-router'
import { errorEvent } from '@/lib/log'
import { Resume } from '@/schema/resume'
import { letterFilename, renderLetterDocx } from '@/render/docx/docx'

/** Generous, and still bounded: a cover letter that needs more than this is not a cover letter. */
const MAX_LETTER_CHARS = 8000

export const Route = createFileRoute('/api/render-letter')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Two shapes, as `/api/render` has: JSON from `fetch`, or form fields from the download button.
        // A form POST is the only way to make the browser stream a file to disk rather than hold it.
        let resumeRaw: unknown
        let letter: string | undefined

        const contentType = request.headers.get('content-type') ?? ''
        if (contentType.includes('form')) {
          const form = await request.formData()
          const raw = form.get('resume')
          try {
            resumeRaw = typeof raw === 'string' ? JSON.parse(raw) : undefined
          } catch {
            resumeRaw = undefined
          }
          const text = form.get('letter')
          letter = typeof text === 'string' ? text : undefined
        } else {
          try {
            const body = (await request.json()) as {
              resume?: unknown
              letter?: unknown
            }
            resumeRaw = body.resume
            letter = typeof body.letter === 'string' ? body.letter : undefined
          } catch {
            resumeRaw = undefined
          }
        }

        const parsed = Resume.safeParse(resumeRaw)
        if (!parsed.success || letter === undefined || letter.trim() === '') {
          return Response.json(
            {
              error: 'bad_request',
              message: 'We could not build that letter.',
            },
            { status: 400 },
          )
        }

        /**
         * Wrapped for the same reason as `/api/render`: an unhandled throw here becomes the framework's
         * 500 page, and the client now shows the message instead of navigating into it. The letter is
         * the worst thing to lose this way — it is the one document the candidate has been editing by
         * hand, and nothing has stored their edits.
         *
         * The class name only, never the message: a letter is nothing but the candidate's own words.
         */
        try {
          const bytes = renderLetterDocx(
            letter.slice(0, MAX_LETTER_CHARS),
            parsed.data,
          )

          return new Response(bytes as unknown as BodyInit, {
            headers: {
              'content-type':
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'content-disposition': `attachment; filename="${letterFilename(parsed.data)}"`,
              // A letter names the candidate and the employer; no intermediary should keep a copy.
              'cache-control': 'no-store',
            },
          })
        } catch (error) {
          errorEvent('render_letter.failed', {
            format: 'docx',
            code: error instanceof Error ? error.constructor.name : 'unknown',
          })
          return Response.json(
            {
              error: 'render_failed',
              message:
                'We could not build the letter just now. Your text is unchanged — please try again.',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
