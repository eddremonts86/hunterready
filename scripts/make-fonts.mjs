/**
 * Build the document faces with Latin, Greek and Cyrillic coverage in one file per weight.
 *
 *   node scripts/make-fonts.mjs
 *
 * Requires network and `uvx` (for `pyftsubset`), so it is **not** part of `pnpm build`. Same shape as
 * the fixture generators: run on demand, commit the output, and the build only copies files.
 *
 * ## Why this exists at all
 *
 * `bundle-fonts.mjs` takes fontsource's per-range `woff2` subsets, and ADR-022 records what was measured
 * about them: **takumi-pdf 0.6.4 cannot reach the glyphs in those files beyond Latin.** Adding
 * `cyrillic` and `greek` to its subset list copies twelve more files and changes nothing about the
 * output — the renderer loads them and draws tofu-free Latin while reporting `MissingGlyphs` for
 * everything else.
 *
 * A full TTF renders all three scripts fine. So the fix is a format change, not a subset list, and the
 * only cost is size — which is what this script exists to control.
 *
 * ## Subset, not the whole font
 *
 * Adobe's `SourceSans3-Regular.ttf` is 431 KB; restricted to the ranges below it is **192 KB**. Six
 * files (two faces × three weights) come to about 1.1 MB, against the 2.4 MB that vendoring the full
 * fonts would have cost. The ranges are chosen from the hiring markets in PRODUCT.md plus the two
 * scripts this closes:
 *
 *   • Latin, Latin-1, Latin Extended-A/B — every Western European name, including ø, å, ñ, ł, ș
 *   • Greek and Greek Extended
 *   • Cyrillic and Cyrillic Supplement — Bulgarian, Ukrainian, Serbian, Russian
 *   • punctuation, currency and the letterlike symbols a CV actually uses
 *
 * CJK is not here and is not an oversight: no Source face has it, and Noto Sans CJK is 10–16 MB per
 * weight. That is a separate decision about the deployed image (ADR-022).
 *
 * ## Verify, do not assume
 *
 * This script was written **after** proving a subsetted TTF renders Cyrillic and Greek through takumi,
 * because the previous attempt bundled fonts the renderer could not use. `src/render/__tests__/` has the
 * round-trip that keeps it honest: if the output of this script stops covering a script, a test fails
 * rather than a candidate's name turning into boxes.
 */
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src/render/fonts/files')

/**
 * The two faces a **document** is set in. Deliberately not the app-chrome faces: nothing in a CV is
 * ever set in those, and CLAUDE.md's hardest rule is that the print is not ours.
 *
 * Pinned releases, not `latest`. A font that changes under us changes every line break in every
 * rendered CV, and the ATS round-trip asserts exact strings.
 */
const FACES = [
  {
    slug: 'source-sans-3',
    repo: 'adobe-fonts/source-sans',
    release: '3.052R',
    archive: 'TTF-source-sans-3.052R.zip',
    weights: {
      400: 'SourceSans3-Regular.ttf',
      600: 'SourceSans3-Semibold.ttf',
      700: 'SourceSans3-Bold.ttf',
    },
  },
  {
    slug: 'source-serif-4',
    repo: 'adobe-fonts/source-serif',
    release: '4.005R',
    // `_Desktop`, not a `TTF-` prefix: the two Source repos name their release assets differently, and
    // guessing the second from the first cost a `curl` exit 56 with no useful message.
    archive: 'source-serif-4.005_Desktop.zip',
    weights: {
      400: 'SourceSerif4-Regular.otf',
      600: 'SourceSerif4-Semibold.otf',
      700: 'SourceSerif4-Bold.otf',
    },
  },
]

