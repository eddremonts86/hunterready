/**
 * Document theme registry.
 *
 * These are HunterReady's own themes, derived from DESIGN.md's print-side tokens. pdfcn's
 * shipped themes (`src/components/pdf/theme-*.ts`) stay available but are not offered in
 * the UI: they carry colored accents (#3b82f6 and friends), which a sector-neutral CV
 * should not, and their semantic tokens are not neutralized.
 */
import type { PdfcnTheme } from '@/components/pdf/theme-types'
import { compactTheme } from './compact'
import { executiveTheme } from './executive'
import { modernTheme } from './modern'
import { professionalTheme } from './professional'

export const THEME_IDS = [
  'modern',
  'professional',
  'executive',
  'compact',
] as const
export type ThemeId = (typeof THEME_IDS)[number]

export const DEFAULT_THEME_ID: ThemeId = 'modern'

export const themes: Record<ThemeId, PdfcnTheme> = {
  modern: modernTheme,
  professional: professionalTheme,
  executive: executiveTheme,
  compact: compactTheme,
}

/** Shown in the theme picker. Plain language — the audience is not designers. */
export const themeLabels: Record<ThemeId, { label: string; hint: string }> = {
  modern: {
    label: 'Modern',
    hint: 'Clean and current. A good default for most fields.',
  },
  professional: {
    label: 'Professional',
    hint: 'Formal headings. Suits health, education, law and public sector.',
  },
  executive: {
    label: 'Executive',
    hint: 'Larger and more spacious. Best for senior roles; uses more pages.',
  },
  compact: {
    label: 'Compact',
    hint: 'Fits more on each page. Use it when a long history would otherwise spill over.',
  },
}

export function getTheme(id: ThemeId = DEFAULT_THEME_ID): PdfcnTheme {
  return themes[id]
}

export function isThemeId(value: string): value is ThemeId {
  return (THEME_IDS as ReadonlyArray<string>).includes(value)
}

export { modernTheme, professionalTheme, executiveTheme, compactTheme }
