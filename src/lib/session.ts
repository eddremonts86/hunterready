/**
 * Who is making this request — answered by Better Auth.
 *
 * This module used to hand-roll a signed cookie: an HMAC over a user id, verified in constant time.
 * It worked, and deleting it was still the right call. Session rotation, CSRF, cookie flags, password
 * hashing and the verification table are all problems with known-correct answers, and every one of
 * them is a place where a small mistake is invisible until it is exploited. Better Auth owns them now
 * and `builderhunt` already runs it, so this is the reference app's answer rather than a second one.
 *
 * What is left here is the one thing the rest of the code needs: a user id, or nothing.
 */
import { auth } from './auth'

/**
 * The signed-in user's id, or undefined.
 *
 * Undefined covers every "no" — auth not configured, no cookie, an expired session, a forged token —
 * on purpose. A caller that could distinguish them would be tempted to treat "expired" differently
 * from "absent", and the correct behaviour for all of them is identical: this request has no account.
 */
export async function currentUserId(
  request: Request,
): Promise<string | undefined> {
  if (auth === undefined) return undefined
  try {
    const session = await auth.api.getSession({ headers: request.headers })
    return session?.user.id
  } catch {
    // A database blip must not read as "signed in". Failing closed is the only safe direction here.
    return undefined
  }
}

/**
 * Clears the session cookie, for the one case Better Auth cannot handle itself: the account has just
 * been deleted, so there is no session left to sign out of. Leaving the cookie would show the next
 * visitor a signed-in shell with nothing behind it.
 */
export function clearSession(): string {
  const secure = (process.env.BETTER_AUTH_URL ?? '').startsWith('https://')
  return `better-auth.session_token=; Path=/; HttpOnly; SameSite=Lax;${secure ? ' Secure;' : ''} Max-Age=0`
}
