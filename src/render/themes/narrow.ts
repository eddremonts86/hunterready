/**
 * "Narrow" — Archivo Narrow, forest green, section headings in a solid green band.
 *
 * The condensed face packs a long history in; the solid bands make the packing legible. The greenest
 * thing a parser sees is still the word EXPERIENCE in white on the band — color never touches parsing.
 */
import { defaultPrimitives } from '@/components/pdf/primitives'
import type { DocTheme } from './style'
import {
  DEVELOPER_GRAY,
  FOREST_INK,
  FOREST_WASH,
  NEUTRALIZED_ALERTS,
  PAPER_MUTED,
  PAPER_WHITE,
  PRINT_BLACK,
  SILVER_GRAY,
} from './tokens'

const FONT_NARROW = '"Archivo Narrow"'

export const narrowTheme: DocTheme = {
  name: 'narrow',
  primitives: defaultPrimitives,
  colors: {
    foreground: PRINT_BLACK,
    background: PAPER_WHITE,
    muted: PAPER_MUTED,
    mutedForeground: DEVELOPER_GRAY,
    primary: FOREST_INK,
    primaryForeground: PAPER_WHITE,
    border: SILVER_GRAY,
    accent: FOREST_INK,
    ...NEUTRALIZED_ALERTS,
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
  style: {
    accent: FOREST_INK,
    accentWash: FOREST_WASH,
    onAccent: PAPER_WHITE,
    masthead: 'plain',
    heading: 'band',
    nameInAccent: true,
    headingInAccent: false,
    bulletsInAccent: true,
    roleInAccent: false,
  },
}
