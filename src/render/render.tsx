/**
 * The single entry point for turning a Resume into PDF bytes.
 *
 * Everything upstream of here — ingestion, the review form, the optimizer — only ever
 * produces a `Resume`. Everything downstream is presentation. That boundary is what lets a
 * new template be a contained piece of work (ADR-001).
 *
 * ⚠️ Server-only. `takumi-pdf` is a WASM module, imported lazily so it never enters the
 * client bundle, and its binary must be copied into the build output — see
 * `scripts/copy-wasm.mjs` and the Block 1 finding in ADR-005.
 */
import type { Resume } from '@/schema/resume'
import { documentFilename } from './filename'
import { loadThemeFonts } from './fonts'
import { DEFAULT_THEME_ID, getTheme } from './themes'
import type { ThemeId } from './themes'
import { DEFAULT_TEMPLATE_ID, getTemplate } from './templates/registry'
import type { TemplateId } from './templates/registry'

export interface RenderOptions {
  templateId?: TemplateId
  themeId?: ThemeId
}

export interface RenderResult {
  bytes: Uint8Array
  filename: string
}

/**
 * `"Marta Sørensen"` → `"Marta-Sorensen-CV.pdf"`.
 *
 * Which is what this always claimed and did not do. It stripped combining marks only, so `ø` — a
 * character with no NFD decomposition — fell through to the non-ASCII replacement and produced
 * `Marta-S-rensen-CV.pdf`, while the `.docx` button a centimetre away got the same name right. The bug
 * was invisible because the filename lived in a response header nothing in the codebase read: the
 * browser took it straight off the wire. Reading that header on the client is what surfaced it.
 *
 * `render/filename.ts` is now the one implementation for both, which is what stops them diverging again.
 */
export function suggestFilename(resume: Resume): string {
  return documentFilename(resume.basics.fullName, 'pdf')
}

export async function renderResume(
  resume: Resume,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const { render } = await import('takumi-pdf')

  const theme = getTheme(options.themeId ?? DEFAULT_THEME_ID)
  const { Component } = getTemplate(options.templateId ?? DEFAULT_TEMPLATE_ID)
  const { page } = theme.spacing

  const bytes = await render(<Component resume={resume} theme={theme} />, {
    size: theme.page.size === 'A4' ? 'a4' : 'letter',
    landscape: theme.page.orientation === 'landscape',
    margin: {
      top: page.marginTop,
      right: page.marginRight,
      bottom: page.marginBottom,
      left: page.marginLeft,
    },
    fonts: await loadThemeFonts(theme),
    // Recruiters see the title in their PDF viewer's tab, and parsers read the info dict.
    metadata: {
      title: `${resume.basics.fullName}${
        resume.basics.headline === undefined
          ? ''
          : ` — ${resume.basics.headline}`
      }`,
      authors: [resume.basics.fullName],
      creator: 'HunterReady',
    },
    footer: (
      <div
        style={{
          display: 'flex',
          width: '100%',
          justifyContent: 'flex-end',
          fontFamily: theme.typography.body.fontFamily,
          fontSize: 8,
          color: theme.colors.mutedForeground,
        }}
      >
        <span className="pageNumber" />
        <span>/</span>
        <span className="totalPages" />
      </div>
    ),
  })

  return { bytes, filename: suggestFilename(resume) }
}
