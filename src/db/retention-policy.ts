/**
 * The retention window, importable from the browser.
 *
 * `schema.ts` also exports it, but that module imports `drizzle-orm/pg-core` — pulling it into a
 * client component would drag the whole Postgres dialect into the browser bundle to read one number.
 * Worse, it is the first step down the path that ends in `Buffer is not defined` and a silently dead
 * page (see the comment in `client.ts`).
 *
 * So the number lives here, with no dependencies, and both sides import it. One definition, quoted in
 * the privacy notice and enforced by the sweep.
 */
export const RETENTION_DAYS = 90
