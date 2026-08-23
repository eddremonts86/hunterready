/**
 * POST a Resume, get a document back. GET renders a fixture, so the preview has something to
 * show before ingestion exists (Blocks 6–9).
 *
 * `?template=` and `?theme=` are validated against the registries rather than trusted:
 * an unknown id falls back to the default instead of throwing, because a bad query string
 * should never cost a user their document.
 *
 * `?format=docx` returns Word instead of PDF — v0.6. It shares this route rather than taking its own
 * because the *request* is identical: the same resume, the same download semantics, the same rule that a
 * bad parameter degrades rather than fails. Only the encoder differs, and `template`/`theme` are
 * deliberately ignored for `.docx`: there is one ATS-safe Word layout and offering a choice of designs
 * in the format uploaded to the crudest portals would be selling a decision that cannot be honoured.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { designsUnlocked, entitlementFor } from '@/lib/entitlements'
import { errorEvent } from '@/lib/log'
import { DEFAULT_DESIGN_ID, findDesign, tierOf } from '@/render/designs'
import { Resume } from '@/schema/resume'
import { renderResume } from '@/render/render'
import { renderResumeHtml } from '@/render/html'
import { classifyRenderFailure } from '@/render/failure'
import { REGISTERED_FAMILIES } from '@/render/fonts'
import { normalizeHex } from '@/render/themes/custom'
import { docxFilename, renderDocx } from '@/render/docx/docx'
import { isThemeId } from '@/render/themes'
import type { ThemeId } from '@/render/themes'
import { isTemplateId } from '@/render/templates/registry'
import type { TemplateId } from '@/render/templates/registry'

/** Available until ingestion lands; then the preview posts the real edited resume. */
const FIXTURES = ['nurse-senior', 'sales-junior', 'switcher'] as const
type FixtureName = (typeof FIXTURES)[number]

function isFixtureName(value: string): value is FixtureName {
  return (FIXTURES as ReadonlyArray<string>).includes(value)
}

export function readSelection(url: URL): {
  templateId: TemplateId | undefined
  themeId: ThemeId | undefined
  fonts?: { body?: string; heading?: string }
  colours?: { accent?: string; paper?: string }
} {
  const template = url.searchParams.get('template')
  const theme = url.searchParams.get('theme')

  /*
    The chooser's axes, validated here rather than trusted.

    A family not in the bundle would draw nothing at all (ADR-022), and a colour below the floor is
    refused by `withColours` — but neither should depend on the interface having asked nicely. This
    endpoint is public and takes whatever a query string carries.
  */
  const body = url.searchParams.get('bodyFont')
  const heading = url.searchParams.get('headingFont')
  const known = (family: string | null) =>
    family !== null && REGISTERED_FAMILIES.includes(family) ? family : undefined
  const fonts =
    known(body) === undefined && known(heading) === undefined
      ? undefined
      : { body: known(body), heading: known(heading) }

  const accent = normalizeHex(url.searchParams.get('accent') ?? '')
  const paper = normalizeHex(url.searchParams.get('paper') ?? '')
  const colours =
    accent === undefined && paper === undefined ? undefined : { accent, paper }

  return {
    templateId:
      template !== null && isTemplateId(template) ? template : undefined,
    themeId: theme !== null && isThemeId(theme) ? theme : undefined,
    fonts,
    colours,
  }
}

/**
 * May this caller have this look — the design, and the typefaces and colours laid over it?
 *
 * **The gate lives here and not in the interface**, and that is the whole point of it. This endpoint is
 * public — it has to be, because an anonymous visitor is the commonest user and gets a PDF without an
 * account (ADR-004) — so a padlock drawn on a card in the gallery is decoration. Anybody who reads a query
 * string can ask for a paid pairing directly.
 *
 * `tierOf` fails closed on a pairing nobody catalogued, so a combination that renders perfectly and is
 * deliberately not offered is treated as paid rather than as an oversight. And the entitlement comes from
 * `entitlementFor`, which is the same function that decides whether a CV may be sent to a third-party
 * model — one place deciding what a plan buys, rather than two that can disagree.
 *
 * Returns the refusal to send, or `undefined` when the render may go ahead.
 */
