/**
 * "Modern" — sans throughout, a teal accent bar against every section heading.
 *
 * The default. Contemporary without being fashionable. The teal is confident and sector-neutral —
 * neither corporate navy nor creative anything, which is exactly where a default should sit.
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
  TEAL_INK,
  TEAL_WASH,
} from './tokens'

export const modernTheme: DocTheme = {
  name: 'modern',
  primitives: defaultPrimitives,
  colors: {
    foreground: PRINT_BLACK,
    background: PAPER_WHITE,
    muted: PAPER_MUTED,
    mutedForeground: DEVELOPER_GRAY,
    primary: TEAL_INK,
    primaryForeground: PAPER_WHITE,
    border: SILVER_GRAY,
    accent: TEAL_INK,
    ...NEUTRALIZED_ALERTS,
  },
  typography: {
    body: {
      fontFamily: FONT_SANS,
      fontSize: 10.5,
      lineHeight: 1.45,
    },
    heading: {
      fontFamily: FONT_SANS,
      fontWeight: 700,
      lineHeight: 1.2,
      fontSize: {
        h1: 24,
        h2: 11,
        h3: 12,
        h4: 10.5,
        h5: 10,
        h6: 9.5,
      },
    },
  },
  spacing: {
    page: {
      marginTop: 44,
      marginRight: 44,
      marginBottom: 44,
      marginLeft: 44,
    },
    sectionGap: 18,
    paragraphGap: 8,
    componentGap: 10,
  },
  page: {
    size: 'A4',
    orientation: 'portrait',
  },
  style: {
    accent: TEAL_INK,
    accentWash: TEAL_WASH,
    onAccent: PAPER_WHITE,
    masthead: 'plain',
    heading: 'bar',
    nameInAccent: false,
    headingInAccent: true,
    bulletsInAccent: true,
    roleInAccent: false,
  },
}
