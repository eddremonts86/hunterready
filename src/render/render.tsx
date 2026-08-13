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

/** `"Marta Sørensen"` → `"Marta-Sorensen-CV.pdf"`. */
export function suggestFilename(resume: Resume): string {
  const base = resume.basics.fullName
    .normalize('NFD')
    // Strip combining marks so the filename survives every filesystem and mail client:
    // "Marta Sørensen" → "Marta-Sorensen". Fixture names exercise ø, å and é.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${base === '' ? 'CV' : base}-CV.pdf`
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
