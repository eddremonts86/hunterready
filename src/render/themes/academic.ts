/**
 * "Academic" — serif body, centered masthead, headings flanked by hairlines in maroon.
 *
 * The classical page: centered name, centered section titles between rules, a maroon that reads as
 * institutional rather than decorative. For CVs where the institution names carry the argument.
 */
import { defaultPrimitives } from '@/components/pdf/primitives'
import type { DocTheme } from './style'
import {
  DEVELOPER_GRAY,
  FONT_SANS,
  FONT_SERIF,
  MAROON_INK,
  MAROON_WASH,
  NEUTRALIZED_ALERTS,
  PAPER_MUTED,
  PAPER_WHITE,
  PRINT_BLACK,
  SILVER_GRAY,
} from './tokens'

export const academicTheme: DocTheme = {
  name: 'academic',
  primitives: defaultPrimitives,
  colors: {
    foreground: PRINT_BLACK,
    background: PAPER_WHITE,
    muted: PAPER_MUTED,
    mutedForeground: DEVELOPER_GRAY,
    primary: MAROON_INK,
    primaryForeground: PAPER_WHITE,
    border: SILVER_GRAY,
    accent: MAROON_INK,
    ...NEUTRALIZED_ALERTS,
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
  style: {
    accent: MAROON_INK,
    accentWash: MAROON_WASH,
    onAccent: PAPER_WHITE,
    masthead: 'centered',
    heading: 'flanked',
    nameInAccent: false,
    headingInAccent: true,
    bulletsInAccent: false,
    roleInAccent: false,
  },
}
