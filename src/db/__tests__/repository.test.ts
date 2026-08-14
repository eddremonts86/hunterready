/**
 * The persistence layer, against a real Postgres.
 *
 * Not mocked, deliberately. What is worth testing here is what the *database* guarantees — cascades,
 * retention clocks, ownership predicates — and a mock would assert my beliefs about Postgres rather
 * than Postgres. The one test that matters most is that an erasure request actually erases: a mock
 * would pass that trivially while a dangling row sat in production.
 *
 * Skips itself when no database is reachable, so CI without one is not red for the wrong reason.
 * `pnpm db:test:up` starts one; the deploy runbook says how.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Sql } from 'postgres'
import type * as Repository from '../repository'
import { Resume } from '@/schema/resume'

const URL_ENV = (
  process.env.DATABASE_MIGRATION_URL ??
  process.env.DATABASE_URL ??
  ''
).trim()

const RESUME = Resume.parse({
  schemaVersion: '1.0',
  basics: { fullName: 'Tom Whitfield', links: [], personalDetails: [] },
  work: [
    {
      company: 'Northgate Supplies',
      role: 'Account Manager',
      startDate: '2024-01',
      endDate: null,
      highlights: ['Grew a book of 40 accounts.'],
      tech: [],
    },
  ],
  education: [],
  skills: [],
  projects: [],
  certifications: [],
  languages: [],
  awards: [],
  publications: [],
  volunteer: [],
  custom: [],
})

describe.skipIf(URL_ENV === '')('persistence, against a real Postgres', () => {
  let repo: typeof Repository
  let sql: Sql
  const email = `test-${Date.now()}@example.invalid`

  /**
   * Seeds an account directly, because creating one is Better Auth's job and this suite is about what
   * the *database* guarantees — cascades, retention clocks, ownership predicates. Driving Better Auth's
   * HTTP API to get a row would test their code, not ours.
   */
  let seeded = 0
  async function seedUser(suffix = ''): Promise<string> {
    // A counter, not just the suffix: three tests call this with no suffix, and reusing one address
    // trips the unique constraint on the second.
    seeded += 1
    const id = `u_${Math.random().toString(36).slice(2, 12)}`
    await sql`INSERT INTO auth_users (id, email) VALUES (${id}, ${`${suffix}${seeded}-${email}`})`
    return id
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_ENV
    repo = await import('../repository')
    const postgres = (await import('postgres')).default
    sql = postgres(URL_ENV, { max: 1, onnotice: () => {} })
  })

  afterAll(async () => {
    await sql`DELETE FROM auth_users WHERE email LIKE '%@example.invalid'`
    await sql.end()
  })

  it('bumps the retention clock when an account is used', async () => {
    const userId = await seedUser()
    await sql`UPDATE auth_users SET delete_after = now() + interval '2 days' WHERE id = ${userId}`
    await repo.touchUser(userId)
    const [row] =
      await sql`SELECT delete_after FROM auth_users WHERE id = ${userId}`
    const daysLeft =
      (new Date(row.delete_after as string).getTime() - Date.now()) / 86_400_000
    expect(daysLeft).toBeGreaterThan(80)
  })

  it('stores a CV and reads it back through Zod', async () => {
    const userId = await seedUser()
    const resumeId = await repo.saveResume({ userId, resume: RESUME })
    const list = await repo.listResumes(userId)
    const found = list.find((row) => row.id === resumeId)
    expect(found?.resume.work[0].company).toBe('Northgate Supplies')
  })

  it('refuses to update a CV belonging to somebody else', async () => {
    const owner = await seedUser()
    const other = await seedUser('other-')
    const resumeId = await repo.saveResume({ userId: owner, resume: RESUME })

    // The ownership check is in the WHERE clause, so this updates nothing rather than throwing.
    await repo.saveResume({
      userId: other,
      resumeId,
      resume: RESUME,
      label: 'Stolen',
    })
    const stillOwners = await repo.listResumes(owner)
    expect(stillOwners.find((r) => r.id === resumeId)?.label).toBe('My CV')
    expect(await repo.listResumes(other)).toHaveLength(0)
  })

  it('pushes the retention date forward when the CV is used', async () => {
    const userId = await seedUser()
    await sql`UPDATE auth_users SET delete_after = now() + interval '2 days' WHERE id = ${userId}`
    await repo.listResumes(userId)
    const [row] =
      await sql`SELECT delete_after FROM auth_users WHERE id = ${userId}`
    const daysLeft =
      (new Date(row.delete_after as string).getTime() - Date.now()) / 86_400_000
    // Back to the full window: someone iterating for months has not abandoned their CV.
    expect(daysLeft).toBeGreaterThan(80)
  })

  it('erases everything, and the database enforces it', async () => {
    const userId = await seedUser('erase-')
    const resumeId = await repo.saveResume({ userId, resume: RESUME })
    await repo.saveVariant({
      userId,
      resumeId,
      resume: RESUME,
      company: 'Acme',
    })

    expect(await repo.deleteEverything(userId)).toBe(true)

    // Queried directly rather than through the repository: the point is what is *in the database*,
    // and a dangling CV after a deleted account is the exact failure an erasure request exists to
    // make impossible.
    const [{ count: cvs }] =
      await sql`SELECT count(*)::int FROM resumes WHERE user_id = ${userId}`
    const [{ count: vars }] =
      await sql`SELECT count(*)::int FROM variants WHERE user_id = ${userId}`
    expect(cvs).toBe(0)
    expect(vars).toBe(0)
  })

  it('keeps the evidence that a deletion happened', async () => {
    const userId = await seedUser('audit-')
    await repo.deleteEverything(userId)
    // The audit row survives with its subject nulled. Being unable to show that an erasure happened
    // is its own compliance problem.
    const rows =
      await sql`SELECT action FROM access_log WHERE action = 'account.deleted'`
    expect(rows.length).toBeGreaterThan(0)
  })

  it('exports everything we hold, including who looked at it', async () => {
    const userId = await seedUser('export-')
    await repo.saveResume({ userId, resume: RESUME })
    const dump = await repo.exportEverything(userId)

    expect(dump?.account.email).toContain('export-')
    expect(dump?.resumes).toHaveLength(1)
    // Article 15 covers the access log too, and withholding it while holding it is indefensible.
    expect(Array.isArray(dump?.accessLog)).toBe(true)
    expect(dump?.retentionPolicy).toMatch(/90 days/)
  })
  it('moves an application between draft and sent, and only its owner may', async () => {
    const owner = await seedUser('status-')
    const stranger = await seedUser('status-other-')
    const resumeId = await repo.saveResume({ userId: owner, resume: RESUME })
    const variantId = await repo.saveVariant({
      userId: owner,
      resumeId,
      resume: RESUME,
      role: 'Account Manager',
      company: 'Northgate Supplies',
    })

    expect(
      await repo.setApplicationStatus({
        userId: owner,
        variantId,
        status: 'sent',
      }),
    ).toBe(true)

    const [row] = await sql`SELECT status FROM variants WHERE id = ${variantId}`
    expect(row.status).toBe('sent')

    // The ownership test is in the SQL predicate rather than an `if` above it, so this cannot pass by
    // somebody remembering to write the check.
    expect(
      await repo.setApplicationStatus({
        userId: stranger,
        variantId,
        status: 'draft',
      }),
    ).toBe(false)
    const [unchanged] =
      await sql`SELECT status FROM variants WHERE id = ${variantId}`
    expect(unchanged.status).toBe('sent')
  })

  it('leaves the stored document alone when the status changes', async () => {
    // The whole point of keeping a variant is that it is what was sent. A tracker that lets you edit
    // history is not a record of anything, so `setApplicationStatus` touches one column.
    const userId = await seedUser('immutable-')
    const resumeId = await repo.saveResume({ userId, resume: RESUME })
    const variantId = await repo.saveVariant({
      userId,
      resumeId,
      resume: RESUME,
    })
    const [before] =
      await sql`SELECT document FROM variants WHERE id = ${variantId}`
    await repo.setApplicationStatus({ userId, variantId, status: 'sent' })
    const [after] =
      await sql`SELECT document FROM variants WHERE id = ${variantId}`
    expect(after.document).toEqual(before.document)
  })

  describe('a share link is the one public thing, so its limits are structural', () => {
    it('creates a link with an expiry, and reads the document back through it', async () => {
      const userId = await seedUser('share-')
      const resumeId = await repo.saveResume({ userId, resume: RESUME })
      const { token, expiresAt } = await repo.createShare({ userId, resumeId })

      expect(expiresAt.getTime()).toBeGreaterThan(Date.now())
      const shared = await repo.readShare(token)
      expect(shared?.resume.basics.fullName).toBe('Tom Whitfield')
    })

    it('clamps a request for a longer window instead of honouring it', async () => {
      /**
       * The pressure on this parameter is always toward longer, so the ceiling lives in the store rather
       * than in whoever remembered to validate. Ten years becomes ninety days.
       */
      const userId = await seedUser('share-clamp-')
      const resumeId = await repo.saveResume({ userId, resume: RESUME })
      const { expiresAt } = await repo.createShare({
        userId,
        resumeId,
        days: 3650,
      })

      const days = (expiresAt.getTime() - Date.now()) / 86_400_000
      expect(days).toBeLessThanOrEqual(91)
      expect(days).toBeGreaterThan(89)
    })

    it('refuses an expired link', async () => {
      const userId = await seedUser('share-expired-')
      const resumeId = await repo.saveResume({ userId, resume: RESUME })
      const { token } = await repo.createShare({ userId, resumeId })
      // Reach past the API to age it: what is being tested is that `readShare` checks, not that a clock works.
      await sql`UPDATE shares SET expires_at = now() - interval '1 day' WHERE id = ${token}`

      expect(await repo.readShare(token)).toBeUndefined()
    })

    it('refuses a revoked link immediately, and keeps the row', async () => {
      const userId = await seedUser('share-revoked-')
      const resumeId = await repo.saveResume({ userId, resume: RESUME })
      const { token } = await repo.createShare({ userId, resumeId })

      expect(await repo.revokeShare({ userId, token })).toBe(true)
      expect(await repo.readShare(token)).toBeUndefined()
      // The row survives, so the access log can still explain what a visitor saw last week.
      const [row] = await sql`SELECT revoked_at FROM shares WHERE id = ${token}`
      expect(row.revoked_at).not.toBeNull()
    })

    it('will not let a stranger revoke somebody else’s link', async () => {
      const owner = await seedUser('share-owner-')
      const stranger = await seedUser('share-stranger-')
      const resumeId = await repo.saveResume({ userId: owner, resume: RESUME })
      const { token } = await repo.createShare({ userId: owner, resumeId })

      expect(await repo.revokeShare({ userId: stranger, token })).toBe(false)
      // And the link still works, which is what makes the previous assertion mean something.
      expect(await repo.readShare(token)).toBeDefined()
    })

    it('answers an unknown token the same way as a revoked one', async () => {
      // Distinguishing them would confirm to somebody holding a guessed URL that a CV exists.
      expect(
        await repo.readShare('00000000-0000-4000-8000-000000000000'),
      ).toBeUndefined()
    })

    it('counts views without recording who', async () => {
      const userId = await seedUser('share-views-')
      const resumeId = await repo.saveResume({ userId, resume: RESUME })
      const { token } = await repo.createShare({ userId, resumeId })

      await repo.readShare(token)
      await repo.readShare(token)

      const [link] = (await repo.listShares(userId)).filter(
        (row) => row.token === token,
      )
      expect(link.views).toBe(2)
      // One audit row per view against the *owner*, flagged as somebody else's access. No visitor identity
      // exists anywhere — that would be a log of people reading a CV, which is not ours to keep.
      const rows =
        await sql`SELECT by_other FROM access_log WHERE action = 'share.viewed' AND subject_user_id = ${userId}`
      expect(rows.length).toBe(2)
      expect(rows.every((row) => row.by_other === true)).toBe(true)
    })

    it('takes the links with the account when it is erased', async () => {
      const userId = await seedUser('share-erase-')
      const resumeId = await repo.saveResume({ userId, resume: RESUME })
      const { token } = await repo.createShare({ userId, resumeId })

      await repo.deleteEverything(userId)

      const [{ count }] =
        await sql`SELECT count(*)::int FROM shares WHERE id = ${token}`
      expect(count).toBe(0)
      // And the link stops working, which is the property that actually matters to the person erasing.
      expect(await repo.readShare(token)).toBeUndefined()
    })

    it('includes share links in the Article 15 export', async () => {
      const userId = await seedUser('share-export-')
      const resumeId = await repo.saveResume({ userId, resume: RESUME })
      await repo.createShare({ userId, resumeId })

      const dump = await repo.exportEverything(userId)
      expect(dump?.shareLinks).toHaveLength(1)
    })
  })
})
