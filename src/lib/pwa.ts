/**
 * Registering the service worker, and the two conditions under which we refuse to.
 *
 * ## Not in a dev server
 *
 * `import.meta.env.PROD` gates this, and the reason is a pain this repo has already written down
 * three times: *"why don't I see the change"*, which turned out to be a stale artefact every time.
 * A worker serving a previous bundle's assets is a fourth way to have that afternoon, and the worst
 * one, because it survives a rebuild and a hard reload.
 *
 * It still registers in `pnpm host` and `pnpm app` — both are real production builds — so the whole
 * install path is exercisable locally rather than only after a deploy. Only `vite dev` is excluded.
 *
 * ## Not without a secure context
 *
 * `navigator.serviceWorker` is undefined on plain HTTP, so a phone opening `http://192.168.1.x:3013`
 * over the LAN gets the site and no worker: no install prompt, no offline page. That is the browser's
 * rule, not ours, and it is worth stating out loud because it is the one thing that makes "test the
 * PWA on my phone" require HTTPS rather than an IP address. `localhost` is exempt by spec, which is
 * why :3013 works.
 *
 * ## Why the failure is swallowed
 *
 * Everything this worker provides is an improvement on a working app: installability and a nicer
 * offline screen. Nothing depends on it. So a registration that fails logs a code and stops — a
 * thrown error here would take down a page that is otherwise completely fine.
 */
import { event, errorEvent } from '@/lib/log'

let attempted = false

export async function registerServiceWorker(): Promise<void> {
  if (!import.meta.env.PROD) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator))
    return

  // React can mount an effect twice in development and a router can remount the shell; registering
  // twice is harmless but the log line would suggest something is looping.
  if (attempted) return
  attempted = true

  try {
    /*
      Root scope, from the root path. A worker served from `/assets/` could only ever control
      `/assets/`, which is the one part of the site that does not need controlling.
    */
    await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    // A count, no URL and nothing about the person — the rule the rest of `log.ts` follows.
    event('pwa.worker_registered')
  } catch (error: unknown) {
    errorEvent('pwa.worker_failed', {
      code: error instanceof Error ? error.name : 'unknown',
    })
  }
}
