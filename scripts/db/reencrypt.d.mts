/**
 * Types for `reencrypt.mjs`, so the envelope test can import it.
 *
 * The script is plain JavaScript on purpose — `scripts/` has no TypeScript runner — but
 * `src/db/__tests__/reencrypt-envelope.test.ts` imports it to check that its envelope still matches
 * `crypto.ts`. Without this file that import is an implicit `any` and `tsc --noEmit` refuses it
 * (TS7016), which is how CI failed.
 *
 * Only the three exports the test uses are declared. `main` is deliberately absent: importing the
 * script must never open a database connection.
 */

/** The stored shape. Mirrors `Envelope` in `src/db/crypto.ts`. */
export interface Envelope {
  v: number
  iv: string
  ct: string
  tag: string
}

/**
 * Read and validate the key. Returns `undefined` for anything that is not 64 hex characters rather
 * than padding it. Called with no argument it reads `process.env.DATA_ENCRYPTION_KEY`.
 */
export declare function readKey(raw?: string): Buffer | undefined

/** Encrypt one value into the storage envelope. */
export declare function encryptJson(value: unknown, secret: Buffer): Envelope

/** True when a stored value is already an envelope. */
export declare function isEnvelope(value: unknown): boolean
