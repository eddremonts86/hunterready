/**
 * Which company the person named, read off a request, in one place.
 *
 * ## Why one place
 *
 * Five endpoints take this field — ingest, rewrite, target, the cover letter, the translation — and
 * every one of them used to compare it to the literal string `'provider'`. That was fine while the
 * answer was yes-or-no. The moment the gate started naming companies, four of those five would have
 * kept reading `'minimax'` as *not* consent and quietly done the work on the local model instead:
 * five copies of one rule, four of them wrong, and nothing on screen to say so.
 *
 * ## The direction it fails in
 *
 * Anything unrecognised — an empty field, an older client, a mistyped id, `'provider'` from a page
 * that has been open since before this change — reads as **no consent**. The cost of getting that
 * wrong is a slightly worse extraction. The cost of the other direction is somebody's employment
 * history sent to a company they did not name, which is the one mistake docs/07 exists to prevent.
 *
 * `providerById` refuses an unknown id on the same principle, so a value that survives this check and
 * then fails to resolve still falls to the local model rather than to whichever company is first.
 */

/** The value that means "nothing leaves this machine". Not a provider id, and never will be one. */
export const LOCAL_CHOICE = 'local'

/**
 * The ids a request may name. Anything else is not an answer.
 *
 * Checked against the list rather than "not empty and not local", which is what the first version
 * did and what the test caught within a minute: `'yes'` sailed through as consent to a company named
 * yes. Nothing would have been sent anywhere — `providerById` refuses it too — but the request would
 * have counted as consent and dropped the CV onto the rule engine instead of the local model, which
 * is a worse read for a person who never asked for it.
 */
const KNOWN = new Set(['deepseek', 'minimax', 'anthropic'])

export function chosenProvider(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const id = value.trim().toLowerCase()
  if (id === '' || id === LOCAL_CHOICE) return undefined
  /*
    `provider` was the old yes-or-no value. Treated as consent-without-a-name: a page open since
    before the change should not silently lose its answer, and the deployment's own resolution order
    is what it consented to at the time. `undefined` from here means local; `'provider'` means "yes,
    to whoever this deployment uses", which is exactly what it meant when it was written.
  */
  if (id === 'provider') return 'default'
  return KNOWN.has(id) ? id : undefined
}

/** True when the person consented to a transfer at all, whichever company they named. */
export function consentedToTransfer(value: unknown): boolean {
  return chosenProvider(value) !== undefined
}

/** The id to hand `providerById`, or undefined to let the deployment's own order decide. */
export function providerIdFrom(value: unknown): string | undefined {
  const id = chosenProvider(value)
  return id === undefined || id === 'default' ? undefined : id
}
