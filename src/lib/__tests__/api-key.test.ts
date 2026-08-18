/**
 * Issuing a key, and never being able to read it back.
 *
 * The property under test is not "hashing works" — it is that **nothing in this module can turn
 * stored state back into a working key**. That is what makes a leaked database dump survivable, and
 * it is the kind of guarantee that quietly stops being true when somebody adds a convenience.
 */
import { describe, expect, it } from 'vitest'

import {
  KEY_PREFIX,
  hashKey,
  hashesMatch,
  keyFromHeader,
  mint,
} from '../api-key'

describe('minting', () => {
  it('produces a key nobody can reconstruct from what is stored', () => {
    const { secret, secretHash, prefix } = mint()

    // The two things that get persisted, checked against the one thing that does not.
    expect(secretHash).not.toContain(secret)
    expect(secretHash).not.toContain(secret.slice(KEY_PREFIX.length))
    expect(prefix.length).toBeLessThan(secret.length / 2)
    expect(secret.startsWith(prefix)).toBe(true)
  })

  it('marks the key as ours and as this environment', () => {
    // A leaked key has to be greppable in a log and recognisable in a paste.
    expect(mint().secret.startsWith(KEY_PREFIX)).toBe(true)
  })

  it('never repeats', () => {
    const many = new Set(Array.from({ length: 500 }, () => mint().secret))
    expect(many.size).toBe(500)
  })

  it('carries enough entropy that guessing is not a strategy', () => {
    // 32 bytes in base64url. Shorter than this and the sentence above stops being true.
    const body = mint().secret.slice(KEY_PREFIX.length)
    expect(body.length).toBeGreaterThanOrEqual(42)
  })

  it('hashes deterministically, so a lookup is one indexed read', () => {
    const { secret, secretHash } = mint()
    expect(hashKey(secret)).toBe(secretHash)
  })
})

describe('reading the header', () => {
  it('accepts a bearer token of ours', () => {
    const { secret } = mint()
    expect(keyFromHeader(`Bearer ${secret}`)).toBe(secret)
    expect(keyFromHeader(`bearer ${secret}`)).toBe(secret)
    expect(keyFromHeader(`  Bearer   ${secret}  `)).toBe(secret)
  })

  it.each([
    ['no header at all', null],
    ['empty', ''],
    ['a session cookie pasted into the wrong place', 'Bearer abc.def.ghi'],
    ['basic auth', 'Basic aGk6dGhlcmU='],
    ['the word Bearer alone', 'Bearer'],
    ['a key with no prefix', 'Bearer deadbeefdeadbeef'],
  ])('refuses %s', (_why, header) => {
    // Anything not shaped like ours costs a string comparison, never a database round trip.
    expect(keyFromHeader(header)).toBeUndefined()
  })
})

describe('comparing hashes', () => {
  it('matches a hash with itself and nothing else', () => {
    const a = hashKey('hr_live_one')
    expect(hashesMatch(a, a)).toBe(true)
    expect(hashesMatch(a, hashKey('hr_live_two'))).toBe(false)
  })

  it('does not throw on different lengths, which timingSafeEqual would', () => {
    expect(hashesMatch('short', hashKey('hr_live_one'))).toBe(false)
  })
})
