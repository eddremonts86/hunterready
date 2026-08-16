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
  // ── The chooser's catalogue (50 OFL families from Google Fonts), picked for difference. ──
  {
    pkg: 'lato',
    weights: ['400', '700'],
    role: 'humanist sans',
  },
  {
    pkg: 'open-sans',
    weights: ['400', '600', '700'],
    role: 'humanist sans',
  },
  {
    pkg: 'noto-sans',
    weights: ['400', '700'],
    role: 'neutral sans',
  },
  {
    pkg: 'pt-sans',
    weights: ['400', '700'],
    role: 'humanist sans',
  },
  {
    pkg: 'fira-sans',
    weights: ['400', '700'],
    role: 'humanist sans',
  },
  {
    pkg: 'ibm-plex-sans',
    weights: ['400', '600', '700'],
    role: 'technical sans',
  },
  {
    pkg: 'work-sans',
    weights: ['400', '600', '700'],
    role: 'grotesque sans',
  },
  {
    pkg: 'public-sans',
    weights: ['400', '700'],
    role: 'civic sans',
  },
  {
    pkg: 'rubik',
    weights: ['400', '500', '700'],
    role: 'rounded grotesque',
  },
  {
    pkg: 'karla',
    weights: ['400', '700'],
    role: 'quirky grotesque',
  },
  {
    pkg: 'mulish',
    weights: ['400', '700'],
    role: 'rounded sans',
  },
  {
    pkg: 'manrope',
    weights: ['400', '700'],
    role: 'geometric sans',
  },
  {
    pkg: 'inter',
    weights: ['400', '600', '700'],
    role: 'neutral UI sans',
  },
  {
    pkg: 'barlow',
    weights: ['400', '600', '700'],
    role: 'semi-condensed sans',
  },
  {
    pkg: 'asap',
    weights: ['400', '700'],
    role: 'rounded sans',
  },
  {
    pkg: 'poppins',
    weights: ['400', '600', '700'],
    role: 'geometric sans',
  },
  {
    pkg: 'montserrat',
    weights: ['400', '600', '700'],
    role: 'geometric sans',
  },
  {
    pkg: 'nunito-sans',
    weights: ['400', '700'],
    role: 'rounded sans',
  },
  {
    pkg: 'outfit',
    weights: ['400', '600', '700'],
    role: 'geometric sans',
  },
  {
    pkg: 'urbanist',
    weights: ['400', '700'],
    role: 'geometric sans',
  },
  {
    pkg: 'jost',
    weights: ['400', '700'],
    role: 'geometric sans',
  },
  {
    pkg: 'barlow-condensed',
    weights: ['400', '700'],
    role: 'condensed sans',
  },
  {
    pkg: 'fira-sans-condensed',
    weights: ['400', '700'],
    role: 'condensed sans',
  },
  {
    pkg: 'saira-condensed',
    weights: ['400', '700'],
    role: 'condensed sans',
  },
  {
    pkg: 'encode-sans-condensed',
    weights: ['400', '700'],
    role: 'condensed sans',
  },
  {
    pkg: 'oswald',
    weights: ['400', '700'],
    role: 'condensed display',
  },
  {
    pkg: 'merriweather',
    weights: ['400', '700'],
    role: 'reading serif',
  },
  {
    pkg: 'libre-baskerville',
    weights: ['400', '700'],
    role: 'classical serif',
  },
  {
    pkg: 'crimson-text',
    weights: ['400', '700'],
    role: 'old-style serif',
  },
  {
    pkg: 'cardo',
    weights: ['400', '700'],
    role: 'humanist serif',
  },
  {
    pkg: 'spectral',
    weights: ['400', '600', '700'],
    role: 'screen serif',
  },
  {
    pkg: 'pt-serif',
    weights: ['400', '700'],
    role: 'transitional serif',
  },
  {
    pkg: 'noto-serif',
    weights: ['400', '700'],
    role: 'neutral serif',
  },
  {
    pkg: 'bitter',
    weights: ['400', '700'],
    role: 'slab serif',
  },
  {
    pkg: 'zilla-slab',
    weights: ['400', '700'],
    role: 'slab serif',
  },
  {
    pkg: 'roboto-slab',
    weights: ['400', '700'],
    role: 'slab serif',
  },
  {
    pkg: 'arvo',
    weights: ['400', '700'],
    role: 'slab serif',
  },
  {
    pkg: 'alegreya',
    weights: ['400', '700'],
    role: 'literary serif',
  },
  {
    pkg: 'vollkorn',
    weights: ['400', '700'],
    role: 'warm serif',
  },
  {
    pkg: 'literata',
    weights: ['400', '700'],
    role: 'reading serif',
  },
  {
    pkg: 'gelasio',
    weights: ['400', '700'],
    role: 'book serif',
  },
  {
    pkg: 'faustina',
    weights: ['400', '700'],
    role: 'humanist serif',
  },
  {
    pkg: 'cormorant-garamond',
    weights: ['400', '700'],
    role: 'display serif',
  },
  {
    pkg: 'prata',
    weights: ['400'],
    role: 'didone display',
  },
  {
    pkg: 'bodoni-moda',
    weights: ['400', '700'],
    role: 'didone display',
  },
  {
    pkg: 'ibm-plex-mono',
    weights: ['400', '700'],
    role: 'technical mono',
  },
  {
    pkg: 'jetbrains-mono',
    weights: ['400', '700'],
    role: 'code mono',
  },
  {
    pkg: 'space-mono',
    weights: ['400', '700'],
    role: 'quirky mono',
  },
  {
    pkg: 'archivo',
    weights: ['400', '600', '700'],
    role: 'grotesque sans',
  },
  {
    pkg: 'chivo',
    weights: ['400', '700'],
    role: 'grotesque sans',
  },
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
    pkg: 'playfair-display',
    weights: ['400', '700'],
    role: 'document display serif (editorial, blossom)',
  },
  {
    pkg: 'eb-garamond',
    weights: ['400', '700'],
    role: 'document classical serif (parchment, heritage)',
  },
  {
    pkg: 'space-grotesk',
    weights: ['400', '700'],
    role: 'document grotesque (grotesk)',
  },
  {
    pkg: 'lora',
    weights: ['400', '700'],
    role: 'document warm serif (brush body)',
  },
  {
    pkg: 'josefin-sans',
    weights: ['400', '700'],
    role: 'document geometric sans (glacier)',
  },
  {
    pkg: 'caveat-brush',
    weights: ['400'],
    role: 'app display (grease pencil) and the brush theme name',
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
