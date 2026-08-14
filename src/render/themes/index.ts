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
import { compactTheme } from './compact'
import { executiveTheme } from './executive'
import { minimalTheme } from './minimal'
import { modernTheme } from './modern'
import { narrowTheme } from './narrow'
import { professionalTheme } from './professional'
import { technicalTheme } from './technical'

/**
 * Eight, and every one of them uses a family already bundled and registered.
 *
 * That constraint is the reason there are eight rather than pdfcn's nine or some larger number: a new
 * typeface is not a line of config, it is megabytes in the deployed image and a `make-fonts.mjs` run, and
 * ADR-022 is the record of what happens when fonts get vendored before anyone checks the renderer can use
 * them. Source Sans 3, Source Serif 4, Courier Prime and Archivo Narrow give four genuine type
 * directions; the rest of the difference is size, leading and margin, which is where a document's
 * character actually lives.
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
