/**
 * `GET /v1/openapi.json` — the contract, machine-readable.
 *
 * Unauthenticated on purpose, and it is the only `/v1` route that is. A contract you need a key to
 * read is a contract you cannot evaluate before asking for one, and there is nothing in here that is
 * not already in `docs/api/`. `enterV1` is deliberately not called: no key, no quota, no request id.
 *
 * The URL carries `.json` through the file router's `[.]` escape, because that is the name every
 * client-generator, Postman importer and renderer guesses first.
 */
import { createFileRoute } from '@tanstack/react-router'

import { openApiDocument } from '@/api/openapi'

export const Route = createFileRoute('/v1/openapi.json')({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => {
        /*
          The server it is actually being served from, not a constant.

          A document that hardcodes production sends anyone reading it on a preview build straight at
          the live API with a key they were testing against something else. `origin` is whatever the
          reader reached, which is the only base URL that can never be wrong.
        */
        const { origin } = new URL(request.url)

        return Response.json(openApiDocument(origin), {
          headers: {
            // Public and stable within a deploy; a renderer fetches it on every page load.
            'cache-control': 'public, max-age=300',
            // So a browser tab can read it from a docs page served anywhere.
            'access-control-allow-origin': '*',
          },
        })
      },
    },
  },
})
