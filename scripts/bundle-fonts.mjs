/**
 * Copy the fonts we ship out of node_modules and into the repo.
 *
 *   node scripts/bundle-fonts.mjs
 *
 * Why bundle instead of resolving from node_modules at runtime: the production image ships
 * `.output/` alone, with no node_modules (see the Dockerfile). And why bundle instead of
 * reading the host's fonts, which is what this replaced: a render must produce identical
 * bytes on Edd's Mac and in a Linux container. A macOS system path is not a dependency you
 * can deploy.
 *
 * All five faces are open-licensed (OFL/Apache). Licences are copied alongside the files.
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src/render/fonts/files')

/**
 * `latin` covers U+0000–00FF, which includes Danish ø/å and Spanish ñ/í — the accents our
 * fixtures actually exercise. `latin-ext` is added where available for Central European
 * names (ł, ő, ș), because a candidate whose surname renders as tofu will not use us twice.
 */
const FACES = [
  {
    pkg: 'source-sans-3',
    weights: ['400', '600', '700'],
    role: 'document sans',
  },
  {
    pkg: 'source-serif-4',
    weights: ['400', '600', '700'],
    role: 'document serif',
  },
  {
    pkg: 'courier-prime',
    weights: ['400', '700'],
    role: 'app body (typewriter notes)',
  },
  {
    pkg: 'archivo-narrow',
    weights: ['400', '700'],
    role: 'app labels (stencilled caps)',
  },
  {
    pkg: 'caveat-brush',
    weights: ['400'],
    role: 'app display (grease pencil)',
  },
]

const SUBSETS = ['latin', 'latin-ext']

await mkdir(OUT, { recursive: true })

const copied = []
const missing = []

for (const face of FACES) {
  const base = join(ROOT, 'node_modules/@fontsource', face.pkg)

  for (const subset of SUBSETS) {
    for (const weight of face.weights) {
      const name = `${face.pkg}-${subset}-${weight}-normal.woff2`
      try {
        await copyFile(join(base, 'files', name), join(OUT, name))
        copied.push(name)
      } catch {
        // Not every face publishes every weight or subset; only the 400/latin is required.
        if (subset === 'latin' && weight === '400') {
          missing.push(`${face.pkg} ${subset} ${weight} (REQUIRED)`)
        }
      }
    }
  }

  // Ship the licence next to the bytes. Fontsource packages carry it as LICENSE.
  for (const licenceName of ['LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
    try {
      const text = await readFile(join(base, licenceName), 'utf8')
      await writeFile(join(OUT, `${face.pkg}.LICENSE.txt`), text)
      break
    } catch {
      /* try the next candidate name */
    }
  }
}

console.log(`bundled ${copied.length} font files → src/render/fonts/files/`)
if (missing.length > 0) {
  console.error(`MISSING required faces:\n  ${missing.join('\n  ')}`)
  process.exit(1)
}
