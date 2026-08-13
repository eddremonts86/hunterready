/**
 * Date and text formatting for documents.
 *
 * The ATS ruleset (docs/05-pdf-rendering.md) mandates `MMM YYYY – MMM YYYY` with `Present`
 * for current roles, consistently everywhere. Real parsers key on that shape; a CV that
 * mixes `01/2019`, `Jan 2019` and `2019-01` loses date ranges.
 *
 * English month abbreviations regardless of `resume.locale`: the output document targets
 * recruiters and screeners in EU/US hiring, where English dates parse and localized month
 * names frequently do not. Revisit when v1.0 ships localized output.
 */
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/** `"2019-03"` → `"Mar 2019"`; `"2019"` → `"2019"`. */
export function formatYearMonth(value: string | undefined): string {
  if (value === undefined || value === '') return ''

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

/** `endDate === null` means current, so it prints `Present` (never an empty dash). */
export function formatRange(
  startDate: string | undefined,
  endDate: string | null,
): string {
  const start = formatYearMonth(startDate)
  const end = endDate === null ? 'Present' : formatYearMonth(endDate)

  if (start === '' && end === '') return ''
  if (start === '') return end
  if (end === '') return start
  return `${start} – ${end}`
}

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
