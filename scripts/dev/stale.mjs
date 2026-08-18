/**
 * Is that server running the code you think it is?
 *
 * Written after the same confusion three times in one session: a change verified on the dev server,
 * the container never rebuilt, and then a round of guessing at browser caches to explain why it was
 * not on screen. Nothing in the interface says which build it is serving, so this asks it.
 *
 *   pnpm stale                                        # the local container on :3100
 *   pnpm stale --url https://hunterready.example.dk    # the deployed site
 *
 * Compares `/api/health`'s `build` — the commit stamped in at image build time — with the commit that
 * target *should* be serving, and lists what has landed in between. Exits non-zero when they differ,
 * so it can gate a script later.
 *
 * **Which commit it should be serving depends on where it is.** A local container should match your
 * working tree, so it is compared against `HEAD`. A deployed site should match what was released, so
 * it is compared against `origin/master` — comparing production to a local HEAD would call it stale
 * for every commit you have not shipped yet, which is most of them and none of them a problem.
 */
import { execSync } from 'node:child_process'

/** `--url <base>` beats `HR_API`, which beats the local container. */
function targetUrl() {
  const flag = process.argv.indexOf('--url')
  if (flag !== -1 && process.argv[flag + 1] !== undefined) {
    return process.argv[flag + 1].replace(/\/$/, '')
  }
  return process.env.HR_API ?? 'http://localhost:3100'
}

const URL_BASE = targetUrl()
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(
  URL_BASE,
)

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
/*
  Local compares against your tree; remote compares against what was released. `origin/master` is read
  from the local ref rather than fetched, so a stale ref reports honestly: if `git fetch` has not run,
  the answer is about the last state you saw, which is better than a network call this script cannot
  guarantee.
*/
const expectedRef = isLocal ? 'HEAD' : 'origin/master'
let head
try {
  head = git(`rev-parse ${expectedRef}`)
} catch {
  console.log(
    `✖ cannot resolve ${expectedRef} in this checkout, so there is nothing to compare against.` +
      (isLocal ? '' : '\n  Try `git fetch origin` first.'),
  )
  process.exit(2)
}
const shortHead = head.slice(0, 7)

if (built === 'unknown') {
  console.log(
    `? ${URL_BASE} is serving a build with no commit stamp, so it cannot answer this.\n` +
      (isLocal
        ? `  Rebuild once and it will be able to:\n  pnpm app`
        : `  The deploy passes no HR_COMMIT. See docs/plans/15-production-commit-stamp.md.`),
  )
  process.exit(1)
}

if (built === head) {
  // The Dockerfile and the compose file shape the image too, so a change to either is a stale one.
  const dirty =
    isLocal &&
    git('status --porcelain -- src Dockerfile docker-compose.yml') !== ''
  console.log(
    dirty
      ? `~ ${URL_BASE} matches ${expectedRef} (${shortHead}), but the working tree has uncommitted changes it cannot know about.`
      : `✔ ${URL_BASE} is serving ${expectedRef} (${shortHead}).`,
  )
  process.exit(dirty ? 1 : 0)
}

let behind = ''
try {
  behind = git(`log --oneline ${built}..${expectedRef}`)
} catch {
  /* the stamped commit is not in this checkout — a different branch, or amended */
}

console.log(
  `✖ ${URL_BASE} is behind. Serving ${built.slice(0, 7)}, ${expectedRef} is ${shortHead}.` +
    (behind === '' ? '' : `\n\n  Missing:\n${behind.replace(/^/gm, '    ')}`) +
    (isLocal
      ? `\n\n  pnpm app`
      : `\n\n  Merge to master, or wait for the Coolify deploy to finish.`),
)
process.exit(1)
