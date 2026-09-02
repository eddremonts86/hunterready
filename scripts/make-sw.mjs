/**
 * Write `public/sw.js` from `src/pwa/service-worker.js`, with this build's cache version stamped in.
 *
 * ## Why this runs before `vite build` and not after
 *
 * Nitro bakes a manifest of `public/` into the server bundle — `etag`, `mtime`, `size` and `path`
 * per file — and serves each asset against the recorded size. Editing a file in `public/` after the
 * build therefore truncates it to its old length: the first version of this stamped the worker from
 * `copy-assets.mjs`, and the browser answered
 *
 *     TypeError: ServiceWorker script evaluation failed
 *
 * because the response stopped mid-comment and the final `})` never arrived. `copy-assets.mjs` is
 * safe doing the same thing to the WASM and the fonts only because those land in `.output/server/`,
 * which is not manifested. So: `public/` is an input to the build, never an output of it.
 *
 * ## Why the output is generated rather than committed
 *
 * The version has to change per deploy or the caches never turn over, which makes `public/sw.js` a
 * build artefact by definition — committing it would mean a file that is dirty after every build and
 * whose contents are a lie about which commit produced them. `.gitignore` covers it; the source next
 * to it is what gets reviewed.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FROM = join(ROOT, 'src/pwa/service-worker.js')
const TO = join(ROOT, 'public/sw.js')

/**
 * `HR_COMMIT` is the build arg `docker-compose.yml` passes; `SOURCE_COMMIT` is Coolify's name for it.
 * Absent — a bare `pnpm build` on a laptop — the timestamp keeps the only property that matters: two
 * builds never share a cache name, so an activate always purges what came before.
 */
const BUILD =
  process.env.HR_COMMIT ??
  process.env.SOURCE_COMMIT ??
  `local-${Date.now().toString(36)}`

const source = await readFile(FROM, 'utf8')

/*
  The whole assignment, not the token. The docblock in the worker names `__HR_BUILD__` while
  explaining itself, and a `replaceAll` rewrote the prose too — harmless, and the kind of thing that
  makes a diff unreadable. Anchoring on the line shape also means this fails loudly if somebody
  renames the constant, rather than writing an unversioned worker.
*/
const LINE = /^const BUILD = '[^']*'$/m
if (!LINE.test(source)) {
  console.error(
    `make-sw: no \`const BUILD = '…'\` line in ${FROM}, so the caches would never be versioned`,
  )
  process.exit(1)
}

await mkdir(dirname(TO), { recursive: true })
await writeFile(TO, source.replace(LINE, `const BUILD = '${BUILD}'`))
console.log(`make-sw: public/sw.js  cache version ${BUILD}`)
