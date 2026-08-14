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

/**
 * How long a public share link lives by default, and the longest one may live — v0.9.
 *
 * Fourteen days is chosen from what the thing is for: sending a CV to a recruiter who asked for it, and
 * a fortnight covers a hiring conversation. It is short on purpose, and the maximum is short on purpose,
 * because the failure mode of this feature is a link nobody remembers that still works two years later.
 *
 * Anyone who needs longer can make a new link. That is a mild inconvenience; a forgotten permanent URL
 * holding somebody's employment history is not.
 */
export const SHARE_DAYS = 14
export const SHARE_MAX_DAYS = 90
