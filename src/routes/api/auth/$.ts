/**
 * Better Auth's own handler, mounted at `/api/auth/*`.
 *
 * A catch-all, because Better Auth owns a family of paths — sign-in, sign-up, sign-out, session,
 * callbacks — and enumerating them here would mean this file needing an edit every time a plugin adds
 * one. `builderhunt` mounts it the same way.
 *
 * When auth is not configured this answers 404 rather than crashing: the app is fully usable without
 * an account and that is the default path (ADR-019).
 */
import { createFileRoute } from '@tanstack/react-router'
import { auth } from '@/lib/auth'

const notConfigured = () =>
  Response.json(
    {
      error: 'auth_disabled',
      message: 'Accounts are not enabled on this installation.',
    },
    { status: 404 },
  )

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) =>
        auth === undefined ? notConfigured() : auth.handler(request),
      POST: ({ request }) =>
        auth === undefined ? notConfigured() : auth.handler(request),
    },
  },
})
