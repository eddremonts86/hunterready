/**
 * Delete what is past its retention date — 90 days of inactivity (Edd's decision, 2026-08-14).
 *
 * Idempotent and safe to run on every deploy and on a schedule. Runs as the **owner**, because the
 * application role deliberately cannot DELETE from the audit log: an actor who can erase the record of
 * their own access has an audit log in name only.
 *
 * Deleting an account cascades to its CVs and variants, so one statement honours the whole promise —
 * the point of every foreign key carrying `onDelete: 'cascade'` rather than a service remembering the
 * order to delete things in.
 *
 * ## Why `--check` exists, and why the queries are declared once
 *
 * The orchestrator treats a failure here as **soft**, so a retention problem never blocks a release.
 * That is right, and it is also how this shipped broken: when the schema moved to Better Auth's
 * `auth_users`, this file still said `users`, the deploy went green, and the sweep silently did
 * nothing. A sweep that matches no rows looks exactly like a sweep with nothing to do.
 *
 * The first attempt at a fix was worse than none — a `--check` mode with its own copy of the queries,
 * which passed while the real ones were still broken. **A check that duplicates the thing it checks
 * does not check it.** So there is one list of targets below, and both paths read it: `--check` counts
 * what would go, the real run deletes it. They cannot drift.
 */
import postgres from 'postgres'

const url = (
  process.env.DATABASE_MIGRATION_URL ??
  process.env.DATABASE_URL ??
  ''
).trim()
if (url === '') {
  console.error('retention: no database URL set')
  process.exit(1)
}

/**
 * What expires, and when. One definition, used by both the check and the sweep.
 *
 * Accounts come first: the cascade takes their documents with them, so the later statements find less
 * work. The audit log outlives the records it describes by a year, because an erasure request answered
 * in month ten needs evidence that the deletion happened.
 */
const TARGETS = [
  { key: 'users', table: 'auth_users', where: 'delete_after < now()' },
  { key: 'resumes', table: 'resumes', where: 'delete_after < now()' },
  { key: 'variants', table: 'variants', where: 'delete_after < now()' },
  {
    key: 'auditRows',
    table: 'access_log',
    where: "at < now() - interval '1 year'",
  },
]

const CHECK = process.argv.includes('--check')
const sql = postgres(url, { max: 1, onnotice: () => {} })

try {
  const counts = {}

  if (CHECK) {
    // Counts only, nothing deleted: this proves every statement still resolves against the schema,
    // which is the failure that slipped through once.
    for (const target of TARGETS) {
      const [row] = await sql.unsafe(
        `SELECT count(*)::int AS n FROM ${target.table} WHERE ${target.where}`,
      )
      counts[target.key] = row.n
    }
    console.log(JSON.stringify({ event: 'retention.check', ok: true, counts }))
  } else {
    for (const target of TARGETS) {
      const rows = await sql.unsafe(
        `DELETE FROM ${target.table} WHERE ${target.where} RETURNING 1`,
      )
      counts[target.key] = rows.length
    }
    // Counts only. A retention sweep that logged what it deleted would be the last place CV content
    // leaks from (docs/07).
    console.log(JSON.stringify({ event: 'retention.swept', ...counts }))
  }
} catch (error) {
  console.error(
    'retention: failed —',
    error instanceof Error ? error.message : error,
  )
  process.exit(1)
} finally {
  await sql.end()
}
