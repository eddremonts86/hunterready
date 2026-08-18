/**
 * Who is calling `/v1`, and the refusal when nobody is.
 *
 * Separate from `session.ts` because the two answer different questions. That module answers "which
 * user is this request", for code that does not care how it was established. This one answers "is
 * this a live API key, and which one", which the `/v1` routes need in order to rate-limit per key
 * and to record that the key was used.
 *
 * It resolves the key a second time rather than taking it from `currentUserId`, and that is one
 * indexed lookup on a unique column. The alternative was threading a caller object through every
 * signature in the app so that one of them could report a key id.
 */
import { and, eq, isNull } from 'drizzle-orm'

import { db } from '@/db/client'
import { apiKeys } from '@/db/schema'
import { hashKey, keyFromHeader } from './api-key'
import { errorEvent } from './log'

export interface ApiCaller {
  /** The key's row id. Used for the rate-limit bucket, never shown to anybody. */
  keyId: string
  userId: string
}

/**
 * The live key on this request, or undefined.
 *
 * Revoked keys are excluded in the query, so revocation takes effect on the next call. There is no
 * cache: a cached answer leaves a leaked key working for however long the cache lives, which is the
 * exact window an incident is trying to close.
 */
export async function apiCaller(
  request: Request,
): Promise<ApiCaller | undefined> {
  const secret = keyFromHeader(request.headers.get('authorization'))
  if (secret === undefined || db === undefined) return undefined

  try {
    const [row] = await db
      .select({ id: apiKeys.id, userId: apiKeys.userId })
      .from(apiKeys)
      .where(
        and(eq(apiKeys.secretHash, hashKey(secret)), isNull(apiKeys.revokedAt)),
      )
      .limit(1)
    if (row === undefined) return undefined

    /*
      Last used, coarsely and without awaiting.

      Coarse because a per-request timestamp would be a record of when somebody used the product, and
      docs/07 does not want one. Not awaited because "when was this key last used" is a forensic
      convenience and must never be able to fail a request that would otherwise have succeeded.
    */
    void db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, row.id))
      .catch(() => {
        /* the answer is still valid; only the bookkeeping failed */
      })

    return { keyId: row.id, userId: row.userId }
  } catch (error) {
    errorEvent('v1.auth.lookup_failed', {
      code: error instanceof Error ? error.name : 'unknown',
    })
    return undefined
  }
}

/**
 * The refusal, and it says nothing a prober could learn from.
 *
 * One shape for every "no": no header, a malformed one, an unknown key, a revoked key, a database
 * that did not answer. Distinguishing them would tell somebody holding a stolen key whether it was
 * ever real, and none of the five is worth a different response to the honest caller either.
 */
export function unauthorized(id: string): Response {
  return Response.json(
    {
      error: 'unauthorized',
      message:
        'This endpoint needs a live API key in an Authorization: Bearer header.',
      requestId: id,
    },
    { status: 401, headers: { 'x-request-id': id } },
  )
}
