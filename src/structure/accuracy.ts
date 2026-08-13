/**
 * Field-level extraction accuracy against a hand-written expected result.
 *
 * "Did it run" is not a quality signal, and neither is a spot check: the whole point of
 * docs/04-ingestion.md's fixture table is a number that moves when a change helps and moves the
 * other way when it hurts. Without one, every prompt tweak and every normalizer heuristic is
 * guesswork dressed as progress.
 *
 * Scoring choices, all deliberate:
 *
 *  • **Recall over precision.** A missing employer costs someone an interview; an extra field costs
 *    them a moment in the review form. So the score is "how much of the expected content survived",
 *    and extras are reported separately rather than punished.
 *  • **Fuzzy string equality, with a bounded surplus.** Case, accents, punctuation and whitespace
 *    are normalized away: a parser that returns "SCHILLING APS" for "Schilling ApS" has done its
 *    job. But containment alone is far too kind — it scored
 *    `"Account Manager, Northgate Supplies (Jan 2024"` as a hit for `"Account Manager"`, so a field
 *    carrying thirty characters of junk counted as recovered and the suite stayed green through a
 *    real defect. Extra text is now capped, and any digit in it disqualifies the match.
 *  • **Work entries match on employer + role, not on order.** Order is checked separately, because
 *    it is a different failure with a different cause.
 */
import type { Resume } from '@/schema/resume'

export interface FieldScore {
  field: string
  expected: number
  matched: number
  /** Values present in the output that the expected result does not have. */
  extra: number
}

export interface AccuracyReport {
  scores: Array<FieldScore>
  /** matched / expected across every field. 0–1. */
  overall: number
  /** Employers appearing in the expected order. */
  orderPreserved: boolean
  misses: Array<string>
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * How much extra text a containment match may carry and still count.
 *
 * Six characters covers the differences that are genuinely the same value — a legal suffix like
 * "Ltd", "ApS" or "A/S" — and excludes the ones that are a bug: a trailing date parenthetical, a
 * location welded onto an employer, two bullets merged into one.
 */
const MAX_EXTRA_CHARS = 6

/** Equal enough: identical after normalization, or contained with only a trivial surplus. */
function similar(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) return false
  const left = normalize(a)
  const right = normalize(b)
  if (left === '' || right === '') return false
  if (left === right) return true

  // Containment only counts when the shorter side is substantial, so "a" does not match everything.
  const shorter = left.length <= right.length ? left : right
  const longer = left.length <= right.length ? right : left
  if (shorter.length < 4 || !longer.includes(shorter)) return false

  // What the longer side carries beyond the value we were looking for. A digit in there means a date
  // or an identifier came along for the ride, which is never the same value.
  const surplus = longer.replace(shorter, ' ').trim()
  return surplus.length <= MAX_EXTRA_CHARS && !/\d/.test(surplus)
}

/**
 * Pair each expected job with a *distinct* actual one, preferring agreement on both fields.
 *
 * Matching on either field alone and never consuming the match is wrong in the most ordinary case
 * there is — a promotion, two jobs at one employer. Both expected entries paired to the first actual
 * one, so the second job's dates could never score no matter what the parser produced. That quietly
 * cost 2 of 4 date points on the cleanest fixture in the set, 2 of 6 on another, and was reported
 * twice as an extraction weakness when it was a bug in the ruler.
 */
function pairJobs(
  expected: Resume['work'],
  actual: Resume['work'],
): Map<number, Resume['work'][number]> {
  const candidates: Array<{ want: number; have: number; score: number }> = []

  expected.forEach((want, wantIndex) => {
    actual.forEach((have, haveIndex) => {
      const company = similar(have.company, want.company)
      const role = similar(have.role, want.role)
      if (!company && !role) return
      candidates.push({
        want: wantIndex,
        have: haveIndex,
        score: (company ? 1 : 0) + (role ? 1 : 0),
      })
    })
  })

  // Best agreement first, then each side used at most once.
  candidates.sort((a, b) => b.score - a.score)
  const paired = new Map<number, Resume['work'][number]>()
  const used = new Set<number>()
  for (const candidate of candidates) {
    if (paired.has(candidate.want) || used.has(candidate.have)) continue
    paired.set(candidate.want, actual[candidate.have])
    used.add(candidate.have)
  }
  return paired
}

function scoreStrings(
  field: string,
  expected: Array<string>,
  actual: Array<string>,
  misses: Array<string>,
): FieldScore {
  const remaining = [...actual]
  let matched = 0

  for (const want of expected) {
    const at = remaining.findIndex((have) => similar(have, want))
    if (at === -1) {
      misses.push(`${field}: ${want}`)
      continue
    }
    remaining.splice(at, 1)
    matched++
  }

  return { field, expected: expected.length, matched, extra: remaining.length }
}

