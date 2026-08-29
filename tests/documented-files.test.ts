/**
 * A file named in prose is a file that exists.
 *
 * ## The failure this exists for
 *
 * `src/lib/pricing.ts` said, in its own docblock: *"`pricing.test.ts` exists to say that out loud
 * rather than to check arithmetic."* There was no such file. Nothing was broken and nothing was red —
 * the sentence simply described a test nobody had written, and it read as a guarantee to anyone who
 * opened the file.
 *
 * That is the small version of this repository's oldest recurring defect. Four features once shipped
 * as schema plus documentation and no code, and the roadmap and the plans index have each described a
 * state of the world that reading `src/` disproved. **The common move is trusting the document next to
 * the code instead of the code**, and a filename is the one claim in a document that a machine can
 * check completely.
 *
 * So this checks the cheap half exhaustively and says nothing about the rest. A docblock can still
 * lie about what a test asserts; it can no longer name one that is not there.
 *
 * ## Two shapes, because the real failure had no path in it
 *
 * A path-shaped reference — `` `scripts/copy-assets.mjs` `` — is satisfied by any real path ending in
 * those segments, because the documents write `adapters/pdf.ts` for `src/ingest/adapters/pdf.ts` and
 * that is a style rather than a defect. Matching whole segments still catches the cases that matter: a
 * renamed file, a changed extension, and a directory that moved out from under a sentence. Requiring
 * the exact path instead produced forty-five failures, all of them prose written the ordinary way.
 *
 * A bare test filename — `` `pricing.test.ts` `` — is checked by basename, because that is how this
 * codebase refers to its own tests and it is precisely the form the original defect took. Bare names
 * are restricted to `*.test.ts(x)`: widening them to every extension would start matching prose about
 * modules, and the noise would drown the signal within a month.
 *
 * ## Why it skips inside the container
 *
 * `.dockerignore` excludes `docs`, `specs` and every `*.md` but the README, so the image
 * `pnpm test:docker` builds does not contain the documentation this check is about. Left running
 * there it found a handful of references instead of hundreds and failed its own "is actually looking
 * at something" assertion — which is the gate behaving correctly, and it caught this on the first
 * push.
 *
 * So it skips when `docs/` is absent, and **says `skipped` rather than passing quietly**, which is the
 * rule plan 12 wrote down for the DeepSeek guard and the same one the LibreOffice and OCR suites
 * follow. Its home is `pnpm test` and CI; a green tick from an image with no documents in it would be
 * a check standing in for a habit.
 *
 * Found on its first run, both real: `docs/02-architecture.md` had pointed four times at
 * `scripts/copy-wasm.mjs`, which became `copy-assets.mjs` when it learned to copy fonts as well, and
 * plan 14 said it would write a processing-display-name test while the file that shipped is
 * `display-name.test.ts` — a plan marked done, naming a test that does not exist, which is the exact
 * shape of the thing being guarded against. (Its old name is deliberately unquoted here: backticking
 * it in this docblock makes this file fail its own check, which is a fair demonstration and a silly
 * way to leave the suite.)
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')

const SKIP = new Set(['node_modules', '.output', '.git', 'dist', '.vite'])

/**
 * Prefixes that are real paths and simply not ours to check.
 *
 * `ai-os/` and `context/` live in `~/Projects/ai-os`, and `builderhunt/` is the sibling app whose
 * deploy script and database client this one was modelled on — all referenced by design and none of
 * them ours to assert. `.output/` and `dist/` exist only after a build, so checking them would make
 * the suite depend on whether somebody had run one.
 */
const NOT_THIS_REPO = /^(ai-os\/|context\/|builderhunt\/|\.output\/|dist\/)/

/**
 * Named in prose without claiming to exist, each with the reason.
 *
 * The bar is that the sentence is *already* honest to a human reader — an instruction to create
 * something, or a hypothetical — so the guard is what is wrong about it, not the document.
 */
const NOT_CLAIMS: ReadonlyMap<string, string> = new Map([
  [
    'src/schema/migrations/1.0-to-1.1.ts',
    'docs/03 tells you to *add* this when the schema shape changes. It is an instruction, and the day ' +
      'it exists this entry should go rather than the sentence.',
  ],
  [
    'src/routes/v1/thing.tsx',
    'A hypothetical in `openapi.test.ts`, explaining what the contract test catches: "adding ' +
      '`src/routes/v1/thing.tsx` without describing it goes red".',
  ],
])

