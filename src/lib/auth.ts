/**
 * Better Auth — the sign-in the whole of v0.5 was waiting on.
 *
 * Better Auth 1.6 with the Drizzle adapter, matching `builderhunt`. Copying the reference app is the
 * standing instruction and here it also settles the awkward questions for free: password hashing,
 * session rotation, CSRF, cookie flags and the verification table are all its problem rather than
 * mine, and `src/lib/session.ts`'s hand-rolled HMAC cookie is deleted in the same commit.
 *
 * ## What is deliberately left out
 *
 * builderhunt's configuration runs to hundreds of lines: organizations, device fingerprinting, abuse
 * hooks, step-up auth, disposable-email gates. Every one of those solves a multi-tenant SaaS's
 * problem. HunterReady is one person and one CV, and inheriting that apparatus would be complexity
 * with nothing behind it. If teams ever arrive, the reference app's answer is there to copy then.
 *
 * ## Email and password, not magic links — for now
 *
 * Magic links are arguably better for a product holding CVs, since there is no password to leak. They
 * need a working email sender, which this deployment does not have yet. Email-and-password works
 * today, is what the reference app does, and Better Auth hashes with scrypt — so this is the honest
 * available choice rather than the ideal one. `sendResetPassword` is intentionally absent: offering a
 * reset flow that silently cannot send an email is worse than not offering one.
 */
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { db } from '@/db/client'
import {
  authAccounts,
  authSessions,
  authUsers,
  authVerifications,
} from '@/db/schema'

/**
 * Absent means sign-in is switched off, not defaulted.
 *
 * A default secret is not a secret, and a default URL sends cookies to the wrong origin. With either
 * missing, `auth` is undefined and every route that needs it answers 404 — the same shape as "no
 * account", which is exactly what the situation is.
 */
function configured(): boolean {
  return (
    (process.env.BETTER_AUTH_SECRET ?? '').trim() !== '' &&
    (process.env.DATABASE_URL ?? '').trim() !== ''
  )
}

export const auth = configured()
  ? betterAuth({
      database: drizzleAdapter(db, {
        provider: 'pg',
        schema: {
          user: authUsers,
          session: authSessions,
          account: authAccounts,
          verification: authVerifications,
        },
      }),
      secret: process.env.BETTER_AUTH_SECRET,
      baseURL: process.env.BETTER_AUTH_URL,
      emailAndPassword: {
        enabled: true,
        // Better Auth's default is 8. A CV is not a bank account, but it is somebody's employment
        // history and their email address; 10 costs a user nothing and removes the shortest passwords.
        minPasswordLength: 10,
      },
      session: {
        expiresIn: 60 * 60 * 24 * 30,
        // Rotate the session a day before it would expire rather than on every request: a token that
        // changes constantly is a token that breaks a second tab.
        updateAge: 60 * 60 * 24,
      },
      advanced: {
        // Set explicitly rather than inferred from NODE_ENV: a Secure cookie that silently becomes
        // non-Secure because an env var was misread is the kind of downgrade nobody notices.
        useSecureCookies: (process.env.BETTER_AUTH_URL ?? '').startsWith(
          'https://',
        ),
      },
    })
  : undefined

export function isAuthEnabled(): boolean {
  return auth !== undefined
}
