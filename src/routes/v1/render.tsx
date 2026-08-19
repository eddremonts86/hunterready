/**
 * `POST /v1/render` — a `Resume` in, a PDF out.
 *
 * ## Why this is not a second renderer
 *
 * It imports `renderResume`, `readSelection`, `refuseUnlessEntitled` and `pdfResponse` from the
 * browser's own route. **The paid-design gate in particular is the same function, not an equivalent
 * one.** A copy would be a second place for the paywall to hold or fail, and
 * `production-parity.parity.test.ts` only watches one of them.
 *
 * ## Why `/v1` and not `/api/v1`
 *
 * `/api/*` is what the browser client talks to and it changes when the interface changes. `/v1/*` is
 * a contract somebody else builds against. Keeping them apart is the difference between "we moved a
 * field" and "we broke a partner", and having said that out loud once is cheaper than discovering
 * which of the fifteen `/api` routes somebody had started depending on.
 */
import { createFileRoute } from '@tanstack/react-router'

import { enterV1 } from '@/lib/v1'

import { Resume } from '@/schema/resume'
import { renderResume } from '@/render/render'
import {
  pdfResponse,
  readSelection,
  refuseUnlessEntitled,
} from '@/routes/api/render'
import { errorEvent, event } from '@/lib/log'

export const Route = createFileRoute('/v1/render')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const entry = await enterV1(request, 'render')
        if ('refusal' in entry) return entry.refusal
        const { id } = entry.ok

        let body: unknown
        try {
          body = await request.json()
        } catch {
          body = undefined
        }

        const parsed = Resume.safeParse(body)
        if (!parsed.success) {
          /*
            A sentence and no issue list, for the same reason `/api/render` stopped returning one: a
            zod issue quotes the value it rejected, and that value is CV content travelling in a
            response body (docs/07).
          */
          event('v1.render.invalid', { requestId: id })
          return Response.json(
            {
              error: 'invalid_resume',
              message:
                'That resume does not match the schema. See docs/api for the shape.',
              requestId: id,
            },
            { status: 422, headers: { 'x-request-id': id } },
          )
        }

        const selection = readSelection(new URL(request.url))
        // The same gate the browser meets, called rather than reimplemented.
        const refusal = await refuseUnlessEntitled(request, selection)
        if (refusal !== undefined) return refusal

        try {
          const { bytes, filename } = await renderResume(parsed.data, selection)
          event('v1.render.ok', { requestId: id, bytes: bytes.length })
          const response = pdfResponse(bytes, filename, true)
          response.headers.set('x-request-id', id)
          return response
        } catch (error) {
          // The message, never the document. A render error can quote the content it choked on.
          errorEvent('v1.render.failed', {
            requestId: id,
            code: error instanceof Error ? error.name : 'unknown',
          })
          return Response.json(
            {
              error: 'render_failed',
              message: 'That resume could not be rendered.',
              requestId: id,
            },
            { status: 500, headers: { 'x-request-id': id } },
          )
        }
      },
    },
  },
})
