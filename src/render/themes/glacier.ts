/**
 * "Glacier" — a pale blue sheet, steel ink, geometric headings.
 *
 * The paper itself is the design: a full cold-blue ground the way a stationer sells tinted stock,
 * with Josefin Sans giving the headings a light geometric voice. For fields where calm reads as
 * competence — design, architecture, research.
 */
import { defaultPrimitives } from '@/components/pdf/primitives'
import type { DocTheme } from './style'
import {
  DEVELOPER_GRAY,
  FONT_SANS,
  GLACIER_PAPER,
  NEUTRALIZED_ALERTS,
  PAPER_MUTED,
  PAPER_WHITE,
  PRINT_BLACK,
  SILVER_GRAY,
  STEEL_INK,
  STEEL_WASH,
} from './tokens'

const FONT_JOSEFIN = '"Josefin Sans"'

export const glacierTheme: DocTheme = {
  name: 'glacier',
  primitives: defaultPrimitives,
  colors: {
    foreground: PRINT_BLACK,
    background: GLACIER_PAPER,
    muted: PAPER_MUTED,
    mutedForeground: DEVELOPER_GRAY,
    primary: STEEL_INK,
    primaryForeground: PAPER_WHITE,
    border: SILVER_GRAY,
    accent: STEEL_INK,
    ...NEUTRALIZED_ALERTS,
  },
  typography: {
    body: {
      fontFamily: FONT_SANS,
      fontSize: 10.5,
      lineHeight: 1.5,
    },
    heading: {
      fontFamily: FONT_JOSEFIN,
      fontWeight: 700,
      lineHeight: 1.22,
      fontSize: { h1: 24, h2: 11.5, h3: 12, h4: 10.5, h5: 10, h6: 9.5 },
    },
  },
  spacing: {
    page: { marginTop: 46, marginRight: 46, marginBottom: 46, marginLeft: 46 },
    sectionGap: 18,
    paragraphGap: 8,
    componentGap: 10,
  },
  page: { size: 'A4', orientation: 'portrait' },
  style: {
    accent: STEEL_INK,
    accentWash: STEEL_WASH,
    onAccent: PAPER_WHITE,
    masthead: 'plain',
    heading: 'shortline',
    nameInAccent: true,
    headingInAccent: true,
    bulletsInAccent: true,
    roleInAccent: false,
    watermark: 'disc',
    paper: GLACIER_PAPER,
  },
}
