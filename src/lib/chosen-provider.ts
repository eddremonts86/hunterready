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
 *
 * **Kept in step with `BY_ID` in `structure/provider.ts`, and by a test rather than by hand.**
 * Not derived from it, because that module constructs the Anthropic SDK at import time and this one is
 * reached from the request path. A name that passes here and resolves to nothing there is not
 * dangerous — `providerById` refuses it and the CV stays local — but it would count as consent, which
 * is the wrong record to keep.
 *
 * ⚠️ **This list has been wrong twice, in both directions, and it fails silently both times.**
 * `minimax` left on 2026-08-29 with ADR-036 and came back on 2026-09-03 with ADR-038 — and the second
 * time the provider was swapped in `BY_ID` and *not* here. The consequence was exactly what the first
 * section of this file warns about: `'minimax'` read as not-consent, and every upload through the
 * third-party path quietly extracted on the local model instead. `pnpm test` was green throughout,
 * because `chosen-provider.test.ts` asserted the list as it then stood. Found by ingesting a real CV
 * against a real build and reading `method` in the answer, which said `local`.
 *
 * `chosen-provider.test.ts` now parses `BY_ID` out of `provider.ts` and asserts every id in it is
 * accepted here, so the two lists cannot drift again without something going red.
 */
const KNOWN = new Set(['minimax', 'anthropic'])

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

/**
 * The same answer, asserted by a machine on a header (ADR-032).
 *
 * A browser sends the person's own click in the request body. An API caller has no person at the
 * keyboard, so it states on each request that its user consented, and names the company:
 *
 *     X-HunterReady-Consent: minimax
 *
 * **Per request, never per key.** A key is not a standing permission to send anybody's CV anywhere;
 * the consent belongs to one person and one document, and a header that has to be set each time is
 * the shape of that. It also means a caller that forgets it gets the local model rather than an
 * accidental transfer.
 *
 * Read through `chosenProvider` deliberately, rather than parsed here. The whole reason that function
 * exists is that five endpoints once had five copies of this rule and four were wrong. A sixth copy
 * for the API would be the same mistake with a better excuse.
 */
export const CONSENT_HEADER = 'x-hunterready-consent'

/**
 * Returns the **raw** header value, not a normalised id, so it drops in exactly where a body field
 * does and is read by the same two functions afterwards.
 *
 * Returning the normalised id here was the first version and it was wrong in a way worth recording:
 * `chosenProvider` maps the legacy value `provider` to `default`, and feeding `default` back into
 * `providerIdFrom` produces `undefined`, because `default` is not a company. A caller asserting
 * consent would have silently got the local model. One normalisation, at the end, once.
 */
export function assertedConsent(request: Request): string | null {
  return request.headers.get(CONSENT_HEADER)
}

/**
 * The consent on this request, from the body if a browser sent one, otherwise from the header.
 *
 * Body first because a browser's own field is the person's actual click, and a header on the same
 * request would be a machine overriding it.
 */
export function consentOn(request: Request, fromBody: unknown): unknown {
  const body = typeof fromBody === 'string' ? fromBody.trim() : ''
  return body !== '' ? fromBody : assertedConsent(request)
}
