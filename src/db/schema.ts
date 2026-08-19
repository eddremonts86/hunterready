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
  integer,
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
  /**
   * What this account is entitled to. `free` or `pro`, and `free` is the default for everybody.
   *
   * It exists for one concrete reason rather than as speculative billing plumbing: the third-party
   * model is a per-CV cost, so it is a paid capability, and everything else runs on our own hardware
   * (ADR-023). A column rather than a computed guess, because "is this person paying?" has to have one
   * answer that both the provider resolution and the interface read.
   *
   * Deliberately a `text` and not an enum. A Postgres enum needs a migration to add a value, and the
   * one certainty about tiers is that they change.
   */
  plan: text('plan').notNull().default('free'),
  deleteAfter: retention(),
})

/**
 * Every billing event we have already acted on, so acting on it twice cannot happen.
 *
 * ## Why a table and not a memory of the last one
 *
 * Payment providers **retry**. Every one of them redelivers a webhook it did not get a `2xx` for, and
 * all of them warn that an event can arrive more than once even when it did. That is not a fault: it
 * is what makes at-least-once delivery reliable, and it makes the receiver's idempotency the load
 * bearing part.
 *
 * The failure it prevents here is not a double charge — the provider owns the money. It is a double
 * *grant*: a `subscription.cancelled` arriving twice is harmless, but a cancel and a stale re-delivered
 * `active` racing each other decides whether somebody who stopped paying keeps the larger model. The
 * ledger makes the answer "whichever we recorded first, once".
 *
 * In Postgres rather than memory because a restart mid-retry is exactly when the duplicate arrives,
 * and a process that forgets on boot is a process that grants again.
 *
 * ## What is deliberately not in here
 *
 * No amount, no currency, no card, no customer name, no address. The provider holds all of that and it
 * is the merchant of record (ADR-034) — this row exists to answer "have I seen this id?" and nothing
 * else. A billing table is a tempting place to accumulate a shadow copy of somebody's purchase
 * history, and the only defence against that is for the columns not to exist.
 */
export const billingEvents = pgTable('billing_events', {
  /** The provider's own event id. The primary key, because that is precisely the uniqueness we want. */
  id: text('id').primaryKey(),
  /** Which provider sent it, so two providers cannot collide on an id during a migration between them. */
  provider: text('provider').notNull(),
  /** The provider's event name, for reading the ledger later. A closed vocabulary in practice. */
  kind: text('kind').notNull(),
  /** The account it moved, when it moved one. Null for an event about somebody we could not match. */
  userId: text('user_id').references(() => authUsers.id, {
    onDelete: 'set null',
    onUpdate: 'cascade',
  }),
  /** What we did: `pro`, `free`, or `ignored`. The outcome, not the reasoning. */
  outcome: text('outcome').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
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

/**
 * A public share link — v0.9, and the most dangerous row in this schema.
 *
 * Every other table here is reachable only with a session. This one makes a CV readable by anybody
 * holding a URL, which is the whole point and also the whole risk. Three properties are structural
 * rather than conventional, because a convention is what fails on the Friday somebody is in a hurry:
 *
 * **`expiresAt` is `notNull`.** There is no such thing as a share without an expiry. A column that
 * allowed null would make "forever" one forgotten parameter away, and a CV readable forever is a CV
 * leaked. The default is short (`SHARE_DAYS`) and the API caps what a caller may ask for.
 *
 * **The token is the primary key and nothing else.** A `uuid` from `gen_random_uuid()` is 122 random
 * bits, so the URL is the credential and enumeration is not a threat. Sequential ids here would have
 * made every CV ever shared readable by counting.
 *
 * **`revokedAt` rather than a delete.** Revoking has to be instant and auditable: the row stays so the
 * access log can still explain what a visitor saw last week, and `deleteEverything` removes it with
 * everything else when the account goes.
 *
 * The document is **referenced, not copied**. A share shows what the CV says now, so revoking is not the
 * only way to stop showing an old mistake — correcting the CV is. The alternative, a frozen snapshot per
 * link, would mean a candidate who fixed a typo still had the typo in circulation with no way to tell.
 */
export const shares = pgTable(
  'shares',
  {
    /** The token. This *is* the URL, so it is random and never sequential. */
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    /** Exactly one of these is set — the base CV, or one tailored variant. */
    resumeId: uuid('resume_id').references(() => resumes.id, {
      onDelete: 'cascade',
    }),
    variantId: uuid('variant_id').references(() => variants.id, {
      onDelete: 'cascade',
    }),
    /** What the recipient is told they are looking at. Never the candidate's name. */
    label: text('label').notNull().default(''),
    /** Not nullable, and that is the point. See the note above. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    /** Counted, never logged per visit: a visit log would be a record of who looked at a CV. */
    views: integer('views').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deleteAfter: retention(),
  },
  (table) => [index('shares_user_idx').on(table.userId)],
)

/**
 * API keys, for a machine rather than a person (ADR-032).
 *
 * ## What is stored is a hash
 *
 * `secretHash` is SHA-256 of the key. The key itself is shown once, at creation, and never again —
 * not in a column, not in a log, not in a support tool. A database dump therefore contains nothing
 * that can call the API, which is the only property that makes a leaked backup survivable.
 *
 * SHA-256 rather than argon2 or bcrypt, deliberately, and it is the opposite of the advice for
 * passwords. A password is short, human-chosen and guessable, so it needs a slow hash. This is 32
 * random bytes: brute force is not on the table, and a slow hash on the authentication path would
 * add work to every single request for no security anybody can name.
 *
 * ## The prefix is not decoration
 *
 * Every key reads `hr_live_…`. It makes a leaked key greppable in a log aggregator, recognisable in a
 * paste, and detectable by GitHub's secret scanning if it ever reaches a public repository. `prefix`
 * stores the first characters so a person can tell two keys apart in a list without either being
 * shown.
 *
 * ## Revocation is a column, not a delete
 *
 * A revoked key keeps its row so `lastUsedAt` survives the revocation: "when was this last used"
 * is the first question after a leak, and deleting the row answers it with silence.
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    /** SHA-256 of the key. Unique, so authentication is one indexed lookup rather than a scan. */
    secretHash: text('secret_hash').notNull().unique(),
    /** The first characters, for telling keys apart in a list. Never enough to reconstruct one. */
    prefix: text('prefix').notNull(),
    /** What the owner called it: "edd's other app", "staging". Never a person's name or a CV field. */
    label: text('label').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Coarse on purpose. Per-request timestamps would be a log of when somebody used the product. */
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [index('api_keys_user_idx').on(table.userId)],
)

export type ApiKeyRow = typeof apiKeys.$inferSelect

export type ShareRow = typeof shares.$inferSelect

export { RETENTION_DAYS }

export type UserRow = typeof authUsers.$inferSelect
export type ResumeRow = typeof resumes.$inferSelect
export type VariantRow = typeof variants.$inferSelect
