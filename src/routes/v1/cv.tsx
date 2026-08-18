/**
 * `POST /v1/cv` — a file in, a `Resume` out.
 *
 * The one endpoint that matters, because everything else in this product operates on a `Resume` and
 * this is the only thing that makes one. A partner that can call this and `/v1/render` has the whole
 * pipeline: read a document, correct it in their own interface, get a parse-checked PDF back.
 *
 * ## Consent, per request (ADR-032)
 *
 * With no `X-HunterReady-Consent` header the CV is read on our own hardware and does not leave. With
 * one naming a company, and only if the key's plan allows it, the larger model reads it. The header
 * goes through `consentOn` and `providerIdFrom` — the same two functions the browser's field goes
 * through — because that module exists precisely to stop this rule being copied a sixth time.
 *
 * The response says which path ran, in `method`. A caller that asserted consent and got `local` back
 * knows the plan did not allow it, without being told anything about somebody's account.
 */
import { createFileRoute } from '@tanstack/react-router'

import { enterV1 } from '@/lib/v1'

import { ingest } from '@/ingest'
import { extractResume } from '@/structure/extract'
import {
  consentOn,
  consentedToTransfer,
  providerIdFrom,
} from '@/lib/chosen-provider'
import { mayUseThirdParty } from '@/lib/entitlements'
import { errorEvent, event } from '@/lib/log'

/** The same ceiling the browser upload has. A partner is not a reason to accept a 40 MB scan. */
const MAX_BYTES = 10 * 1024 * 1024

export const Route = createFileRoute('/v1/cv')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const entry = await enterV1(request, 'cv')
        if ('refusal' in entry) return entry.refusal
        const { id } = entry.ok

        let file: File | undefined
        let asked: unknown
        try {
          const form = await request.formData()
          const candidate = form.get('file')
          file = candidate instanceof File ? candidate : undefined
          // Body first, header second — the same precedence the browser path uses.
          asked = consentOn(request, form.get('processing'))
        } catch {
          file = undefined
          asked = consentOn(request, null)
        }

        if (file === undefined) {
          return Response.json(
            {
              error: 'no_file',
              message:
                'Send the document as multipart/form-data under the field "file".',
              requestId: id,
            },
            { status: 400, headers: { 'x-request-id': id } },
          )
        }

        const bytes = new Uint8Array(await file.arrayBuffer())
        if (bytes.length > MAX_BYTES) {
          event('v1.cv.too_large', { requestId: id, bytes: bytes.length })
          return Response.json(
            {
              error: 'too_large',
              message: 'That file is over the 10 MB limit.',
              requestId: id,
            },
            { status: 413, headers: { 'x-request-id': id } },
          )
        }

        const read = await ingest(bytes, file.name)
        if (!read.ok) {
          // `code` is a metric, `message` is for a developer. Neither carries file content.
          event('v1.cv.rejected', { requestId: id, code: read.code })
          return Response.json(
            { error: read.code, message: read.message, requestId: id },
            { status: 415, headers: { 'x-request-id': id } },
          )
        }

        const mayUseProvider = await mayUseThirdParty(
          request,
          consentedToTransfer(asked),
        )
        const chosen = providerIdFrom(asked)

        const extracted = await extractResume(read.normalized.text, {
          useProvider: mayUseProvider,
          ...(chosen === undefined ? {} : { providerId: chosen }),
        })

        if (!extracted.ok) {
          errorEvent('v1.cv.extract_failed', {
            requestId: id,
            code: extracted.code,
          })
          return Response.json(
            {
              error: extracted.code,
              message: extracted.message,
              requestId: id,
            },
            { status: 502, headers: { 'x-request-id': id } },
          )
        }

        event('v1.cv.ok', {
          requestId: id,
          method: extracted.method,
          format: read.format,
          bytes: bytes.length,
          // Counts, never content. See `no-cv-in-logs.test.ts`, which scans for the difference.
          workItems: extracted.resume.work.length,
          provenance: extracted.provenance.length,
        })

        return Response.json(
          {
            resume: extracted.resume,
            /** Where each field came from, so a partner can show the same "check this" the app does. */
            provenance: extracted.provenance,
            /**
             * `llm` third party, `local` our hardware, `rules` the deterministic floor. A caller that
             * asserted consent and reads `local` knows the plan did not allow it.
             */
            method: extracted.method,
            /** True when the document was read by OCR, which is when to double-check the result. */
            scanned: read.warnings.includes('ocr'),
            requestId: id,
          },
          { headers: { 'x-request-id': id, 'cache-control': 'no-store' } },
        )
      },
    },
  },
})
