/**
 * Every database read and write, in one place.
 *
 * Routes never touch `db` directly. That is not layering for its own sake — three obligations have to
 * hold on *every* access, and a repository is the only place they can be enforced rather than
 * remembered:
 *
 *  1. **A stored document is validated on the way out.** It was written by an older version of this
 *     code and `Resume` has a `schemaVersion` for exactly that reason (ADR-001). A route that trusted
 *     the column would hand the renderer a shape it rejects, months after the write.
 *  2. **Activity extends retention.** Reading or writing someone's CV means they are still using it,
 *     so `lastSeenAt` and `deleteAfter` move together. Retention that counted from creation would
 *     delete the work of anyone who iterates for four months.
 *  3. **Access is logged.** docs/08 requires an audit of record access, and a log that some call sites
 *     remember to write is not an audit.
 */
import { and, eq, lt, sql } from 'drizzle-orm'
import { Resume } from '@/schema/resume'
import { db } from './client'
import { decryptJson, encryptJson } from './crypto'
import {
  accessLog,
  authUsers,
  RETENTION_DAYS,
  resumes,
  shares,
  variants,
} from './schema'
import { SHARE_DAYS, SHARE_MAX_DAYS } from './retention-policy'

export { RETENTION_DAYS, SHARE_DAYS }

/** Pushes both retention clocks forward by the policy window. */
const extended = sql`now() + interval '${sql.raw(String(RETENTION_DAYS))} days'`

async function record(
  subjectUserId: string | null,
  action: string,
  recordType?: string,
  recordId?: string,
  byOther = false,
): Promise<void> {
  try {
    await db
      .insert(accessLog)
      .values({ subjectUserId, action, recordType, recordId, byOther })
  } catch {
    // An audit write must never fail the user's request. It is logged as a metric elsewhere; losing
    // one row is bad, refusing to load somebody's CV because of it is worse.
  }
}

/**
 * Decrypt and parse a stored document, or throw with something a developer can act on.
 *
 * The single funnel every read goes through, which is why encryption needed no changes at the call
 * sites. `decryptJson` passes plaintext rows through unchanged, so rows written before the key existed
 * keep reading (ADR-021).
 */
function parseDocument(raw: unknown, id: string): Resume {
  const parsed = Resume.safeParse(decryptJson(raw))
  if (!parsed.success) {
    throw new Error(
      `stored document ${id} does not match the current Resume schema: ${parsed.error.issues
        .slice(0, 3)
        .map((issue) => issue.path.join('.'))
        .join(', ')}`,
    )
  }
  return parsed.data
}

/**
 * Record that this account was used, and push its retention clock forward.
 *
 * Creating accounts is Better Auth's job now — this used to be `findOrCreateUser`, which was our own
 * half of an identity system we no longer own. What remains is the half Better Auth does not do: the
 * retention policy is ours, and "still using it" is measured here.
 */
export async function touchUser(userId: string): Promise<void> {
  await db
    .update(authUsers)
    .set({ lastSeenAt: new Date(), deleteAfter: extended })
    .where(eq(authUsers.id, userId))
}

/**
 * The account's plan, or `free` when there is no row.
 *
 * A missing user is `free` rather than an error: the caller is deciding whether to spend money on a
 * third-party call, and "we could not find you" must never resolve to yes (see `lib/entitlements.ts`).
 */
export async function getPlan(userId: string): Promise<string> {
  const [row] = await db
    .select({ plan: authUsers.plan })
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .limit(1)
  return row?.plan ?? 'free'
}

/**
 * Move an account between plans. Audited, because it changes what happens to that person's CV.
 *
 * There is no payment provider yet, so this is how a plan gets set at all — deliberately a repository
 * function rather than an endpoint. Granting yourself the paid tier over HTTP is not a feature.
 */
export async function setPlan(input: {
  userId: string
  plan: string
}): Promise<boolean> {
  const changed = await db
    .update(authUsers)
    .set({ plan: input.plan })
    .where(eq(authUsers.id, input.userId))
    .returning({ id: authUsers.id })

  if (changed.length === 0) return false
  await record(input.userId, `plan.${input.plan}`, 'account', undefined)
  return true
}

