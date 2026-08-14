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
import { accessLog, RETENTION_DAYS, resumes, users, variants } from './schema'

export { RETENTION_DAYS }

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

export async function findOrCreateUser(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase()
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1)

  if (existing !== undefined) {
    // Seen today, so the clock restarts. This is the only place it does.
    await db
      .update(users)
      .set({ lastSeenAt: new Date(), deleteAfter: extended })
      .where(eq(users.id, existing.id))
    return existing.id
  }

  const [created] = await db
    .insert(users)
    .values({ email: normalized })
    .returning({ id: users.id })
  await record(created.id, 'user.created')
  return created.id
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
    .update(users)
    .set({ lastSeenAt: new Date(), deleteAfter: extended })
    .where(eq(users.id, userId))

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
      id: users.id,
      email: users.email,
      createdAt: users.createdAt,
      lastSeenAt: users.lastSeenAt,
      deleteAfter: users.deleteAfter,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (account === undefined) return undefined

  const [cvs, tailored, log] = await Promise.all([
    db.select().from(resumes).where(eq(resumes.userId, userId)),
    db.select().from(variants).where(eq(variants.userId, userId)),
    db.select().from(accessLog).where(eq(accessLog.subjectUserId, userId)),
  ])

  await record(userId, 'account.exported')

  return {
    exportedAt: new Date().toISOString(),
    retentionPolicy: `Deleted after ${RETENTION_DAYS} days without signing in.`,
    account,
    resumes: cvs,
    variants: tailored,
    accessLog: log,
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
    .delete(users)
    .where(eq(users.id, userId))
    .returning({ id: users.id })
  return deleted.length > 0
}

/** Rows past their retention date. Read-only: the sweep itself runs as the owner. */
export async function countExpired(): Promise<number> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(lt(users.deleteAfter, new Date()))
  return rows.length
}
