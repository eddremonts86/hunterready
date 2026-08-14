/**
 * POST an advert and a CV, get back what the job asks for and a summary aimed at it.
 *
 * ## Why this endpoint does only two things
 *
 * Reading the advert and writing the summary need a model, so they need a server. Matching the
 * requirements against the CV, scoring the coverage and reordering the evidence do not: `buildGapReport`,
 * `scoreCv` and `applyTailoring` are pure functions of two plain objects and they run in the browser.
 *
 * That split is a product decision, not a technical one. The requirement list is *editable* — a rule
 * reader and a model both get things wrong, and the candidate is the only one who has read the advert
 * properly — so every edit has to re-match, re-score and re-tailor. Doing that on the server would put
 * a network round trip behind a checkbox. Doing it here would mean the client could not do it at all.
 *
 * ## Consent
 *
 * The same rule as `/api/ingest` and `/api/rewrite`: absent is not consent, and declining routes to the
 * local model rather than switching the feature off. The advert itself is public text, but it travels
 * with the CV and the summary call sends the CV's contents, so it obeys the CV's rules.
 *
 * Nothing here logs the advert, the CV, or the summary — counts and outcomes only (docs/07-privacy.md).
 */
import { createFileRoute } from '@tanstack/react-router'
import { Resume } from '@/schema/resume'
import {
  MAX_ADVERT_CHARS,
  MIN_ADVERT_CHARS,
  readAdvert,
} from '@/optimize/advert'
import { tailorSummary } from '@/optimize/summary'
import { resolveLocalProvider, resolveProvider } from '@/structure/provider'
import { checkRateLimit, clientKey } from '@/lib/rate-limit'
import { progressEnd, progressReporter } from '@/lib/progress'
import { event, requestId } from '@/lib/log'
import { mayUseThirdParty } from '@/lib/entitlements'

export const Route = createFileRoute('/api/target')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const id = requestId()
        const started = Date.now()

        const limit = checkRateLimit(clientKey(request))
        if (!limit.allowed) {
          event('target.rate_limited', { requestId: id })
          return Response.json(
            {
              error: 'rate_limited',
              message: `You have targeted a lot of jobs in a short time. Please wait ${Math.ceil(limit.retryAfterSeconds / 60)} minutes and try again.`,
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
          advert?: unknown
          resume?: unknown
          processing?: unknown
          answers?: unknown
          progress?: unknown
        }

        const advert =
          typeof payload.advert === 'string' ? payload.advert.trim() : ''
        if (advert.length < MIN_ADVERT_CHARS) {
          return Response.json(
            {
              error: 'advert_too_short',
              message:
                'That is not quite enough of the advert to work with. Paste the part that lists what they are looking for.',
            },
            { status: 400 },
          )
        }
        if (advert.length > MAX_ADVERT_CHARS) {
          return Response.json(
            {
              error: 'advert_too_long',
              message:
                'That is longer than a job advert. Paste just the advert rather than the whole careers page.',
            },
            { status: 413 },
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
        const provider = mayUseProvider
          ? resolveProvider()
          : resolveLocalProvider()

        /**
         * No 503 when nothing is configured.
         *
         * Unlike rewriting, this feature has a real deterministic path: `readAdvertWithRules` finds the
         * requirements, and matching, scoring and tailoring never needed a model at all. Only the
         * tailored summary is lost. Refusing the whole request would throw away the working three
         * quarters of the feature to report the missing quarter.
         */
        /**
         * The narrated wait, same channel as ingestion (src/lib/progress.ts). Two stages, because the
         * request makes at most two model calls: reading the advert, then writing the aimed summary.
         */
        const progressId =
          typeof payload.progress === 'string' ? payload.progress : undefined
        const onProgress = progressReporter(progressId)

        onProgress('Reading what the advert asks for')
        const reading = await readAdvert({
          advert,
          useProvider: mayUseProvider,
          signal: request.signal,
        })

        const summary =
          provider === undefined
            ? {
                original: parsed.data.basics.summary ?? '',
                rationale: '',
                outcome: 'unavailable' as const,
              }
            : (onProgress('Writing a summary aimed at this job'),
              await tailorSummary({
                resume: parsed.data,
                requirements: reading.requirements,
                ...(reading.roleTitle === undefined
                  ? {}
                  : { roleTitle: reading.roleTitle }),
                useProvider: mayUseProvider,
                answers: Array.isArray(payload.answers)
                  ? payload.answers.filter(
                      (value): value is string => typeof value === 'string',
                    )
                  : undefined,
                signal: request.signal,
              }))

        /**
         * Counts only. `invented` is the number that matters operationally — a rising share means the
         * prompt or the model has drifted toward supplying requirements nobody asked for, and it is
         * invisible without this. The requirements themselves are never logged.
         */
        if (progressId !== undefined) progressEnd(progressId)

        event('target.done', {
          requestId: id,
          // `method`, not `source`: the field is already allowlisted in `log.ts` and already carries
          // exactly this vocabulary for `/api/ingest`. A second name for one concept would have needed
          // the allowlist widened for a generic word.
          method: reading.source,
          hardSkills: reading.requirements.hardSkills.length,
          softSkills: reading.requirements.softSkills.length,
          responsibilities: reading.requirements.responsibilities.length,
          invented: reading.invented.length,
          summaryOutcome: summary.outcome,
          ms: Date.now() - started,
        })

        return Response.json(
          {
            source: reading.source,
            ...(reading.roleTitle === undefined
              ? {}
              : { roleTitle: reading.roleTitle }),
            ...(reading.company === undefined
              ? {}
              : { company: reading.company }),
            requirements: reading.requirements,
            invented: reading.invented,
            summary,
          },
          { headers: { 'cache-control': 'no-store' } },
        )
      },
    },
  },
})
