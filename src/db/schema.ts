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
  uniqueIndex,
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

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * Stored lowercased and unique. The only personal datum we hold outside a CV, and the only one
     * we need: there is no name column, because the name is already in the document they uploaded
     * and duplicating it would mean two places to honour an erasure request.
     */
    email: text('email').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Bumped on every authenticated request. The clock retention counts from. */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deleteAfter: retention(),
  },
  (table) => [uniqueIndex('users_email_key').on(table.email)],
)

export const resumes = pgTable(
  'resumes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      // Erasure has to be one statement. A dangling CV after a deleted account is the exact failure
      // a GDPR request is meant to make impossible, so the database enforces it rather than a
      // service remembering to.
      .references(() => users.id, { onDelete: 'cascade' }),
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
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
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
    subjectUserId: uuid('subject_user_id').references(() => users.id, {
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

export type UserRow = typeof users.$inferSelect
export type ResumeRow = typeof resumes.$inferSelect
export type VariantRow = typeof variants.$inferSelect
