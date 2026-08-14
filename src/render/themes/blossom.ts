/**
 * "Blossom" — a deep rose masthead band, Playfair Display, tinted section bands.
 *
 * The warmest thing in the catalogue: the name in white display serif on rose, headings resting in
 * pale pink bands. Character without a single parse risk — every stroke of it is paint.
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
  ROSE_INK,
  ROSE_WASH,
  SILVER_GRAY,
} from './tokens'

const FONT_PLAYFAIR = '"Playfair Display"'

export const blossomTheme: DocTheme = {
  name: 'blossom',
  primitives: defaultPrimitives,
  colors: {
    foreground: PRINT_BLACK,
    background: PAPER_WHITE,
    muted: PAPER_MUTED,
    mutedForeground: DEVELOPER_GRAY,
    primary: ROSE_INK,
    primaryForeground: PAPER_WHITE,
    border: SILVER_GRAY,
    accent: ROSE_INK,
    ...NEUTRALIZED_ALERTS,
  },
  typography: {
    body: {
      fontFamily: FONT_SANS,
      fontSize: 10.5,
      lineHeight: 1.48,
    },
    heading: {
      fontFamily: FONT_PLAYFAIR,
      fontWeight: 700,
      lineHeight: 1.22,
      fontSize: { h1: 27, h2: 11.5, h3: 12.5, h4: 11, h5: 10.5, h6: 10 },
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
    accent: ROSE_INK,
    accentWash: ROSE_WASH,
    onAccent: PAPER_WHITE,
    masthead: 'band',
    heading: 'tint',
    nameInAccent: false,
    headingInAccent: true,
    bulletsInAccent: true,
    roleInAccent: false,
  },
}
