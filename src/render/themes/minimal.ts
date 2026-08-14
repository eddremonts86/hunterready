/**
 * "Minimal" — typewriter headings, wide margins, and not one line of decoration.
 *
 * The identity is restraint, kept honest now that every other theme has color: this is the one that
 * chooses none. Generous leading and absence — for people whose work should speak unadorned.
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
} from './tokens'

const FONT_MONO = '"Courier Prime"'

export const minimalTheme: DocTheme = {
  name: 'minimal',
  primitives: defaultPrimitives,
  colors: {
    foreground: PRINT_BLACK,
    background: PAPER_WHITE,
    muted: PAPER_MUTED,
    mutedForeground: DEVELOPER_GRAY,
    primary: PRINT_BLACK,
    primaryForeground: PAPER_WHITE,
    border: SILVER_GRAY,
    accent: PRINT_BLACK,
    ...NEUTRALIZED_ALERTS,
  },
  typography: {
    body: {
      fontFamily: FONT_SANS,
      fontSize: 10.5,
      // Generous leading is where "minimal" actually lives — not in removing anything.
      lineHeight: 1.6,
    },
    heading: {
      fontFamily: FONT_MONO,
      /**
       * 400, not 700. Courier Prime's bold is heavy enough to read as a different face, and the point of
       * a typewriter heading is that it is quiet.
       */
      fontWeight: 400,
      lineHeight: 1.2,
      fontSize: { h1: 19, h2: 10, h3: 11, h4: 10, h5: 10, h6: 9.5 },
    },
  },
  spacing: {
    // Wide margins, and they are the reason this theme uses more pages than `modern`.
    page: { marginTop: 52, marginRight: 56, marginBottom: 52, marginLeft: 56 },
    sectionGap: 22,
    paragraphGap: 9,
    componentGap: 12,
  },
  page: { size: 'A4', orientation: 'portrait' },
  style: {
    accent: PRINT_BLACK,
    accentWash: PAPER_MUTED,
    onAccent: PAPER_WHITE,
    masthead: 'plain',
    heading: 'plain',
    nameInAccent: false,
    headingInAccent: false,
    bulletsInAccent: false,
    roleInAccent: false,
  },
}
