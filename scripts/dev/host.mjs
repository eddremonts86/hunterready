/**
 * Run the built server on this machine, against the stack's own Postgres and model.
 *
 * **Why this exists.** The container was the only documented way to run the whole app locally, and
 * for most work it buys nothing. Measured on this Mac: the host build takes seconds, while a
 * container rebuild whose apt layer has fallen out of cache spends ten minutes re-downloading
 * LibreOffice, poppler and three Tesseract language packs before it compiles a line of the app.
 * Three separate rebuilds in one session hit that, none of them for a reason to do with the code.
 *
 * What the host gives you, verified rather than assumed:
 *
 *   {"status":"ok","checks":{"wasm":true,"fonts":true,"families":60}}
 *   {"provider":"MiniMax","encryptsAtRest":true,"thirdPartyAvailable":true}
 *
 * That is the WASM renderer, the bundled fonts, the real database with encryption at rest, and both
 * third-party models. `/api/render` returns the same 19,742-byte PDF the container returns.
 *
 * **What it does not give you, and this is the whole reason the container stays.** LibreOffice and
 * Tesseract live in the image and deliberately not on a laptop (ADR-012), so `.doc` ingestion and
 * OCR of a scanned CV fail here in a way they never fail in production. Anything touching those two
 * paths belongs in `pnpm app` or `pnpm test:docker`. poppler is the exception: brew has it, so PDF
 * text extraction works.
 *
 * It also stamps no commit, so `/api/health` reports `build: "unknown"` and `pnpm stale` will say it
 * cannot tell. That is honest: this server is whatever is in your working tree, which is the point.
 *
 * Secrets are read from `.env` and never printed. The two database URLs are assembled here rather
 * than stored, because the compose file builds them for `db:5432` and this needs `localhost:5433`.
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createConnection } from 'node:net'

const PORT = process.env.PORT ?? '3011'
const DB_PORT = process.env.HR_DB_PORT ?? '5433'

/** Parse `.env` far enough for this: `KEY=value`, no export, no multiline. */
function readEnvFile(path) {
  const out = {}
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return out
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const at = trimmed.indexOf('=')
    if (at < 1) continue
    out[trimmed.slice(0, at)] = trimmed
      .slice(at + 1)
      .replace(/^["']|["']$/g, '')
  }
  return out
}

/** Is anything listening there? A refused connection is the answer, not an error. */
function listening(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port: Number(port) })
    const done = (answer) => {
      socket.destroy()
      resolve(answer)
    }
    socket.setTimeout(700)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

const file = readEnvFile('.env')
const env = { ...file, ...process.env, PORT }

if (!(await listening(DB_PORT))) {
  console.error(
    `✖ nothing listening on localhost:${DB_PORT}, so there is no database to talk to.\n` +
      `  The db and model containers are separate from the app one and are probably just stopped:\n\n` +
      `    docker compose -f docker-compose.yml -f docker-compose.local.yml up -d db llm\n`,
  )
  process.exit(2)
}

if (file.DATABASE_APP_PASSWORD === undefined) {
  console.error(
    '✖ DATABASE_APP_PASSWORD is not in .env, so the connection string cannot be built.',
  )
  process.exit(2)
}

env.DATABASE_URL ??= `postgres://hunterready_app:${file.DATABASE_APP_PASSWORD}@localhost:${DB_PORT}/hunterready`
if (file.POSTGRES_PASSWORD !== undefined) {
/*
  The origin this loop actually serves, because Better Auth rejects every other one.

  `.env` carries `BETTER_AUTH_URL=http://localhost:3000` — the compose default, and a port nothing on
  this machine listens on. Better Auth trusts its `baseURL`'s origin and no other, so **every sign-in
  and sign-up on `pnpm host` answered `403 INVALID_ORIGIN`**, on 3011 and on the launch.json 3013
  alike. Not a broken form: a form that could never have worked here, which is why nothing about it
  looked wrong. Everything behind an account was unreachable in the default local loop — the checkout,
  the billing portal, saved CVs and the GDPR controls.

  Derived rather than defaulted, for the same reason `DATABASE_URL` is: this script already owns the
  URLs that depend on which port it was told to serve, and the file's copy is about a different one.
  An explicit `BETTER_AUTH_URL` in the environment still wins, because that is somebody pointing this
  build at a tunnel or a proxy on purpose.
*/
if (process.env.BETTER_AUTH_URL === undefined) {
  env.BETTER_AUTH_URL = `http://localhost:${PORT}`
}

  env.DATABASE_MIGRATION_URL ??= `postgres://hunterready_owner:${file.POSTGRES_PASSWORD}@localhost:${DB_PORT}/hunterready`
}

/*
  The brew Ollama on Metal rather than the container's CPU one, when it is up. CLAUDE.md measured the
  difference at roughly 4x, and on the host there is no `host.docker.internal` indirection to make.
*/
env.OLLAMA_BASE_URL ??= (await listening('11500'))
  ? 'http://localhost:11500'
  : 'http://localhost:11434'

console.log(`▸ http://localhost:${PORT}`)
console.log(`  database  localhost:${DB_PORT}`)
console.log(`  model     ${env.OLLAMA_BASE_URL}`)
console.log(
  '  no LibreOffice and no Tesseract here: .doc and OCR need `pnpm app`.\n',
)

const child = spawn(process.execPath, ['.output/server/index.mjs'], {
  env,
  stdio: 'inherit',
})
child.on('exit', (code) => process.exit(code ?? 0))
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