export async function refuseUnlessEntitled(
  request: Request,
  selection: ReturnType<typeof readSelection>,
): Promise<Response | undefined> {
  const fallback = findDesign(DEFAULT_DESIGN_ID)
  const structure = selection.templateId ?? fallback?.structure
  const theme = selection.themeId ?? fallback?.theme
  if (structure === undefined || theme === undefined) return undefined

  /**
   * Two paid things now, gated together because they are the same purchase.
   *
   * "Make it yours" — a typeface and a colour of your own, mixed across designs — went out on the free
   * tier while the ninety-one designs it can imitate were behind a plan, which made the plan optional:
   * take a free layout, set the paid one's ink and face on it, and the gate had been walked around
   * through the front door. So the axes are checked here, at the same door, in the same breath.
   *
   * The default look is not a custom look. `fonts` and `colours` are undefined unless the caller asked
   * for something, so an untouched free design is untouched by this.
   */
  const custom =
    selection.fonts !== undefined || selection.colours !== undefined
  if (tierOf(structure, theme) === 'free' && !custom) return undefined

  // The developer switch (see entitlements.ts): a catalogue you cannot try is one you cannot test.
  if (designsUnlocked()) return undefined

  /*
    `paidDesigns`, never `thirdParty`. They were the same flag until ADR-030's suspension opened the
    model to everyone and handed all forty-eight paid designs away with it — through this exact line,
    which is the gate itself and not the padlock drawing.
  */
  const { paidDesigns, plan } = await entitlementFor(request)
  if (paidDesigns) return undefined

  /**
   * 402, not 403. "Payment required" is the accurate status for a thing that exists, works, and is not
   * included in this plan — and it is the one a client can act on by offering an upgrade rather than by
   * reporting an error. The message names what was refused so the interface never has to guess, and
   * carries no CV content (docs/07).
   *
   * The two refusals are told apart by their code, because they are answered differently: a locked
   * design has eleven free alternatives to point at, and a locked axis has none — the only honest reply
   * there is what the plan would add.
   */
  const locked = tierOf(structure, theme) !== 'free'
  errorEvent(locked ? 'render.design_locked' : 'render.axes_locked', {
    code: `${structure}|${theme}`,
  })
  return Response.json(
    {
      error: locked ? 'design_locked' : 'axes_locked',
      plan,
      message: locked
        ? 'That design is part of the paid plan. Every layout marked free renders exactly the same document, verified by the same test.'
        : 'Choosing your own typefaces and colours is part of the paid plan. Every included design renders the same document, verified by the same test.',
    },
    { status: 402 },
  )
}

export function pdfResponse(
  bytes: Uint8Array,
  filename: string,
  download: boolean,
) {
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
      // A CV is personal data; no intermediary should hold a copy (docs/07-privacy.md).
      'cache-control': 'no-store',
    },
  })
}

/**
 * Always an attachment, unlike the PDF.
 *
 * A browser cannot display a `.docx`, so `inline` means "download it anyway, with a worse filename" in
 * every browser that has been tried. Saying `attachment` outright is the honest header for a format
 * whose only destination is the disk.
 */
function docxResponse(bytes: Uint8Array, filename: string) {
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'content-type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  })
}

/** Unknown values fall back to PDF, for the same reason an unknown template does. */
/**
 * Which of the three files was asked for. Anything unrecognised is a PDF, which is the default the
 * whole product is built around and the safe answer to a query string somebody mistyped.
 */
type Format = 'pdf' | 'docx' | 'html'

function wantsFormat(url: URL): Format {
  const asked = url.searchParams.get('format')
  return asked === 'docx' || asked === 'html' ? asked : 'pdf'
}

/**
 * The HTML export is a whole document rather than a fragment, so it is served as one.
 *
 * `content-disposition: attachment` even though a browser could display it: the person pressed
 * Download, and a CV that opens in the current tab has replaced the workspace they were editing it in.
 * Same `no-store` as the other two — a CV is personal data and no intermediary should hold a copy.
 */
function htmlResponse(html: string, filename: string, download: boolean) {
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
      'cache-control': 'no-store, no-cache, must-revalidate, private',
    },
  })
}

