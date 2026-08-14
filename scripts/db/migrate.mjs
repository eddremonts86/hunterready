/**
 * Apply pending migrations as the owner role.
 *
 * Separate from `drizzle-kit migrate` so it can be run from the deployed image, which has no
 * devDependencies — drizzle-kit is a dev tool and is not there. `drizzle-orm/migrator` is.
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

const url = (
  process.env.DATABASE_MIGRATION_URL ??
  process.env.DATABASE_URL ??
  ''
).trim()
if (url === '') {
  console.error('migrate: no DATABASE_MIGRATION_URL or DATABASE_URL set')
  process.exit(1)
}

// max: 1 — migrations are serial by nature and a pool here only invites a lock fight with itself.
// `onnotice` silenced: postgres emits NOTICE for every "already exists, skipping", and a dozen of
// those scrolling past is how a genuine error gets missed.
const sql = postgres(url, { max: 1, onnotice: () => {} })
try {
  await migrate(drizzle(sql), { migrationsFolder: './drizzle' })
  console.log('migrate: up to date')
} catch (error) {
  console.error(
    'migrate: failed —',
    error instanceof Error ? error.message : error,
  )
  process.exit(1)
} finally {
  await sql.end()
}
