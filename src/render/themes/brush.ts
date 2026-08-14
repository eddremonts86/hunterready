/**
 * "Brush" — the name hand-written in Caveat Brush, coral strokes, Lora body.
 *
 * The creative theme: a script name at poster size over a warm serif, coral shortlines under the
 * headings. The script face touches exactly one string — the name — which the round-trip suite
 * scores on every build, so the flourish is proven parseable rather than assumed.
 */
import { defaultPrimitives } from '@/components/pdf/primitives'
import type { DocTheme } from './style'
import {
  CORAL_INK,
  CORAL_WASH,
  DEVELOPER_GRAY,
  NEUTRALIZED_ALERTS,
  PAPER_MUTED,
  PAPER_WHITE,
  PRINT_BLACK,
  SILVER_GRAY,
} from './tokens'

const FONT_LORA = '"Lora"'
const FONT_CAVEAT = '"Caveat Brush"'

export const brushTheme: DocTheme = {
  name: 'brush',
  primitives: defaultPrimitives,
  colors: {
    foreground: PRINT_BLACK,
    background: PAPER_WHITE,
    muted: PAPER_MUTED,
    mutedForeground: DEVELOPER_GRAY,
    primary: CORAL_INK,
    primaryForeground: PAPER_WHITE,
    border: SILVER_GRAY,
    accent: CORAL_INK,
    ...NEUTRALIZED_ALERTS,
  },
  typography: {
    body: {
      fontFamily: FONT_LORA,
      fontSize: 10.5,
      lineHeight: 1.5,
    },
    heading: {
      fontFamily: FONT_LORA,
      fontWeight: 700,
      lineHeight: 1.22,
      fontSize: { h1: 30, h2: 11, h3: 12, h4: 10.5, h5: 10, h6: 9.5 },
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
    accent: CORAL_INK,
    accentWash: CORAL_WASH,
    onAccent: PAPER_WHITE,
    masthead: 'plain',
    heading: 'shortline',
    nameInAccent: true,
    headingInAccent: true,
    bulletsInAccent: true,
    roleInAccent: false,
    nameFontFamily: FONT_CAVEAT,
  },
}
