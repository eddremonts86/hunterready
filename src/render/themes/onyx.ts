/**
 * "Onyx" — the dark page: light type on near-black, a cool steel accent.
 *
 * The look of Edd's own dark CV and of half the developer portfolios on the reference sheet. The text
 * layer is identical to any light theme — extraction does not know what color the ground was — but a
 * dark page eats toner and can look muddy from a laser printer, so the hint says what it is for:
 * screens, not paper.
 */
import { defaultPrimitives } from '@/components/pdf/primitives'
import type { DocTheme } from './style'
import {
  FONT_SANS,
  NEUTRALIZED_ALERTS,
  ONYX_ACCENT,
  ONYX_BORDER,
  ONYX_MUTED,
  ONYX_PAPER,
  ONYX_TEXT,
} from './tokens'

const FONT_GROTESK = '"Space Grotesk"'

export const onyxTheme: DocTheme = {
  name: 'onyx',
  primitives: defaultPrimitives,
  colors: {
    foreground: ONYX_TEXT,
    background: ONYX_PAPER,
    muted: ONYX_BORDER,
    mutedForeground: ONYX_MUTED,
    primary: ONYX_ACCENT,
    primaryForeground: ONYX_PAPER,
    border: ONYX_BORDER,
    accent: ONYX_ACCENT,
    ...NEUTRALIZED_ALERTS,
  },
  typography: {
    body: {
      fontFamily: FONT_SANS,
      fontSize: 10.5,
      lineHeight: 1.5,
    },
    heading: {
      fontFamily: FONT_GROTESK,
      fontWeight: 700,
      lineHeight: 1.2,
      fontSize: { h1: 24, h2: 11, h3: 12, h4: 10.5, h5: 10, h6: 9.5 },
    },
  },
  spacing: {
    page: { marginTop: 46, marginRight: 46, marginBottom: 46, marginLeft: 46 },
    sectionGap: 19,
    paragraphGap: 8,
    componentGap: 10,
  },
  page: { size: 'A4', orientation: 'portrait' },
  style: {
    accent: ONYX_ACCENT,
    accentWash: ONYX_BORDER,
    onAccent: ONYX_PAPER,
    masthead: 'plain',
    heading: 'underline',
    nameInAccent: false,
    headingInAccent: true,
    bulletsInAccent: true,
    roleInAccent: false,
    paper: ONYX_PAPER,
  },
}
