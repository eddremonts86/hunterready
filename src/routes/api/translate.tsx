/**
 * POST a resume and a target language, get the document translated — or a block of text, for the letter.
 *
 * The owner-moved line from v0.8 (see src/optimize/translate.ts): translation on demand, inside guards.
 * Everything here mirrors the other model endpoints: consent decides which model may read the document
 * (ADR-023 — local unless paid AND consented), its own rate bucket, live progress through the same
 * content-free store, and no CV content in any log line (docs/07).
 */
import { createFileRoute } from '@tanstack/react-router'
import { Resume } from '@/schema/resume'
import { translateResume } from '@/optimize/translate'
import { isOutputLocale } from '@/render/locale'
import { resolveLocalProvider, resolveProvider } from '@/structure/provider'
import { checkRateLimit, clientKey } from '@/lib/rate-limit'
import { event, requestId } from '@/lib/log'
import { mayUseThirdParty } from '@/lib/entitlements'
import { consentedToTransfer } from '@/lib/chosen-provider'
import { progressEnd, progressReporter } from '@/lib/progress'

export const Route = createFileRoute('/api/translate')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const id = requestId()
        const started = Date.now()

        // Its own bucket: a translation is a handful of model calls, and it must not spend the
        // ingest budget of somebody who is about to re-upload.
        const limit = checkRateLimit(`translate:${clientKey(request)}`, 20)
        if (!limit.allowed) {
          event('translate.rate_limited', { requestId: id })
          return Response.json(
            {
              error: 'rate_limited',
              message: `You have asked for a lot of translations in a short time. Please wait ${Math.ceil(limit.retryAfterSeconds / 60)} minutes and try again.`,
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
          text?: unknown
          target?: unknown
          processing?: unknown
          progress?: unknown
        }

        if (
          typeof payload.target !== 'string' ||
          !isOutputLocale(payload.target)
        ) {
          return Response.json(
            {
              error: 'bad_target',
              message: 'That is not a language this product writes.',
            },
            { status: 400 },
          )
        }

        const mayUseProvider = await mayUseThirdParty(
          request,
          consentedToTransfer(payload.processing),
        )
        const provider = mayUseProvider
          ? resolveProvider()
          : resolveLocalProvider()
        if (provider === undefined) {
          return Response.json(
            {
              error: 'no_provider',
              message:
                'No model is available to translate right now. Headings and dates changed; your own words did not.',
            },
            { status: 503 },
          )
        }

        const progressId =
          typeof payload.progress === 'string' ? payload.progress : undefined
        const onProgress = progressReporter(progressId)

        /**
         * Text mode: one block, for the cover letter. The same guards apply — a letter whose numbers
         * changed in translation is worse than a letter in the wrong language.
         */
        if (typeof payload.text === 'string' && payload.text.trim() !== '') {
          const wrapped = Resume.parse({
            schemaVersion: '1.0',
            basics: { fullName: 'x', summary: payload.text.slice(0, 8000) },
            work: [],
            education: [],
            skills: [],
            projects: [],
            certifications: [],
            languages: [],
            custom: [],
          })
          const result = await translateResume({
            resume: wrapped,
            target: payload.target,
            provider,
            onProgress,
            signal: request.signal,
          })
          if (progressId !== undefined) progressEnd(progressId)
          event('translate.text_done', {
            requestId: id,
            target: payload.target,
            translated: result.translated,
            kept: result.kept,
            ms: Date.now() - started,
          })
          return Response.json(
            {
              text: result.resume.basics.summary ?? payload.text,
              kept: result.kept,
            },
            { headers: { 'cache-control': 'no-store' } },
          )
        }

        const parsed = Resume.safeParse(payload.resume)
        if (!parsed.success) {
          return Response.json(
            {
              error: 'bad_resume',
              message: 'That CV did not arrive in a shape we can translate.',
            },
            { status: 400 },
          )
        }

        const result = await translateResume({
          resume: parsed.data,
          target: payload.target,
          provider,
          onProgress,
          signal: request.signal,
        })
        if (progressId !== undefined) progressEnd(progressId)

        // Counts only — never a field, never a translation (docs/07).
        event('translate.done', {
          requestId: id,
          target: payload.target,
          translated: result.translated,
          kept: result.kept,
          ms: Date.now() - started,
        })

        return Response.json(
          {
            resume: result.resume,
            translated: result.translated,
            kept: result.kept,
          },
          { headers: { 'cache-control': 'no-store' } },
        )
      },
    },
  },
})
