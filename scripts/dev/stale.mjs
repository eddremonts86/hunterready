/**
 * Is the running container serving the code in this working tree?
 *
 * Written after the same confusion three times in one session: a change verified on the dev server,
 * the container never rebuilt, and then a round of guessing at browser caches to explain why it was
 * not on screen. Nothing in the interface says which build it is serving, so this asks it.
 *
 *   pnpm stale
 *
 * Compares `/api/health`'s `build` — the commit stamped in at image build time — with HEAD, and lists
 * what has landed in between. Exits non-zero when they differ, so it can gate a script later.
 */
import { execSync } from 'node:child_process'

const URL_BASE = process.env.HR_API ?? 'http://localhost:3100'

const git = (args) =>
  execSync(`git ${args}`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()

let payload
try {
  const response = await fetch(`${URL_BASE}/api/health`)
  payload = await response.json()
} catch {
  console.log(`✖ nothing answering on ${URL_BASE}. Is the container up?`)
  process.exit(2)
}

/*
  Missing and 'unknown' are the same answer, and the first version treated them differently — it read
  `payload.build` off an image built before the stamp existed, got `undefined`, and crashed on
  `.slice`. A staleness check that throws when the thing is stale is the one case it had to handle.
*/
const built =
  typeof payload.build === 'string' && payload.build !== ''
    ? payload.build
    : 'unknown'
const head = git('rev-parse HEAD')
const shortHead = head.slice(0, 7)

if (built === 'unknown') {
  console.log(
    `? ${URL_BASE} is serving an image with no commit stamp — built before this check existed.\n` +
      `  Rebuild once and it will be able to answer:\n` +
      `  docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build app`,
  )
  process.exit(1)
}

if (built === head) {
  // The Dockerfile and the compose file shape the image too, so a change to either is a stale one.
  const dirty =
    git('status --porcelain -- src Dockerfile docker-compose.yml') !== ''
  console.log(
    dirty
      ? `~ ${URL_BASE} matches HEAD (${shortHead}), but the working tree has uncommitted changes it cannot know about.`
      : `✔ ${URL_BASE} is serving HEAD (${shortHead}).`,
  )
  process.exit(dirty ? 1 : 0)
}

let behind = ''
try {
  behind = git(`log --oneline ${built}..HEAD`)
} catch {
  /* the stamped commit is not in this checkout — a different branch, or amended */
}

console.log(
  `✖ ${URL_BASE} is behind. Serving ${built.slice(0, 7)}, HEAD is ${shortHead}.` +
    (behind === '' ? '' : `\n\n  Missing:\n${behind.replace(/^/gm, '    ')}`) +
    `\n\n  docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build app`,
)
process.exit(1)
