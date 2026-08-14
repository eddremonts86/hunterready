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

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_ENV
    repo = await import('../repository')
    const postgres = (await import('postgres')).default
    sql = postgres(URL_ENV, { max: 1, onnotice: () => {} })
  })

  afterAll(async () => {
    await sql`DELETE FROM users WHERE email LIKE 'test-%@example.invalid'`
    await sql.end()
  })

  it('creates a user once and finds them again', async () => {
    const first = await repo.findOrCreateUser(email)
    const second = await repo.findOrCreateUser(email.toUpperCase())
    // Email is normalized, so a different casing is the same person — not a second account.
    expect(second).toBe(first)
  })

  it('stores a CV and reads it back through Zod', async () => {
    const userId = await repo.findOrCreateUser(email)
    const resumeId = await repo.saveResume({ userId, resume: RESUME })
    const list = await repo.listResumes(userId)
    const found = list.find((row) => row.id === resumeId)
    expect(found?.resume.work[0].company).toBe('Northgate Supplies')
  })

  it('refuses to update a CV belonging to somebody else', async () => {
    const owner = await repo.findOrCreateUser(email)
    const other = await repo.findOrCreateUser(`other-${email}`)
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
    const userId = await repo.findOrCreateUser(email)
    await sql`UPDATE users SET delete_after = now() + interval '2 days' WHERE id = ${userId}`
    await repo.listResumes(userId)
    const [row] = await sql`SELECT delete_after FROM users WHERE id = ${userId}`
    const daysLeft =
      (new Date(row.delete_after as string).getTime() - Date.now()) / 86_400_000
    // Back to the full window: someone iterating for months has not abandoned their CV.
    expect(daysLeft).toBeGreaterThan(80)
  })

  it('erases everything, and the database enforces it', async () => {
    const userId = await repo.findOrCreateUser(`erase-${email}`)
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
    const userId = await repo.findOrCreateUser(`audit-${email}`)
    await repo.deleteEverything(userId)
    // The audit row survives with its subject nulled. Being unable to show that an erasure happened
    // is its own compliance problem.
    const rows =
      await sql`SELECT action FROM access_log WHERE action = 'account.deleted'`
    expect(rows.length).toBeGreaterThan(0)
  })

  it('exports everything we hold, including who looked at it', async () => {
    const userId = await repo.findOrCreateUser(`export-${email}`)
    await repo.saveResume({ userId, resume: RESUME })
    const dump = await repo.exportEverything(userId)

    expect(dump?.account.email).toContain('export-')
    expect(dump?.resumes).toHaveLength(1)
    // Article 15 covers the access log too, and withholding it while holding it is indefensible.
    expect(Array.isArray(dump?.accessLog)).toBe(true)
    expect(dump?.retentionPolicy).toMatch(/90 days/)
  })
})
