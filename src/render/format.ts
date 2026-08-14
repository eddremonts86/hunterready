/**
 * Date and text formatting for documents.
 *
 * The ATS ruleset (docs/05-pdf-rendering.md) mandates `MMM YYYY – MMM YYYY` with the local word for
 * "present" on current roles, consistently everywhere. Real parsers key on that shape; a CV that mixes
 * `01/2019`, `Jan 2019` and `2019-01` loses date ranges.
 *
 * **Localized since v0.8.** These functions used to hardcode English months with a comment saying the
 * output "targets recruiters and screeners in EU/US hiring, where English dates parse". That was wrong
 * about this product's audience: a Danish nurse applying to a Danish hospital was handed a Danish CV with
 * `Mar 2019` in it. `locale` defaults to English so every existing caller behaves as before, and the
 * document passes `resolveLocale(resume.locale)`.
 */
import { resolveLocale, strings } from './locale'
import type { OutputLocale } from './locale'

/** `"2019-03"` → `"Mar 2019"` in English, `"mar. 2019"` in Danish; `"2019"` → `"2019"` in both. */
export function formatYearMonth(
  value: string | undefined,
  locale: OutputLocale = 'en',
): string {
  if (value === undefined || value === '') return ''
  const MONTHS = strings(locale).months

  const parts = value.split('-')
  const year = parts[0]
  // Year-only is legitimate — CVs say "2019" with no month, and the schema allows it.
  if (parts.length < 2) return year

  // Bounds-checked on the index rather than the lookup: with a readonly tuple TypeScript
  // considers `MONTHS[n]` always defined, so an undefined check there is dead code to it.
  const monthIndex = Number(parts[1]) - 1
  if (
    !Number.isInteger(monthIndex) ||
    monthIndex < 0 ||
    monthIndex >= MONTHS.length
  ) {
    return year
  }

  return `${MONTHS[monthIndex]} ${year}`
}

/** `endDate === null` means current, so it prints the local word for it (never an empty dash). */
export function formatRange(
  startDate: string | undefined,
  endDate: string | null,
  locale: OutputLocale = 'en',
): string {
  const local = strings(locale)
  const start = formatYearMonth(startDate, locale)
  const end =
    endDate === null ? local.present : formatYearMonth(endDate, locale)

  if (start === '' && end === '') return ''
  if (start === '') return end
  if (end === '') return start
  return `${start}${local.rangeSeparator}${end}`
}

/** The locale a document should be set in, from its own `resume.locale`. Re-exported for convenience. */
export { resolveLocale }

/** Joins the non-empty parts of a contact line with a visible separator. */
export function joinParts(
  parts: Array<string | undefined>,
  separator = '  ·  ',
): string {
  return parts
    .filter((p): p is string => p !== undefined && p !== '')
    .join(separator)
}

/** `{ city, region, country }` → `"Copenhagen, Denmark"`. */
export function formatLocation(
  location: { city?: string; region?: string; country?: string } | undefined,
): string {
  if (location === undefined) return ''
  return joinParts([location.city, location.region, location.country], ', ')
}
