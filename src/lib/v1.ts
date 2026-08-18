/**
 * The preamble every `/v1` route shares: a key, a bucket, a request id.
 *
 * Extracted at the third endpoint rather than the second, which is about when a pattern stops being
 * a coincidence. The point is not the saved lines — it is that authentication, the rate-limit bucket
 * and the id on the response are now **one decision applied everywhere** rather than eight copies
 * that can drift. `contract.test.ts` reads the routes and asserts they all use it.
 */
import { apiCaller, unauthorized } from './api-caller'
import type { ApiCaller } from './api-caller'
import { event, requestId } from './log'
import { checkRateLimit } from './rate-limit'

export interface V1Context {
  caller: ApiCaller
  /** On every response, success or failure. The only thread back to a log that holds no content. */
  id: string
}

/** A refusal to return, or the context to work with. Never both, never neither. */
export type V1Entry = { refusal: Response } | { ok: V1Context }

export async function enterV1(
  request: Request,
  route: string,
): Promise<V1Entry> {
  const id = requestId()

  const caller = await apiCaller(request)
  if (caller === undefined) return { refusal: unauthorized(id) }

  /*
    Bucketed by key, not by address. Two partners behind one NAT must not share a budget, and one
    must not escape its own by moving hosts.
  */
  const limit = checkRateLimit(`key:${caller.keyId}`)
  if (!limit.allowed) {
    event(`v1.${route}.rate_limited`, { requestId: id })
    return {
      refusal: Response.json(
        {
          error: 'rate_limited',
          message: 'Too many requests. Try again shortly.',
          requestId: id,
        },
        {
          status: 429,
          headers: { 'retry-after': '60', 'x-request-id': id },
        },
      ),
    }
  }

  return { ok: { caller, id } }
}

/**
 * A JSON failure in the one shape the docs describe.
 *
 * `message` is written for a developer reading a terminal. **It never quotes the request**, because
 * the request is somebody's CV and an error body is somewhere that content must not travel (docs/07)
 * — which is also why a zod issue list is never returned from here.
 */
export function v1Error(
  id: string,
  status: number,
  error: string,
  message: string,
): Response {
  return Response.json(
    { error, message, requestId: id },
    { status, headers: { 'x-request-id': id } },
  )
}

/** A JSON success, with the id and without a stray cache. A CV must not sit in an intermediary. */
export function v1Json(id: string, body: Record<string, unknown>): Response {
  return Response.json(
    { ...body, requestId: id },
    { headers: { 'x-request-id': id, 'cache-control': 'no-store' } },
  )
}
