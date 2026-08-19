/**
 * Issue, list and revoke API keys (ADR-032).
 *
 *   node scripts/db/api-key.mjs list
 *   node scripts/db/api-key.mjs issue <user-email> [label]
 *   node scripts/db/api-key.mjs revoke <key-id>
 *
 * A script rather than a screen, deliberately and for now. There is one key holder — Edd's other
 * application — and a settings page for a population of one is a surface to maintain, a paywall to
 * decide about and an audit story to write, for something two commands already do. When the second
 * holder appears, that is the moment the screen is worth its cost.
 *
 * **The key is printed once and never stored.** What goes in the database is a SHA-256 hash. If it
 * is lost, revoke it and issue another; there is nothing to look up, which is the property that
 * makes a leaked backup survivable.
 */
import { createHash, randomBytes } from 'node:crypto'
import postgres from 'postgres'

const KEY_PREFIX = 'hr_live_'

function connectionString() {
  const direct = process.env.DATABASE_URL
  if (direct !== undefined && direct !== '') return direct
  const password = process.env.DATABASE_APP_PASSWORD
  if (password === undefined || password === '') return undefined
  const port = process.env.HR_DB_PORT ?? '5433'
  return `postgres://hunterready_app:${password}@localhost:${port}/hunterready`
}

const url = connectionString()
if (url === undefined) {
  console.error(
    '✖ no DATABASE_URL and no DATABASE_APP_PASSWORD.\n' +
      '  set -a; . ./.env; set +a; node scripts/db/api-key.mjs list',
  )
  process.exit(2)
}

const sql = postgres(url)
const [command, first, ...rest] = process.argv.slice(2)

try {
  if (command === 'list') {
    const rows = await sql`
      select k.id, k.prefix, k.label, k.created_at, k.last_used_at, k.revoked_at, u.email
      from api_keys k join auth_users u on u.id = k.user_id
      order by k.created_at desc`
    if (rows.length === 0) console.log('no keys')
    for (const r of rows) {
      const state = r.revoked_at === null ? 'live   ' : 'revoked'
      const used =
        r.last_used_at === null
          ? 'never used'
          : `used ${r.last_used_at.toISOString().slice(0, 10)}`
      console.log(
        `${state}  ${r.prefix}…  ${r.id}  ${r.email}  ${used}  ${r.label}`,
      )
    }
  } else if (command === 'issue') {
    if (first === undefined) throw new Error('issue needs a user email')
    const [user] =
      await sql`select id from auth_users where email = ${first} limit 1`
    if (user === undefined) throw new Error(`no account for ${first}`)

    const secret = `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`
    const hash = createHash('sha256').update(secret, 'utf8').digest('hex')
    await sql`insert into api_keys (user_id, secret_hash, prefix, label)
              values (${user.id}, ${hash}, ${secret.slice(0, KEY_PREFIX.length + 6)}, ${rest.join(' ')})`

    console.log(`\n  ${secret}\n`)
    console.log('  Shown once. It is stored as a hash and cannot be read back.')
  } else if (command === 'revoke') {
    if (first === undefined)
      throw new Error('revoke needs a key id (see: list)')
    const done = await sql`update api_keys set revoked_at = now()
                           where id = ${first} and revoked_at is null returning id`
    console.log(
      done.length === 1 ? `revoked ${first}` : `nothing live with id ${first}`,
    )
  } else {
    console.log('usage: api-key.mjs list | issue <email> [label] | revoke <id>')
  }
} catch (error) {
  console.error(`✖ ${error.message}`)
  process.exitCode = 1
} finally {
  await sql.end()
}
