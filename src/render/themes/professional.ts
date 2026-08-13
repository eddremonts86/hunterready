/**
 * "Professional" document theme — serif headings over a sans body.
 *
 * The register of a formal letter. Suits regulated and institutional fields (health,
 * education, law, public sector) where a contemporary sans reads as too casual.
 */
import { defaultPrimitives } from '@/components/pdf/primitives'
import type { PdfcnTheme } from '@/components/pdf/theme-types'
import {
  DEVELOPER_GRAY,
  FONT_SANS,
  FONT_SERIF,
  NEUTRALIZED_SEMANTICS,
  PAPER_MUTED,
  PAPER_WHITE,
  PRINT_BLACK,
  SILVER_GRAY,
} from './tokens'

export const professionalTheme: PdfcnTheme = {
  name: 'professional',
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
      lineHeight: 1.5,
    },
    heading: {
      fontFamily: FONT_SERIF,
      fontWeight: 700,
      lineHeight: 1.25,
      fontSize: {
        h1: 26,
        h2: 12,
        h3: 13,
        h4: 11,
        h5: 10.5,
        h6: 10,
      },
    },
  },
  spacing: {
    page: {
      marginTop: 52,
      marginRight: 48,
      marginBottom: 52,
      marginLeft: 48,
    },
    sectionGap: 22,
    paragraphGap: 9,
    componentGap: 11,
  },
  page: {
    size: 'A4',
    orientation: 'portrait',
  },
}
