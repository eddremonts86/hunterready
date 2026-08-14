/**
 * "Narrow" — a condensed face, so a long history fits without shrinking the type.
 *
 * `compact` already exists for the same problem and solves it the other way: it takes the type down to
 * 10pt, which is the floor for something a person prints and reads. This one keeps a comfortable 10.5pt
 * and buys the room from the *letterforms* instead — Archivo Narrow sets roughly 15% more characters per
 * line than Source Sans at the same size.
 *
 * Two ways to fit a fifteen-year career on two pages, and they fail differently: `compact` gets hard to
 * read on paper, this one looks obviously condensed on screen. Offering both and saying which is which is
 * the honest version of a single "make it fit" button.
 */
import { defaultPrimitives } from '@/components/pdf/primitives'
import type { PdfcnTheme } from '@/components/pdf/theme-types'
import {
  DEVELOPER_GRAY,
  NEUTRALIZED_SEMANTICS,
  PAPER_MUTED,
  PAPER_WHITE,
  PRINT_BLACK,
  SILVER_GRAY,
} from './tokens'

/** Bundled and registered. Narrow at 400 and 700, which is what the headings need. */
const FONT_NARROW = '"Archivo Narrow"'

export const narrowTheme: PdfcnTheme = {
  name: 'narrow',
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
      fontFamily: FONT_NARROW,
      fontSize: 10.5,
      lineHeight: 1.42,
    },
    heading: {
      fontFamily: FONT_NARROW,
      fontWeight: 700,
      lineHeight: 1.18,
      /**
       * h1 at 22 rather than 20: a condensed face at the same point size reads visibly smaller, and a
       * name is the one thing on the page that must not look diminished.
       */
      fontSize: { h1: 22, h2: 11, h3: 11.5, h4: 10.5, h5: 10.5, h6: 10 },
    },
  },
  spacing: {
    // Margins stay normal. Narrowing the type *and* the margins is how a CV starts looking cramped.
    page: { marginTop: 40, marginRight: 42, marginBottom: 40, marginLeft: 42 },
    sectionGap: 15,
    paragraphGap: 7,
    componentGap: 9,
  },
  page: { size: 'A4', orientation: 'portrait' },
}
