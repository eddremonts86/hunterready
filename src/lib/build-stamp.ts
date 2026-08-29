/**
 * Which commit this process is serving, from whichever of the two sources actually knows.
 *
 * ## Why there are two, and why `??` is the wrong operator for them
 *
 * `HR_COMMIT` is stamped at build time. `pnpm app` passes `git rev-parse HEAD`, and the Dockerfile
 * declares `ARG HR_COMMIT=unknown` with `ENV HR_COMMIT=$HR_COMMIT` behind it — which is the whole
 * trap. In any build that does not pass the arg, **the variable exists and its value is the string
 * `"unknown"`**, so `process.env.HR_COMMIT ?? somethingElse` can never reach `somethingElse`. A
 * fallback written with `??` would have looked correct, changed nothing, and been very hard to
 * disbelieve.
 *
 * `SOURCE_COMMIT` is Coolify's own predefined variable, the commit of the source it deployed. That is
 * the half plan 15 was waiting on, and it was waiting for the wrong thing: the plan and the roadmap
 * both recorded this as needing a build arg somebody sets in Coolify, so it sat under "Edd's". It does
 * not. Coolify injects `SOURCE_COMMIT` into the application's environment on its own, and this is read
 * **at run time** — which also steps around the documented caveat that `SOURCE_COMMIT` is withheld
 * from Docker *builds* to preserve layer caching, because nothing here needs it at build time.
 *
 * Build time wins when it is real, because it is the more precise of the two: it is the commit the
 * bundle was compiled from, whereas a deploy-time value describes the checkout. They agree in
 * production and only the local loop has a build arg at all.
 *
 * ## What "unknown" has to keep meaning
 *
 * A missing stamp must never read as agreement. `pnpm stale` prints `?` and exits 1 on `unknown` — it
 * says "this build cannot answer", not "this build is current" — and that is the behaviour to preserve
 * rather than paper over. Guessing from `package.json`, a timestamp or a tag would turn an honest
 * "I don't know" into a confident wrong answer, which is the failure the whole stamp exists to stop.
 */

/** `unknown` is a value the Dockerfile sets, so it is an absence wearing a value's clothes. */
const ABSENT = new Set(['', 'unknown'])

function usable(raw: string | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return ABSENT.has(trimmed) ? undefined : trimmed
}

/**
 * Takes the environment rather than reading it, so the resolution order can be asserted without
 * mutating `process.env` in a test that runs beside others.
 */
export function buildStamp(
  env: Record<string, string | undefined> = process.env,
): string {
  return usable(env.HR_COMMIT) ?? usable(env.SOURCE_COMMIT) ?? 'unknown'
}
