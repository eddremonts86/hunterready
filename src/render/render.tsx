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
import { styleOf } from './themes/style'
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
  const { render, measure } = await import('takumi-pdf')

  const theme = getTheme(options.themeId ?? DEFAULT_THEME_ID)
  const { Component } = getTemplate(options.templateId ?? DEFAULT_TEMPLATE_ID)
  const { page } = theme.spacing
  const style = styleOf(theme)
  const fonts = await loadThemeFonts(theme)
  const pageHeight = theme.page.size === 'A4' ? 1123 : 1056

  const metadata = {
    // Recruiters see the title in their PDF viewer's tab, and parsers read the info dict.
    title: `${resume.basics.fullName}${
      resume.basics.headline === undefined ? '' : ` — ${resume.basics.headline}`
    }`,
    authors: [resume.basics.fullName],
    creator: 'HunterReady',
  }

  const counter = (color: string) => (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: style.paper === undefined ? undefined : page.marginBottom,
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingRight: style.paper === undefined ? 0 : page.marginRight,
        backgroundColor: style.paper,
        fontFamily: theme.typography.body.fontFamily,
        fontSize: 8,
        color,
      }}
    >
      <span className="pageNumber" />
      <span>/</span>
      <span className="totalPages" />
    </div>
  )

  /**
   * White paper: the ordinary path. takumi owns the margins, the footer band carries the counter.
   */
  if (style.paper === undefined) {
    const bytes = await render(<Component resume={resume} theme={theme} />, {
      size: theme.page.size === 'A4' ? 'a4' : 'letter',
      landscape: theme.page.orientation === 'landscape',
      margin: {
        top: page.marginTop,
        right: page.marginRight,
        bottom: page.marginBottom,
        left: page.marginLeft,
      },
      fonts,
      metadata,
      footer: counter(theme.colors.mutedForeground),
    })
    return { bytes, filename: suggestFilename(resume) }
  }

  /**
   * Tinted paper — the bleed construction (ADR-025).
   *
   * takumi has no page-background option and its margins are unpainted page, so a theme whose paper is
   * a color has to build the page out of three tinted pieces:
   *
   *   1. zero side margins, with the horizontal margins moved into the content box as padding — the
   *      tint then reaches the left and right edges of every page;
   *   2. tinted header and footer bands exactly filling the vertical margins, repeated per page by the
   *      renderer — the tint reaches the top and bottom edges, and continuation pages keep their
   *      breathing room (real margins, not painted fakes);
   *   3. the content box grown to a whole number of usable pages, measured first — without this the
   *      last page's tint stops where the content stops and the sheet ends in a white strip, which
   *      reads as a printing error. Two pixels are shaved so a box landing exactly on the boundary
   *      cannot spill a zero-height slice onto a phantom extra page (the probe produced exactly that).
   *
   * The text layer is untouched by any of it: bands and grounds are painted boxes with no glyphs.
   */
  const usable = pageHeight - page.marginTop - page.marginBottom
  const content = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: style.paper,
        paddingLeft: page.marginLeft,
        paddingRight: page.marginRight,
      }}
    >
      <Component resume={resume} theme={theme} />
    </div>
  )

  const { height } = await measure(content, {
    size: theme.page.size === 'A4' ? 'a4' : 'letter',
    fonts,
  })
  const pages = Math.max(1, Math.ceil((height + 2) / usable))

  const band = (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: page.marginTop,
        backgroundColor: style.paper,
      }}
    />
  )

  const bytes = await render(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: style.paper,
        paddingLeft: page.marginLeft,
        paddingRight: page.marginRight,
        height: pages * usable - 2,
      }}
    >
      <Component resume={resume} theme={theme} />
    </div>,
    {
      size: theme.page.size === 'A4' ? 'a4' : 'letter',
      landscape: theme.page.orientation === 'landscape',
      margin: {
        top: page.marginTop,
        bottom: page.marginBottom,
        left: 0,
        right: 0,
      },
      fonts,
      metadata,
      header: band,
      footer: counter(theme.colors.mutedForeground),
    },
  )

  return { bytes, filename: suggestFilename(resume) }
}
