/**
 * The one-off re-encryption script writes the same envelope the application reads.
 *
 * `scripts/db/reencrypt.mjs` cannot import `crypto.ts` — the scripts are plain `.mjs` and this repo has
 * no TypeScript runner — so the envelope exists twice. `retention.mjs` already documents where that
 * ends: a second copy of something drifts from the first, and nothing notices until the day it matters.
 *
 * This is the thing that notices. It reads across the boundary in both directions, so a change to the
 * algorithm, the IV size, the version or the field names on either side fails here rather than in
 * production, where the symptom would be a table of CVs that no longer decrypt.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  encryptJson as scriptEncryptJson,
  isEnvelope as scriptIsEnvelope,
  readKey,
} from '../../../scripts/db/reencrypt.mjs'
import {
  decryptJson,
  encryptJson as appEncryptJson,
  resetKeyCache,
} from '../crypto'

const KEY = 'a'.repeat(64)

const RESUME = {
  schemaVersion: '1.0',
  basics: { fullName: 'Marta Sørensen', email: 'marta@example.org' },
  work: [{ company: 'Rigshospitalet', highlights: ['Led nursing handover.'] }],
}

const original = process.env.DATA_ENCRYPTION_KEY

beforeEach(() => {
  process.env.DATA_ENCRYPTION_KEY = KEY
  resetKeyCache()
})

afterEach(() => {
  if (original === undefined) delete process.env.DATA_ENCRYPTION_KEY
  else process.env.DATA_ENCRYPTION_KEY = original
  resetKeyCache()
})

describe('the script and the application share one envelope', () => {
  it('the application reads what the script wrote', () => {
    const secret = readKey(KEY)
    const stored = scriptEncryptJson(RESUME, secret)

    expect(decryptJson(stored)).toEqual(RESUME)
  })

  it('the script recognises what the application wrote', () => {
    expect(scriptIsEnvelope(appEncryptJson(RESUME))).toBe(true)
  })

  /**
   * The predicate the script selects rows with is "not an envelope". If it disagreed with the
   * application about what an envelope looks like, a re-run would encrypt already-encrypted rows —
   * double-wrapping them into something `decryptJson` reads as one envelope and fails to parse.
   */
  it('agrees that a plaintext document is not an envelope', () => {
    expect(scriptIsEnvelope(RESUME)).toBe(false)
    expect(scriptIsEnvelope(null)).toBe(false)
    expect(scriptIsEnvelope([1, 2, 3])).toBe(false)
  })

  it('re-encrypting is refused rather than repeated', () => {
    const secret = readKey(KEY)
    const once = scriptEncryptJson(RESUME, secret)

    // The script never reaches a second call for this row, because its own predicate excludes it.
    expect(scriptIsEnvelope(once)).toBe(true)
  })
})

describe('the script reads the key on the application terms', () => {
  it('accepts 64 hex characters', () => {
    expect(readKey(KEY)).toHaveLength(32)
  })

  it('rejects a short or non-hex key rather than padding it', () => {
    expect(readKey('a'.repeat(63))).toBeUndefined()
    expect(readKey('z'.repeat(64))).toBeUndefined()
    expect(readKey('')).toBeUndefined()
  })

  /**
   * Called with no argument it reads the environment, which is how `main` uses it. Worth pinning:
   * the argument exists for this test, and a default parameter means `readKey(undefined)` is the
   * environment rather than "no key" — a distinction that would otherwise be found by surprise.
   */
  it('falls back to the environment when called with no argument', () => {
    expect(readKey()).toHaveLength(32)

    delete process.env.DATA_ENCRYPTION_KEY
    expect(readKey()).toBeUndefined()
  })

  it('trims, because an env file is edited by hand', () => {
    expect(readKey(`  ${KEY}\n`)).toHaveLength(32)
  })
})
