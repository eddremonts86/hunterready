/**
 * "Executive" document theme — serif throughout, larger scale, generous margins.
 *
 * For senior candidates whose CV is read by a hiring committee rather than skimmed off a
 * pile. Costs vertical space, so it fits fewer roles per page: the template's page-count
 * warning matters most under this theme.
 */
import { defaultPrimitives } from '@/components/pdf/primitives'
import type { PdfcnTheme } from '@/components/pdf/theme-types'
import {
  DEVELOPER_GRAY,
  FONT_SERIF,
  NEUTRALIZED_SEMANTICS,
  PAPER_MUTED,
  PAPER_WHITE,
  PRINT_BLACK,
  SILVER_GRAY,
} from './tokens'

export const executiveTheme: PdfcnTheme = {
  name: 'executive',
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
      fontFamily: FONT_SERIF,
      fontSize: 11,
      lineHeight: 1.55,
    },
    heading: {
      fontFamily: FONT_SERIF,
      fontWeight: 700,
      lineHeight: 1.25,
      fontSize: {
        h1: 28,
        h2: 12.5,
        h3: 14,
        h4: 12,
        h5: 11,
        h6: 10.5,
      },
    },
  },
  spacing: {
    page: {
      marginTop: 60,
      marginRight: 56,
      marginBottom: 60,
      marginLeft: 56,
    },
    sectionGap: 26,
    paragraphGap: 10,
    componentGap: 12,
  },
  page: {
    size: 'A4',
    orientation: 'portrait',
  },
}
