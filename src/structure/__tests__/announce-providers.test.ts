/**
 * Which providers resolved, said out loud once, with nothing secret in the sentence.
 *
 * ## Why this line exists
 *
 * DeepSeek shipped on 2026-08-18 and did not appear in production. `deepseek()` returns `undefined`
 * without `DEEPSEEK_API_KEY`, so the app started clean, `/api/health` was green, and a model somebody
 * had deliberately added was simply absent from the list. Nothing was broken enough to log. It was
 * found by reading `/api/processing` after the deploy, which is not a method.
 *
 * ## Why the second test matters more than the first
 *
 * A line about credentials is a line that can leak one. `log.ts` scrubs known field names, and it
 * cannot know that a number it was handed is the length of a secret. So this asserts the negative
 * directly: given a recognisable key, no part of it — and no measurement of it — reaches the output.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Distinctive enough that a substring search cannot match it by accident, and **deliberately not
 * shaped like a real credential**.
 *
 * The first version wore a well-known vendor key prefix, chosen to look like the thing being
 * protected. It looked like it to GitGuardian too, which failed the release PR over a string with
 * `NOTAREALKEY` written in the middle of it. A test fixture that trips a secret scanner is a false alarm on every future pull request that
 * touches this file, and the fifth one gets waved through without reading — which is the failure a
 * scanner exists to prevent.
 */
const SECRET = 'zzq7-provider-credential-fixture-4417-vv'

async function boot(env: Record<string, string | undefined>) {
  vi.resetModules()
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) vi.stubEnv(k, '')
    else vi.stubEnv(k, v)
  }
  const lines: Array<string> = []
  const spy = vi
    .spyOn(console, 'log')
    .mockImplementation((line: unknown) => void lines.push(String(line)))
  const mod = await import('../provider')
  mod.announceProviders()
  spy.mockRestore()
  return lines
}

beforeEach(() => vi.unstubAllEnvs())
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('the boot line names what resolved and what did not', () => {
  it('reports a configured provider and a skipped one', async () => {
    const lines = await boot({
      DEEPSEEK_API_KEY: SECRET,
      ANTHROPIC_API_KEY: undefined,
      HUNTERREADY_LLM_TOKEN: undefined,
    })
    const line = lines.find((l) => l.includes('providers.resolved'))
    expect(line, `no announcement in:\n${lines.join('\n')}`).toBeDefined()

    const parsed = JSON.parse(line as string) as {
      providersConfigured: string
      providersSkipped: string
    }
    expect(parsed.providersConfigured).toContain('deepseek')
    // The skipped one is Anthropic now. MiniMax was removed as a provider on 2026-08-29 (ADR-036),
    // so it cannot be reported as skipped — there is nothing left to skip.
    expect(parsed.providersSkipped).toContain('anthropic')
    expect(parsed.providersSkipped).not.toContain('minimax')
  })

  it('says so plainly when nothing is configured', async () => {
    const lines = await boot({
      DEEPSEEK_API_KEY: undefined,
      ANTHROPIC_API_KEY: undefined,
      HUNTERREADY_LLM_TOKEN: undefined,
    })
    const parsed = JSON.parse(
      lines.find((l) => l.includes('providers.resolved')) as string,
    ) as { providersConfigured: string }
    // Not an empty string that reads as a missing field. Nothing configured is a fact worth stating.
    expect(parsed.providersConfigured).toBe('none')
  })

  it('is said once per process, not once per request', async () => {
    vi.resetModules()
    vi.stubEnv('DEEPSEEK_API_KEY', SECRET)
    const lines: Array<string> = []
    const spy = vi
      .spyOn(console, 'log')
      .mockImplementation((l: unknown) => void lines.push(String(l)))
    const mod = await import('../provider')
    mod.announceProviders()
    mod.announceProviders()
    mod.availableProviders()
    spy.mockRestore()

    expect(lines.filter((l) => l.includes('providers.resolved'))).toHaveLength(
      1,
    )
  })
})

describe('the boot line carries nothing secret', () => {
  it('contains no part of the key, and no measurement of it', async () => {
    /*
      The clock is pinned, and pinned to a hostile instant deliberately.

      `SECRET.length` is 40, and `log.ts` stamps every line with `new Date().toISOString()`. The
      millisecond below serialises as `...T08:19:18.540Z`, which contains "40". So this is the exact
      moment at which the first version of this test — which searched the whole serialised line —
      failed a privacy gate because of a clock. It passed twice locally and on one CI runner before
      going red on another a minute later.

      Pinning it turns a 1-in-10 flake into a permanent property: if anyone ever widens the search
      back to the raw line, this fails every single run instead of one in ten. Which matters more
      than the tidiness of it — a privacy gate that goes red for no reason is one people re-run, and
      the fifth time it goes red for a real reason it gets re-run too.
    */
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-19T08:19:18.540Z'))

    try {
      const lines = await boot({ DEEPSEEK_API_KEY: SECRET })
      const all = lines.join('\n')

      expect(all).not.toContain(SECRET)
      // Fragments, in case something ever "helpfully" prints a prefix or a suffix.
      expect(all).not.toContain(SECRET.slice(0, 8))
      expect(all).not.toContain(SECRET.slice(-8))

      /*
        And the length. A secret's length is information about the secret, and it is the shape a
        well-meaning diagnostic reaches for first. `log.ts` cannot scrub it, because a number has no
        field name saying where it came from.

        Asked of the fields the announcement chose, not of the envelope the logger adds. `ts` is
        `new Date().toISOString()` unconditionally and `level` is a literal, so neither can carry a
        credential — and dropping them removes fourteen digits of clock that an assertion about a
        secret had no business reading.
      */
      for (const line of lines) {
        const {
          ts: _ts,
          level: _level,
          ...chosen
        } = JSON.parse(line) as Record<string, unknown>
        expect(
          JSON.stringify(chosen),
          `the announcement's own fields must not measure the key`,
        ).not.toContain(String(SECRET.length))
      }
    } finally {
      vi.useRealTimers()
    }
  })
})
