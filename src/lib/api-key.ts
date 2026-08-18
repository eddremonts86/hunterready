/**
 * Issuing and recognising an API key (ADR-032).
 *
 * ## The key is shown once and stored as a hash
 *
 * `mint()` returns the secret to the caller and a hash to the database. Nothing anywhere keeps both.
 * A database dump therefore contains nothing that can call the API, which is the only property that
 * makes a leaked backup survivable, and a support tool cannot read somebody's key back to them
 * because there is nothing to read.
 *
 * ## SHA-256, and why that is right here and wrong for a password
 *
 * A password is short, human-chosen and guessable, so it needs a deliberately slow hash. This is 32
 * bytes from a CSPRNG: there is no dictionary, no reuse across sites, and no realistic brute force.
 * A slow hash on the authentication path would add work to every request and buy nothing anybody can
 * name. The threat a key hash defends against is a database read, not a guessing attack.
 *
 * ## The prefix
 *
 * `hr_live_` on every key. It makes a leaked one greppable in a log aggregator, recognisable in a
 * paste, and detectable by scanners that look for known secret shapes. The environment segment
 * exists so a test key can never be mistaken for a production one in an incident.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** Marks the key as ours and as this environment's. Kept short: it is typed into curl by hand. */
export const KEY_PREFIX = 'hr_live_'

/** 32 bytes. base64url so a key survives a shell, a URL and a YAML file without quoting. */
const SECRET_BYTES = 32

/** Enough to tell two keys apart in a list, far too little to reconstruct one. */
const SHOWN_CHARS = KEY_PREFIX.length + 6

export interface MintedKey {
  /** Shown to the person exactly once. Never stored, never logged. */
  secret: string
  /** What goes in `api_keys.secret_hash`. */
  secretHash: string
  /** What goes in `api_keys.prefix`, for a list somebody has to read. */
  prefix: string
}

export function hashKey(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex')
}

export function mint(): MintedKey {
  const secret = `${KEY_PREFIX}${randomBytes(SECRET_BYTES).toString('base64url')}`
  return {
    secret,
    secretHash: hashKey(secret),
    prefix: secret.slice(0, SHOWN_CHARS),
  }
}

/**
 * Pull a key out of `Authorization: Bearer …`.
 *
 * Returns `undefined` for anything that is not shaped like one of ours, so a malformed header costs
 * a string comparison rather than a database round trip. **The prefix check is not authentication**;
 * it is a filter, and the hash lookup is the actual answer.
 */
export function keyFromHeader(header: string | null): string | undefined {
  if (header === null) return undefined
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  const candidate = match?.[1]
  if (candidate === undefined || !candidate.startsWith(KEY_PREFIX)) {
    return undefined
  }
  return candidate
}

/**
 * Constant-time comparison of two hashes.
 *
 * The lookup is by unique index, so this is belt and braces rather than the main defence — but a
 * `===` on a secret-derived value is the kind of line that gets copied somewhere it matters, and
 * this one cannot be.
 */
export function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
