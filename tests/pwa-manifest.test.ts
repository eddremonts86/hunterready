/**
 * The manifest describes files that exist, at the sizes it claims, in the colour the app actually is.
 *
 * ## Why each of those three is a real failure mode
 *
 * A manifest is read by a launcher, not by a person, and it fails silently: Chrome drops an icon
 * whose file is missing and installs anyway, iOS shows a screenshot of the page, and a `sizes` that
 * lies about its PNG produces a blurry home-screen tile on exactly the devices nobody here owns. None
 * of it appears in a build log, a test run or a browser console. So this checks the manifest against
 * the bytes on disk — the same argument `documented-files.test.ts` makes about filenames in prose.
 *
 * The colour check is the drift guard. `theme_color` here, the `theme-color` meta in `__root.tsx` and
 * `--color-ground` in `styles.css` are three copies of one decision, and the visible consequence of
 * them disagreeing — a status bar in a slightly different white from the topbar under it — is the kind
 * of thing you see on a phone and cannot name.
 *
 * Not asserted here: that the icons look like anything. `scripts/make-icons.mjs` draws them from the
 * wordmark and the tokens, and no test can tell a good mark from a bad one.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')
const PUBLIC = join(ROOT, 'public')

interface Manifest {
  name: string
  short_name: string
  start_url: string
  scope: string
  display: string
  theme_color: string
  background_color: string
  icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>
}

const manifest = JSON.parse(
  readFileSync(join(PUBLIC, 'manifest.webmanifest'), 'utf8'),
) as Manifest

/**
 * A PNG's real dimensions, from its IHDR chunk.
 *
 * Sixteen bytes in, two big-endian 32-bit integers. Written out rather than pulled from a library
 * because it is four lines and the alternative is a dependency for reading eight bytes.
 */
function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path)
  expect(bytes.subarray(1, 4).toString('ascii'), `${path} is not a PNG`).toBe(
    'PNG',
  )
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

describe('the web app manifest', () => {
  it('carries everything a browser needs to offer an install', () => {
    /*
      Chrome's own criteria, minus the service worker, which `sw-privacy.test.ts` covers: a name, a
      start URL inside the scope, a display mode that is not `browser`, and icons at 192 and 512.
    */
    expect(manifest.name).toBe('HunterReady')
    expect(manifest.short_name.length).toBeGreaterThan(0)
    expect(manifest.short_name.length).toBeLessThanOrEqual(12)
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
    expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(
      manifest.display,
    )

    const sizes = manifest.icons.map((icon) => icon.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
  })

  it('declares a maskable icon, so a round launcher does not shave the mark', () => {
    // Separate files rather than `"any maskable"` on one — see the note in `scripts/make-icons.mjs`.
    const maskable = manifest.icons.filter(
      (icon) => icon.purpose === 'maskable',
    )
    expect(maskable.map((icon) => icon.sizes).sort()).toEqual([
      '192x192',
      '512x512',
    ])
  })

  it('points at files that exist, at the sizes it claims', () => {
    for (const icon of manifest.icons) {
      const path = join(PUBLIC, icon.src)
      expect(
        existsSync(path),
        `${icon.src} is in the manifest and not on disk`,
      ).toBe(true)

      const [declared] = icon.sizes.split('x').map(Number)
      const real = pngSize(path)
      expect(
        [real.width, real.height],
        `${icon.src} is declared ${icon.sizes} and is ${real.width}x${real.height}`,
      ).toEqual([declared, declared])
    }
  })

  it('includes the two icons the manifest cannot describe', () => {
    /*
      iOS ignores the icon array entirely, and a browser tab reads `rel=icon`. Both are linked from
      `__root.tsx` instead, which is why they need asserting here — nothing else would notice them
      going missing.
    */
    for (const [file, size] of [
      ['apple-touch-icon.png', 180],
      ['favicon-32.png', 32],
      ['favicon-16.png', 16],
    ] as const) {
      const path = join(PUBLIC, 'icons', file)
      expect(
        existsSync(path),
        `icons/${file} is linked from __root.tsx and missing`,
      ).toBe(true)
      expect(pngSize(path)).toEqual({ width: size, height: size })
    }
  })

  it('agrees with the app about what colour it is', () => {
    const css = readFileSync(join(ROOT, 'src/styles.css'), 'utf8')
    const ground = /--color-ground:\s*([^;]+);/.exec(css)?.[1].trim()
    expect(ground).toBeDefined()

    // `#ffffff` in the token, `#ffffff` in the manifest — compared lowercase, since a hex case
    // difference is not a disagreement.
    expect(manifest.theme_color.toLowerCase()).toBe(ground?.toLowerCase())
    expect(manifest.background_color.toLowerCase()).toBe(ground?.toLowerCase())

    const root = readFileSync(join(ROOT, 'src/routes/__root.tsx'), 'utf8')
    const meta = /'theme-color',\s*content:\s*'([^']+)'/.exec(root)?.[1]
    expect(
      meta?.toLowerCase(),
      'the theme-color meta in __root.tsx and the manifest have drifted apart',
    ).toBe(manifest.theme_color.toLowerCase())
  })

  it('has an offline page that needs nothing to render', () => {
    /*
      The one page that has to work when the network is gone cannot reference a hashed stylesheet or
      a font file: a miss in the cache would leave unstyled text at the moment the product is meant
      to look most reliable. So it carries its own CSS and links nothing.
    */
    const offline = readFileSync(join(PUBLIC, 'offline.html'), 'utf8')
    expect(offline).toContain('<style>')
    expect(offline).not.toMatch(/<link[^>]+rel=["']stylesheet/)
    expect(offline).not.toMatch(/<script[^>]+src=/)
  })
})
