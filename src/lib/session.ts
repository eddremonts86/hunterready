/**
 * Who is making this request.
 *
 * A deliberately small, signed-cookie session — no password, no OAuth, no third party. What v0.5
 * needs is "the same browser comes back and finds its CV", and the honest minimum for that is a
 * signed identifier. Anything larger would be authentication theatre around a product that stores one
 * document per person.
 *
 * The cookie holds a user id and an HMAC of it. It is not encrypted, and does not need to be: a user
 * id is not a secret, and the signature is what stops someone editing the cookie to read another
 * account. `SESSION_SECRET` is what makes the signature mean anything — without it, sessions are
 * disabled outright rather than signed with a default, because a default secret is no secret.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

const COOKIE = 'hr_session'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30

function secret(): string {
  return (process.env.SESSION_SECRET ?? '').trim()
}

function sign(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('base64url')
}

/** Constant-time compare, so a forged cookie cannot be brute-forced a byte at a time. */
function matches(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function issueSession(userId: string): string {
  const value = `${userId}.${sign(userId)}`
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${MAX_AGE_SECONDS}`
}

export function clearSession(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`
}

export async function currentUserId(
  request: Request,
): Promise<string | undefined> {
  if (secret() === '') return undefined

  const header = request.headers.get('cookie') ?? ''
  const raw = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`))
  if (raw === undefined) return undefined

  const [userId, signature] = raw.slice(COOKIE.length + 1).split('.')
  if (userId === undefined || signature === undefined) return undefined
  // An unsigned or wrongly-signed cookie is treated as absent, never as a hint about who it claims
  // to be.
  return matches(sign(userId), signature) ? userId : undefined
}
