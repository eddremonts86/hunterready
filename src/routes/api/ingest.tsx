/**
 * POST a CV file, get back a structured `Resume` with per-field confidence.
 *
 * The whole ingestion pipeline behind one endpoint: detect → adapter → normalize → extract →
 * heuristics. Nothing is written to disk and nothing is stored: the response goes to the browser
 * and the server forgets it (docs/07-privacy.md, ADR-004).
 *
 * Logging emits counts and codes only — never a field value, never a filename. See `lib/log.ts`.
 */
import { createFileRoute } from '@tanstack/react-router'
import { ingest, MAX_BYTES } from '@/ingest'
import { extractResume } from '@/structure/extract'
import { resolveLocalProvider, resolveProvider } from '@/structure/provider'
import { sanityWarnings } from '@/structure/sanity'
import { checkRateLimit, clientKey } from '@/lib/rate-limit'
import { progressEnd, progressReporter } from '@/lib/progress'
import { errorEvent, event, requestId } from '@/lib/log'
import { mayUseThirdParty } from '@/lib/entitlements'

export const Route = createFileRoute('/api/ingest')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const id = requestId()
        const started = Date.now()

        const limit = checkRateLimit(clientKey(request))
        if (!limit.allowed) {
          event('ingest.rate_limited', { requestId: id })
          return Response.json(
            {
              error: 'rate_limited',
              message: `You have uploaded a lot of files in a short time. Please wait ${Math.ceil(limit.retryAfterSeconds / 60)} minutes and try again.`,
            },
            {
              status: 429,
              headers: { 'retry-after': String(limit.retryAfterSeconds) },
            },
          )
        }

        // Reject on the declared length before reading the body into memory.
        const declared = Number(request.headers.get('content-length') ?? '0')
        if (declared > MAX_BYTES * 1.1) {
          event('ingest.too_large_header', { requestId: id, bytes: declared })
          return Response.json(
            {
              error: 'too_large',
              message: 'That file is over the 10 MB limit.',
            },
            { status: 413 },
          )
        }

        let bytes: Uint8Array
        let filename = ''
        /**
         * Whether the user agreed to their CV being sent to the model provider.
         *
         * Defaults to **false**, and that direction is deliberate: a malformed request, an older
         * client or a missing field must not be read as consent. The cost of getting it wrong this
         * way is a slightly worse extraction; the cost of the other way is a transfer nobody agreed
         * to (docs/07-privacy.md).
         */
        let mayUseProvider = false
        /**
         * The live-progress channel (src/lib/progress.ts). The id is minted by the client and travels
         * with the upload; everything reported against it is stage labels and counts, never content.
         */
        let progressId: string | undefined
        try {
          const form = await request.formData()
          const claimed = form.get('progress')
          if (typeof claimed === 'string' && claimed !== '')
            progressId = claimed
          /**
           * Consent **and** a paid plan (ADR-023). Local otherwise, for everybody.
           *
           * The form field is the client's answer to the consent gate and is one half of an `&&` whose
           * other half the client cannot influence. An anonymous visitor has no plan, so nothing they
           * upload leaves the server — which makes the statelessness promise and the transfer promise
           * the same promise for the commonest kind of visitor.
           */
          mayUseProvider = await mayUseThirdParty(
            request,
            form.get('processing') === 'provider',
          )
          const file = form.get('file')
          if (!(file instanceof File)) {
            return Response.json(
              {
                error: 'no_file',
                message: 'No file arrived. Please choose a file and try again.',
              },
              { status: 400 },
            )
          }
          filename = file.name
          bytes = new Uint8Array(await file.arrayBuffer())
        } catch {
          return Response.json(
            {
              error: 'bad_request',
              message: 'That upload did not arrive intact. Please try again.',
            },
            { status: 400 },
          )
        }

        const onProgress = progressReporter(progressId)
        onProgress('Receiving the file')
        const ingested = await ingest(bytes, filename, onProgress)
        if (!ingested.ok) {
          if (progressId !== undefined) progressEnd(progressId)
          // The code is a metric; the message is for the person. Neither contains file content.
          event('ingest.rejected', {
            requestId: id,
            code: ingested.code,
            bytes: bytes.length,
            ms: Date.now() - started,
          })
          return Response.json(
            { error: ingested.code, message: ingested.message },
            { status: 422 },
          )
        }

        event('ingest.parsed', {
          requestId: id,
          format: ingested.format,
          bytes: bytes.length,
          pages: ingested.pageCount,
          chars: ingested.normalized.text.length,
          columns: Math.max(...ingested.normalized.columnsPerPage, 1),
          warnings: ingested.warnings.length,
        })

        const extracted = await extractResume(ingested.normalized.text, {
          useProvider: mayUseProvider,
          onProgress,
        })
        if (!extracted.ok) {
          if (progressId !== undefined) progressEnd(progressId)
          errorEvent('ingest.extract_failed', {
            requestId: id,
            code: extracted.code,
          })
          return Response.json(
            { error: extracted.code, message: extracted.message },
            { status: 502 },
          )
        }

        /**
         * `method: 'rules'` while a provider was configured *and* allowed usually means the call
         * failed — the metric that catches a silent outage, since the user still got a CV and nothing
         * else would show it.
         *
         * Two exclusions, both of which are the system working rather than breaking, and both found by
         * watching this fire in production on the first real deploy:
         *
         *  • The user **declined** the transfer (`mayUseProvider`).
         *  • The model answered and the deterministic path simply **recovered more** of the document,
         *    so `extractResume` shipped the better result (`+rules-outperformed`). That is the
         *    comparison working exactly as designed, and counting it as an outage would train whoever
         *    reads this metric to ignore it.
         *
         * A metric that cries wolf is worse than no metric, because it gets muted and then the real
         * outage arrives unannounced.
         */
        const providerConfigured = resolveProvider() !== undefined
        const chosenOverModel = extracted.promptVersion.endsWith(
          '+rules-outperformed',
        )
        if (
          providerConfigured &&
          mayUseProvider &&
          extracted.method === 'rules' &&
          !chosenOverModel
        ) {
          errorEvent('ingest.provider_degraded', {
            requestId: id,
            method: extracted.method,
          })
        }

        /**
         * The same alarm for the **local** model, which ADR-023 made everybody's default.
         *
         * Before that change the local path was the exception, taken by people who declined a
         * transfer, and its failure showed up as one person getting a worse read. Now it is the path
         * almost every CV takes, so a broken or unpulled model silently drops the entire product to
         * regular expressions — with the user still receiving a plausible CV and nothing anywhere
         * saying why it got worse. The metric that existed for the third party is worth strictly more
         * here.
         */
        if (
          !mayUseProvider &&
          resolveLocalProvider() !== undefined &&
          extracted.method === 'rules' &&
          !chosenOverModel
        ) {
          errorEvent('ingest.local_degraded', {
            requestId: id,
            method: extracted.method,
          })
        }

        // Cross-field checks: individually plausible values that are jointly impossible, e.g. two
        // roles both open-ended, which would print as two "Present" jobs.
        onProgress('Checking nothing was invented')
        const sanity = sanityWarnings(extracted.resume)
        if (progressId !== undefined) progressEnd(progressId)

        event('ingest.extracted', {
          requestId: id,
          method: extracted.method,
          repairs: extracted.repairs,
          promptVersion: extracted.promptVersion,
          workItems: extracted.resume.work.length,
          provenance: extracted.provenance.length,
          lowConfidence: extracted.provenance.filter((p) => p.confidence < 0.7)
            .length,
          ms: Date.now() - started,
        })

        return Response.json(
          {
            resume: extracted.resume,
            provenance: extracted.provenance,
            warnings: [...ingested.warnings, ...sanity],
            method: extracted.method,
            format: ingested.format,
            // The text came off an image. The review step raises its guidance from "check the
            // uncertain fields" to "check every field", because OCR gets wrong the things a text
            // layer cannot: a name's spelling, a digit in a date, a licence number.
            ocr: ingested.ocr,
          },
          { headers: { 'cache-control': 'no-store' } },
        )
      },
    },
  },
})
