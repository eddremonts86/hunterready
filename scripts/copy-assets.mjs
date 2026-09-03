/**
 * Copy runtime assets the bundler does not emit into the Nitro server output.
 *
 * Two things, both loaded at runtime through `readFile` rather than an `import`, which is why
 * Rollup never sees them:
 *
 *   1. takumi-pdf's WASM (3.7 MB). Found the hard way in Block 1 (ADR-005): `vite dev` worked,
 *      `vite build` exited 0, and the built server 500'd with ENOENT on the first render.
 *      Relative to `_libs/`, the module resolves `../pkg/…wasm` → `.output/server/pkg/`.
 *   2. The bundled fonts. takumi has no base-14: an unregistered family renders as nothing.
 *
 * Keeping both in the output is what lets the image ship `.output/` with no node_modules.
 * Runs as part of `pnpm build`; the production-parity test fails if it silently stops working.
 *
 * The third is a check rather than a copy: that `public/` reached the build output at all.
 *
 * ⚠️ **This script may not write to `.output/public/`.** Nitro manifests that directory into the
 * server bundle with a `size` per file and serves each asset against the recorded length, so a file
 * grown here is truncated on the wire. Stamping the service worker's cache version from this script
 * is exactly what that cost: `TypeError: ServiceWorker script evaluation failed`, because the
 * response stopped mid-comment. `scripts/make-sw.mjs` now does it before `vite build`. The WASM and
 * the fonts above are fine because `.output/server/` carries no such manifest.
 */
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const WASM = 'takumi_pdf_wasm_bg.wasm'
const WASM_FROM = join(ROOT, 'node_modules/takumi-pdf/pkg', WASM)
const WASM_TO = join(ROOT, '.output/server/pkg', WASM)

const FONTS_FROM = join(ROOT, 'src/render/fonts/files')
const FONTS_TO = join(ROOT, '.output/server/fonts')

// --- WASM ---------------------------------------------------------------------------------
const { size } = await stat(WASM_FROM) // throws loudly if the package layout changed
await mkdir(dirname(WASM_TO), { recursive: true })
await copyFile(WASM_FROM, WASM_TO)
console.log(
  `copy-assets: ${WASM} → .output/server/pkg/ (${(size / 1024 / 1024).toFixed(2)} MB)`,
)

// --- fonts --------------------------------------------------------------------------------
await mkdir(FONTS_TO, { recursive: true })
/**
 * `.ttf` as well as `.woff2`.
 *
 * The full-coverage document faces from `scripts/make-fonts.mjs` are TTFs (ADR-022 — takumi cannot use
 * the per-range `woff2` subsets beyond Latin). Filtering on `.woff2` alone left them out of the build, so
 * the loader found only the Latin subsets in `.output` and a Cyrillic name failed to render **in
 * production only** — the one place it is hardest to notice, since the source tree has the files.
 */
const fontFiles = (await readdir(FONTS_FROM)).filter(
  (f) => f.endsWith('.woff2') || f.endsWith('.ttf'),
)

if (fontFiles.length === 0) {
  console.error(
    'copy-assets: no fonts in src/render/fonts/files — run `node scripts/bundle-fonts.mjs`',
  )
  process.exit(1)
}

let fontBytes = 0
for (const file of fontFiles) {
  const info = await stat(join(FONTS_FROM, file))
  fontBytes += info.size
  await copyFile(join(FONTS_FROM, file), join(FONTS_TO, file))
}
console.log(
  `copy-assets: ${fontFiles.length} fonts → .output/server/fonts/ (${Math.round(fontBytes / 1024)} KB)`,
)

// --- did public/ reach the build? -------------------------------------------------------
/**
 * A check, not a copy. `public/` carries the manifest, the icons, the offline page and the service
 * worker — the entire PWA delivery path — and if Vite's publicDir ever stops being copied the symptom
 * is an app that quietly cannot be installed, with a green build. ADR-005's failure shape exactly, so
 * it gets the same treatment: assert the artefact, loudly.
 */
const SW = join(ROOT, '.output/public/sw.js')
let sw
try {
  sw = await readFile(SW, 'utf8')
} catch {
  console.error(
    `copy-assets: ${SW} is missing, so public/ did not reach the build output — the PWA cannot install`,
  )
  process.exit(1)
}

/*
  The assignment, not the string. The worker's own docblock names `__HR_BUILD__` while explaining
  itself, so a substring check on the whole file fails on a correctly stamped build — which is what
  it did on the first run of this guard.
*/
const version = /const BUILD = '([^']*)'/.exec(sw)?.[1]
if (version === undefined || version === '__HR_BUILD__') {
  console.error(
    'copy-assets: the service worker in the build output is unstamped, so scripts/make-sw.mjs did not run before vite build',
  )
  process.exit(1)
}

console.log(`copy-assets: public/ present, sw.js cache version ${version}`)
