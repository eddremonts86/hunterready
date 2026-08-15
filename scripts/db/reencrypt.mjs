/**
 * Encrypt the rows that were written before there was a key.
 *
 * `DATA_ENCRYPTION_KEY` was empty in production from the first deploy until 15 Aug 2026. Everything
 * stored in that window is plaintext, and it stays plaintext on its own: `encryptJson` only runs on a
 * write, so a CV nobody edits again is never encrypted, and `decryptJson` passes a non-envelope
 * through unchanged — which is what keeps those rows readable, and also what makes them invisible.
 * Turning the key on fixed the future and nothing else. This fixes the past.
 *
 * ## Safe to run, safe to run again
 *
 * The predicate is "this value is not an envelope", so an already-encrypted row is not selected, and
 * a second run does nothing. That is also why the batch loop terminates: encrypting a row removes it
 * from the set the loop is draining. If the key were missing, encryption would be a no-op, every row
 * would stay selected, and the loop would never end — so a missing or malformed key is refused up
 * front rather than discovered as a hang.
 *
 * ## Two implementations of one envelope
 *
 * `src/db/crypto.ts` cannot be imported here: these scripts are plain `.mjs` and the repo has no
 * TypeScript runner. So the envelope is written twice, which is exactly the shape of the bug
 * `retention.mjs` documents — a second copy that drifts from the first and is never noticed.
 *
 * What stops it here is `src/db/__tests__/reencrypt-envelope.test.ts`: it imports both this file and
 * `crypto.ts` and asserts each can read what the other wrote. If the envelope changes on either side,
 * that test fails. Do not change the constants below without it.
 *
 * ## Usage
 *
 *   node scripts/db/reencrypt.mjs --check    # count what is still plaintext, change nothing
 *   node scripts/db/reencrypt.mjs            # encrypt it
 *
 * Runs as the **owner** (`DATABASE_MIGRATION_URL`), like every other script here — the application
 * role has no reason to hold UPDATE on every row of every document table.
 */
import { createCipheriv, randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import postgres from 'postgres'

/** Mirrors `src/db/crypto.ts`. Pinned to it by the envelope test — see the header. */
const VERSION = 1
const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const ENVELOPE_KEYS = ['v', 'iv', 'ct', 'tag']

/**
 * What holds encrypted content. One list, read by both `--check` and the real run.
 *
 * `retention.mjs` shipped broken because its check kept its own copy of the queries and passed while
 * the real ones were stale. The same rule applies here: one definition, two readers.
 */
const TARGETS = [
  { key: 'resumes', table: 'resumes', column: 'document' },
  { key: 'variantDocuments', table: 'variants', column: 'document' },
  { key: 'variantGapReports', table: 'variants', column: 'gap_report' },
]

/** How many rows to hold in memory at once. CVs are small; this is about the update round trips. */
const BATCH = 200

/**
 * The key, on the same terms as the application reads it.
 *
 * A short or non-hex value is rejected rather than padded. An installation that thinks it is
 * encrypting with 256 bits and is not is the failure this whole feature exists to avoid.
 */
export function readKey(raw = process.env.DATA_ENCRYPTION_KEY) {
  const value = (raw ?? '').trim()
  if (value === '') return undefined
  if (!/^[0-9a-fA-F]{64}$/.test(value)) return undefined
  return Buffer.from(value, 'hex')
}

/** Encrypt one value into the storage envelope. Exported so the envelope test can read it. */
export function encryptJson(value, secret) {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, secret, iv)
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8')
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()])

  return {
    v: VERSION,
    iv: iv.toString('base64'),
    ct: ct.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  }
}

/** True when a stored value is already an envelope. The mirror of `isEnvelope` in `crypto.ts`. */
export function isEnvelope(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  return (
    typeof value.v === 'number' &&
    typeof value.iv === 'string' &&
    typeof value.ct === 'string' &&
    typeof value.tag === 'string'
  )
}

