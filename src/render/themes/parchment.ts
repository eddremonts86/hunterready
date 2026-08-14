/**
 * "Parchment" — a cream sheet set entirely in EB Garamond, umber ink.
 *
 * The classical book page as a CV: warm tinted stock, a garalde serif from the 16th century's
 * lineage, and nothing modern anywhere. For candidates whose fields still write letters.
 */
import { defaultPrimitives } from '@/components/pdf/primitives'
import type { DocTheme } from './style'
import {
  BRONZE_WASH,
  DEVELOPER_GRAY,
  NEUTRALIZED_ALERTS,
  PAPER_MUTED,
  PAPER_WHITE,
  PARCHMENT_PAPER,
  PRINT_BLACK,
  SILVER_GRAY,
  UMBER_INK,
} from './tokens'

const FONT_GARAMOND = '"EB Garamond"'

export const parchmentTheme: DocTheme = {
  name: 'parchment',
  primitives: defaultPrimitives,
  colors: {
    foreground: PRINT_BLACK,
    background: PARCHMENT_PAPER,
    muted: PAPER_MUTED,
    mutedForeground: DEVELOPER_GRAY,
    primary: UMBER_INK,
    primaryForeground: PAPER_WHITE,
    border: SILVER_GRAY,
    accent: UMBER_INK,
    ...NEUTRALIZED_ALERTS,
  },
  typography: {
    body: {
      fontFamily: FONT_GARAMOND,
      fontSize: 11,
      lineHeight: 1.5,
    },
    heading: {
      fontFamily: FONT_GARAMOND,
      fontWeight: 700,
      lineHeight: 1.24,
      fontSize: { h1: 26, h2: 12, h3: 13, h4: 11, h5: 10.5, h6: 10 },
    },
  },
  spacing: {
    page: { marginTop: 50, marginRight: 48, marginBottom: 50, marginLeft: 48 },
    sectionGap: 20,
    paragraphGap: 9,
    componentGap: 11,
  },
  page: { size: 'A4', orientation: 'portrait' },
  style: {
    accent: UMBER_INK,
    accentWash: BRONZE_WASH,
    onAccent: PAPER_WHITE,
    masthead: 'plain',
    heading: 'hairline',
    nameInAccent: false,
    headingInAccent: true,
    bulletsInAccent: false,
    roleInAccent: false,
    paper: PARCHMENT_PAPER,
  },
}
