/**
 * The browser half of Better Auth.
 *
 * Separate module from `auth.ts`, and the separation is load-bearing: `auth.ts` imports the Drizzle
 * adapter and therefore `postgres`, and anything that reaches the client bundle from there runs
 * Node internals in a browser — `Buffer is not defined`, before React mounts, with the
 * server-rendered HTML still displaying perfectly and every button silently dead. That failure is
 * documented at length in `src/db/client.ts`. This file imports nothing from the server.
 */
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient()
export const { signIn, signUp, signOut, useSession } = authClient
