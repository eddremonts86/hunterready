/**
 * "Compact" — dense sans, rust accents, section headings in a pale tinted band.
 *
 * Fits the most on each page. The rust tint bands earn their ink at this density — they separate
 * sections that tight spacing would otherwise run together, doing structure work, not decoration.
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
  RUST_INK,
  RUST_WASH,
  SILVER_GRAY,
} from './tokens'

export const compactTheme: DocTheme = {
  name: 'compact',
  primitives: defaultPrimitives,
  colors: {
    foreground: PRINT_BLACK,
    background: PAPER_WHITE,
    muted: PAPER_MUTED,
    mutedForeground: DEVELOPER_GRAY,
    primary: RUST_INK,
    primaryForeground: PAPER_WHITE,
    border: SILVER_GRAY,
    accent: RUST_INK,
    ...NEUTRALIZED_ALERTS,
  },
  typography: {
    body: {
      fontFamily: FONT_SANS,
      // 10pt is the floor: below it a printed CV stops being comfortable to read.
      fontSize: 10,
      lineHeight: 1.35,
    },
    heading: {
      fontFamily: FONT_SANS,
      fontWeight: 700,
      lineHeight: 1.15,
      fontSize: { h1: 20, h2: 10.5, h3: 11, h4: 10, h5: 10, h6: 9.5 },
    },
  },
  spacing: {
    page: { marginTop: 32, marginRight: 34, marginBottom: 32, marginLeft: 34 },
    sectionGap: 12,
    paragraphGap: 6,
    componentGap: 7,
  },
  page: { size: 'A4', orientation: 'portrait' },
  style: {
    accent: RUST_INK,
    accentWash: RUST_WASH,
    onAccent: PAPER_WHITE,
    masthead: 'sideline',
    heading: 'tint',
    nameInAccent: false,
    headingInAccent: true,
    bulletsInAccent: true,
    roleInAccent: false,
  },
}
