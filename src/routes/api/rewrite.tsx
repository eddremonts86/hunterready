/**
 * POST a `Resume`, get back a suggestion per bullet. Nothing is applied here.
 *
 * The endpoint deliberately returns *suggestions* rather than a modified resume. Enforcement layer 3
 * (docs/06-ai-optimization.md) is that the candidate accepts each one, and an endpoint that returned
 * an improved CV would make that a formality — the work would already be done and the diff would be
 * a receipt rather than a decision.
 *
 * Consent applies exactly as it does to extraction: without it, this does nothing at all. Rewriting
 * has no local fallback — there is no deterministic way to write a better sentence — so declining
 * here means the feature is unavailable, and saying so is more honest than a silent no-op.
 */
import { createFileRoute } from '@tanstack/react-router'
import { Resume } from '@/schema/resume'
import { rewriteBullets } from '@/optimize/rewrite'
import { resolveLocalProvider, resolveProvider } from '@/structure/provider'
import { checkRateLimit, clientKey } from '@/lib/rate-limit'
import { event, requestId } from '@/lib/log'
import { mayUseThirdParty } from '@/lib/entitlements'

export const Route = createFileRoute('/api/rewrite')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const id = requestId()
        const started = Date.now()

        // A rewrite pass is ~25 model calls. Rate limiting this is not optional.
        const limit = checkRateLimit(clientKey(request))
        if (!limit.allowed) {
          event('rewrite.rate_limited', { requestId: id })
          return Response.json(
            {
              error: 'rate_limited',
              message: `You have asked for a lot of rewrites in a short time. Please wait ${Math.ceil(limit.retryAfterSeconds / 60)} minutes and try again.`,
            },
            {
              status: 429,
              headers: { 'retry-after': String(limit.retryAfterSeconds) },
            },
          )
        }

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json(
            {
              error: 'bad_request',
              message: 'That request did not arrive intact.',
            },
            { status: 400 },
          )
        }

        const payload = body as {
          resume?: unknown
          processing?: unknown
          answers?: unknown
        }

        /**
         * Two conditions, not one (ADR-023): consent **and** a paid plan. Local otherwise.
         *
         * `processing` is the client's answer to the consent gate and is never trusted alone — it is
         * one half of an `&&` whose other half the client cannot influence.
         */
        const mayUseProvider = await mayUseThirdParty(
          request,
          payload.processing === 'provider',
        )

        if (
          (mayUseProvider ? resolveProvider() : resolveLocalProvider()) ===
          undefined
        ) {
          return Response.json(
            {
              error: 'not_configured',
              message:
                'Improving wording is not available on this installation. Everything else still works.',
            },
            { status: 503 },
          )
        }

        const parsed = Resume.safeParse(payload.resume)
        if (!parsed.success) {
          return Response.json(
            { error: 'invalid_resume', message: 'We could not read that CV.' },
            { status: 400 },
          )
        }

        const result = await rewriteBullets({
          resume: parsed.data,
          useProvider: mayUseProvider,
          // What the candidate told us when we asked. Source material, so the guard will permit a
          // figure they supplied — which is the entire point of asking rather than inventing.
          answers: Array.isArray(payload.answers)
            ? payload.answers.filter(
                (value): value is string => typeof value === 'string',
              )
            : undefined,
          signal: request.signal,
        })

        // Counts only — never a bullet, never a suggestion (docs/07-privacy.md).
        event('rewrite.done', {
          requestId: id,
          promptVersion: result.promptVersion,
          bullets: result.rewrites.length,
          ...result.tally,
          ms: Date.now() - started,
        })

        return Response.json(
          { rewrites: result.rewrites, tally: result.tally },
          { headers: { 'cache-control': 'no-store' } },
        )
      },
    },
  },
})
