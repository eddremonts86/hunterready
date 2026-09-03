/**
 * Two builds never share a service worker cache name — and `unknown` is not a name.
 *
 * ## The defect this exists for
 *
 * `scripts/make-sw.mjs` shipped as `HR_COMMIT ?? SOURCE_COMMIT ?? timestamp`, and the first
 * production deploy served `const BUILD = 'unknown'`. The Dockerfile declares
 * `ARG HR_COMMIT=unknown` with `ENV HR_COMMIT=$HR_COMMIT` behind it, so in any build that does not
 * pass the arg the variable **exists** and its value is that string — a `??` chain can never reach
 * past it.
 *
 * The consequence is silent and cumulative: a constant cache name means no deploy ever turns the
 * caches over, `activate` never purges, and the precached offline page stays frozen at whichever
 * release first installed it. Nothing fails, nothing logs, and the served worker looks fine unless
 * you read the one line.
 *
 * `src/lib/build-stamp.ts` was written for this exact trap and its docblock predicts the mistake
 * almost word for word. It was made anyway, in a new script, a fortnight later — which is the case
 * for asserting the rule rather than documenting it twice.
 *
 * Runs the real script as a subprocess, because what is being tested is a build step and its
 * environment, not a function.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')

/** Runs `make-sw.mjs` with a given environment and returns the version it stamped. */
function stamp(env: Record<string, string>): string {
  execFileSync('node', ['scripts/make-sw.mjs'], {
    cwd: ROOT,
    env: { ...process.env, HR_COMMIT: '', SOURCE_COMMIT: '', ...env },
    stdio: 'pipe',
  })
  const written = readFileSync(join(ROOT, 'public/sw.js'), 'utf8')
  const version = /const BUILD = '([^']*)'/.exec(written)?.[1]
  expect(version, 'make-sw.mjs wrote a worker with no BUILD line').toBeDefined()
  return version as string
}

describe('the service worker cache version', () => {
  it('prefers the build-time commit', () => {
    expect(stamp({ HR_COMMIT: 'abc1234' })).toBe('abc1234')
  })

  it("falls through to Coolify's deploy-time commit", () => {
    expect(stamp({ SOURCE_COMMIT: 'def5678' })).toBe('def5678')
  })

  it('treats the Dockerfile\'s "unknown" as absent, not as a version', () => {
    /*
      The regression. `unknown` is a value the Dockerfile sets, so it is an absence wearing a value's
      clothes — and it must not become the cache name.
    */
    const version = stamp({ HR_COMMIT: 'unknown' })
    expect(version).not.toBe('unknown')
    expect(version).toMatch(/^build-/)
  })

  it('treats an empty string as absent too', () => {
    // Coolify supplies the row and leaves it empty, which is how production reached `unknown`.
    const version = stamp({ HR_COMMIT: 'unknown', SOURCE_COMMIT: '' })
    expect(version).toMatch(/^build-/)
  })

  it('still prefers a real commit over the fallback when both are present', () => {
    expect(stamp({ HR_COMMIT: 'unknown', SOURCE_COMMIT: 'fed9876' })).toBe(
      'fed9876',
    )
  })

  it('gives two builds with no commit two different names', async () => {
    /*
      The property the whole thing exists for. Without it a deploy cannot invalidate what the previous
      one cached, which is the failure `unknown` actually produced.
    */
    const first = stamp({ HR_COMMIT: 'unknown' })
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = stamp({ HR_COMMIT: 'unknown' })
    expect(second).not.toBe(first)
  })
})
