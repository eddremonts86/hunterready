/**
 * "Modern" document theme — sans throughout, tight vertical rhythm.
 *
 * The default. Reads as contemporary without being fashionable, which is what a CV needs
 * to survive both a recruiter's three-second scan and a parser.
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

export const modernTheme: PdfcnTheme = {
  name: 'modern',
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
      lineHeight: 1.45,
    },
    heading: {
      fontFamily: FONT_SANS,
      fontWeight: 700,
      lineHeight: 1.2,
      fontSize: {
        h1: 24,
        h2: 11,
        h3: 12,
        h4: 10.5,
        h5: 10,
        h6: 9.5,
      },
    },
  },
  spacing: {
    page: {
      marginTop: 44,
      marginRight: 44,
      marginBottom: 44,
      marginLeft: 44,
    },
    sectionGap: 18,
    paragraphGap: 8,
    componentGap: 10,
  },
  page: {
    size: 'A4',
    orientation: 'portrait',
  },
}
