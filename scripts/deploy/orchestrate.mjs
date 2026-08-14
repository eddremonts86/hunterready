/**
 * The post-deployment command. Idempotent, forward-only, fail-loud.
 *
 * Modelled on `builderhunt/scripts/deploy/orchestrate.mjs`, and it exists for the reason recorded in
 * that project's runbook: **never run bare `drizzle-kit migrate` as a deploy command.** The roles
 * migration creates the runtime roles without passwords on purpose, so migrating alone leaves the app
 * unable to authenticate — every database-backed page 500s while the pipeline shows green. Four
 * deploys were spent learning that there.
 *
 * Steps, in order, each fatal unless noted:
 *
 *   1. wait for the database to accept a connection
 *   2. apply migrations as the owner
 *   3. provision the application role's password from the environment
 *   4. verify the application role can actually log in — the check that would have caught it
 *   5. sweep expired rows (soft: a retention failure must not block a release)
 */
import { execFileSync } from 'node:child_process'
import postgres from 'postgres'

const OWNER = (
  process.env.DATABASE_MIGRATION_URL ??
  process.env.DATABASE_URL ??
  ''
).trim()
const APP = (process.env.DATABASE_URL ?? '').trim()
const APP_PASSWORD = (process.env.DATABASE_APP_PASSWORD ?? '').trim()
const ATTEMPTS = Number(process.env.DEPLOY_DB_WAIT_ATTEMPTS ?? '30')

function step(name) {
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 60 - name.length))}`)
}

if (OWNER === '') {
  console.error(
    'deploy:db — no database URL. Nothing to do; the app runs stateless (ADR-019).',
  )
  process.exit(0)
}

step('1 wait for the database')
const owner = postgres(OWNER, {
  max: 1,
  connect_timeout: 5,
  onnotice: () => {},
})
let ready = false
for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  try {
    await owner`SELECT 1`
    ready = true
    console.log(`   reachable after ${attempt} attempt(s)`)
    break
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
}
if (!ready) {
  console.error(`   database never answered after ${ATTEMPTS} attempts`)
  process.exit(1)
}

step('2 apply migrations')
try {
  execFileSync('node', ['scripts/db/migrate.mjs'], { stdio: 'inherit' })
} catch {
  await owner.end()
  process.exit(1)
}

step('3 provision the application role password')
if (APP_PASSWORD === '') {
  console.error(
    '   DATABASE_APP_PASSWORD is not set. The roles migration creates hunterready_app without a\n' +
      '   password by design, so the app cannot authenticate until this is provisioned.\n' +
      '   See docs/operations/deploy-runbook.md.',
  )
  await owner.end()
  process.exit(1)
}
try {
  // Not interpolated into SQL text: a password with a quote in it would otherwise be a syntax error
  // at best and an injection at worst.
  await owner`ALTER ROLE hunterready_app WITH PASSWORD ${owner.unsafe(`'${APP_PASSWORD.replace(/'/g, "''")}'`)}`
  console.log('   provisioned')
} catch (error) {
  console.error('   failed —', error instanceof Error ? error.message : error)
  await owner.end()
  process.exit(1)
}

step('4 verify the application role can log in')
if (APP === '' || APP === OWNER) {
  console.log(
    '   skipped: DATABASE_URL is the owner URL, so there is nothing separate to verify',
  )
} else {
  const app = postgres(APP, { max: 1, connect_timeout: 5, onnotice: () => {} })
  try {
    await app`SELECT 1`
    console.log('   the app role authenticates')
  } catch (error) {
    // This is the check that would have caught builderhunt's outage. It is fatal on purpose.
    console.error(
      '   the app role cannot log in. The container will start and every database-backed page will\n' +
        '   500 — which is exactly the shape of failure this step exists to prevent.\n  ',
      error instanceof Error ? error.message : error,
    )
    await app.end()
    await owner.end()
    process.exit(1)
  } finally {
    await app.end().catch(() => {})
  }
}

step('5 sweep expired rows (soft)')
try {
  execFileSync('node', ['scripts/db/retention.mjs'], { stdio: 'inherit' })
} catch {
  console.warn('   retention sweep failed; not blocking the release')
}

await owner.end()
console.log('\ndeploy:db — done')
