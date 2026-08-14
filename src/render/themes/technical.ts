/**
 * "Technical" — monospace headings in framed boxes, slate accents, dense and exact.
 *
 * Reads like good documentation: every section heading in a 1px box, the role line in slate. The one
 * theme where looking like a machine wrote it is the compliment.
 */
import { defaultPrimitives } from '@/components/pdf/primitives'
import type { DocTheme } from './style'
import {
  DEVELOPER_GRAY,
  FONT_SANS,
  NEUTRALIZED_ALERTS,
  PAPER_MUTED,
  PAPER_WHITE,
  PRINT_BLACK,
  SILVER_GRAY,
  SLATE_INK,
  SLATE_WASH,
} from './tokens'

const FONT_MONO = '"Courier Prime"'

export const technicalTheme: DocTheme = {
  name: 'technical',
  primitives: defaultPrimitives,
  colors: {
    foreground: PRINT_BLACK,
    background: PAPER_WHITE,
    muted: PAPER_MUTED,
    mutedForeground: DEVELOPER_GRAY,
    primary: SLATE_INK,
    primaryForeground: PAPER_WHITE,
    border: SILVER_GRAY,
    accent: SLATE_INK,
    ...NEUTRALIZED_ALERTS,
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
  style: {
    accent: SLATE_INK,
    accentWash: SLATE_WASH,
    onAccent: PAPER_WHITE,
    masthead: 'plain',
    heading: 'framed',
    nameInAccent: false,
    headingInAccent: true,
    bulletsInAccent: false,
    roleInAccent: true,
  },
}
