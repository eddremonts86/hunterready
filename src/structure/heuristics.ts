/**
 * Deterministic cleanup after extraction.
 *
 * Rule of thumb: **never ask the model to do what code does reliably.** Date parsing, sorting and
 * deduplication are cheap, exact and free here; asking for them costs tokens and introduces
 * variance in the one part of the pipeline that should have none.
 *
 * Everything in this file is pure. It runs on every extraction, including a cached one.
 */
import type { Resume, WorkItem } from '@/schema/resume'

const MONTHS: Record<string, number> = {
  // English
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
  // Spanish (keys already present in English are omitted: one map, no duplicates)
  ene: 1,
  enero: 1,
  febrero: 2,
  marzo: 3,
  abr: 4,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  dic: 12,
  diciembre: 12,
  // Danish
  januar: 1,
  februar: 2,
  marts: 3,
  maj: 5,
  juni: 6,
  juli: 7,
  oktober: 10,
}

/** Words meaning "still there", across our three languages. */
const PRESENT = [
  'present',
  'current',
  'now',
  'to date',
  'ongoing',
  'actualidad',
  'actual',
  'presente',
  'hoy',
  'nu',
  'nuvaerende',
  'i dag',
]

function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** True when a raw date string means "this is my current role". */
export function meansPresent(raw: string): boolean {
  const normalized = stripAccents(raw).toLowerCase().trim()
  return PRESENT.some(
    (word) => normalized === word || normalized.includes(word),
  )
}

/**
 * Any human date → `YYYY-MM` or `YYYY`. Returns undefined rather than guessing.
 *
 * Handles: `Mar 2019`, `March 2019`, `03/2019`, `2019-03`, `2019/03`, `marzo de 2019`,
 * `mar. 2019`, `2019`. Deliberately does **not** handle `03/04/2019` — day-first and month-first
 * are ambiguous across our markets, and a wrong month is worse than a year-only date.
 */
export function normalizeDate(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  const text = stripAccents(raw).toLowerCase().trim()
  if (text === '') return undefined

  // Already canonical.
  const canonical = /^(\d{4})(?:-(\d{1,2}))?$/.exec(text)
  if (canonical !== null) {
    const year = canonical[1]
    const month = canonical[2]
    if (month === undefined) return year
    const m = Number(month)
    return m >= 1 && m <= 12 ? `${year}-${String(m).padStart(2, '0')}` : year
  }

  // Month name + year, in either order.
  const nameFirst = /^([a-z]+)\.?\s*(?:de\s+)?(\d{4})$/.exec(text)
  const yearFirst = /^(\d{4})\s+([a-z]+)\.?$/.exec(text)
  const nameMatch = nameFirst ?? yearFirst
  if (nameMatch !== null) {
    const [name, year] =
      nameFirst !== null
        ? [nameMatch[1], nameMatch[2]]
        : [nameMatch[2], nameMatch[1]]
    const month = MONTHS[name]
    if (month !== undefined) return `${year}-${String(month).padStart(2, '0')}`
    return year
  }

  // Numeric month/year, either separator, either order.
  const numeric = /^(\d{1,2})[/.-](\d{4})$/.exec(text)
  if (numeric !== null) {
    const month = Number(numeric[1])
    if (month >= 1 && month <= 12) {
      return `${numeric[2]}-${String(month).padStart(2, '0')}`
    }
    return numeric[2]
  }
  const numericReversed = /^(\d{4})[/.](\d{1,2})$/.exec(text)
  if (numericReversed !== null) {
    const month = Number(numericReversed[2])
    if (month >= 1 && month <= 12) {
      return `${numericReversed[1]}-${String(month).padStart(2, '0')}`
    }
    return numericReversed[1]
  }

  // A bare year hiding in a longer string, e.g. "since 2019".
  const bareYear = /\b((?:19|20)\d{2})\b/.exec(text)
  if (bareYear !== null) return bareYear[1]

  return undefined
}

/** Sort key: later dates first, undefined last. `null` end date (current) sorts first. */
function sortKey(startDate: string | undefined): number {
  if (startDate === undefined) return -1
  const [year, month] = startDate.split('-')
  return Number(year) * 12 + (month === undefined ? 6 : Number(month))
}

function dedupePreservingFirstCasing(items: Array<string>): Array<string> {
  const seen = new Map<string, string>()
  for (const item of items) {
    const key = item.trim().toLowerCase()
    if (key === '') continue
    if (!seen.has(key)) seen.set(key, item.trim())
  }
  return [...seen.values()]
}

/** A skills blob with no categories — split it on the separators people actually use. */
function splitSkillBlob(value: string): Array<string> {
  return value
    .split(/[,;|·•\n]+|\s{3,}/)
    .map((part) => part.trim())
    .filter((part) => part !== '' && part.length < 60)
}

function isEmptyWork(item: WorkItem): boolean {
  return (
    item.company.trim() === '' &&
    item.role.trim() === '' &&
    item.highlights.length === 0
  )
}

/**
 * Applies every deterministic fix. Returns a new Resume; never mutates the input, because the
 * caller keeps the pre-heuristics version to compute what changed.
 */
export function applyHeuristics(resume: Resume): Resume {
  const work = resume.work
    .filter((item) => !isEmptyWork(item))
    .map((item) => ({
      ...item,
      startDate: normalizeDate(item.startDate),
      endDate:
        item.endDate === null
          ? null
          : meansPresent(item.endDate)
            ? null
            : (normalizeDate(item.endDate) ?? null),
      highlights: item.highlights.map((h) => h.trim()).filter((h) => h !== ''),
      tech: dedupePreservingFirstCasing(item.tech),
    }))
    // Most-recent first. Current roles (null end) win ties.
    .sort((a, b) => {
      const byStart = sortKey(b.startDate) - sortKey(a.startDate)
      if (byStart !== 0) return byStart
      if (a.endDate === null && b.endDate !== null) return -1
      if (b.endDate === null && a.endDate !== null) return 1
      return 0
    })

  const education = resume.education
    .filter((item) => item.institution.trim() !== '')
    .map((item) => ({
      ...item,
      startDate: normalizeDate(item.startDate),
      endDate:
        item.endDate === null
          ? null
          : meansPresent(item.endDate)
            ? null
            : (normalizeDate(item.endDate) ?? null),
    }))
    .sort((a, b) => sortKey(b.startDate) - sortKey(a.startDate))

  const skills = resume.skills
    .map((group) => {
      // A single long "item" is really a blob the model failed to split.
      const items =
        group.items.length === 1 && group.items[0].length > 40
          ? splitSkillBlob(group.items[0])
          : group.items
      return {
        ...group,
        category: group.category.trim(),
        items: dedupePreservingFirstCasing(items),
      }
    })
    .filter((group) => group.items.length > 0)

  const certifications = resume.certifications
    .filter((item) => item.name.trim() !== '')
    .map((item) => ({
      ...item,
      date: normalizeDate(item.date),
      expires: normalizeDate(item.expires),
    }))

  return {
    ...resume,
    basics: {
      ...resume.basics,
      fullName: resume.basics.fullName.replace(/\s+/g, ' ').trim(),
      // A malformed address is demoted to absent rather than rendered as garbage; the review
      // step will surface it as a field to check.
      email: resume.basics.email?.trim().toLowerCase(),
      links: resume.basics.links.filter((link) =>
        /^https?:\/\//.test(link.url),
      ),
    },
    work,
    education,
    skills,
    certifications,
    projects: resume.projects.filter((p) => p.name.trim() !== ''),
    languages: resume.languages.filter((l) => l.name.trim() !== ''),
  }
}
