/**
 * POST a CV file, get back a structured `Resume` with per-field confidence.
 *
 * The whole ingestion pipeline behind one endpoint: detect → adapter → normalize → extract →
 * heuristics. Nothing is written to disk and nothing is stored: the response goes to the browser
 * and the server forgets it (docs/07-privacy.md, ADR-004).
 *
 * Logging emits counts and codes only — never a field value, never a filename. See `lib/log.ts`.
 *
 * ## Two shapes, and the second one is why the local model is usable
 *
 * By default this answers with the `Resume`, which is what every existing caller expects.
 *
 * Sending `detach: 'true'` in the form makes it answer `{ jobId }` in milliseconds and leave the
 * result in `job-result.ts` for `GET /api/result?id=` to collect. **Measured against production on
 * 2026-08-19: 57s for an ingest on the local model**, and up to 100s for the advert read on the same
 * box. A `fetch` held open that long is a request every proxy and mobile network between a phone and
 * this server is entitled to cut, and when one does the person loses a CV that was already read.
 *
 * This is the path a first-time visitor meets, so it is the one that decides whether the local model
 * is a real free tier or a spinner. ADR-030 turned the third-party model on for everybody because
 * this request blocked; plan 04 turns it back off because it no longer does.
 *
 * The job id is the client's existing `progress` id — already minted, already sent, already polled
 * for the narration — so the detached shape needs no new handle and nothing new to correlate.
 */
import { createFileRoute } from '@tanstack/react-router'
import { ingest, MAX_BYTES } from '@/ingest'
import { extractResume } from '@/structure/extract'
import { resolveLocalProvider, resolveProvider } from '@/structure/provider'
import { sanityWarnings } from '@/structure/sanity'
import { checkRateLimit, clientKey } from '@/lib/rate-limit'
import { progressEnd, progressNoter, progressReporter } from '@/lib/progress'
import { fail, finish } from '@/lib/job-result'
import { errorEvent, event, requestId } from '@/lib/log'
import { mayUseThirdParty } from '@/lib/entitlements'
import {
  consentedToTransfer,
  consentOn,
  providerIdFrom,
} from '@/lib/chosen-provider'

/**
 * What `run()` below hands back: the answer, or a failure that already knows how to be rendered.
 *
 * A shape rather than a thrown error, so the same failure can become an HTTP response now or a
 * stored result collected a minute from now, without either shape restating the other's sentences.
 */
