# The PWA

How HunterReady installs on a phone, what it does when the network goes, and the two things about it
that are easy to get wrong. The reasoning is [ADR-037](09-decisions.md#adr-037); this is the operating
manual.

## What it is

Installable and resilient, **not** offline-first. Reading a CV is a model on our own hardware,
rendering a PDF is a WASM binary in the server bundle, and the plan is a database row — so every
capability lives behind a request, by design rather than by omission. The worker buys installability
and an honest offline page, and nothing else.

| file                          | what it is                                                             |
| ----------------------------- | ---------------------------------------------------------------------- |
| `public/manifest.webmanifest` | Name, colours, icons, `display: standalone`. What a launcher reads.    |
| `src/pwa/service-worker.js`   | The worker's source. Reviewed here.                                    |
| `public/sw.js`                | **Generated** by `scripts/make-sw.mjs` before every build. Gitignored. |
| `public/offline.html`         | Self-contained: its own CSS, no font file, no script.                  |
| `public/icons/`               | Seven PNGs from `scripts/make-icons.mjs`.                              |
| `src/lib/pwa.ts`              | Registration, from the root route's component.                         |

## The two traps

**⚠️ `public/` is an input to the build, never an output of it.** Nitro manifests that directory into
the server bundle with a `size` per file and serves each asset against the recorded length, so a file
edited after `vite build` is truncated on the wire. Stamping the worker's cache version post-build cost
a session: `TypeError: ServiceWorker script evaluation failed`, because the response stopped
mid-comment. `scripts/copy-assets.mjs` may write to `.output/server/` — no manifest there — and must
not write to `.output/public/`.

**⚠️ Installing needs HTTPS.** `navigator.serviceWorker` is undefined outside a secure context, so a
phone opening `http://192.168.1.x:3013` over the LAN gets the site, no worker, no install prompt and
no offline page. `localhost` is exempt by spec, which is why `:3013` exercises the whole path. Getting
it onto a real phone means production, or a tunnel that terminates TLS.

## Testing it

```bash
pnpm host                      # :3013 — a real build, so the worker registers
```

Then, in the browser: DevTools → Application → Manifest and Service Workers. The whole flow is also
asserted without a browser:

```bash
pnpm test src/pwa              # the worker, run in a constructed scope (13 tests)
pnpm test tests/pwa-manifest   # the manifest against the bytes on disk
pnpm test:parity               # the served worker is a complete script, not a 200
```

`pnpm test:parity` is the one that matters most, because it is the only one that would have caught the
truncation.

To see the offline page: install the worker by loading the app once, stop the server, then reload.
Chrome's DevTools "Offline" checkbox does **not** reach the worker's own fetches — it emulates the
page's network, so the worker still reaches the server and the fallback never fires. Stopping the
server is the test that works.

## Changing an icon

```bash
node scripts/make-icons.mjs    # reads --color-signal and Figtree from source, writes public/icons/
```

The mark is `HR.` — the wordmark's initials and its Signal Blue full stop, inverted so the field
carries the accent. DESIGN.md defines no app icon; that derivation is the closest thing to one. The
plain and maskable pairs are separate files on purpose: Android crops a maskable icon to the launcher's
shape and guarantees only the middle 80%.

## What the worker will not do

`/api/*` is declined outright — not answered and cached, _declined_, so no future caching branch can
reach a CV, a session or an entitlement. Server-rendered HTML is never cached either. Only
content-addressed URLs (`/assets/*`, `/icons/*`) go in, because a hashed filename is its own version.

`sw-privacy.test.ts` asserts both. Read its docblock before changing the fetch handler: the obvious
version of that test passes against a worker with no privacy guard at all.