export const Route = createFileRoute('/api/render')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const requested = url.searchParams.get('fixture') ?? 'nurse-senior'
        const name: FixtureName = isFixtureName(requested)
          ? requested
          : 'nurse-senior'

        const raw = await readFile(
          join(process.cwd(), 'fixtures/expected', `${name}.json`),
          'utf8',
        )
        const resume = Resume.parse(JSON.parse(raw))
        const selection = readSelection(url)

        /**
         * Gated on the way in, and the fixture route is gated too.
         *
         * It is a sample document rather than anybody's CV, which is exactly why it would be the way to
         * evaluate a paid design for free — render the nurse in every locked pairing and screenshot it.
         */
        const refusal = await refuseUnlessEntitled(request, selection)
        if (refusal !== undefined) return refusal

        const format = wantsFormat(url)
        if (format === 'docx') {
          return docxResponse(renderDocx(resume), docxFilename(resume))
        }
        if (format === 'html') {
          const page = await renderResumeHtml(resume, selection)
          return htmlResponse(
            page.html,
            page.filename,
            url.searchParams.get('download') === '1',
          )
        }

        const { bytes, filename } = await renderResume(resume, selection)

        return pdfResponse(
          bytes,
          filename,
          url.searchParams.get('download') === '1',
        )
      },

      POST: async ({ request }) => {
        const url = new URL(request.url)

        // Two shapes: JSON from fetch, or a form field from the download button (a form POST is
        // the only way to make the browser save a file without holding it in memory first).
        let body: unknown
        const contentType = request.headers.get('content-type') ?? ''
        if (contentType.includes('form')) {
          const form = await request.formData()
          const raw = form.get('resume')
          try {
            body = typeof raw === 'string' ? JSON.parse(raw) : undefined
          } catch {
            body = undefined
          }
        } else {
          body = await request.json()
        }

        const parsed = Resume.safeParse(body)

        if (!parsed.success) {
          /**
           * A sentence, and no `issues` array.
           *
           * The issues used to be returned verbatim. Nobody read them — the client had no way to show
           * anything, because a form POST navigated into the response — and a zod issue names the field
           * path it rejected and can quote what it received, which is CV content travelling in a
           * response body (docs/07). Now that the client *does* display `message`, the useful half is
           * the sentence and the risky half was never being used.
           */
          return Response.json(
            {
              error: 'invalid_resume',
              message:
                'That CV is missing something we need in order to lay it out. Go back a step and check the details we read.',
            },
            { status: 422 },
          )
        }

        const selection = readSelection(url)
        const refusal = await refuseUnlessEntitled(request, selection)
        if (refusal !== undefined) return refusal

        /**
         * The render is wrapped, and this is not defensive habit — it is the failure mode this project
         * has actually shipped. The Block 1 WASM bug (ADR-005) threw here in production, and an
         * unhandled throw becomes the framework's 500 page. That was survivable when nothing depended
         * on the shape of the failure; it stopped being survivable the moment the client started
         * showing the message, and it was never survivable while the download was a form POST, because
         * the browser navigated to the error and the person lost every correction they had made.
         *
         * The `message` is a sentence, not a stack. `renderResume` failures name fonts, glyphs and file
         * paths, and a CV's own text can reach the exception — docs/07 forbids CV content in any
         * response, log or error.
         */
        try {
          const format = wantsFormat(url)
          if (format === 'docx') {
            return docxResponse(
              renderDocx(parsed.data),
              docxFilename(parsed.data),
            )
          }
          if (format === 'html') {
            const page = await renderResumeHtml(parsed.data, selection)
            return htmlResponse(page.html, page.filename, true)
          }

          const { bytes, filename } = await renderResume(parsed.data, selection)
          return pdfResponse(
            bytes,
            filename,
            url.searchParams.get('download') === '1',
          )
        } catch (error) {
          /**
           * A code from a closed list, never the message. `renderResume` failures quote the text they
           * could not lay out, which means the message can carry a line of somebody's CV straight into
           * the log — the one thing docs/07 forbids without exception.
           *
           * It used to log `error.constructor.name`, which was the same instinct and did not work:
           * takumi throws a plain `Error`, so a CV in a script we have not bundled and a genuine
           * renderer bug both arrived as `code: "Error"`. `classifyRenderFailure` is the bounded
           * vocabulary that actually distinguishes them, and it also decides the sentence — because a
           * missing glyph is permanent, and "please try again" sent somebody back to press the same
           * button forever while two other downloads would have worked.
           */
          const failure = classifyRenderFailure(error)
          errorEvent('render.failed', {
            format: wantsFormat(url),
            code: failure.code,
          })
          return Response.json(
            { error: 'render_failed', message: failure.message },
            /*
              422 for a refusal the request cannot talk us out of, 500 only for something that might
              genuinely be us. Not cosmetic: the Dockerfile's health check and whatever watches 5xx
              should not be woken by a CV written in Hebrew.
            */
            { status: failure.retryable ? 500 : 422 },
          )
        }
      },
    },
  },
})