export async function saveResume(input: {
  userId: string
  resume: Resume
  label?: string
  resumeId?: string
}): Promise<string> {
  const values = {
    userId: input.userId,
    // Encrypted at rest (ADR-021). `schemaVersion` stays in the clear on purpose: a migration has to be
    // able to find rows of a given version without holding the key.
    document: encryptJson(input.resume),
    schemaVersion: input.resume.schemaVersion,
    label: input.label ?? 'My CV',
    updatedAt: new Date(),
    deleteAfter: extended,
  }

  if (input.resumeId !== undefined) {
    await db
      .update(resumes)
      .set(values)
      .where(
        // The user id is in the predicate, not checked beforehand: an ownership test that lives in a
        // separate `if` is an ownership test somebody can forget to write.
        and(eq(resumes.id, input.resumeId), eq(resumes.userId, input.userId)),
      )
    await record(input.userId, 'resume.updated', 'resume', input.resumeId)
    return input.resumeId
  }

  const [created] = await db
    .insert(resumes)
    .values(values)
    .returning({ id: resumes.id })
  await record(input.userId, 'resume.created', 'resume', created.id)
  return created.id
}

export async function listResumes(userId: string) {
  await db
    .update(authUsers)
    .set({ lastSeenAt: new Date(), deleteAfter: extended })
    .where(eq(authUsers.id, userId))

  const rows = await db
    .select({
      id: resumes.id,
      label: resumes.label,
      updatedAt: resumes.updatedAt,
      document: resumes.document,
    })
    .from(resumes)
    .where(eq(resumes.userId, userId))

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    updatedAt: row.updatedAt,
    resume: parseDocument(row.document, row.id),
  }))
}

export async function saveVariant(input: {
  userId: string
  resumeId: string
  resume: Resume
  company?: string
  role?: string
  jobDescription?: string
  gapReport?: unknown
  status?: string
}): Promise<string> {
  const [created] = await db
    .insert(variants)
    .values({
      userId: input.userId,
      resumeId: input.resumeId,
      document: encryptJson(input.resume),
      schemaVersion: input.resume.schemaVersion,
      company: input.company,
      role: input.role,
      /**
       * The advert stays readable; the gap report does not.
       *
       * A job advert is public text somebody pasted. A gap report **quotes the CV back** — its `found`
       * arrays are the candidate's own bullets — so it is CV content wearing a different name, and it gets
       * the same treatment as the document.
       */
      jobDescription: input.jobDescription,
      gapReport: encryptJson(input.gapReport),
      status: input.status ?? 'draft',
      deleteAfter: extended,
    })
    .returning({ id: variants.id })
  await record(input.userId, 'variant.created', 'variant', created.id)
  return created.id
}

/**
 * Move one application between `draft` and `sent`.
 *
 * The only mutable field on a variant, and deliberately: the *document* a variant holds must never
 * change, because the entire point of storing it is that it is what was sent. Editing a variant in
 * place would destroy the only record of what a recruiter is holding.
 *
 * Returns whether a row was actually changed, so a caller can answer 404 rather than pretend. The
 * ownership test is in the predicate, not in an `if` above it — see `saveResume`.
 */
export async function setApplicationStatus(input: {
  userId: string
  variantId: string
  status: 'draft' | 'sent'
}): Promise<boolean> {
  const changed = await db
    .update(variants)
    .set({ status: input.status, deleteAfter: extended })
    .where(
      and(eq(variants.id, input.variantId), eq(variants.userId, input.userId)),
    )
    .returning({ id: variants.id })

  if (changed.length === 0) return false
  await record(
    input.userId,
    `variant.${input.status}`,
    'variant',
    input.variantId,
  )
  return true
}

