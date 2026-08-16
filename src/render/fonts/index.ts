/**
 * Font registration for the PDF renderer.
 *
 * takumi has no built-in base-14: a family the renderer was never given bytes for renders as
 * **nothing at all**, silently. So every render registers the families its theme names.
 *
 * All faces are bundled into the repo by `scripts/bundle-fonts.mjs` and copied into the build
 * output by `scripts/copy-assets.mjs`. Nothing here reads a host font directory — a render
 * must produce identical bytes on a Mac and in a Linux container, and a macOS system path is
 * not a dependency you can deploy.
 *
 * Bytes are cached per family for the process: a 100 KB read per request would be silly I/O
 * for a file that never changes.
 */
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { FAMILY_SLUGS } from './families'

interface FontLoader {
  name: string
  data: Uint8Array
  weight?: number
}

/**
 * Searched in order, first hit wins:
 *   1. the build output  (production — the image ships `.output/` with no node_modules)
 *   2. the source tree   (dev / tests)
 * Both are relative to the process cwd, which is the app root in every environment we run.
 */
const FONT_DIRS = [
  join(process.cwd(), '.output/server/fonts'),
  join(process.cwd(), 'src/render/fonts/files'),
]

/** Family name → the fontsource package slug the files are named after. */

/** Weights to try per family. A missing weight is survivable; a missing 400 is not. */
const WEIGHTS = [400, 600, 700]
const SUBSETS = ['latin', 'latin-ext']

const cache = new Map<string, Array<FontLoader>>()
let resolvedDir: string | undefined

async function fontDir(): Promise<string> {
  if (resolvedDir !== undefined) return resolvedDir

  for (const dir of FONT_DIRS) {
    try {
      const info = await stat(dir)
      if (info.isDirectory()) {
        resolvedDir = dir
        return dir
      }
    } catch {
      /* try the next candidate */
    }
  }

  throw new Error(
    `No bundled fonts found. Looked in:\n  ${FONT_DIRS.join('\n  ')}\nRun \`node scripts/bundle-fonts.mjs\`, and for a built server \`pnpm build\`.`,
  )
}

async function loadFamily(cssValue: string): Promise<Array<FontLoader>> {
  // Theme tokens carry the CSS form, which is quoted when the name ends in a digit.
  const family = cssValue.replace(/^["']|["']$/g, '')
  const cached = cache.get(family)
  if (cached !== undefined) return cached

  const slug = FAMILY_SLUGS.get(family)
  if (slug === undefined) {
    throw new Error(
      `Font family "${family}" is not bundled. Add it to scripts/bundle-fonts.mjs and FAMILY_SLUGS, or the renderer will silently draw nothing.`,
    )
  }

  const dir = await fontDir()
  const loaded: Array<FontLoader> = []

  for (const weight of WEIGHTS) {
    /**
     * A full-coverage TTF wins, and the per-range `woff2` files are then skipped for that weight.
     *
     * ADR-022 is the reason. takumi-pdf 0.6.4 cannot reach the glyphs in fontsource's per-range `woff2`
     * subsets beyond Latin — it loads them, draws Latin, and reports `MissingGlyphs` for a Cyrillic or
     * Greek name. A single subsetted TTF covering Latin, Greek and Cyrillic renders all three, which was
     * measured before any of it was vendored.
     *
     * Skipping the `woff2` for a weight that has a TTF is not tidiness: registering both puts two fonts
     * under one family and weight, and only one of them is consulted. Which one is not ours to decide.
     *
     * Written as a preference rather than a replacement so the change stays additive — a face with no
     * `-full-` file, or a checkout where `node scripts/make-fonts.mjs` has not been run, behaves exactly
     * as it did before.
     */
    const full = join(dir, `${slug}-full-${weight}-normal.ttf`)
    try {
      loaded.push({ name: family, data: await readFile(full), weight })
      continue
    } catch {
      /* no full-coverage file for this weight; fall back to the subsets below */
    }

    for (const subset of SUBSETS) {
      const file = join(dir, `${slug}-${subset}-${weight}-normal.woff2`)
      try {
        loaded.push({ name: family, data: await readFile(file), weight })
      } catch {
        /* not every face publishes every weight or subset */
      }
    }
  }

  if (loaded.length === 0) {
    throw new Error(`No font files found for "${family}" in ${dir}`)
  }

  cache.set(family, loaded)
  return loaded
}

/** Every font a theme needs, deduped by family. */
export async function loadThemeFonts(theme: {
  typography: { body: { fontFamily: string }; heading: { fontFamily: string } }
  /** A theme may set the candidate's name in a third face (style.nameFontFamily). */
  style?: { nameFontFamily?: string }
}): Promise<Array<FontLoader>> {
  const families = new Set(
    [
      theme.typography.body.fontFamily,
      theme.typography.heading.fontFamily,
      theme.style?.nameFontFamily,
    ].filter((family): family is string => family !== undefined),
  )

  const all: Array<FontLoader> = []
  for (const family of families) {
    all.push(...(await loadFamily(family)))
  }
  return all
}

/** Families this build can render. Asserted by a test. */
export { REGISTERED_FAMILIES } from './families'

/** Exposed for the asset-copy script and for tests. */
export const FONT_SOURCE_DIR = 'src/render/fonts/files'
export const FONT_OUTPUT_DIR = '.output/server/fonts'
