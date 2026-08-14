import { defineConfig } from 'drizzle-kit'

/**
 * Migrations run as the **owner**, not as the application role.
 *
 * `DATABASE_MIGRATION_URL` first, matching builderhunt: the web service must never hold an identity
 * that can alter the schema, and keeping the two URLs separate is what makes that structural rather
 * than a convention someone remembers.
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL ?? '',
  },
  // Forward-only. A generated migration is never edited once applied — drizzle-kit hashes contents,
  // so changing even a comment makes it re-run (builderhunt's CLAUDE.md records this).
  strict: true,
  verbose: true,
})
