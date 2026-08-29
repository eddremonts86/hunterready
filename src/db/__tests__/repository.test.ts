/**
 * The persistence layer, against a real Postgres.
 *
 * Not mocked, deliberately. What is worth testing here is what the *database* guarantees — cascades,
 * retention clocks, ownership predicates — and a mock would assert my beliefs about Postgres rather
 * than Postgres. The one test that matters most is that an erasure request actually erases: a mock
 * would pass that trivially while a dangling row sat in production.
 *
 * Skips itself when no database is reachable, so CI without one is not red for the wrong reason.
 *
 * **`pnpm db:test:up` does not exist, and this line used to say it did.** There is no such script and
 * there deliberately is not one now: the `db` service the dev loop already needs is the same database,
 * and a second name for it is the thing four launch entries were just cut down to one to avoid. What
 * works, run and confirmed on 2026-08-23 — 40 tests, this file and `webhook.test.ts`:
 *
 *     docker compose -f docker-compose.yml -f docker-compose.local.yml up -d db
 *     DATA_ENCRYPTION_KEY=$(openssl rand -hex 32) \
 *     DATABASE_MIGRATION_URL="postgres://hunterready_owner:$POSTGRES_PASSWORD@localhost:5433/hunterready" \
 *       pnpm vitest run src/db src/routes/api/billing
 *
 * `POSTGRES_PASSWORD` is the one in `.env`; `scripts/dev/host.mjs` composes the same URL from the same
 * file, so if `pnpm host` reaches the database this will too.
 *
 * **Bring the key, or two tests fail rather than skip.** Without `DATA_ENCRYPTION_KEY` the rows are
 * stored in plaintext by design (ADR-021: unset means plaintext, announced rather than assumed), so the
 * two ADR-021 assertions below go red and look like a persistence bug. They are deliberately not
 * skipped when the key is absent — a privacy guarantee that quietly opts out of being checked in
 * exactly the runs equipped to check it is worth less than a confusing red — which is why the key is
 * named here rather than left to be discovered.
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

    it('answers a malformed token the same way, instead of throwing', async () => {
      /*
        The token is a `uuid` primary key, so `no-existe` used to reach Postgres, raise 22P02 and come
        back to the route as a 500 — a different answer for a truncated link than for an unknown one,
        in the endpoint whose whole rule is that there is only one answer. Found at `/s/no-existe`.
      */
      for (const bad of ['no-existe', '', '   ', "'; drop table shares; --"]) {
        expect(await repo.readShare(bad)).toBeUndefined()
      }
    })

    it('revokes nothing for a malformed token, instead of throwing', async () => {
      const userId = await seedUser('share-bad-revoke-')
      expect(await repo.revokeShare({ userId, token: 'no-existe' })).toBe(false)
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
  describe('what lands in the table is unreadable (ADR-021)', () => {
    /**
     * The codec has its own tests; this is the one that proves it is wired into the write path. It reads
     * the raw column with SQL, deliberately bypassing the repository — the whole claim is about what
     * somebody with database access but not the application's environment can see.
     */
    it('stores a CV as an envelope, with none of its content in the row', async () => {
      const userId = await seedUser('crypto-')
      const resumeId = await repo.saveResume({ userId, resume: RESUME })

      const [row] =
        await sql`SELECT document::text AS raw FROM resumes WHERE id = ${resumeId}`

      // `hunterready_readonly` and a leaked `pg_dump` see this and nothing else.
      expect(row.raw).not.toContain('Whitfield')
      expect(row.raw).not.toContain('Northgate')
      // Parsed rather than substring-matched: `jsonb::text` normalizes to `{"v": 1, …}` with a space,
      // so asserting on the serialized shape tests Postgres's formatter instead of our envelope.
      expect(JSON.parse(row.raw)).toMatchObject({ v: 1 })
      expect(Object.keys(JSON.parse(row.raw)).sort()).toEqual([
        'ct',
        'iv',
        'tag',
        'v',
      ])

      // And it still reads back through the repository, which is the other half of the claim.
      const [saved] = (await repo.listResumes(userId)).filter(
        (item) => item.id === resumeId,
      )
      expect(saved.resume.basics.fullName).toBe('Tom Whitfield')
    })

    it('encrypts a gap report too, because it quotes the CV back', async () => {
      // `found` arrays are the candidate's own bullets. A gap report is CV content under another name.
      const userId = await seedUser('crypto-gap-')
      const resumeId = await repo.saveResume({ userId, resume: RESUME })
      const variantId = await repo.saveVariant({
        userId,
        resumeId,
        resume: RESUME,
        gapReport: {
          matches: [
            { requirement: 'SAP', found: ['Grew a book of 40 accounts.'] },
          ],
        },
      })

      const [row] =
        await sql`SELECT gap_report::text AS raw FROM variants WHERE id = ${variantId}`
      expect(row.raw).not.toContain('40 accounts')
      expect(JSON.parse(row.raw)).toMatchObject({ v: 1 })
    })

    it('leaves the advert readable, because it is public text somebody pasted', async () => {
      const userId = await seedUser('crypto-advert-')
      const resumeId = await repo.saveResume({ userId, resume: RESUME })
      const variantId = await repo.saveVariant({
        userId,
        resumeId,
        resume: RESUME,
        jobDescription: 'Requirements\n- SAP EWM',
      })

      const [row] =
        await sql`SELECT job_description AS raw FROM variants WHERE id = ${variantId}`
      expect(row.raw).toContain('SAP EWM')
    })

    it('hands the Article 15 export plain JSON, not ciphertext', async () => {
      /**
       * A right to your data is not a right to a base64 envelope you cannot open. Without the decrypt in
       * `exportEverything` this download would be technically complete and useless.
       */
      const userId = await seedUser('crypto-export-')
      const resumeId = await repo.saveResume({ userId, resume: RESUME })
      await repo.saveVariant({
        userId,
        resumeId,
        resume: RESUME,
        gapReport: { note: 'a gap report' },
      })

      const dump = await repo.exportEverything(userId)
      expect(JSON.stringify(dump)).toContain('Tom Whitfield')
      // No envelope anywhere in the download.
      expect(JSON.stringify(dump)).not.toMatch(/"iv":/)
      expect(JSON.stringify(dump)).not.toMatch(/"tag":/)
      expect(dump?.variants[0].gapReport).toEqual({ note: 'a gap report' })
    })

    it('reads a row that was written before the key existed', async () => {
      // The assertion that makes turning the key on safe rather than an outage.
      const userId = await seedUser('crypto-legacy-')
      const resumeId = await repo.saveResume({ userId, resume: RESUME })
      // Put the row back to plaintext, exactly as it would have been last week.
      await sql`UPDATE resumes SET document = ${sql.json(RESUME)} WHERE id = ${resumeId}`

      const [saved] = (await repo.listResumes(userId)).filter(
        (item) => item.id === resumeId,
      )
      expect(saved.resume.basics.fullName).toBe('Tom Whitfield')
    })
  })
  /**
   * Billing, and the two failures a webhook receiver is shaped around.
   *
   * Against a real Postgres because both of them *are* database guarantees. The idempotency comes
   * from a primary key and the atomicity from a transaction, and a mock would assert my beliefs about
   * both rather than Postgres's behaviour — which is this suite's whole reason for existing.
   */
  describe('billing events are acted on exactly once', () => {
    it('grants the plan, and a redelivery of the same event changes nothing', async () => {
      const userId = await seedUser('bill-')
      const eventId = `evt_${Math.random().toString(36).slice(2, 12)}`

      const first = await repo.applyBillingEvent({
        eventId,
        provider: 'test',
        kind: 'subscription.active',
        userId,
        active: true,
      })
      expect(first).toEqual({ applied: true, outcome: 'pro' })
      expect(await repo.getPlan(userId)).toBe('pro')

      // Somebody downgrades by hand. If the replay re-applies, this comes back as `pro`.
      await sql`UPDATE auth_users SET plan = 'free' WHERE id = ${userId}`

      const replay = await repo.applyBillingEvent({
        eventId,
        provider: 'test',
        kind: 'subscription.active',
        userId,
        active: true,
      })
      expect(replay.applied, 'a redelivered event was acted on twice').toBe(
        false,
      )
      expect(await repo.getPlan(userId)).toBe('free')

      const rows =
        await sql`SELECT count(*)::int AS n FROM billing_events WHERE id = ${eventId}`
      expect(rows[0].n).toBe(1)
    })

    it('drops the plan when the subscription stops', async () => {
      const userId = await seedUser('bill-')
      await repo.applyBillingEvent({
        eventId: `evt_a_${Math.random().toString(36).slice(2, 10)}`,
        provider: 'test',
        kind: 'subscription.active',
        userId,
        active: true,
      })
      expect(await repo.getPlan(userId)).toBe('pro')

      const off = await repo.applyBillingEvent({
        eventId: `evt_c_${Math.random().toString(36).slice(2, 10)}`,
        provider: 'test',
        kind: 'subscription.cancelled',
        userId,
        active: false,
      })
      expect(off).toEqual({ applied: true, outcome: 'free' })
      expect(await repo.getPlan(userId)).toBe('free')
    })

    it('does not re-grant when a stale active is redelivered after a cancellation', async () => {
      /*
        The failure the ledger exists for, and the only one here that costs money in the wrong
        direction. Providers retry, so a `subscription.active` that was never acknowledged can arrive
        *after* the cancellation that superseded it. Without the ledger the last write wins and it is
        the wrong one: somebody who stopped paying keeps the third-party model.
      */
      const userId = await seedUser('bill-')
      const activeId = `evt_stale_${Math.random().toString(36).slice(2, 10)}`

      await repo.applyBillingEvent({
        eventId: activeId,
        provider: 'test',
        kind: 'subscription.active',
        userId,
        active: true,
      })
      await repo.applyBillingEvent({
        eventId: `evt_cancel_${Math.random().toString(36).slice(2, 10)}`,
        provider: 'test',
        kind: 'subscription.cancelled',
        userId,
        active: false,
      })
      expect(await repo.getPlan(userId)).toBe('free')

      // The retry arrives late.
      const late = await repo.applyBillingEvent({
        eventId: activeId,
        provider: 'test',
        kind: 'subscription.active',
        userId,
        active: true,
      })
      expect(late.applied).toBe(false)
      expect(
        await repo.getPlan(userId),
        'a stale redelivery restored a cancelled plan',
      ).toBe('free')
    })

    it('records an unmatched customer as ignored rather than guessing', async () => {
      const eventId = `evt_orphan_${Math.random().toString(36).slice(2, 10)}`
      const result = await repo.applyBillingEvent({
        eventId,
        provider: 'test',
        kind: 'subscription.active',
        // No userId: the provider named a customer we cannot match to an account.
        active: true,
      })
      expect(result).toEqual({ applied: true, outcome: 'ignored' })

      /*
        Written down anyway. A redelivery of it is then also a no-op, and "we saw it and did nothing"
        stays distinguishable from "it never arrived" — the only question worth asking when somebody
        says they paid and nothing happened.
      */
      const [row] =
        await sql`SELECT outcome, user_id FROM billing_events WHERE id = ${eventId}`
      expect(row.outcome).toBe('ignored')
      expect(row.user_id).toBeNull()

      await sql`DELETE FROM billing_events WHERE id = ${eventId}`
    })

    it('writes an audit row naming the event that moved the plan', async () => {
      const userId = await seedUser('bill-')
      const eventId = `evt_audit_${Math.random().toString(36).slice(2, 10)}`
      await repo.applyBillingEvent({
        eventId,
        provider: 'test',
        kind: 'subscription.active',
        userId,
        active: true,
      })
      const [row] =
        await sql`SELECT action, record_type, record_id FROM access_log WHERE subject_user_id = ${userId} ORDER BY at DESC LIMIT 1`
      expect(row.action).toBe('plan.pro')
      expect(row.record_type).toBe('billing')
      /*
        No `record_id`. That column is a `uuid` and a provider's event id is `evt_…`, so the first
        version of this passed one in, the insert threw, `record` swallowed it — as it must, since an
        audit failure cannot be allowed to fail a webhook — and the row silently did not exist.

        The link survives in the ledger instead, which is what this asserts next.
      */
      expect(row.record_id).toBeNull()

      const [ledger] =
        await sql`SELECT user_id, outcome FROM billing_events WHERE id = ${eventId}`
      expect(ledger.user_id).toBe(userId)
      expect(ledger.outcome).toBe('pro')
    })

    it('keeps no money and no customer in the ledger', async () => {
      /*
        Asserted against the live table rather than trusted to the schema file. A billing table is a
        tempting place to accumulate a shadow copy of somebody's purchase history, and the defence is
        for the columns not to exist (ADR-034: the merchant of record holds all of it).
      */
      const columns =
        await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'billing_events'`
      const names = columns.map((c) => String(c.column_name)).sort()
      expect(names).toEqual([
        'id',
        'kind',
        'outcome',
        'provider',
        'received_at',
        'user_id',
      ])
    })
  })
})
