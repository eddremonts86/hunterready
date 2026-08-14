/**
 * "Minimal" — typewriter headings, and more white space than anything else here.
 *
 * pdfcn ships a preset by this name (Courier headings, maximum whitespace) and this is that idea inside
 * this project's constraints: the palette is the same print-side monochrome as every other theme, because
 * DESIGN.md's hardest rule is that no accent of ours touches somebody's document.
 *
 * Courier Prime is used for the *section headings only*, never the body. A whole CV set in a monospace
 * face reads slowly and costs about 15% more lines for the same words, which on a two-page history is a
 * third page. As a heading face it does what the preset intends — it marks the sections without shouting.
 */
import { defaultPrimitives } from '@/components/pdf/primitives'
import type { PdfcnTheme } from '@/components/pdf/theme-types'
import {
  DEVELOPER_GRAY,
  FONT_SANS,
  NEUTRALIZED_SEMANTICS,
  PAPER_MUTED,
  PAPER_WHITE,
  PRINT_BLACK,
  SILVER_GRAY,
} from './tokens'

/** Bundled, and registered in `fonts/index.ts`. A family the renderer lacks draws nothing at all. */
const FONT_MONO = '"Courier Prime"'

export const minimalTheme: PdfcnTheme = {
  name: 'minimal',
  primitives: defaultPrimitives,
  colors: {
    foreground: PRINT_BLACK,
    background: PAPER_WHITE,
    muted: PAPER_MUTED,
    mutedForeground: DEVELOPER_GRAY,
    primary: PRINT_BLACK,
    primaryForeground: PAPER_WHITE,
    border: SILVER_GRAY,
    ...NEUTRALIZED_SEMANTICS,
  },
  typography: {
    body: {
      fontFamily: FONT_SANS,
      fontSize: 10.5,
      // Generous leading is where "minimal" actually lives — not in removing anything.
      lineHeight: 1.6,
    },
    heading: {
      fontFamily: FONT_MONO,
      /**
       * 400, not 700. Courier Prime's bold is heavy enough to read as a different face, and the point of
       * a typewriter heading is that it is quiet.
       */
      fontWeight: 400,
      lineHeight: 1.2,
      fontSize: { h1: 19, h2: 10, h3: 11, h4: 10, h5: 10, h6: 9.5 },
    },
  },
  spacing: {
    // Wide margins, and they are the reason this theme uses more pages than `modern`.
    page: { marginTop: 52, marginRight: 56, marginBottom: 52, marginLeft: 56 },
    sectionGap: 22,
    paragraphGap: 9,
    componentGap: 12,
  },
  page: { size: 'A4', orientation: 'portrait' },
}