/**
 * SQL for "this column holds something that is not an envelope".
 *
 * `jsonb_exists` rather than the `?` operator, which is awkward to carry through a driver that uses
 * placeholders. A value that is not an object fails every key test and is therefore treated as
 * plaintext, which is the right answer for it.
 */
function plaintextPredicate(column) {
  const keys = ENVELOPE_KEYS.map((k) => `jsonb_exists(${column}, '${k}')`)
  return `${column} IS NOT NULL AND NOT (${keys.join(' AND ')})`
}

async function main() {
  const url = (
    process.env.DATABASE_MIGRATION_URL ??
    process.env.DATABASE_URL ??
    ''
  ).trim()
  if (url === '') {
    console.error('reencrypt: no database URL set')
    process.exit(1)
  }

  const check = process.argv.includes('--check')

  // Refused before opening a connection: without a key the encrypt step is a no-op and the drain loop
  // below would never make progress. A hang is a worse way to learn this than a line of output.
  const secret = readKey()
  if (secret === undefined && !check) {
    console.error(
      'reencrypt: DATA_ENCRYPTION_KEY is unset or not 64 hex characters — nothing to encrypt with',
    )
    process.exit(1)
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} })
  const counts = {}

  try {
    if (check) {
      for (const target of TARGETS) {
        const [row] = await sql.unsafe(
          `SELECT count(*)::int AS n FROM ${target.table} WHERE ${plaintextPredicate(target.column)}`,
        )
        counts[target.key] = row.n
      }
      console.log(
        JSON.stringify({
          event: 'reencrypt.check',
          keyConfigured: secret !== undefined,
          plaintext: counts,
        }),
      )
      return
    }

    for (const target of TARGETS) {
      let done = 0
      const remaining = async () => {
        const [row] = await sql.unsafe(
          `SELECT count(*)::int AS n FROM ${target.table} WHERE ${plaintextPredicate(target.column)}`,
        )
        return row.n
      }
      let before = await remaining()

      for (;;) {
        const rows = await sql.unsafe(
          `SELECT id, ${target.column} AS value FROM ${target.table}
           WHERE ${plaintextPredicate(target.column)} ORDER BY id LIMIT ${BATCH}`,
        )
        if (rows.length === 0) break

        for (const row of rows) {
          /**
           * The envelope goes in as an object, not as a string.
           *
           * `JSON.stringify(envelope)` against a `jsonb` parameter encodes it twice: the driver
           * serialises the string it was handed, and the column ends up holding a JSON *string*
           * whose text happens to be an object. `jsonb_exists` then finds no keys on it, the row
           * still matches "not an envelope", and the drain loop below never finishes.
           */
          await sql.unsafe(
            `UPDATE ${target.table} SET ${target.column} = $1 WHERE id = $2`,
            [sql.json(encryptJson(row.value, secret)), row.id],
          )
        }
        done += rows.length

        /**
         * The set has to shrink, or the loop above spins until the process dies.
         *
         * That is not hypothetical: the first version of this script encoded the envelope twice, the
         * column ended up holding a JSON string rather than an object, the predicate kept matching the
         * rows it had just written, and the symptom was an out-of-memory crash with no clue in it. A
         * write that does not satisfy the predicate that selected it is a bug in this file, and it
         * says so here instead of hanging.
         */
        const after = await remaining()
        if (after >= before) {
          throw new Error(
            `${target.table}.${target.column}: encrypted ${rows.length} rows and ${after} are still plaintext (was ${before}) — the write is not producing what the predicate reads as an envelope`,
          )
        }
        before = after
      }
      counts[target.key] = done
    }

    // Counts only. A script that logged what it encrypted would be the one place the plaintext it is
    // removing comes back out (docs/07).
    console.log(JSON.stringify({ event: 'reencrypt.done', ...counts }))
  } catch (error) {
    console.error(
      'reencrypt: failed —',
      error instanceof Error ? error.message : error,
    )
    process.exit(1)
  } finally {
    await sql.end()
  }
}

// Importing this file must not touch a database — the envelope test does exactly that.
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) await main()