/**
 * Files exempt whole, because their backticked names are not claims about the present.
 *
 * `docs/10-plan-v0.1.md` is the v0.1 execution plan: the spike script, the smoke route and the old
 * `dist/` output it names were all real when it was written, and editing them out would be rewriting
 * the record to satisfy a test — the opposite of what this file is for.
 *
 * This file is the other one, and the reason is structural rather than convenient: **its subject is
 * filenames that do not exist**, so every example it gives of a broken reference is a broken
 * reference. Four of its own sentences failed the first run. The cost is that a genuinely stale path
 * inside this file goes unnoticed; the alternative is a docblock that cannot name what it is about.
 */
const NOT_DESCRIPTIONS = new Set([
  'docs/10-plan-v0.1.md',
  'tests/documented-files.test.ts',
])

/** A path-shaped reference: has a directory in it, and an extension we can resolve. */
const PATH_REF =
  /`([A-Za-z0-9][A-Za-z0-9_./-]*\/[A-Za-z0-9_.-]+\.(?:tsx?|mjs|yml|json|md))`/g

/** A bare test filename, the form this codebase uses for its own tests. */
const TEST_REF = /`([A-Za-z0-9][A-Za-z0-9_.-]*\.test\.tsx?)`/g

interface Reference {
  token: string
  source: string
}

function walk(dir: string, onFile: (path: string, rel: string) => void): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, onFile)
    else onFile(path, path.slice(ROOT.length + 1))
  }
}

function scan(): { paths: Array<Reference>; tests: Array<Reference> } {
  const paths: Array<Reference> = []
  const tests: Array<Reference> = []
  walk(ROOT, (path, rel) => {
    if (!/\.(md|tsx?|mjs)$/.test(rel)) return
    if (NOT_DESCRIPTIONS.has(rel)) return
    const text = readFileSync(path, 'utf8')
    for (const m of text.matchAll(PATH_REF)) {
      const token = m[1]
      if (token === undefined || NOT_THIS_REPO.test(token)) continue
      paths.push({ token, source: rel })
    }
    for (const m of text.matchAll(TEST_REF)) {
      const token = m[1]
      if (token !== undefined) tests.push({ token, source: rel })
    }
  })
  return { paths, tests }
}

/** Every filename in the repository, for the basename lookup. */
function basenames(): Set<string> {
  const found = new Set<string>()
  walk(ROOT, (_path, rel) => {
    found.add(rel.slice(rel.lastIndexOf('/') + 1))
  })
  return found
}

/** Every real path in the repository, for the segment-suffix match. */
function allPaths(): Array<string> {
  const found: Array<string> = []
  walk(ROOT, (_path, rel) => {
    found.push(rel)
  })
  return found
}

/**
 * Whether a reference resolves: the exact path, or any real path ending in those whole segments.
 *
 * Whole segments, not a bare string suffix — otherwise `pdf.ts` would be satisfied by `unpdf.ts`, and
 * a check that accepts near misses is the kind that passes while the sentence is wrong.
 */
function resolves(ref: string, paths: ReadonlyArray<string>): boolean {
  try {
    statSync(join(ROOT, ref))
    return true
  } catch {
    /* not an exact path; try the segment suffix below */
  }
  return paths.some((real) => real === ref || real.endsWith(`/${ref}`))
}

/** The documents are `.dockerignore`d, so the trimmed test image has nothing for this to read. */
const DOCUMENTED = existsSync(join(ROOT, 'docs'))

describe.skipIf(!DOCUMENTED)(
  'a file named in prose is a file that exists',
  () => {
    const { paths, tests } = scan()

    it('resolves every path-shaped reference to a real file', () => {
      const real = allPaths()
      const broken = [
        ...new Set(
          paths
            .filter((r) => !NOT_CLAIMS.has(r.token) && !resolves(r.token, real))
            .map((r) => `${r.token} (named in ${r.source})`),
        ),
      ]

      expect(
        broken,
        'These paths are written in backticks and do not exist. Fix the reference, or — if the sentence ' +
          'is an instruction rather than a claim — add it to NOT_CLAIMS with the reason.',
      ).toEqual([])
    })

    it('resolves every bare test filename by basename', () => {
      const have = basenames()
      const broken = [
        ...new Set(
          tests
            .filter((r) => !have.has(r.token))
            .map((r) => `${r.token} (named in ${r.source})`),
        ),
      ]

      expect(
        broken,
        'These test files are named in prose and do not exist anywhere in the repository. This is the ' +
          'check that `pricing.test.ts` would have failed: a docblock describing a test nobody wrote.',
      ).toEqual([])
    })

    it('is actually looking at something', () => {
      /*
      A scanner that silently matches nothing passes forever, which would make this file worse than
      absent — it would be a green check standing in for a habit. The numbers only have to be
      non-trivial, not exact, so they do not become a chore every time a document is edited.
    */
      expect(paths.length).toBeGreaterThan(100)
      expect(tests.length).toBeGreaterThan(20)
      expect(tests.map((r) => r.token)).toContain('pricing.test.ts')
    })
  },
)
