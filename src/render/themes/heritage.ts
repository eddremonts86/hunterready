/**
 * "Heritage" — EB Garamond headings over Lora, bronze accents, centred and grave.
 *
 * The institutional serif page for careers built on names that carry weight: chambers, faculties,
 * foundations. Bronze rather than gold — a hue that reads as history, not jewellery.
 */
import { defaultPrimitives } from '@/components/pdf/primitives'
import type { DocTheme } from './style'
import {
  BRONZE_INK,
  BRONZE_WASH,
  DEVELOPER_GRAY,
  NEUTRALIZED_ALERTS,
  PAPER_MUTED,
  PAPER_WHITE,
  PRINT_BLACK,
  SILVER_GRAY,
} from './tokens'

const FONT_GARAMOND = '"EB Garamond"'
const FONT_LORA = '"Lora"'

export const heritageTheme: DocTheme = {
  name: 'heritage',
  primitives: defaultPrimitives,
  colors: {
    foreground: PRINT_BLACK,
    background: PAPER_WHITE,
    muted: PAPER_MUTED,
    mutedForeground: DEVELOPER_GRAY,
    primary: BRONZE_INK,
    primaryForeground: PAPER_WHITE,
    border: SILVER_GRAY,
    accent: BRONZE_INK,
    ...NEUTRALIZED_ALERTS,
  },
  typography: {
    body: {
      fontFamily: FONT_LORA,
      fontSize: 10.5,
      lineHeight: 1.5,
    },
    heading: {
      fontFamily: FONT_GARAMOND,
      fontWeight: 700,
      lineHeight: 1.22,
      fontSize: { h1: 25, h2: 12, h3: 13, h4: 11, h5: 10.5, h6: 10 },
    },
  },
  spacing: {
    page: { marginTop: 50, marginRight: 48, marginBottom: 50, marginLeft: 48 },
    sectionGap: 21,
    paragraphGap: 9,
    componentGap: 11,
  },
  page: { size: 'A4', orientation: 'portrait' },
  style: {
    accent: BRONZE_INK,
    accentWash: BRONZE_WASH,
    onAccent: PAPER_WHITE,
    masthead: 'centered',
    heading: 'flanked',
    nameInAccent: false,
    headingInAccent: true,
    bulletsInAccent: false,
    roleInAccent: false,
  },
}
