/**
 * The persistence schema — v0.5 (docs/08-roadmap.md, ADR-018/019).
 *
 * Drizzle + Postgres, matching the house stack in `builderhunt` rather than the "Convex" the roadmap
 * guessed at. Copying the reference app's answers instead of inventing a second architecture is
 * Edd's standing instruction, and it means the migration workflow, the role model and the deploy
 * orchestrator are already understood here.
 *
 * ## Shipping this changes what the product promises
 *
 * Until now `/privacy` said a CV is *never written to a disk or a database*. That was true and it was
 * load-bearing — docs/07 calls it "a claim competitors cannot make". It is no longer true, so the
 * copy changes in the same commit, which docs/07 requires and ADR-019 records. Storing someone's
 * employment history is not a feature you add quietly.
 *
 * ## Three decisions the shape encodes
 *
 * **A CV lives in one column, as JSON, validated by Zod on the way out.** Not normalized into a
 * dozen tables. The `Resume` schema is already the single contract (ADR-001) and it evolves with a
 * `schemaVersion`; normalizing it would create a second definition that has to be migrated in
 * lockstep, and every read would need a join fan-out to rebuild what one `JSON.parse` gives.
 *
 * **A variant references its base and never copies it.** One row per application, holding only the
 * tailored document and which job it was for, so "what did I send them?" is answerable months later
 * — which is the whole point of remembering anything.
 *
 * **Every table carries `deleteAfter`.** Retention is not a cron job's private business: it is a
 * column, so any query can see whether a row is due, a restore cannot silently resurrect expired
 * data, and "we delete after 90 days of inactivity" is checkable rather than asserted.
 */
import { sql } from 'drizzle-orm'
import { RETENTION_DAYS } from './retention-policy'
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * 90 days of inactivity, then the row is due for deletion (Edd's decision, 2026-08-14; docs/07).
 *
 * Counted from `lastSeenAt`, not from creation: someone iterating on their CV over four months has
 * not abandoned it, and deleting their work on an anniversary would be the wrong kind of correct.
 */
const retention = () =>
  timestamp('delete_after', { withTimezone: true })
    .notNull()
    // Interpolated from the one definition, so the column default and the privacy notice cannot
    // disagree about what the policy is.
    .default(sql`now() + interval '${sql.raw(String(RETENTION_DAYS))} days'`)

/**
 * Better Auth's four tables, named as in `builderhunt` — the reference app already runs Better Auth
 * 1.6 with the Drizzle adapter, so this is its answer rather than a new one.
 *
 * What is *not* copied: organizations, device fingerprinting, abuse hooks, step-up auth. Those solve
 * a multi-tenant SaaS's problems. HunterReady is one person and one CV, and inheriting that apparatus
 * would be complexity with nothing behind it.
 *
 * ## One identity table, and this is the load-bearing decision
 *
 * `auth_users` *is* the user table. There is no second `users` row keyed to it, which the first draft
 * of this schema had — and two identity tables means two places to honour an erasure request, which is
 * exactly the shape of bug a GDPR obligation cannot survive. The retention columns therefore live
 * here, on Better Auth's own table: they have defaults, so Better Auth inserts without knowing about
 * them and Postgres fills them in.
 */
export const authUsers = pgTable('auth_users', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default(''),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  /**
   * The clock retention counts from — bumped on every authenticated request.
   *
   * Not `createdAt`: someone iterating on their CV over four months has not abandoned it, and
   * deleting their work on an anniversary would be the wrong kind of correct.
   */
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  deleteAfter: retention(),
})

export const authSessions = pgTable('auth_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => authUsers.id, {
      onDelete: 'cascade',
      onUpdate: 'cascade',
    }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const authAccounts = pgTable(
  'auth_accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
    }),
    scope: text('scope'),
    idToken: text('id_token'),
    /** Hashed by Better Auth (scrypt). Never a plaintext password, never our own hashing. */
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('auth_accounts_provider_account_unique').on(
      table.accountId,
      table.providerId,
    ),
  ],
)

export const authVerifications = pgTable('auth_verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const resumes = pgTable(
  'resumes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      // Erasure has to be one statement. A dangling CV after a deleted account is the exact failure
      // a GDPR request is meant to make impossible, so the database enforces it rather than a
      // service remembering to.
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    /** Their working CV. One `Resume` document, validated by Zod on read (ADR-001). */
    document: jsonb('document').notNull(),
    /** Carried so a stored document can be migrated forward without guessing which shape it is. */
    schemaVersion: text('schema_version').notNull(),
    label: text('label').notNull().default('My CV'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deleteAfter: retention(),
  },
  (table) => [index('resumes_user_idx').on(table.userId)],
)

/**
 * One row per application: the tailored document, and what it was tailored for.
 *
 * The job description is kept because without it the variant is unexplainable — six weeks later
 * "why does this version lead with cycle counting?" has no answer, and the gap report cannot be
 * recomputed to show what the candidate decided to apply with anyway.
 */
export const variants = pgTable(
  'variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    resumeId: uuid('resume_id')
      .notNull()
      .references(() => resumes.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    document: jsonb('document').notNull(),
    schemaVersion: text('schema_version').notNull(),
    /** Where they applied. Free text, because a company name is not a database key. */
    company: text('company'),
    role: text('role'),
    jobDescription: text('job_description'),
    /** The gap report as computed at the time, so the record does not drift when our rules change. */
    gapReport: jsonb('gap_report'),
    /**
     * Application state. Free text on purpose: an enum here would either be wrong for somebody's
     * process or grow a migration every time a new stage is needed.
     */
    status: text('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deleteAfter: retention(),
  },
  (table) => [
    index('variants_resume_idx').on(table.resumeId),
    index('variants_user_idx').on(table.userId),
  ],
)

/**
 * Who read what, and when.
 *
 * docs/08 lists "audit log of record access" under v0.5 and it is the one table here that is not
 * about features. It exists so an erasure or access request can be answered with evidence rather
 * than a promise, and so an internal read of somebody's CV leaves a trace.
 *
 * It deliberately holds **no CV content** — a subject id, an action, a row id. An audit log that
 * quotes the record it is auditing doubles the exposure it exists to control.
 */
export const accessLog = pgTable(
  'access_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The account whose data was touched. Nullable so a failed lookup is still recorded. */
    subjectUserId: text('subject_user_id').references(() => authUsers.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    recordType: text('record_type'),
    recordId: uuid('record_id'),
    /** True when the actor was not the subject — the row worth reviewing. */
    byOther: boolean('by_other').notNull().default(false),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('access_log_subject_idx').on(table.subjectUserId)],
)

export { RETENTION_DAYS }

export type UserRow = typeof authUsers.$inferSelect
export type ResumeRow = typeof resumes.$inferSelect
export type VariantRow = typeof variants.$inferSelect
