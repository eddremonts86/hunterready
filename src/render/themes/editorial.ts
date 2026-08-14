/**
 * "Editorial" — Playfair Display at magazine scale, ink on white, centred.
 *
 * Character through type alone: a thirty-point display name, centred masthead, a hard black rule
 * under every heading. The monochrome theme for people who want presence without color.
 */
import { defaultPrimitives } from '@/components/pdf/primitives'
import type { DocTheme } from './style'
import {
  DEVELOPER_GRAY,
  FONT_SERIF,
  NEUTRALIZED_ALERTS,
  PAPER_MUTED,
  PAPER_WHITE,
  PRINT_BLACK,
  SILVER_GRAY,
} from './tokens'

const FONT_PLAYFAIR = '"Playfair Display"'

export const editorialTheme: DocTheme = {
  name: 'editorial',
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
      fontFamily: FONT_SERIF,
      fontSize: 10.5,
      lineHeight: 1.52,
    },
    heading: {
      fontFamily: FONT_PLAYFAIR,
      fontWeight: 700,
      lineHeight: 1.2,
      fontSize: { h1: 30, h2: 12, h3: 13, h4: 11, h5: 10.5, h6: 10 },
    },
  },
  spacing: {
    page: { marginTop: 54, marginRight: 52, marginBottom: 54, marginLeft: 52 },
    sectionGap: 24,
    paragraphGap: 9,
    componentGap: 12,
  },
  page: { size: 'A4', orientation: 'portrait' },
  style: {
    accent: PRINT_BLACK,
    accentWash: PAPER_MUTED,
    onAccent: PAPER_WHITE,
    masthead: 'centered',
    heading: 'underline',
    nameInAccent: false,
    headingInAccent: false,
    bulletsInAccent: false,
    roleInAccent: false,
  },
}
