/**
 * "Executive" — serif, generous margins, and the masthead set in a full graphite band.
 *
 * The band is the strongest signal in the catalogue and only this theme gets it: a committee sees the
 * name in white on near-black before anything else. Costs vertical space, which is what executive means.
 */
import { defaultPrimitives } from '@/components/pdf/primitives'
import type { DocTheme } from './style'
import {
  DEVELOPER_GRAY,
  FONT_SERIF,
  GRAPHITE_INK,
  GRAPHITE_WASH,
  NEUTRALIZED_ALERTS,
  PAPER_MUTED,
  PAPER_WHITE,
  PRINT_BLACK,
  SILVER_GRAY,
} from './tokens'

export const executiveTheme: DocTheme = {
  name: 'executive',
  primitives: defaultPrimitives,
  colors: {
    foreground: PRINT_BLACK,
    background: PAPER_WHITE,
    muted: PAPER_MUTED,
    mutedForeground: DEVELOPER_GRAY,
    primary: GRAPHITE_INK,
    primaryForeground: PAPER_WHITE,
    border: SILVER_GRAY,
    accent: GRAPHITE_INK,
    ...NEUTRALIZED_ALERTS,
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
  style: {
    accent: GRAPHITE_INK,
    accentWash: GRAPHITE_WASH,
    onAccent: PAPER_WHITE,
    masthead: 'band',
    heading: 'shortline',
    nameInAccent: false,
    headingInAccent: false,
    bulletsInAccent: false,
    roleInAccent: false,
  },
}
