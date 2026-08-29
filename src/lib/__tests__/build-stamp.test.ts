/**
 * The resolution order, and the one case that made the obvious version of this useless.
 *
 * Item 15 of the roadmap sat under "Edd's" for five days on the belief that production could only
 * learn its commit from a build arg somebody sets in Coolify. It can read Coolify's own
 * `SOURCE_COMMIT` instead — but the fallback has to survive the Dockerfile, which declares
 * `ARG HR_COMMIT=unknown` and promotes it to `ENV`. So in every build that does not pass the arg the
 * variable is **present and equal to the string `"unknown"`**, and a fallback written the natural way
 * would never have been reached. That case is the third test here and it is the reason for the file.
 */
import { describe, expect, it } from 'vitest'

import { buildStamp } from '@/lib/build-stamp'

const SHA = '532e0d7f0c1e4b2a9d8c7b6a5f4e3d2c1b0a9988'
const DEPLOYED = 'ad65dee11223344556677889900aabbccddeeff0'

describe('which commit this process says it is serving', () => {
  it('prefers the build arg, which is the commit the bundle was compiled from', () => {
    expect(buildStamp({ HR_COMMIT: SHA, SOURCE_COMMIT: DEPLOYED })).toBe(SHA)
  })

  it('falls back to the deploy, which is the only one production has', () => {
    expect(buildStamp({ SOURCE_COMMIT: DEPLOYED })).toBe(DEPLOYED)
  })

  it('treats the Dockerfile’s own default as the absence it is', () => {
    /*
      The whole point. `ENV HR_COMMIT=unknown` means the variable exists in every Coolify build, so
      `process.env.HR_COMMIT ?? process.env.SOURCE_COMMIT` resolves to "unknown" forever — a fallback
      that reads correctly, ships, and changes nothing.
    */
    expect(buildStamp({ HR_COMMIT: 'unknown', SOURCE_COMMIT: DEPLOYED })).toBe(
      DEPLOYED,
    )
  })

  it('treats an empty string as absent too, in both', () => {
    // What `${SOURCE_COMMIT:-}` delivers when nothing set it: declared, and empty.
    expect(buildStamp({ HR_COMMIT: '', SOURCE_COMMIT: DEPLOYED })).toBe(
      DEPLOYED,
    )
    expect(buildStamp({ HR_COMMIT: '', SOURCE_COMMIT: '' })).toBe('unknown')
    expect(buildStamp({ HR_COMMIT: '  ', SOURCE_COMMIT: '  ' })).toBe('unknown')
  })

  it('still says unknown when neither knows, and does not invent one', () => {
    /*
      `pnpm stale` prints `?` and exits 1 on this, meaning "this build cannot answer" — not "this build
      is current". A guess from a tag or a timestamp would turn an honest unknown into a confident
      wrong answer, which is the failure the stamp exists to prevent.
    */
    expect(buildStamp({})).toBe('unknown')
  })
})
