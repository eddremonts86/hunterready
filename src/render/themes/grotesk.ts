/**
 * "Grotesk" — Space Grotesk throughout, plum accents, tight and current.
 *
 * The contemporary studio voice: a grotesque with real personality in its terminals, a plum that
 * no corporate template would dare, bars and sidelines doing the structure. For product, media
 * and anywhere "current" is a compliment.
 */
import { defaultPrimitives } from '@/components/pdf/primitives'
import type { DocTheme } from './style'
import {
  DEVELOPER_GRAY,
  NEUTRALIZED_ALERTS,
  PAPER_MUTED,
  PAPER_WHITE,
  PLUM_INK,
  PLUM_WASH,
  PRINT_BLACK,
  SILVER_GRAY,
} from './tokens'

const FONT_GROTESK = '"Space Grotesk"'

export const groteskTheme: DocTheme = {
  name: 'grotesk',
  primitives: defaultPrimitives,
  colors: {
    foreground: PRINT_BLACK,
    background: PAPER_WHITE,
    muted: PAPER_MUTED,
    mutedForeground: DEVELOPER_GRAY,
    primary: PLUM_INK,
    primaryForeground: PAPER_WHITE,
    border: SILVER_GRAY,
    accent: PLUM_INK,
    ...NEUTRALIZED_ALERTS,
  },
  typography: {
    body: {
      fontFamily: FONT_GROTESK,
      fontSize: 10,
      lineHeight: 1.45,
    },
    heading: {
      fontFamily: FONT_GROTESK,
      fontWeight: 700,
      lineHeight: 1.18,
      fontSize: { h1: 22, h2: 10.5, h3: 11, h4: 10, h5: 10, h6: 9.5 },
    },
  },
  spacing: {
    page: { marginTop: 42, marginRight: 42, marginBottom: 42, marginLeft: 42 },
    sectionGap: 16,
    paragraphGap: 7,
    componentGap: 9,
  },
  page: { size: 'A4', orientation: 'portrait' },
  style: {
    accent: PLUM_INK,
    accentWash: PLUM_WASH,
    onAccent: PAPER_WHITE,
    masthead: 'sideline',
    heading: 'bar',
    nameInAccent: true,
    headingInAccent: true,
    bulletsInAccent: true,
    roleInAccent: false,
  },
}
