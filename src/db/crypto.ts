/**
 * Encryption at rest for CV content — closes the last v0.5 item (ADR-018, ADR-021).
 *
 * ## What this protects, and what it honestly does not
 *
 * ADR-018 refused to ship this for a precise reason: on a single-host Coolify deployment, any key the
 * application can read at runtime sits on the same machine as the data, so "encrypted at rest" cannot
 * mean "safe from someone who owns the box". Edd accepted that trade on 2026-08-14, and the honest
 * statement of what it buys is:
 *
 *   • **Protected:** a stolen disk, a leaked volume snapshot, a backup copied off the host, a `pg_dump`
 *     that ends up somewhere it should not, and anyone with read access to the database but not the
 *     application's environment — which includes the `hunterready_readonly` role.
 *   • **Not protected:** an attacker who has the application's environment. They have the key.
 *
 * The realistic threat for a small deployment is the first list, not the second. A leaked backup is how
 * this kind of data actually escapes, and until now every byte of it was plaintext.
 *
 * ## AES-256-GCM, and why the envelope has a version
 *
 * GCM rather than CBC because it authenticates: a tampered ciphertext fails to decrypt instead of
 * producing plausible garbage that then flows into a `Resume` and out into somebody's CV. A fresh random
 * 12-byte IV per write, never reused — the one mistake that breaks GCM completely.
 *
 * The stored shape is a JSON envelope inside the existing `jsonb` column, so **no migration and no
 * column type change**:
 *
 *     { "v": 1, "iv": "<base64>", "ct": "<base64>", "tag": "<base64>" }
 *
 * `v` exists so a future key rotation or algorithm change can be told apart from this one on read
 * rather than guessed at.
 *
 * ## Plaintext rows still read
 *
 * `decryptJson` returns anything that is not an envelope unchanged. That is not laziness — it is what
 * makes this deployable at all. A rolling deploy has both versions of the code live at once, and rows
 * written before the key existed have to keep working. Encryption happens on the next write of each row.
 *
 * ## No key configured
 *
 * Writes stay plaintext and `encryptionEnabled()` reports false, because the alternative — refusing to
 * save a CV because an environment variable is missing — trades a working product for a security posture
 * nobody asked for on a laptop. It is announced once at startup rather than silently: an installation
 * that believes it is encrypting and is not is worse than one that knows it is not.
 *
 * ## Losing the key loses the data
 *
 * Stated here because it is the whole cost of this feature. There is no recovery path and there should
 * not be one — a recoverable encryption key is a key with a second copy somewhere. See ADR-021 and the
 * deploy runbook for where the key lives and how it is backed up.
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import { errorEvent, event } from '@/lib/log'

/** The current envelope version. Bump only alongside a documented migration path. */
const VERSION = 1

const ALGORITHM = 'aes-256-gcm'
/** 96 bits, the size GCM is specified for. Anything else weakens it for no benefit. */
const IV_BYTES = 12

interface Envelope {
  v: number
  iv: string
  ct: string
  tag: string
}

/**
 * The key, read once.
 *
 * 64 hex characters — 32 bytes. Rejected loudly if it is the wrong length, because a short key silently
 * accepted is an installation that thinks it is encrypting with 256 bits and is not.
 */
function readKey(): Buffer | undefined {
  const raw = (process.env.DATA_ENCRYPTION_KEY ?? '').trim()
  if (raw === '') return undefined

  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    // A code, never the value. This is the one place a key could reach a log line.
    errorEvent('crypto.bad_key', { code: 'expected_64_hex_chars' })
    return undefined
  }
  return Buffer.from(raw, 'hex')
}

let cached: { key: Buffer | undefined; announced: boolean } | undefined

function key(): Buffer | undefined {
  if (cached === undefined) {
    cached = { key: readKey(), announced: false }
    if (!cached.announced) {
      // Said once, at first use. An installation that believes it is encrypting and is not is worse
      // than one that knows.
      event('crypto.state', {
        code: cached.key === undefined ? 'plaintext_no_key' : 'encrypting',
      })
      cached.announced = true
    }
  }
  return cached.key
}

/** Whether stored CV content is being encrypted. Read by `/privacy` so the page cannot overstate it. */
export function encryptionEnabled(): boolean {
  return key() !== undefined
}

/** Test seam: forget the cached key so a test can change the environment. Not used in production. */
export function resetKeyCache(): void {
  cached = undefined
}

function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.v === 'number' &&
    typeof candidate.iv === 'string' &&
    typeof candidate.ct === 'string' &&
    typeof candidate.tag === 'string'
  )
}

/**
 * Encrypt a value for storage, or return it unchanged when no key is configured.
 *
 * `undefined` and `null` pass straight through: an absent gap report is absent, and encrypting nothing
 * into an envelope would make a nullable column non-null in effect.
 */
export function encryptJson(value: unknown): unknown {
  if (value === undefined || value === null) return value
  const secret = key()
  if (secret === undefined) return value

  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, secret, iv)
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8')
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()])

  const envelope: Envelope = {
    v: VERSION,
    iv: iv.toString('base64'),
    ct: ct.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  }
  return envelope
}

/**
 * Decrypt a stored value.
 *
 * Anything that is not an envelope comes back unchanged — see the note above on why plaintext rows must
 * keep reading. A row that *is* an envelope and cannot be decrypted **throws**, because the alternatives
 * are worse: returning the envelope would hand ciphertext to the `Resume` parser, and returning
 * `undefined` would look exactly like an empty CV and could be saved back over the real one.
 */
export function decryptJson(stored: unknown): unknown {
  if (!isEnvelope(stored)) return stored

  const secret = key()
  if (secret === undefined) {
    throw new Error(
      'stored value is encrypted but DATA_ENCRYPTION_KEY is not set — refusing to guess',
    )
  }
  if (stored.v !== VERSION) {
    throw new Error(`unknown encryption envelope version: ${stored.v}`)
  }

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      secret,
      Buffer.from(stored.iv, 'base64'),
    )
    decipher.setAuthTag(Buffer.from(stored.tag, 'base64'))
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(stored.ct, 'base64')),
      decipher.final(),
    ])
    return JSON.parse(plaintext.toString('utf8'))
  } catch {
    /**
     * Almost always the wrong key — a rotated or mistyped `DATA_ENCRYPTION_KEY`. The message says so,
     * because the default assumption on a decryption failure is "the data is corrupt", and acting on
     * that assumption is how somebody deletes rows that were fine.
     */
    throw new Error(
      'could not decrypt stored CV content: the key does not match what wrote it',
    )
  }
}

/**
 * Constant-time comparison of two keys, for the rotation check in the deploy orchestrator.
 *
 * Not security-critical here — both values are already in this process — but a short-circuiting compare
 * on key material is the habit worth not having.
 */
export function sameKey(a: string, b: string): boolean {
  const left = Buffer.from(a.trim(), 'utf8')
  const right = Buffer.from(b.trim(), 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
