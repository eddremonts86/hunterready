/**
 * The service worker's one non-negotiable: nothing about a person is ever written to disk.
 *
 * ## Why this runs the worker instead of reading it
 *
 * A grep for `'/api/'` would pass on a file that checks the prefix and then caches anyway. So this
 * evaluates `src/pwa/service-worker.js` in a constructed worker scope, dispatches real fetch events at
 * it, and asserts on what it *did*: whether it answered, and what it put in a cache. No `vi.mock`,
 * in keeping with the rest of this suite — the harness below is a fake `self`, not a fake worker.
 *
 * The property is stated twice on purpose, because the two halves fail differently:
 *
 *   1. **`/api/*` is not answered at all.** Not answered-and-not-cached: declining to call
 *      `respondWith` is what keeps the worker out of that path entirely, so no future edit to the
 *      caching branches can reach a CV, a session or an entitlement.
 *   2. **No response body is cached for anything but a content-addressed asset.** A navigation is
 *      answered from the network and never stored, so a server-rendered field — there are none today
 *      — could not become a plaintext copy on the device by somebody else's later change.
 *
 * docs/07 forbids CV content in logs, errors and telemetry. Cache Storage is the same category and
 * worse: it outlives the session, survives a sign-out, and is readable by anything with access to the
 * origin's storage.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

const SOURCE = readFileSync(
  join(import.meta.dirname, '..', 'service-worker.js'),
  'utf8',
)

/** What a fetch event did, which is the only thing worth asserting. */
interface Outcome {
  answered: boolean
  body?: string
}

interface Harness {
  fetchEvent: (
    url: string,
    init?: { mode?: string; method?: string },
  ) => Promise<Outcome>
  cachedPaths: () => Array<string>
}

/**
 * A worker scope, built rather than mocked.
 *
 * `caches` is a real Map-backed store so "what ended up in the cache" is a fact this test can read
 * instead of a call it has to trust. `fetch` answers everything with a 200 so that any cache write
 * the worker wants to make actually happens — a stub that failed would let a caching bug pass.
 */
function load(): Harness {
  const listeners = new Map<string, (event: unknown) => void>()
  const store = new Map<string, Map<string, string>>()

  const caches = {
    open: async (name: string) => {
      const cache = store.get(name) ?? new Map<string, string>()
      store.set(name, cache)
      return {
        addAll: async (requests: Array<Request>) => {
          for (const request of requests)
            cache.set(new URL(request.url).pathname, 'precached')
        },
        put: async (request: Request, response: Response) => {
          cache.set(new URL(request.url).pathname, await response.text())
        },
        keys: async () => [...cache.keys()],
      }
    },
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
    match: async (request: Request | string) => {
      const path =
        typeof request === 'string' ? request : new URL(request.url).pathname
      for (const cache of store.values()) {
        if (cache.has(path)) return new Response(cache.get(path))
      }
      return undefined
    },
  }

  const self = {
    location: new URL('https://hunterready.test/'),
    addEventListener: (name: string, handler: (event: unknown) => void) => {
      listeners.set(name, handler)
    },
    clients: { claim: async () => undefined },
    caches,
  }

  const run = new Function(
    'self',
    'caches',
    'fetch',
    'Request',
    'Response',
    'URL',
    SOURCE,
  ) as (...args: Array<unknown>) => void

  run(
    self,
    caches,
    async (request: Request | string) => {
      const url = typeof request === 'string' ? request : request.url
      const response = new Response(
        `body of ${new URL(url, 'https://hunterready.test').pathname}`,
        { status: 200 },
      )
      /*
        `basic` is what a same-origin fetch reports, and the worker refuses to cache anything else —
        deliberately, so an opaque or errored response never becomes a permanent failure on disk.
        Node's `Response` says `default`, so without this the asset-caching test failed and the
        harness, not the worker, was wrong. A fake that is easier on the code than the browser is
        worse than no test.
      */
      Object.defineProperty(response, 'type', { value: 'basic' })
      return response
    },
    Request,
    Response,
    URL,
  )

  return {
    fetchEvent: async (url, init = {}) => {
      const handler = listeners.get('fetch')
      if (handler === undefined)
        throw new Error('the worker registered no fetch handler')

      let answered = false
      let promise: Promise<Response> | undefined
      const request = {
        url: new URL(url, 'https://hunterready.test').toString(),
        method: init.method ?? 'GET',
        mode: init.mode ?? 'no-cors',
      }
      handler({
        request,
        respondWith: (value: Promise<Response>) => {
          answered = true
          promise = value
        },
      })
      if (!answered) return { answered: false }
      const response = await promise
      return { answered: true, body: await response!.text() }
    },
    cachedPaths: () =>
      [...store.values()].flatMap((cache) => [...cache.keys()]),
  }
}

