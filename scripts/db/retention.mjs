/**
 * Delete what is past its retention date — 90 days of inactivity (Edd's decision, 2026-08-14).
 *
 * Idempotent and safe to run on every deploy and on a schedule. Runs as the **owner**, because the
 * application role deliberately cannot DELETE from the audit log: an actor who can erase the record
 * of their own access has an audit log in name only.
 *
 * Deleting a user cascades to their CVs and variants, so one statement honours the whole promise —
 * which is the point of the foreign keys carrying `onDelete: 'cascade'` rather than a service
 * remembering the order to delete things in.
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

const sql = postgres(url, { max: 1, onnotice: () => {} })
try {
  // Users first: the cascade takes their documents with them, so the later statements find less work.
  const users =
    await sql`DELETE FROM users WHERE delete_after < now() RETURNING id`
  const resumes =
    await sql`DELETE FROM resumes WHERE delete_after < now() RETURNING id`
  const variants =
    await sql`DELETE FROM variants WHERE delete_after < now() RETURNING id`
  // The log outlives the records it describes by a year: an erasure request answered in month ten
  // needs evidence that the deletion happened.
  const logs =
    await sql`DELETE FROM access_log WHERE at < now() - interval '1 year' RETURNING id`

  // Counts only. A retention sweep that logged what it deleted would be the last place CV content
  // leaks from (docs/07).
  console.log(
    JSON.stringify({
      event: 'retention.swept',
      users: users.length,
      resumes: resumes.length,
      variants: variants.length,
      auditRows: logs.length,
    }),
  )
} catch (error) {
  console.error(
    'retention: failed —',
    error instanceof Error ? error.message : error,
  )
  process.exit(1)
} finally {
  await sql.end()
}