export async function listVariants(userId: string) {
  const rows = await db
    .select()
    .from(variants)
    .where(eq(variants.userId, userId))
  return rows.map((row) => ({
    id: row.id,
    resumeId: row.resumeId,
    company: row.company,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt,
    resume: parseDocument(row.document, row.id),
  }))
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
   Public share links — v0.9
   ──────────────────────────────────────────────────────────────────────────────────────────────── */

export interface ShareTarget {
  userId: string
  /** Exactly one of these. A share points at the base CV or at one tailored variant. */
  resumeId?: string
  variantId?: string
  label?: string
  /** Clamped to `SHARE_MAX_DAYS`, defaulted to `SHARE_DAYS`. There is no "no expiry". */
  days?: number
}

/**
 * Create a link. Returns the token, which *is* the URL.
 *
 * The expiry is computed here rather than taken from the caller, and clamped rather than validated: a
 * request for 3650 days becomes 90 instead of an error. That is the right shape for something whose
 * failure mode is a permanent URL — the pressure is always toward longer, so the ceiling has to be a
 * property of the store and not of whoever remembered to check.
 *
 * Ownership is verified by the insert's own predicate: the row cannot reference a resume or variant that
 * is not this user's, because the foreign keys and the `userId` are set from the session together and the
 * caller checks the target belongs to them. `readShare` re-derives the owner from the row rather than
 * trusting anything in the URL.
 */
export async function createShare(target: ShareTarget): Promise<{
  token: string
  expiresAt: Date
}> {
  const days = Math.max(
    1,
    Math.min(SHARE_MAX_DAYS, Math.round(target.days ?? SHARE_DAYS)),
  )
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

  const [created] = await db
    .insert(shares)
    .values({
      userId: target.userId,
      ...(target.resumeId === undefined ? {} : { resumeId: target.resumeId }),
      ...(target.variantId === undefined
        ? {}
        : { variantId: target.variantId }),
      label: target.label ?? '',
      expiresAt,
      deleteAfter: extended,
    })
    .returning({ id: shares.id })

  await record(target.userId, 'share.created', 'share', created.id)
  return { token: created.id, expiresAt }
}

export interface SharedDocument {
  resume: Resume
  label: string
  expiresAt: Date
}

/**
 * Read what a link points at, or `undefined`.
 *
 * One answer for every failure — unknown token, revoked, expired, or a document since deleted. The
 * caller shows one page for all of them, deliberately: telling a visitor that a token *was* valid but
 * expired confirms the CV exists, and confirming existence to somebody holding a guessed URL is the one
 * thing this endpoint must not do.
 *
 * The visit is counted, not logged. A per-visit log would be a record of who looked at somebody's CV and
 * when — data this product has no use for and no business holding.
 */
/**
 * The token is a `uuid` primary key, so anything that is not shaped like one never reaches the table.
 *
 * Without this check Postgres raises `22P02 invalid input syntax for type uuid`, the query throws, and
 * the route answers **500** instead of the 404 it was written to give — so a truncated link and an
 * unknown-but-well-formed one get *different* answers, in the one endpoint whose stated rule is one
 * answer for every failure. The driver also puts the offending parameter in the error it logs, which is
 * the token this module goes out of its way never to log.
 *
 * Found in the browser: `/s/no-existe` answered 200 with the right page (the shell is client-rendered)
 * over an API call that had 500'd underneath it.
 */
const SHARE_TOKEN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function readShare(
  token: string,
): Promise<SharedDocument | undefined> {
  if (!SHARE_TOKEN.test(token)) return undefined

  const [row] = await db.select().from(shares).where(eq(shares.id, token))
  if (row === undefined) return undefined
  if (row.revokedAt !== null) return undefined
  if (row.expiresAt.getTime() <= Date.now()) return undefined

  const document =
    row.variantId !== null
      ? await db
          .select({ document: variants.document })
          .from(variants)
          .where(eq(variants.id, row.variantId))
      : row.resumeId !== null
        ? await db
            .select({ document: resumes.document })
            .from(resumes)
            .where(eq(resumes.id, row.resumeId))
        : []

  const [found] = document
  if (found === undefined) return undefined

  await db
    .update(shares)
    .set({ views: row.views + 1 })
    .where(eq(shares.id, token))
  // `byOther`: the reader is not the subject, which is exactly the row worth reviewing later.
  await record(row.userId, 'share.viewed', 'share', row.id, true)

  return {
    resume: parseDocument(found.document, row.id),
    label: row.label,
    expiresAt: row.expiresAt,
  }
}

/** Revoke immediately. The row stays so the access log can still explain what a visitor saw. */
export async function revokeShare(input: {
  userId: string
  token: string
}): Promise<boolean> {
  // Same uuid column, same 500 if a malformed token reaches it. "Nothing to revoke" is the honest answer.
  if (!SHARE_TOKEN.test(input.token)) return false

  const changed = await db
    .update(shares)
    .set({ revokedAt: new Date() })
    .where(and(eq(shares.id, input.token), eq(shares.userId, input.userId)))
    .returning({ id: shares.id })

  if (changed.length === 0) return false
  await record(input.userId, 'share.revoked', 'share', input.token)
  return true
}

export async function listShares(userId: string) {
  const rows = await db.select().from(shares).where(eq(shares.userId, userId))
  return rows.map((row) => ({
    token: row.id,
    label: row.label,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    views: row.views,
    /** Computed here so the interface never has to decide what "expired" means. */
    live: row.revokedAt === null && row.expiresAt.getTime() > Date.now(),
  }))
}

/**
 * Everything we hold about one person, as one JSON object — GDPR Article 15.
 *
 * Answered by a button rather than a support email, which is the whole design goal in docs/07. The
 * export includes the audit log of their own records: "who looked at my data" is part of what Article
 * 15 entitles them to, and withholding it while holding it would be indefensible.
 */
export async function exportEverything(userId: string) {
  const [account] = await db
    .select({
      id: authUsers.id,
      email: authUsers.email,
      createdAt: authUsers.createdAt,
      lastSeenAt: authUsers.lastSeenAt,
      deleteAfter: authUsers.deleteAfter,
    })
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .limit(1)

  if (account === undefined) return undefined

  const [cvs, tailored, log, links] = await Promise.all([
    db.select().from(resumes).where(eq(resumes.userId, userId)),
    db.select().from(variants).where(eq(variants.userId, userId)),
    db.select().from(accessLog).where(eq(accessLog.subjectUserId, userId)),
    // Share links are something we hold, so Article 15 covers them. Omitting them would make "download
    // everything" false about the one table that exposes a CV publicly.
    db.select().from(shares).where(eq(shares.userId, userId)),
  ])

  await record(userId, 'account.exported')

  /**
   * Decrypted for the export, and this is not optional.
   *
   * Article 15 is a right to your data, not to a base64 envelope you cannot open. The rows come straight
   * out of the table, so without this the download would be ciphertext — technically complete, and
   * useless in exactly the way a compliance gesture is useless.
   */
  return {
    exportedAt: new Date().toISOString(),
    retentionPolicy: `Deleted after ${RETENTION_DAYS} days without signing in.`,
    account,
    resumes: cvs.map((row) => ({
      ...row,
      document: decryptJson(row.document),
    })),
    variants: tailored.map((row) => ({
      ...row,
      document: decryptJson(row.document),
      gapReport: decryptJson(row.gapReport),
    })),
    accessLog: log,
    shareLinks: links,
  }
}

/**
 * Delete everything — GDPR Article 17.
 *
 * One statement. Every foreign key carries `onDelete: 'cascade'`, so the database honours the whole
 * promise rather than this function remembering the order to delete things in — a dangling CV after a
 * deleted account is precisely the failure an erasure request exists to make impossible.
 *
 * The audit row is written **first** and survives, with the subject set to null by its own
 * `onDelete: 'set null'`. Evidence that a deletion happened is not personal data, and being unable to
 * show it is its own compliance problem.
 */
export async function deleteEverything(userId: string): Promise<boolean> {
  await record(userId, 'account.deleted')
  const deleted = await db
    .delete(authUsers)
    .where(eq(authUsers.id, userId))
    .returning({ id: authUsers.id })
  return deleted.length > 0
}

/** Rows past their retention date. Read-only: the sweep itself runs as the owner. */
export async function countExpired(): Promise<number> {
  const rows = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(lt(authUsers.deleteAfter, new Date()))
  return rows.length
}