/** The ranges we keep. See the note above for why each one is here. */
const UNICODES = [
  'U+0000-00FF', // Basic Latin + Latin-1: ø å ñ é ü
  'U+0100-017F', // Latin Extended-A: ł ő ș ū
  'U+0180-024F', // Latin Extended-B
  'U+0370-03FF', // Greek and Coptic
  'U+1F00-1FFF', // Greek Extended
  'U+0400-04FF', // Cyrillic
  'U+0500-052F', // Cyrillic Supplement
  'U+2000-206F', // General punctuation: – — ’ • ·
  'U+20A0-20BF', // Currency: € £ ₴
  'U+2113', // ℓ
  'U+2C60-2C7F', // Latin Extended-C
  'U+A720-A7FF', // Latin Extended-D
].join(',')

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

const work = await mkdtemp(join(tmpdir(), 'hr-fonts-'))
await mkdir(OUT, { recursive: true })

const made = []
try {
  for (const face of FACES) {
    const url = `https://github.com/${face.repo}/releases/download/${face.release}/${face.archive}`
    const zip = join(work, `${face.slug}.zip`)
    const unpacked = join(work, face.slug)

    console.log(`fetching ${face.slug} ${face.release}`)
    execFileSync(
      'curl',
      ['-sL', '--fail', '--max-time', '300', '-o', zip, url],
      {
        stdio: ['ignore', 'ignore', 'inherit'],
      },
    )
    await mkdir(unpacked, { recursive: true })
    execFileSync('unzip', ['-o', '-q', zip, '-d', unpacked], {
      stdio: 'inherit',
    })

    // The archives differ in layout between releases, so find each file rather than assuming a path.
    const found = new Map()
    const walk = async (dir) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) await walk(path)
        else found.set(entry.name, path)
      }
    }
    await walk(unpacked)

    for (const [weight, filename] of Object.entries(face.weights)) {
      const source = found.get(filename)
      if (source === undefined) {
        throw new Error(
          `${filename} is not in ${face.archive}. The release layout changed — list the archive and update FACES.`,
        )
      }

      /**
       * `-full-` in the name, and `.ttf`.
       *
       * The loader prefers this over the per-range `woff2` for the same face and weight, so a face with
       * a full file here gets complete coverage and one without falls back to the old subsets. That
       * keeps this change additive: nothing breaks on a checkout where these files are absent.
       */
      const target = join(OUT, `${face.slug}-full-${weight}-normal.ttf`)
      execFileSync(
        'uvx',
        [
          '--from',
          'fonttools',
          'pyftsubset',
          source,
          `--output-file=${target}`,
          `--unicodes=${UNICODES}`,
          '--layout-features=*',
          '--no-hinting',
          '--desubroutinize',
        ],
        { stdio: 'inherit' },
      )
      const { size } = await stat(target)
      made.push(
        `${face.slug}-full-${weight}-normal.ttf (${Math.round(size / 1024)} KB)`,
      )
    }

    // The licence travels with the files, as `bundle-fonts.mjs` does for the woff2 subsets.
    const licence = [...found.entries()].find(([name]) =>
      /^LICENSE/i.test(name),
    )
    if (licence !== undefined) {
      execFileSync('cp', [licence[1], join(OUT, `${face.slug}-LICENSE.txt`)])
    }
  }
} finally {
  await rm(work, { recursive: true, force: true })
}

const total = made.length
console.log(`\nmade ${total} full-coverage faces → src/render/fonts/files/`)
for (const line of made) console.log(`  ${line}`)

if (!(await exists(join(OUT, 'source-sans-3-full-400-normal.ttf')))) {
  console.error(
    'make-fonts: the 400 weight of the sans face is missing — the build will fall back to Latin only',
  )
  process.exit(1)
}

await writeFile(
  join(OUT, 'FULL-COVERAGE.md'),
  `# Full-coverage document faces

Generated by \`node scripts/make-fonts.mjs\`. Latin, Greek and Cyrillic in one file per weight.

Do not hand-edit and do not replace with fontsource's per-range \`woff2\`: ADR-022 records that
takumi-pdf 0.6.4 cannot reach the glyphs in those beyond Latin, so a CV with a Cyrillic or Greek name
fails to render at all.

Both faces are Adobe's, under the SIL Open Font License. Licences are alongside.
`,
  'utf8',
)
