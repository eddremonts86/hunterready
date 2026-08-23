/**
 * Every variable the code reads is one the deployment can actually set.
 *
 * ## The failure this exists for
 *
 * `docker-compose.yml`'s `app` service declares its environment as an explicit map and has no
 * `env_file:`. So a variable absent from that map **does not reach the process**, however carefully it
 * is typed into Coolify — and nothing anywhere says so. The symptom is a switch that appears not to
 * work, and the first day of debugging goes into the environment rather than into the file that never
 * passed it.
 *
 * CLAUDE.md already records this shape from the other side: `HR_THIRD_PARTY_FOR_ALL` was set
 * correctly, present in the container, present at PID 1 — and ignored, because the running bundle
 * predated the code that read it. That cost a session. This is the same question asked at the other
 * end of the pipe: the code reads a name, so does the container ever receive it?
 *
 * Found by this check when it was first written, all five real:
 *
 *   STRIPE_SECRET_KEY  STRIPE_WEBHOOK_SECRET  HR_STRIPE_PRICE_ID   payments could not be turned on
 *   HR_REASONING  HR_REASONING_BUDGET                              a kill switch that killed nothing
 *
 * ## Why it scans string literals and not just `process.env.X`
 *
 * Half of these are read through a helper — `value('MINIMAX_API_KEY')` in `structure/provider.ts`
 * does `process.env[name]` — so a check that only understood dot access would pass while missing
 * every provider credential. Matching quoted literals that look like one of this app's variables
 * catches both, and it does not have to know the helper's name, which is the part that would rot.
 *
 * Backticks are deliberately not matched: prose refers to these names constantly (`` `HR_RELEASE` ``)
 * and a comment mentioning a variable is not a read of it.
 *
 * ## Not under `src/`, because it is not about `src/`
 *
 * It reads the repository's deployment file and compares it against the whole source tree. The nearest
 * honest home is the root, next to the parity tests, which are the other tests whose subject is the
 * built artefact rather than a module.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')

/**
 * The prefixes that make a name ours.
 *
 * `NODE_ENV` and `PORT` belong to the runtime, and `SOFFICE_BIN`, `TESSERACT_BIN` and `PDFTOPPM_BIN`
 * name binaries that are installed in the image with working defaults (ADR-012) — none of them is a
 * deployment decision anybody makes in Coolify, so none of them belongs in this contract. Adding a
 * prefix here is how a new family of variables joins it.
 */
const OURS =
  /^(HR_|STRIPE_|MINIMAX_|DEEPSEEK_|OLLAMA_|DATABASE_|DATA_|BETTER_AUTH_)[A-Z0-9_]*$/

/**
 * Read by the code and deliberately absent from the production compose file, each with the reason.
 *
 * A name arrives here only when *not* passing it is the decision. It is checked one way — an entry
 * for a variable nothing reads any more is stale documentation, not a bug, and making this
 * two-directional would turn deleting a feature into a red suite for no defect.
 */
const NOT_IN_PRODUCTION: ReadonlyMap<string, string> = new Map([
  [
    'HR_UNLOCK_DESIGNS',
    'It is the absence of the paywall, not a plan. `src/lib/entitlements.ts` says never to set it in ' +
      'Coolify, and declaring it here is the first step towards somebody doing exactly that.',
  ],
  [
    'HR_LOCAL_BASE_URL',
    'The container reaches its own `llm` service through `OLLAMA_BASE_URL`, which this file pins to ' +
      'the service name. These two point somewhere else — a model server on a developer machine — ' +
      'and `docker-compose.local.yml` is where that override lives.',
  ],
  [
    'HR_LOCAL_MODEL',
    'The other half of `HR_LOCAL_BASE_URL`: both or neither, and neither in production.',
  ],
  [
    'DATABASE_MIGRATION_URL',
    'Composed in this file from `POSTGRES_PASSWORD` rather than passed in, so the owner credential ' +
      'exists in one place. Declared, just not as a pass-through — see the `app` service.',
  ],
])

/** Source files, minus the ones whose env reads are about the test rig rather than the product. */
function sources(dir: string, found: Array<string> = []): Array<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      sources(path, found)
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.gen.ts')) {
      found.push(path)
    }
  }
  return found
}

function namesReadBySource(): Map<string, string> {
  /** name → the first file that reads it, so a failure names somewhere to look. */
  const found = new Map<string, string>()
  for (const path of sources(join(ROOT, 'src'))) {
    const text = readFileSync(path, 'utf8')
    const candidates = [
      // `process.env.NAME`, the direct read.
      ...text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g),
      // `process.env['NAME']`, and any quoted literal shaped like one of ours — the helper case.
      ...text.matchAll(/['"]([A-Z][A-Z0-9_]{2,})['"]/g),
    ]
    for (const match of candidates) {
      const name = match[1]
      if (name === undefined || !OURS.test(name)) continue
      if (!found.has(name)) found.set(name, path.slice(ROOT.length + 1))
    }
  }
  return found
}

/** The keys the `app` service declares — its `environment:` map plus its build `args:`. */
function namesDeclaredByCompose(): Set<string> {
  const text = readFileSync(join(ROOT, 'docker-compose.yml'), 'utf8')
  /*
    The `app` service only. `db` and `llm` have environments of their own — `POSTGRES_PASSWORD` lives
    on the database — and a variable declared there does not reach the application.
  */
  const app = text.slice(text.indexOf('\n  app:'), text.indexOf('\n  db:'))
  const declared = new Set<string>()
  for (const line of app.split('\n')) {
    // A key at this indentation, ignoring comment lines — which is the whole point: `HR_UNLOCK_DESIGNS`
    // was mentioned in a comment here and declared nowhere, which reads as present to a person grepping.
    const match = /^\s{6,8}([A-Z][A-Z0-9_]*):/.exec(line)
    if (match?.[1] !== undefined) declared.add(match[1])
  }
  return declared
}

describe('the deployment can set what the code reads', () => {
  it('declares every variable in docker-compose.yml, or says why not', () => {
    const declared = namesDeclaredByCompose()
    const missing = [...namesReadBySource()]
      .filter(([name]) => !declared.has(name) && !NOT_IN_PRODUCTION.has(name))
      .map(([name, path]) => `${name} (read in ${path})`)

    expect(
      missing,
      'These are read by the app and not declared on the `app` service, so setting them in Coolify ' +
        'does nothing. Add them to docker-compose.yml, or add them to NOT_IN_PRODUCTION with the ' +
        'reason they are deliberately unreachable there.',
    ).toEqual([])
  })

  it('finds the variables it is supposed to be looking at', () => {
    /*
      A guard whose scanner silently matches nothing passes forever. These four are read three
      different ways — dot access, a helper, and a name that exists only in the compose file's own
      substitution — so if any of the three stops being understood, this goes red before the check
      above starts quietly agreeing with everything.
    */
    const read = namesReadBySource()
    expect([...read.keys()]).toEqual(
      expect.arrayContaining([
        'STRIPE_SECRET_KEY',
        'HR_RELEASE',
        'MINIMAX_API_KEY',
        'DATABASE_URL',
      ]),
    )
    expect(namesDeclaredByCompose()).toContain('STRIPE_SECRET_KEY')
  })
})
