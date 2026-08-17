/**
 * The same document, as a web page.
 *
 * ## Why this is the design and not an approximation
 *
 * I nearly did not build this, on the grounds that an HTML export which merely resembles the PDF is
 * worse than none — the product's whole claim is that what you approve is what you send. Reading
 * `lib/pdf-primitives.tsx` settled it: `View`, `Text`, `Image` and `Link` are already plain `div`,
 * `span`, `img` and `a` carrying inline styles, because takumi consumes browser CSS rather than PDF
 * points. So the template tree is *literally* HTML already. This renders the very same component with
 * the very same theme; it does not re-implement anything, which is why it cannot drift.
 *
 * ## The two honest differences
 *
 * **No pagination.** A PDF is pages; a web page is one column. There is no `@page`, no page counter,
 * no "1 / 2". For a file meant to be opened in a browser that is correct rather than missing, and it
 * is why this is offered beside the PDF instead of instead of it.
 *
 * **The sidebar design's full-height column is drawn by the layout, not measured.** `render.tsx`
 * builds that column by measuring the laid-out height and painting bands into each page's margins —
 * an idea that only means anything when there are pages. Here the column is simply told to fill its
 * parent, which is what it was always trying to look like.
 *
 * Everything else — the typefaces, the accent, the paper, the order of sections, the spacing — is the
 * same theme object the PDF path builds, through the same `withColours` and the same font resolution.
 *
 * ## Self-contained, because a CV is a file you send
 *
 * The fonts are inlined as data URIs from the same bundle the renderer draws with (ADR-022's ten
 * families). A page that fetches its fonts from a CDN would render in a substitute face on any machine
 * that is offline or behind a filter, and "it looked different on their computer" is the failure this
 * product exists to prevent. It costs a larger file; the file is a few hundred kilobytes and it is
 * opened once.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { Document, Page } from '@/lib/pdf-primitives'
import { PdfcnThemeProvider } from '@/components/pdf/theme-provider'
import type { Resume } from '@/schema/resume'
import { DEFAULT_THEME_ID, getTheme } from './themes'
import { withColours } from './themes/custom'
import { styleOf } from './themes/style'
import { DEFAULT_TEMPLATE_ID, getTemplate } from './templates/registry'
import { loadThemeFonts } from './fonts'
import { documentFilename } from './filename'
import { applyAxes } from './axes'
import type { RenderOptions } from './render'

/** A4 at 96 DPI, which is the unit takumi lays out in and therefore the unit the templates think in. */
const A4_WIDTH = 794

/**
 * `wOF2` in the first four bytes, or it is a TrueType file.
 *
 * The `format()` hint is not decorative here: a browser that guesses wrong on a woff2 served as
 * truetype silently skips the face and falls back, which is the exact failure ADR-022 is about —
 * a font that is present, registered, and draws nothing anybody notices until they look.
 */
function fontFormat(data: Uint8Array): 'woff2' | 'truetype' {
  const magic = String.fromCharCode(...data.subarray(0, 4))
  return magic === 'wOF2' ? 'woff2' : 'truetype'
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface HtmlResult {
  html: string
  filename: string
}

export async function renderResumeHtml(
  resume: Resume,
  options: RenderOptions = {},
): Promise<HtmlResult> {
  const base = getTheme(options.themeId ?? DEFAULT_THEME_ID)
  const painted =
    options.colours === undefined ? base : withColours(base, options.colours)
  const theme = applyAxes(painted, options.fonts)

  const meta = getTemplate(options.templateId ?? DEFAULT_TEMPLATE_ID)
  const { Component } = meta
  const style = styleOf(theme)
  const fonts = await loadThemeFonts(theme)

  const faces = fonts
    .map((font) => {
      const data = Buffer.from(font.data).toString('base64')
      const format = fontFormat(font.data)
      const mime = format === 'woff2' ? 'font/woff2' : 'font/ttf'
      return `@font-face{font-family:"${font.name}";font-weight:${font.weight};font-style:normal;font-display:block;src:url(data:${mime};base64,${data}) format("${format}")}`
    })
    .join('\n')

  const body = renderToStaticMarkup(
    <Document>
      <Page>
        <PdfcnThemeProvider theme={theme}>
          <Component resume={resume} theme={theme} />
        </PdfcnThemeProvider>
      </Page>
    </Document>,
  )

  const title = `${resume.basics.fullName}${
    resume.basics.headline === undefined ? '' : ` — ${resume.basics.headline}`
  }`

  /*
    The sheet is a fixed A4 width and centres on a tinted ground, the same way the preview shows it.
    `max-width:100%` under it so a phone shrinks the sheet instead of scrolling it sideways — the one
    concession this file makes to being a web page rather than a printout, and the alternative is a CV
    nobody can read on the device most links are opened on.

    `print-color-adjust` so a browser's own Print keeps the paper and the accent. Somebody who opens
    this and hits Cmd-P should get the document, not a stripped version of it.
  */
  return {
    html: `<!doctype html>
<html lang="${escapeHtml(resume.locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${faces}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:${style.paper ?? theme.colors.background};display:flex;justify-content:center;padding:0}
.sheet{width:${A4_WIDTH}px;max-width:100%;background:${theme.colors.background};color:${theme.colors.foreground};font-family:${theme.typography.body.fontFamily};-webkit-print-color-adjust:exact;print-color-adjust:exact}
@media print{body{padding:0;background:${theme.colors.background}}.sheet{width:auto;max-width:none}}
</style>
</head>
<body><div class="sheet">${body}</div></body>
</html>`,
    filename: documentFilename(resume.basics.fullName, 'html'),
  }
}
