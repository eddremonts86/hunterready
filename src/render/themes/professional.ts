/**
 * "Professional" — serif headings, navy name, a heavy navy rule under each section.
 *
 * The navy every printed CV used before ATS existed. Suits health, education, law and the public
 * sector: fields where a document is expected to look like it has been formatted this way for decades.
 */
import { defaultPrimitives } from '@/components/pdf/primitives'
import type { DocTheme } from './style'
import {
  DEVELOPER_GRAY,
  FONT_SANS,
  FONT_SERIF,
  NAVY_INK,
  NAVY_WASH,
  NEUTRALIZED_ALERTS,
  PAPER_MUTED,
  PAPER_WHITE,
  PRINT_BLACK,
  SILVER_GRAY,
} from './tokens'

export const professionalTheme: DocTheme = {
  name: 'professional',
  primitives: defaultPrimitives,
  colors: {
    foreground: PRINT_BLACK,
    background: PAPER_WHITE,
    muted: PAPER_MUTED,
    mutedForeground: DEVELOPER_GRAY,
    primary: NAVY_INK,
    primaryForeground: PAPER_WHITE,
    border: SILVER_GRAY,
    accent: NAVY_INK,
    ...NEUTRALIZED_ALERTS,
  },
  typography: {
    body: {
      fontFamily: FONT_SANS,
      fontSize: 10.5,
      lineHeight: 1.5,
    },
    heading: {
      fontFamily: FONT_SERIF,
      fontWeight: 700,
      lineHeight: 1.25,
      fontSize: {
        h1: 26,
        h2: 12,
        h3: 13,
        h4: 11,
        h5: 10.5,
        h6: 10,
      },
    },
  },
  spacing: {
    page: {
      marginTop: 52,
      marginRight: 48,
      marginBottom: 52,
      marginLeft: 48,
    },
    sectionGap: 22,
    paragraphGap: 9,
    componentGap: 11,
  },
  page: {
    size: 'A4',
    orientation: 'portrait',
  },
  style: {
    accent: NAVY_INK,
    accentWash: NAVY_WASH,
    onAccent: PAPER_WHITE,
    masthead: 'plain',
    heading: 'underline',
    nameInAccent: true,
    headingInAccent: true,
    bulletsInAccent: false,
    roleInAccent: false,
  },
}
