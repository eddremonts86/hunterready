/**
 * "Technical" — monospace headings over a tight sans body.
 *
 * pdfcn calls this direction Blueprint and gives it a dark slate-cyan palette. The palette is exactly the
 * part that cannot come along: a CV carrying a colour scheme carries somebody's branding into another
 * company's hiring process, and DESIGN.md forbids it outright. What survives the translation is the
 * *typographic* idea — a machine-set heading over dense body copy — and that turns out to be the whole
 * effect anyway.
 *
 * Named for the register rather than for an industry. "Never assume a tech career" is a hard rule here
 * (CLAUDE.md), and this theme suits a lab technician, an aircraft engineer and a CNC machinist as much as
 * anybody who writes software — which is precisely why it is not called "Developer".
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

const FONT_MONO = '"Courier Prime"'

export const technicalTheme: PdfcnTheme = {
  name: 'technical',
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
      fontSize: 10,
      lineHeight: 1.4,
    },
    heading: {
      fontFamily: FONT_MONO,
      fontWeight: 700,
      lineHeight: 1.15,
      /**
       * h1 at 18, the smallest name on any theme here. A monospace name at 20pt+ is wider than the page
       * for most people — "Marta Sørensen" in Courier Prime at 20pt is over half a line on its own.
       */
      fontSize: { h1: 18, h2: 9.5, h3: 10.5, h4: 10, h5: 10, h6: 9.5 },
    },
  },
  spacing: {
    page: { marginTop: 38, marginRight: 40, marginBottom: 38, marginLeft: 40 },
    sectionGap: 14,
    paragraphGap: 6,
    componentGap: 8,
  },
  page: { size: 'A4', orientation: 'portrait' },
}
