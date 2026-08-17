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
import { consentedToTransfer } from '@/lib/chosen-provider'

export const Route = createFileRoute('/api/rewrite')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const id = requestId()
        const started = Date.now()

        /**
         * Its own bucket, wider than ingest's, because the client now sends one request per job rather
         * than one per pass (that is how the progress counter works — see index.tsx). The thing worth
         * limiting is model calls, and the per-job split does not change their total; sharing ingest's
         * 12-per-10-minutes would make a six-job CV spend half the family budget on one pass.
         */
        const limit = checkRateLimit(`rewrite:${clientKey(request)}`, 60)
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
          only?: unknown
        }

        /**
         * Two conditions, not one (ADR-023): consent **and** a paid plan. Local otherwise.
         *
         * `processing` is the client's answer to the consent gate and is never trusted alone — it is
         * one half of an `&&` whose other half the client cannot influence.
         */
        const mayUseProvider = await mayUseThirdParty(
          request,
          consentedToTransfer(payload.processing),
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

        /**
         * `only`: rewrite a subset — the client sends one request per job so the person watches real
         * progress instead of a five-minute spinner. Validated to shape, clamped to sane bounds; a pair
         * pointing at nothing is skipped harmlessly by the engine.
         */
        const only = Array.isArray(payload.only)
          ? payload.only.flatMap((entry: unknown) => {
              const pair = entry as {
                workIndex?: unknown
                highlightIndex?: unknown
              }
              return typeof pair.workIndex === 'number' &&
                Number.isInteger(pair.workIndex) &&
                pair.workIndex >= 0 &&
                pair.workIndex < 200 &&
                typeof pair.highlightIndex === 'number' &&
                Number.isInteger(pair.highlightIndex) &&
                pair.highlightIndex >= 0 &&
                pair.highlightIndex < 200
                ? [
                    {
                      workIndex: pair.workIndex,
                      highlightIndex: pair.highlightIndex,
                    },
                  ]
                : []
            })
          : undefined

        const result = await rewriteBullets({
          resume: parsed.data,
          only,
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
          /*
            Why the silent ones were silent. `unavailable` alone was undiagnosable: a dropped
            connection, a model answering in prose instead of calling the tool, and a payload the
            schema refuses all looked identical, so a measured "an eighth of bullets say nothing"
            could not be turned into a fix. Counts of fixed labels — nothing from the CV.
          */
          silenceCallFailed: result.silence['call-failed'],
          silenceNoToolCall: result.silence['no-tool-call'],
          silenceMalformed: result.silence.malformed,
          silenceNoProvider: result.silence['no-provider'],
          // Whether the voice rules are holding. A rising share is the signal to spend a retry on
          // bullets too, and without the number that decision would be a guess.
          voiceTells: result.voice.tells,
          voiceSuggestions: result.voice.suggestionsWithTells,
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
