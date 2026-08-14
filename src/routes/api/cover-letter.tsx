/**
 * POST a CV, an advert and its requirements; get a cover letter or an honest refusal — v0.7.
 *
 * ## Its own route, and its own rate limit
 *
 * Not folded into `/api/target`. Targeting is what you do to decide whether to apply; a letter is what
 * you write once you have decided, and most people who look at a gap report will not want one. Bundling
 * it would spend two model calls on every advert somebody pastes out of curiosity.
 *
 * ## No local fallback, and no pretending otherwise
 *
 * Unlike advert reading, there is no deterministic way to write a letter — as with bullet rewriting.
 * Declining the third-party transfer routes to the local model; an installation with neither configured
 * gets a 503 that says the feature is unavailable and that everything else still works. A silent no-op
 * would be worse.
 *
 * Nothing here logs the letter, the advert or the CV.
 */
import { createFileRoute } from '@tanstack/react-router'
import { Resume } from '@/schema/resume'
import { draftCoverLetter } from '@/optimize/cover-letter'
import { MAX_ADVERT_CHARS, MIN_ADVERT_CHARS } from '@/optimize/advert'
import type { JobRequirements } from '@/optimize/jd'
import { resolveLocalProvider, resolveProvider } from '@/structure/provider'
import { checkRateLimit, clientKey } from '@/lib/rate-limit'
import { progressEnd, progressReporter } from '@/lib/progress'
import { event, requestId } from '@/lib/log'
import { mayUseThirdParty } from '@/lib/entitlements'

/** Defensive: the client sends back what `/api/target` gave it, and a shape can be lost in transit. */
function readRequirements(value: unknown): JobRequirements {
  const source = (value ?? {}) as Record<string, unknown>
  const list = (key: string): Array<string> =>
    Array.isArray(source[key])
      ? (source[key] as Array<unknown>).filter(
          (item): item is string => typeof item === 'string',
        )
      : []
  return {
    hardSkills: list('hardSkills'),
    softSkills: list('softSkills'),
    responsibilities: list('responsibilities'),
    ...(typeof source.seniority === 'string' && source.seniority !== ''
      ? { seniority: source.seniority }
      : {}),
    keywords: list('keywords'),
  }
}

function text(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed.slice(0, limit)
}

export const Route = createFileRoute('/api/cover-letter')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const id = requestId()
        const started = Date.now()

        const limit = checkRateLimit(clientKey(request))
        if (!limit.allowed) {
          event('cover.rate_limited', { requestId: id })
          return Response.json(
            {
              error: 'rate_limited',
              message: `You have asked for a lot of letters in a short time. Please wait ${Math.ceil(limit.retryAfterSeconds / 60)} minutes and try again.`,
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
          advert?: unknown
          requirements?: unknown
          roleTitle?: unknown
          company?: unknown
          processing?: unknown
          answers?: unknown
        }

        const advert = text(payload.advert, MAX_ADVERT_CHARS)
        if (advert === undefined || advert.length < MIN_ADVERT_CHARS) {
          return Response.json(
            {
              error: 'advert_too_short',
              message:
                'We need the advert to write to. Paste the part that says what they are looking for.',
            },
            { status: 400 },
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
                'Writing a cover letter is not available on this installation. Everything else still works.',
            },
            { status: 503 },
          )
        }

        const progressId =
          typeof (payload as { progress?: unknown }).progress === 'string'
            ? ((payload as { progress?: unknown }).progress as string)
            : undefined

        const letter = await draftCoverLetter({
          onProgress: progressReporter(progressId),
          resume: parsed.data,
          requirements: readRequirements(payload.requirements),
          advert,
          ...(text(payload.roleTitle, 200) === undefined
            ? {}
            : { roleTitle: text(payload.roleTitle, 200) }),
          ...(text(payload.company, 200) === undefined
            ? {}
            : { company: text(payload.company, 200) }),
          useProvider: mayUseProvider,
          answers: Array.isArray(payload.answers)
            ? payload.answers.filter(
                (value): value is string => typeof value === 'string',
              )
            : undefined,
          signal: request.signal,
        })

        /**
         * The outcome and nothing else. A rising `refused` share is the signal that the prompt or the
         * model has drifted toward inventing things about employers, and it is invisible otherwise.
         */
        if (progressId !== undefined) progressEnd(progressId)

        event('cover.done', {
          requestId: id,
          status: letter.outcome,
          ms: Date.now() - started,
        })

        return Response.json(letter, {
          headers: { 'cache-control': 'no-store' },
        })
      },
    },
  },
})
