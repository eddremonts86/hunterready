/**
 * The service worker. Two jobs, and a long list of things it deliberately does not do.
 *
 * ## What it is for
 *
 *   1. **Installability.** Chrome will not offer "Add to Home screen" without a worker that has a
 *      `fetch` handler, so the alternative to this file is a manifest nobody can install.
 *   2. **A real page when the network is gone.** Without it, a phone in a lift shows the browser's
 *      dinosaur on a product that just promised to be reliable.
 *
 * ## What it must never do: cache anything about a person
 *
 * `/api/*` is passed straight through, untouched, and that is the single most important line in this
 * file. Those responses carry CV content, session state and entitlements, and a Cache Storage entry
 * is a plaintext copy of the response body sitting on the device — outliving the session, outliving a
 * sign-out, and readable by anything with access to the origin's storage. docs/07 says no CV content
 * in logs, errors or telemetry for the same reason it applies here: **the strongest guarantee about
 * data you must not hold is that there is nowhere for it to land.**
 *
 * Server-rendered HTML is not cached either, for the narrower version of the same reason. Nothing
 * renders CV content into the document today — the workspace fetches it — but a cache write here
 * would turn any future server-rendered field into a copy on disk, silently, and the person who made
 * that change would have no reason to look in this file.
 *
 * `sw-privacy.test.ts` asserts both, against these bytes.
 *
 * ## What it does cache
 *
 * Content-addressed assets only: `/assets/*` (Vite's hashed JS, CSS and fonts) and `/icons/*`. A
 * hashed filename is its own version, so cache-first on those is correct rather than a staleness bet.
 * Plus the offline page and the manifest, precached at install so the fallback cannot itself fail.
 *
 * ## Why this file is not in `public/`, and the bug that put it here
 *
 * `scripts/make-sw.mjs` stamps the commit into the `BUILD` line and writes `public/sw.js`, **before**
 * `vite build` runs. A version somebody has to remember to bump is a version that is wrong the first
 * time it matters, and here being wrong means serving a previous deploy's assets to a phone that has
 * no way to tell. A new commit means new cache names, and `activate` deletes everything that is not
 * current — which is also what stops the assets cache growing by one full bundle per deploy, forever.
 *
 * The first attempt stamped it *after* the build, from `copy-assets.mjs`, the way that script already
 * adds the WASM and the fonts. It produced a service worker that would not register at all:
 *
 *     TypeError: ServiceWorker script evaluation failed
 *     SyntaxError: Unexpected end of input
 *
 * Nitro bakes a manifest of `public/` into `.output/server/index.mjs` — `etag`, `mtime`, `size` and
 * `path` per file — so growing the file on disk after the build left `"size": 6670` describing 6726
 * bytes, and the server truncated the response mid-comment, dropping the final `})`. **Anything in
 * `public/` must be final before `vite build` runs.** `copy-assets.mjs` gets away with it because it
 * writes to `.output/server/`, which has no such manifest.
 *
 * ## Why it does not call `skipWaiting`
 *
 * An updated worker waits until every tab of the app is closed. The alternative — taking over
 * immediately — can swap the asset cache under a page that is mid-review, with a half-corrected CV in
 * it, to save one reload. Nothing here is urgent enough to be worth that; the update lands next time
 * the app is opened.
 */
// Replaced by scripts/make-sw.mjs, which matches this whole line rather than the token — so the
// prose above can name `__HR_BUILD__` without being rewritten along with it.
const BUILD = '__HR_BUILD__'

const SHELL = `hr-shell-${BUILD}`
const ASSETS = `hr-assets-${BUILD}`

/** The fallback and the icons it may need. Small, and every one of them public by nature. */
const PRECACHE = [
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/favicon-32.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL)
      /*
        `reload` so an install never adopts an entry from the HTTP cache. Precaching a stale
        offline.html is a bug that only appears when you are offline, which is the worst possible
        time to discover it.
      */
      await cache.addAll(
        PRECACHE.map((url) => new Request(url, { cache: 'reload' })),
      )
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, ASSETS])
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((name) => name.startsWith('hr-') && !keep.has(name))
          .map((name) => caches.delete(name)),
      )
      /*
        Claiming open clients is safe in a way `skipWaiting` is not: it changes who answers the *next*
        request rather than replacing the running worker mid-flight, and without it the offline
        fallback does not work until the second visit — which is the visit somebody is least likely to
        make from a train.
      */
      await self.clients.claim()
    })(),
  )
})

/** Everything about a person goes through here untouched. Read the second section above before editing. */
function isPrivate(url) {
  return url.pathname === '/api' || url.pathname.startsWith('/api/')
}

/** Content-addressed, so cache-first is a fact about the URL rather than a guess about freshness. */
function isImmutable(url) {
  return (
    url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Only GET. A POST is a change somebody is making, and a cache has no business in that path.
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Another origin's caching policy is not ours to override.
  if (url.origin !== self.location.origin) return

  if (isPrivate(url)) return

  /*
    Navigations: the network decides, and the offline page is the only fallback. No cache write, so a
    server-rendered document never lands on the device.
  */
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request)
        } catch {
          const cached = await caches.match('/offline.html')
          return (
            cached ??
            new Response('You are offline.', {
              status: 503,
              headers: { 'content-type': 'text/plain; charset=utf-8' },
            })
          )
        }
      })(),
    )
    return
  }

  if (isImmutable(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request)
        if (cached !== undefined) return cached
        const response = await fetch(request)
        /*
          Only a clean answer is worth keeping. Caching an opaque or error response means the next
          load reads a failure from disk with no network involved, and nothing ever recovers.
        */
        if (response.ok && response.type === 'basic') {
          const cache = await caches.open(ASSETS)
          await cache.put(request, response.clone())
        }
        return response
      })(),
    )
    return
  }

  // Everything else — the manifest, robots, anything added later — is left to the browser.
})
