/**
 * Document theme registry.
 *
 * These are HunterReady's own themes, derived from DESIGN.md's print-side tokens. pdfcn's
 * shipped themes (`src/components/pdf/theme-*.ts`) stay available but are not offered in
 * the UI: they carry colored accents (#3b82f6 and friends), which a sector-neutral CV
 * should not, and their semantic tokens are not neutralized.
 */
import type { PdfcnTheme } from '@/components/pdf/theme-types'
import { academicTheme } from './academic'
import { blossomTheme } from './blossom'
import { brushTheme } from './brush'
import { carnivalTheme } from './carnival'
import { editorialTheme } from './editorial'
import { glacierTheme } from './glacier'
import { groteskTheme } from './grotesk'
import { heritageTheme } from './heritage'
import { parchmentTheme } from './parchment'
import { compactTheme } from './compact'
import { executiveTheme } from './executive'
import { minimalTheme } from './minimal'
import { modernTheme } from './modern'
import { narrowTheme } from './narrow'
import { onyxTheme } from './onyx'
import { professionalTheme } from './professional'
import { technicalTheme } from './technical'

/**
 * Sixteen, across ten bundled families.
 *
 * The first eight kept to the four families that already existed, on the theory that type is where a
 * document's character lives. Edd's verdict on the result — thirty designs nobody would pay for — killed
 * the theory: character lives in what a person can see at arm's length. The expansion (ADR-025) vendored
 * five more families (Playfair Display, EB Garamond, Space Grotesk, Lora, Josefin Sans; Caveat Brush was
 * already here for the chrome) and added the axes type alone cannot carry: tinted papers, masthead
 * bands, per-section color chips, a script face for the name. Every family is OFL, bundled by
 * `scripts/bundle-fonts.mjs`, and probed against the renderer before anything relies on it (ADR-022).
 */
export const THEME_IDS = [
  'modern',
  'professional',
  'executive',
  'compact',
  'minimal',
  'narrow',
  'academic',
  'technical',
  // The character expansion (ADR-025): tinted papers, display faces, multi-color chips.
  'glacier',
  'parchment',
  'blossom',
  'carnival',
  'editorial',
  'grotesk',
  'heritage',
  'brush',
  'onyx',
] as const
export type ThemeId = (typeof THEME_IDS)[number]

export const DEFAULT_THEME_ID: ThemeId = 'modern'

export const themes: Record<ThemeId, PdfcnTheme> = {
  modern: modernTheme,
  professional: professionalTheme,
  executive: executiveTheme,
  compact: compactTheme,
  minimal: minimalTheme,
  narrow: narrowTheme,
  academic: academicTheme,
  technical: technicalTheme,
  glacier: glacierTheme,
  parchment: parchmentTheme,
  blossom: blossomTheme,
  carnival: carnivalTheme,
  editorial: editorialTheme,
  grotesk: groteskTheme,
  heritage: heritageTheme,
  brush: brushTheme,
  onyx: onyxTheme,
}

/** Shown in the theme picker. Plain language — the audience is not designers. */
export const themeLabels: Record<ThemeId, { label: string; hint: string }> = {
  modern: {
    label: 'Modern',
    hint: 'Clean and current, with a teal accent. A good default for most fields.',
  },
  professional: {
    label: 'Professional',
    hint: 'Navy headings over a heavy rule. Suits health, education, law and public sector.',
  },
  executive: {
    label: 'Executive',
    hint: 'Your name in white on a dark masthead. Best for senior roles; uses more pages.',
  },
  compact: {
    label: 'Compact',
    hint: 'Fits more on each page, with rust-tinted section bands to keep it readable.',
  },
  minimal: {
    label: 'Minimal',
    hint: 'Typewriter headings, wide margins, no decoration at all. Quietly confident.',
  },
  narrow: {
    label: 'Narrow',
    hint: 'Condensed type with solid green section bands. Packs a long history in.',
  },
  academic: {
    label: 'Academic',
    hint: 'Centred and classical, in maroon. For CVs where the institutions carry weight.',
  },
  technical: {
    label: 'Technical',
    hint: 'Monospace headings in boxes, like good documentation. At home in IT and engineering.',
  },
  glacier: {
    label: 'Glacier',
    hint: 'The whole page is a pale blue, with light geometric headings. Calm and unusual.',
  },
  parchment: {
    label: 'Parchment',
    hint: 'A cream page set in a classical book face. For fields that still write letters.',
  },
  blossom: {
    label: 'Blossom',
    hint: 'Your name in white on a deep rose band, headings on pale pink. The warmest one here.',
  },
  carnival: {
    label: 'Carnival',
    hint: 'A different colour per section — orange, brick and green chips under a rose masthead.',
  },
  editorial: {
    label: 'Editorial',
    hint: 'A magazine-scale name, centred, black on white. Presence without any colour at all.',
  },
  grotesk: {
    label: 'Grotesk',
    hint: 'Contemporary type with plum accents. For product, media and studios.',
  },
  heritage: {
    label: 'Heritage',
    hint: 'Classical serifs and bronze, centred. For careers built on institutions.',
  },
  brush: {
    label: 'Brush',
    hint: 'Your name hand-written at poster size, coral accents, a warm serif underneath.',
  },
  onyx: {
    label: 'Onyx',
    hint: 'Light type on a dark page. Striking on screen; printers will thank you for a light one.',
  },
}

export function getTheme(id: ThemeId = DEFAULT_THEME_ID): PdfcnTheme {
  return themes[id]
}

export function isThemeId(value: string): value is ThemeId {
  return (THEME_IDS as ReadonlyArray<string>).includes(value)
}

export {
  modernTheme,
  professionalTheme,
  executiveTheme,
  compactTheme,
  minimalTheme,
  narrowTheme,
  academicTheme,
  technicalTheme,
}
