/**
 * "Compact" document theme — tighter everything, for a long career on two pages.
 *
 * Exists because of a real constraint the fit estimator surfaces: a fifteen-year history under
 * `executive` spills onto a third page, and the honest options are cut content or set it tighter.
 * This is the second option, and it stays inside the print-side palette like every other theme.
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

export const compactTheme: PdfcnTheme = {
  name: 'compact',
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
      // 10pt is the floor: below it a printed CV stops being comfortable to read.
      fontSize: 10,
      lineHeight: 1.35,
    },
    heading: {
      fontFamily: FONT_SANS,
      fontWeight: 700,
      lineHeight: 1.15,
      fontSize: { h1: 20, h2: 10.5, h3: 11, h4: 10, h5: 10, h6: 9.5 },
    },
  },
  spacing: {
    page: { marginTop: 32, marginRight: 34, marginBottom: 32, marginLeft: 34 },
    sectionGap: 12,
    paragraphGap: 6,
    componentGap: 7,
  },
  page: { size: 'A4', orientation: 'portrait' },
}