function scoreScalar(
  field: string,
  expected: string | undefined,
  actual: string | undefined,
  misses: Array<string>,
): FieldScore {
  if (expected === undefined) {
    return {
      field,
      expected: 0,
      matched: 0,
      extra: actual === undefined ? 0 : 1,
    }
  }
  const matched = similar(expected, actual) ? 1 : 0
  if (matched === 0) misses.push(`${field}: ${expected}`)
  return { field, expected: 1, matched, extra: 0 }
}

export function scoreExtraction(
  actual: Resume,
  expected: Resume,
): AccuracyReport {
  const misses: Array<string> = []
  const scores: Array<FieldScore> = []

  // ── identity ───────────────────────────────────────────────────────────────────────────
  scores.push(
    scoreScalar(
      'name',
      expected.basics.fullName,
      actual.basics.fullName,
      misses,
    ),
  )
  scores.push(
    scoreScalar('email', expected.basics.email, actual.basics.email, misses),
  )
  scores.push(
    scoreScalar(
      'phone',
      // Compare digits only: formatting is not information.
      expected.basics.phone?.replace(/\D/g, ''),
      actual.basics.phone?.replace(/\D/g, ''),
      misses,
    ),
  )

  // ── work ───────────────────────────────────────────────────────────────────────────────
  scores.push(
    scoreStrings(
      'employers',
      expected.work.map((w) => w.company).filter((c) => c !== ''),
      actual.work.map((w) => w.company),
      misses,
    ),
  )
  scores.push(
    scoreStrings(
      'roles',
      expected.work.map((w) => w.role).filter((r) => r !== ''),
      actual.work.map((w) => w.role),
      misses,
    ),
  )

  // Dates are scored per job, against the job they belong to: a right date on the wrong entry is
  // not a hit.
  const jobPairs = pairJobs(expected.work, actual.work)
  let dateExpected = 0
  let dateMatched = 0
  for (const [wantIndex, want] of expected.work.entries()) {
    const have = jobPairs.get(wantIndex)
    if (want.startDate !== undefined) {
      dateExpected++
      if (have?.startDate === want.startDate) dateMatched++
      else
        misses.push(
          `start date for ${want.company || want.role}: ${want.startDate}`,
        )
    }
    dateExpected++
    if (have !== undefined && have.endDate === want.endDate) dateMatched++
    else
      misses.push(
        `end date for ${want.company || want.role}: ${want.endDate ?? 'present'}`,
      )
  }
  scores.push({
    field: 'job dates',
    expected: dateExpected,
    matched: dateMatched,
    extra: 0,
  })

  scores.push(
    scoreStrings(
      'bullets',
      expected.work.flatMap((w) => w.highlights),
      actual.work.flatMap((w) => w.highlights),
      misses,
    ),
  )

  // ── education, skills, languages ───────────────────────────────────────────────────────
  scores.push(
    scoreStrings(
      'institutions',
      expected.education.map((e) => e.institution),
      actual.education.map((e) => e.institution),
      misses,
    ),
  )
  scores.push(
    scoreStrings(
      'skills',
      expected.skills.flatMap((g) => g.items),
      actual.skills.flatMap((g) => g.items),
      misses,
    ),
  )
  scores.push(
    scoreStrings(
      'languages',
      expected.languages.map((l) => l.name),
      actual.languages.map((l) => l.name),
      misses,
    ),
  )

  const totalExpected = scores.reduce((sum, s) => sum + s.expected, 0)
  const totalMatched = scores.reduce((sum, s) => sum + s.matched, 0)

  // Employers in the expected sequence. Only meaningful when they are distinct.
  const wantedOrder = expected.work
    .map((w) => w.company)
    .filter((c) => c !== '')
  const distinct =
    new Set(wantedOrder.map(normalize)).size === wantedOrder.length
  let orderPreserved = true
  if (distinct && wantedOrder.length > 1) {
    const positions = wantedOrder.map((company) =>
      actual.work.findIndex((job) => similar(job.company, company)),
    )
    const found = positions.filter((p) => p !== -1)
    orderPreserved = found.every((p, i) => i === 0 || p > found[i - 1])
  }

  return {
    scores,
    overall: totalExpected === 0 ? 1 : totalMatched / totalExpected,
    orderPreserved,
    misses,
  }
}

/** A fixed-width table, so a change in accuracy is visible at a glance in CI output. */
export function formatReport(label: string, report: AccuracyReport): string {
  const rows = report.scores.map((s) => {
    const pct =
      s.expected === 0
        ? '  —  '
        : `${Math.round((s.matched / s.expected) * 100)}%`.padStart(5)
    return `    ${s.field.padEnd(14)} ${String(s.matched).padStart(3)}/${String(s.expected).padEnd(3)} ${pct}${s.extra > 0 ? `  (+${s.extra} extra)` : ''}`
  })
  return [
    `  ${label} — overall ${Math.round(report.overall * 100)}%${report.orderPreserved ? '' : '  ⚠ ORDER SCRAMBLED'}`,
    ...rows,
  ].join('\n')
}
