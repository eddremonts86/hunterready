/**
 * `GET /api/result?id=…` — collect the answer a long job left behind.
 *
 * The other half of `job-result.ts`. The client already polls `/api/progress` with this same id for
 * the narration; this is where the answer itself arrives, so a request that takes 52 to 101 seconds
 * on the local model does not have to be held open for it.
 *
 * **`204` means "not yet", not "not found".** Those two are indistinguishable from here — a job that
 * has not finished and an id that never existed look identical in an in-memory map — and inventing a
 * difference would mean holding a record of every id ever seen, which is a log of who used the
 * product. So the client polls until it gets something or gives up on its own clock, exactly as it
 * already does for progress.
 *
 * A result is read once and deleted. Two tabs polling one id is a client bug, and the second one
 * getting nothing is the correct outcome rather than a race worth supporting.
 */
import { createFileRoute } from '@tanstack/react-router'

import { collect } from '@/lib/job-result'
import { isProgressId } from '@/lib/progress'

export const Route = createFileRoute('/api/result')({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => {
        const id = new URL(request.url).searchParams.get('id')
        if (!isProgressId(id)) {
          return Response.json(
            { error: 'bad_id', message: 'That is not a job id.' },
            { status: 400 },
          )
        }

        const found = collect(id)
        // Still working, or never existed. The client cannot tell and does not need to.
        if (found === undefined) return new Response(null, { status: 204 })

        if (!found.ok) {
          return Response.json(
            { error: found.error, message: found.message },
            { status: found.status, headers: { 'cache-control': 'no-store' } },
          )
        }

        return Response.json(found.value, {
          // A CV must not sit in an intermediary on its way back.
          headers: { 'cache-control': 'no-store' },
        })
      },
    },
  },
})