describe('the service worker never stores anything about a person', () => {
  let sw: Harness

  beforeEach(() => {
    sw = load()
  })

  it('registers a fetch handler at all, which is what makes the app installable', async () => {
    // Chrome will not offer to install without one, so its absence is a product regression and not
    // only a caching one.
    const outcome = await sw.fetchEvent('/assets/index-abc123.js')
    expect(outcome.answered).toBe(true)
  })

  it.each([
    '/api/processing',
    '/api/library',
    '/api/ingest',
    '/api/render',
    '/api/billing/checkout',
    '/api/auth/get-session',
    '/api/account/export',
  ])('does not even answer %s', async (path) => {
    const outcome = await sw.fetchEvent(path)
    /*
      `answered: false` is the assertion, not an empty cache. Declining the request leaves the whole
      API surface outside this file's reach; answering it and choosing not to cache would put every
      future edit one mistake away from a CV on disk.
    */
    expect(outcome.answered).toBe(false)
    expect(sw.cachedPaths()).toEqual([])
  })

  it('does not answer a navigation to an API path either, which is what proves the guard runs first', async () => {
    /*
      This is the case that discriminates, and the first version of this file did not have it.
      Every other API assertion here passes with the bypass deleted — an `/api/` GET matches no
      caching branch, so the worker declines it either way, and the test was green against a worker
      with no privacy guard at all. Confirmed by deleting the line and watching twelve tests pass.

      A navigation is different: `mode: 'navigate'` matches a branch. With the guard, this is
      declined; without it, the worker answers an API request and can hand back the offline page in
      place of JSON. So this single case is what the ordering claim rests on.
    */
    const outcome = await sw.fetchEvent('/api/v1/openapi.json', {
      mode: 'navigate',
    })
    expect(outcome.answered).toBe(false)
  })

  it('never caches a navigation, so a rendered document cannot land on the device', async () => {
    const outcome = await sw.fetchEvent('/', { mode: 'navigate' })
    expect(outcome.answered).toBe(true)
    expect(outcome.body).toContain('body of /')
    expect(sw.cachedPaths()).toEqual([])
  })

  it('caches content-addressed assets, which is the whole point of having a worker', async () => {
    await sw.fetchEvent('/assets/index-abc123.js')
    await sw.fetchEvent('/icons/icon-192.png')
    expect(sw.cachedPaths().sort()).toEqual([
      '/assets/index-abc123.js',
      '/icons/icon-192.png',
    ])
  })

  it('ignores anything that is not a GET', async () => {
    // A POST is a change somebody is making. Every one of them in this app carries CV content.
    const outcome = await sw.fetchEvent('/assets/index-abc123.js', {
      method: 'POST',
    })
    expect(outcome.answered).toBe(false)
    expect(sw.cachedPaths()).toEqual([])
  })

  it('leaves another origin alone', async () => {
    const outcome = await sw.fetchEvent('https://elsewhere.test/assets/x.js')
    expect(outcome.answered).toBe(false)
  })
})
