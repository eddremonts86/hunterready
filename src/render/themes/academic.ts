/**
 * "Academic" — serif body, sans headings, and room for a long list of qualifications.
 *
 * The inverse of `professional`, which sets serif headings over a sans body. Here the *reading* face is
 * the serif, which is the convention in academia, research, law and medicine — the sectors where a CV
 * routinely runs to three pages of publications and certifications and nobody minds.
 *
 * It is not a decorative choice: a serif at 10.5pt with generous leading is what those readers are used
 * to, and looking unlike a marketing CV is the point. PRODUCT.md's audience is every sector, and "every
 * sector" includes the ones where our default sans reads as too casual.
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

export const academicTheme: PdfcnTheme = {
  name: 'academic',
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
      /**
       * 10.5pt serif, not 11: Source Serif 4 has a large x-height, so it reads a size bigger than a sans
       * at the same point size. Setting it at 11 to "match" makes a document that needs an extra page.
       */
      fontSize: 10.5,
      lineHeight: 1.52,
    },
    heading: {
      fontFamily: FONT_SANS,
      fontWeight: 700,
      lineHeight: 1.2,
      fontSize: { h1: 21, h2: 10.5, h3: 11, h4: 10.5, h5: 10, h6: 10 },
    },
  },
  spacing: {
    page: { marginTop: 46, marginRight: 48, marginBottom: 46, marginLeft: 48 },
    sectionGap: 18,
    paragraphGap: 8,
    componentGap: 10,
  },
  page: { size: 'A4', orientation: 'portrait' },
}