type Outcome =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; status: number; error: string; message: string }

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
        /** The company the person named, when they named one. See the comment where it is read. */
        let chosenProvider: string | undefined
        /**
         * The live-progress channel (src/lib/progress.ts). The id is minted by the client and travels
         * with the upload; everything reported against it is stage labels and counts, never content.
         */
        let progressId: string | undefined
        /**
         * Whether the caller wants the id rather than the answer. See the note on the module.
         *
         * A form field carries strings, so this is the literal `'true'` and nothing else is consent
         * to detach — the same direction every other flag in this handler falls when a request is
         * malformed or comes from an older client.
         */
        let detached = false
        try {
          const form = await request.formData()
          const claimed = form.get('progress')
          if (typeof claimed === 'string' && claimed !== '')
            progressId = claimed
          detached = form.get('detach') === 'true'
          /**
           * Consent **and** a paid plan (ADR-023). Local otherwise, for everybody.
           *
           * The form field is the client's answer to the consent gate and is one half of an `&&` whose
           * other half the client cannot influence. An anonymous visitor has no plan, so nothing they
           * upload leaves the server — which makes the statelessness promise and the transfer promise
           * the same promise for the commonest kind of visitor.
           */
          /*
            `processing` carries the id of the company the person picked — `minimax`, `deepseek` — or
            `local`, or nothing at all from a client that predates the choice. Anything that is not a
            known id is not consent: `providerById` returns undefined for it and extraction stays on
            this machine, which is the direction a malformed request must always fall.
          */
          // Body first, header second: a browser's field is a person's click; the header is a
          // machine asserting on their behalf (ADR-032). Both end up in the same two functions.
          const asked = consentOn(request, form.get('processing'))
          chosenProvider = providerIdFrom(asked)
          mayUseProvider = await mayUseThirdParty(
            request,
            consentedToTransfer(asked),
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

        /**
         * What the request came for, in a function, so it can be awaited or let go of.
         *
         * Nothing inside it changed. Pulling it out is what lets one handler serve both shapes
         * without a second copy of the pipeline, the two degradation alarms and the sanity pass —
         * which would be two places for the no-fabrication guarantee to hold or fail, and only one
         * of them would be the one anybody tests.
         *
         * It **returns** its failures rather than throwing them. Both mid-pipeline failures already
         * carry a status, a code and a sentence written for a person, and both shapes need all
         * three: the synchronous one renders them into a response, the detached one hands them to
         * `job-result.ts` for `/api/result` to render later. A thrown error would keep the first and
         * lose the other two, and the person would read "something went wrong" instead of "that PDF
         * is a scan we could not read".
         */
        const run = async (): Promise<Outcome> => {
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
            return {
              ok: false,
              status: 422,
              error: ingested.code,
              message: ingested.message,
            }
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
            ...(chosenProvider === undefined
              ? {}
              : { providerId: chosenProvider }),
            onProgress,
            // The long stage narrating itself: which section of the answer the model is writing, as
            // it streams. Keys and counts — see `src/structure/narrate.ts` for why it can never be
            // more.
            onNote: progressNoter(progressId),
          })
          if (!extracted.ok) {
            if (progressId !== undefined) progressEnd(progressId)
            errorEvent('ingest.extract_failed', {
              requestId: id,
              code: extracted.code,
            })
            return {
              ok: false,
              status: 502,
              error: extracted.code,
              message: extracted.message,
            }
          }

          /**
           * `method: 'rules'` while a provider was configured *and* allowed usually means the call
           * failed — the metric that catches a silent outage, since the user still got a CV and
           * nothing else would show it.
           *
           * Two exclusions, both of which are the system working rather than breaking, and both
           * found by watching this fire in production on the first real deploy:
           *
           *  • The user **declined** the transfer (`mayUseProvider`).
           *  • The model answered and the deterministic path simply **recovered more** of the
           *    document, so `extractResume` shipped the better result (`+rules-outperformed`). That
           *    is the comparison working exactly as designed, and counting it as an outage would
           *    train whoever reads this metric to ignore it.
           *
           * A metric that cries wolf is worse than no metric, because it gets muted and then the
           * real outage arrives unannounced.
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
           * transfer, and its failure showed up as one person getting a worse read. Now it is the
           * path almost every CV takes, so a broken or unpulled model silently drops the entire
           * product to regular expressions — with the user still receiving a plausible CV and
           * nothing anywhere saying why it got worse. The metric that existed for the third party is
           * worth strictly more here.
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
            lowConfidence: extracted.provenance.filter(
              (p) => p.confidence < 0.7,
            ).length,
            ms: Date.now() - started,
          })

          return {
            ok: true,
            value: {
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
          }
        }

        /**
         * Detached: answer with the id and leave the CV for `/api/result`.
         *
         * Only when the client sent a progress id, because without one there is nowhere to put the
         * answer and nothing to poll. A caller that asks to detach without an id gets the
         * synchronous shape, which is slow rather than broken — the safe direction for a mistake in
         * a request.
         *
         * `void` on purpose: the promise outlives this response, which is the whole point. Nothing
         * in the pipeline is bound to `request.signal`, so the work is not cancelled when the
         * connection for this 202 closes a moment from now.
         *
         * The `catch` is not decoration. Without it an unexpected throw would leave a job id that
         * never resolves, and the page would poll it for four minutes before giving up — the worst
         * of both shapes. A failure is a result too.
         */
        if (detached && progressId !== undefined) {
          const jobId = progressId
          void run()
            .then((outcome) => {
              if (outcome.ok) finish(jobId, outcome.value)
              else fail(jobId, outcome.status, outcome.error, outcome.message)
            })
            .catch((error: unknown) => {
              errorEvent('ingest.detached_failed', {
                requestId: id,
                code: error instanceof Error ? error.name : 'unknown',
              })
              progressEnd(jobId)
              fail(
                jobId,
                500,
                'ingest_failed',
                'Something went wrong reading that file. Please try again.',
              )
            })
          // 202: accepted, not done. The id is the one the client already generated.
          return Response.json({ jobId }, { status: 202 })
        }

        const outcome = await run()
        if (!outcome.ok) {
          return Response.json(
            { error: outcome.error, message: outcome.message },
            { status: outcome.status },
          )
        }

        return Response.json(outcome.value, {
          headers: { 'cache-control': 'no-store' },
        })
      },
    },
  },
})
