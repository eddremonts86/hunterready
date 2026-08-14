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

/** Parse a stored document, or throw with something a developer can act on. */
function parseDocument(raw: unknown, id: string): Resume {
  const parsed = Resume.safeParse(raw)
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

export async function saveResume(input: {
  userId: string
  resume: Resume
  label?: string
  resumeId?: string
}): Promise<string> {
  const values = {
    userId: input.userId,
    document: input.resume,
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
      document: input.resume,
      schemaVersion: input.resume.schemaVersion,
      company: input.company,
      role: input.role,
      jobDescription: input.jobDescription,
      gapReport: input.gapReport,
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
export async function readShare(
  token: string,
): Promise<SharedDocument | undefined> {
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

  return {
    exportedAt: new Date().toISOString(),
    retentionPolicy: `Deleted after ${RETENTION_DAYS} days without signing in.`,
    account,
    resumes: cvs,
    variants: tailored,
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
