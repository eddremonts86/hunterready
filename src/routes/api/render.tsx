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
import { Resume } from '@/schema/resume'
import { renderResume } from '@/render/render'
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

function readSelection(url: URL): {
  templateId: TemplateId | undefined
  themeId: ThemeId | undefined
} {
  const template = url.searchParams.get('template')
  const theme = url.searchParams.get('theme')
  return {
    templateId:
      template !== null && isTemplateId(template) ? template : undefined,
    themeId: theme !== null && isThemeId(theme) ? theme : undefined,
  }
}

function pdfResponse(bytes: Uint8Array, filename: string, download: boolean) {
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
function wantsDocx(url: URL): boolean {
  return url.searchParams.get('format') === 'docx'
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

        if (wantsDocx(url)) {
          return docxResponse(renderDocx(resume), docxFilename(resume))
        }

        const { bytes, filename } = await renderResume(
          resume,
          readSelection(url),
        )

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
          return Response.json(
            { error: 'invalid_resume', issues: parsed.error.issues },
            { status: 422 },
          )
        }

        if (wantsDocx(url)) {
          return docxResponse(
            renderDocx(parsed.data),
            docxFilename(parsed.data),
          )
        }

        const { bytes, filename } = await renderResume(
          parsed.data,
          readSelection(url),
        )
        return pdfResponse(
          bytes,
          filename,
          url.searchParams.get('download') === '1',
        )
      },
    },
  },
})
