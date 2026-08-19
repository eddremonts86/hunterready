/**
 * Hand a `/v1` request to the browser route's own handler.
 *
 * ## Why delegate instead of reimplement
 *
 * The four model-backed endpoints carry real logic: which bullets to rewrite, how to read an advert
 * against a CV, the fabrication guard, the locale rules. Restating any of it in `/v1` would create a
 * second place for the consent rule and the entitlement check to hold or fail, and only one of the
 * two would be the one anybody tests. So `/v1` owns the contract — a key, a bucket, a request id,
 * a stable path — and the handler owns the work.
 *
 * ## The one thing it changes on the way through
 *
 * A browser sends its consent in the body; an API caller sends it on a header (ADR-032). This folds
 * the header into `processing` when the body did not carry one, so the handler downstream sees the
 * field it already reads and needs no knowledge that an API exists.
 *
 * A new `Request` rather than a mutated one, because a `Request` body can only be read once and the
 * handler is about to read it.
 */
import { assertedConsent } from './chosen-provider'

export async function delegateWithConsent(
  request: Request,
  handler: (ctx: { request: Request }) => Promise<Response>,
  id: string,
): Promise<Response> {
  const header = assertedConsent(request)

  let forwarded = request
  if (header !== null && header.trim() !== '') {
    let body: Record<string, unknown> | undefined
    try {
      body = (await request.json()) as Record<string, unknown>
    } catch {
      body = undefined
    }
    if (body !== undefined) {
      /*
        Body wins. A browser field is a person's own answer and a header is a machine asserting on
        their behalf; a header that overrode it would be the second speaking for the first.
      */
      const merged =
        typeof body.processing === 'string' && body.processing.trim() !== ''
          ? body
          : { ...body, processing: header }
      forwarded = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: JSON.stringify(merged),
      })
    }
  }

  const response = await handler({ request: forwarded })
  // Set rather than appended: the handler may already carry one and two would be ambiguous.
  response.headers.set('x-request-id', id)
  return response
}
