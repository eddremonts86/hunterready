/**
 * "Carnival" — a rose masthead and a different colored chip per section.
 *
 * The loudest legal design: EXPERIENCE on orange, EDUCATION on brick, SKILLS on forest — each
 * heading a solid chip, each chip a different hue, the construction Apple's most colorful CV
 * template uses. The words in the chips never change; an extractor reads them exactly as ink.
 */
import { defaultPrimitives } from '@/components/pdf/primitives'
import type { DocTheme } from './style'
import {
  BRICK_INK,
  DEVELOPER_GRAY,
  FONT_SANS,
  FOREST_INK,
  NEUTRALIZED_ALERTS,
  ORANGE_INK,
  PAPER_MUTED,
  PAPER_WHITE,
  PRINT_BLACK,
  ROSE_INK,
  RUST_WASH,
  SILVER_GRAY,
} from './tokens'

export const carnivalTheme: DocTheme = {
  name: 'carnival',
  primitives: defaultPrimitives,
  colors: {
    foreground: PRINT_BLACK,
    background: PAPER_WHITE,
    muted: PAPER_MUTED,
    mutedForeground: DEVELOPER_GRAY,
    primary: BRICK_INK,
    primaryForeground: PAPER_WHITE,
    border: SILVER_GRAY,
    accent: BRICK_INK,
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
      lineHeight: 1.18,
      fontSize: { h1: 23, h2: 11, h3: 11.5, h4: 10.5, h5: 10, h6: 9.5 },
    },
  },
  spacing: {
    page: { marginTop: 42, marginRight: 42, marginBottom: 42, marginLeft: 42 },
    sectionGap: 16,
    paragraphGap: 8,
    componentGap: 10,
  },
  page: { size: 'A4', orientation: 'portrait' },
  style: {
    accent: BRICK_INK,
    accentWash: RUST_WASH,
    onAccent: PAPER_WHITE,
    masthead: 'band',
    mastheadAccent: ROSE_INK,
    heading: 'band',
    nameInAccent: false,
    headingInAccent: false,
    bulletsInAccent: true,
    roleInAccent: false,
    sectionAccents: {
      work: ORANGE_INK,
      education: BRICK_INK,
      skills: FOREST_INK,
    },
  },
}
