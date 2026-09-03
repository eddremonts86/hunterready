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
 * The build's identity, and `??` is the wrong operator for it.
 *
 * The Dockerfile declares `ARG HR_COMMIT=unknown` with `ENV HR_COMMIT=$HR_COMMIT` behind it, so in any
 * build that does not pass the arg **the variable exists and its value is the string `"unknown"`** —
 * and a `??` chain can never reach past it. The first version of this file was
 * `HR_COMMIT ?? SOURCE_COMMIT ?? timestamp`, and the first production deploy shipped
 * `const BUILD = 'unknown'`: a constant cache name, so no deploy would ever turn the caches over and
 * the precached offline page would be frozen at that release forever. Caught by reading the served
 * worker, not by anything failing.
 *
 * `src/lib/build-stamp.ts` exists for this exact trap and its docblock predicts this mistake almost
 * word for word. Its rule is duplicated rather than imported because that is TypeScript and this
 * script runs before the build; the three lines are worth less than the pointer.
 *
 * Unlike `buildStamp`, `unknown` is not an acceptable answer here. A stamp may honestly say it does
 * not know; a cache name may not, because two builds sharing one is the whole failure. So the last
 * resort is a timestamp, which is unique by construction.
 */
const ABSENT = new Set(['', 'unknown'])
const usable = (raw) => {
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  return ABSENT.has(trimmed) ? undefined : trimmed
}

const BUILD =
  usable(process.env.HR_COMMIT) ??
  usable(process.env.SOURCE_COMMIT) ??
  `build-${Date.now().toString(36)}`

/* Which source answered, because `build-…` in a production log is a question worth being able to ask. */
const SOURCE =
  usable(process.env.HR_COMMIT) !== undefined
    ? 'HR_COMMIT'
    : usable(process.env.SOURCE_COMMIT) !== undefined
      ? 'SOURCE_COMMIT'
      : 'neither — timestamp'

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
console.log(`make-sw: public/sw.js  cache version ${BUILD}  (from ${SOURCE})`)
