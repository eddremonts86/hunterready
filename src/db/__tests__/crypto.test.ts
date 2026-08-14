/**
 * Encryption at rest — the envelope, and the four behaviours that make it deployable.
 *
 * No database needed: this is the codec. The repository tests prove it is wired into the right places,
 * and the assertion that matters most here is the one about **plaintext rows still reading** — without
 * it, turning the key on would make every existing CV unreadable, which is the failure that turns a
 * security improvement into an outage.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  decryptJson,
  encryptJson,
  encryptionEnabled,
  resetKeyCache,
  sameKey,
} from '../crypto'

const KEY_A = 'a'.repeat(64)
const KEY_B = 'b'.repeat(64)

const RESUME = {
  schemaVersion: '1.0',
  basics: { fullName: 'Marta Sørensen', email: 'marta@example.org' },
  work: [{ company: 'Rigshospitalet', highlights: ['Led nursing handover.'] }],
}

function withKey(value: string | undefined): void {
  if (value === undefined) delete process.env.DATA_ENCRYPTION_KEY
  else process.env.DATA_ENCRYPTION_KEY = value
  resetKeyCache()
}

const original = process.env.DATA_ENCRYPTION_KEY

beforeEach(() => {
  withKey(KEY_A)
})

afterEach(() => {
  withKey(original)
})

describe('a stored document is not readable from the table', () => {
  it('produces an envelope with none of the content in it', () => {
    const stored = encryptJson(RESUME)
    const serialized = JSON.stringify(stored)

    // The point of the whole feature: a `pg_dump` or a leaked snapshot contains none of this.
    expect(serialized).not.toContain('Sørensen')
    expect(serialized).not.toContain('Rigshospitalet')
    expect(serialized).not.toContain('marta@example.org')
    expect(serialized).not.toContain('handover')
    expect(stored).toMatchObject({ v: 1 })
  })

  it('round-trips exactly', () => {
    expect(decryptJson(encryptJson(RESUME))).toEqual(RESUME)
  })

  it('uses a fresh IV every time, so the same CV never encrypts alike', () => {
    // IV reuse is the one mistake that breaks GCM outright, and identical ciphertexts would also tell an
    // observer which rows hold the same document.
    const first = JSON.stringify(encryptJson(RESUME))
    const second = JSON.stringify(encryptJson(RESUME))
    expect(first).not.toBe(second)
    expect(decryptJson(JSON.parse(first))).toEqual(RESUME)
    expect(decryptJson(JSON.parse(second))).toEqual(RESUME)
  })

  it('passes null and undefined through rather than encrypting nothing', () => {
    // An absent gap report is absent. Wrapping it would make a nullable column non-null in effect.
    expect(encryptJson(undefined)).toBeUndefined()
    expect(encryptJson(null)).toBeNull()
  })
})

describe('rows written before the key existed keep reading', () => {
  it('returns a plaintext value unchanged', () => {
    /**
     * The assertion that makes this deployable. A rolling deploy has both versions of the code live at
     * once, and every row already in the table is plaintext. Without this, switching the key on would
     * make every existing CV unreadable.
     */
    expect(decryptJson(RESUME)).toEqual(RESUME)
    expect(decryptJson('a bare string')).toBe('a bare string')
    expect(decryptJson([1, 2, 3])).toEqual([1, 2, 3])
  })

  it('is not fooled by an object that merely has some of the fields', () => {
    const notAnEnvelope = { v: 1, iv: 'x' }
    expect(decryptJson(notAnEnvelope)).toEqual(notAnEnvelope)
  })
})

describe('a wrong key fails loudly rather than quietly', () => {
  it('throws, and says the key is the likely cause', () => {
    /**
     * It must not return the envelope (that hands ciphertext to the `Resume` parser) and must not return
     * undefined (which looks exactly like an empty CV and could be saved back over the real one). The
     * message names the key because the reflex on a decryption failure is "the data is corrupt", and
     * acting on that reflex is how somebody deletes rows that were fine.
     */
    const stored = encryptJson(RESUME)
    withKey(KEY_B)
    expect(() => decryptJson(stored)).toThrow(/key does not match/)
  })

  it('throws when the data is encrypted and no key is configured', () => {
    const stored = encryptJson(RESUME)
    withKey(undefined)
    expect(() => decryptJson(stored)).toThrow(/DATA_ENCRYPTION_KEY is not set/)
  })

  it('refuses a tampered ciphertext instead of returning plausible garbage', () => {
    // Why GCM and not CBC. An authenticated mode turns tampering into an error.
    const stored = encryptJson(RESUME) as { ct: string }
    const flipped = {
      ...stored,
      ct: Buffer.from(
        Buffer.from(stored.ct, 'base64').map((byte, index) =>
          index === 0 ? byte ^ 0xff : byte,
        ),
      ).toString('base64'),
    }
    expect(() => decryptJson(flipped)).toThrow()
  })

  it('rejects an envelope version it does not know', () => {
    const stored = { ...(encryptJson(RESUME) as object), v: 99 }
    expect(() => decryptJson(stored)).toThrow(/envelope version/)
  })
})

describe('a missing or malformed key degrades visibly, not silently', () => {
  it('stores plaintext with no key, and says so', () => {
    withKey(undefined)
    expect(encryptionEnabled()).toBe(false)
    // Plaintext rather than refusing to save: the alternative trades a working product for a security
    // posture nobody asked for on a laptop. `/privacy` reads `encryptionEnabled()` so it cannot overstate.
    expect(encryptJson(RESUME)).toEqual(RESUME)
  })

  it('refuses a key of the wrong length rather than using it', () => {
    // A short key silently accepted is an installation that believes it has 256 bits and does not.
    withKey('deadbeef')
    expect(encryptionEnabled()).toBe(false)
    expect(encryptJson(RESUME)).toEqual(RESUME)
  })

  it('reports enabled with a valid key', () => {
    expect(encryptionEnabled()).toBe(true)
  })
})

describe('key comparison', () => {
  it('matches equal keys and rejects different ones', () => {
    expect(sameKey(KEY_A, KEY_A)).toBe(true)
    expect(sameKey(KEY_A, KEY_B)).toBe(false)
    expect(sameKey(KEY_A, 'short')).toBe(false)
  })
})
