/**
 * Deterministic extraction — no model, no network, no cost.
 *
 * Three reasons this exists rather than being a stopgap:
 *
 *  1. **The promise has to be true.** When the model is unavailable the error text says "you can
 *     still build your CV". Without this, that sentence is a lie and the user is stuck.
 *  2. **It is the baseline the LLM has to beat.** An accuracy number is meaningless without one.
 *     If a prompt change does not beat plain rules, the prompt change is not an improvement.
 *  3. **Cost and privacy.** For a clean, conventionally-structured CV this is good enough, and it
 *     sends nothing to a third party at all.
 *
 * It reads the `## Section` markers the normalizer produced, so it inherits all of that work
 * including two-column reading order.
 *
 * Confidence is capped deliberately low: a rule-based parse deserves a human's eye, and the
 * review step keys on exactly that (`CONFIDENCE_REVIEW_THRESHOLD`). Claiming certainty we do not
 * have would defeat the honesty mechanism.
 */
import { Resume } from '@/schema/resume'
import type { FieldProvenance } from '@/schema/provenance'
import { isKnownSectionHeading, matchSection } from '@/ingest/sections'
import type { SectionKind } from '@/ingest/sections'
import { isLabel, isProficiency, matchLabel, toCefr } from '@/ingest/labels'
import { applyHeuristics, meansPresent, normalizeDate } from './heuristics'

/** Never claim more than this: rules read structure, not meaning. */
const RULE_CONFIDENCE = 0.55
const STRONG_CONFIDENCE = 0.75

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/
const URL = /https?:\/\/[^\s,;]+/g
const PHONE = /(\+?\d[\d\s().-]{6,}\d)/

/**
 * A year, optionally with an ISO month: `2019`, `2024-01`.
 *
 * The month is matched strictly (`01`–`12`) for one reason: it keeps a plain year range readable.
 * `2019-2022` must parse as *two years*, not as "March 2019" with a stray suffix, and a loose `\d{2}`
 * makes that ambiguous.
 */
const YEAR = String.raw`(?:19|20)\d{2}(?:-(?:0[1-9]|1[0-2]))?`
const MONTH_YEAR = String.raw`(?:[A-Za-zÀ-ÿ]{3,10}\.?\s+)?${YEAR}`

/**
 * `Mar 2019 – Present`, `2019 - 2022`, `2024-01 - Present`, `Jun 2021 – Present · Zaragoza`.
 *
 * The ISO form is not a hypothetical: Word documents converted through LibreOffice emit
 * `2024-01 - Present` on the metadata line. Without it the whole line failed to look like a date, so
 * the entry grouper never opened a second entry — two jobs merged into one with five bullets and no
 * start date, and an entire employment was lost from the CV.
 */
const DATE_RANGE = new RegExp(
  String.raw`(${MONTH_YEAR})\s*[–—-]\s*(${MONTH_YEAR}|[A-Za-zÀ-ÿ ]{3,12})`,
)

/**
 * Remove dates from an entry title before it is split into role and employer.
 *
 * `Account Manager, Northgate Supplies (Jan 2024 - Present)` carries ` - ` inside its date range, and
 * ` - ` is also one of the role/employer separators — so the line split on the wrong hyphen and gave
 * role `Account Manager, Northgate Supplies (Jan 2024` with employer `Present)`. Every job on a
 * plain-text CV came out that way, and education came out as institution `2022)`.
 *
 * Two forms are removed. A parenthetical containing a year is unambiguous. A *trailing* range is not:
 * `Consultant 2019 – Acme Corp` has exactly the same shape as `Warehouse Supervisor Jun 2021 –
 * Present`, so the right-hand side is checked before anything is cut. Only a second date or a word
 * meaning "present" earns the strip — otherwise the employer would be deleted along with the date,
 * which is the more expensive mistake by far.
 */
function stripDates(line: string): string {
  const withoutParenthetical = line.replace(
    /[（(][^)）]*(?:19|20)\d{2}[^)）]*[)）]/g,
    ' ',
  )
  const trailing = new RegExp(
    String.raw`\s*[·|,–—-]?\s*${DATE_RANGE.source}\s*$`,
  ).exec(withoutParenthetical)

  const endsWithADate =
    trailing !== null &&
    (meansPresent(trailing[2]) ||
      normalizeDate(trailing[2].trim()) !== undefined)

  return (
    endsWithADate && trailing !== null
      ? withoutParenthetical.slice(0, trailing.index)
      : withoutParenthetical
  )
    .replace(/\s{2,}/g, ' ')
    .trim()
}

interface Section {
  kind: SectionKind
  title: string
  lines: Array<{ text: string; isBullet: boolean; index: number }>
}

/** Split the normalized text on the `## ` markers. */
function toSections(normalizedText: string): {
  head: Array<string>
  sections: Array<Section>
} {
  const head: Array<string> = []
  const sections: Array<Section> = []
  let current: Section | undefined

  normalizedText.split('\n').forEach((line, index) => {
    const trimmed = line.trim()
    if (trimmed === '') return

    if (trimmed.startsWith('## ')) {
      const title = trimmed.slice(3).trim()
      current = { kind: matchSection(title) ?? 'other', title, lines: [] }
      sections.push(current)
      return
    }

    const isBullet = trimmed.startsWith('- ')
    const text = isBullet ? trimmed.slice(2).trim() : trimmed

    if (current === undefined) head.push(text)
    else current.lines.push({ text, isBullet, index })
  })

  return { head, sections }
}

/**
 * Split "Role — Company" / "Company, Role" into its parts.
 * Returns role first because that is the more distinctive of the two.
 */
function splitRoleCompany(line: string): { role: string; company: string } {
  // Designed CVs number their entries: "/01 Staff Frontend Engineer". The counter is ornament.
  line = line.replace(/^\/?\s*\d{1,2}\s+(?=\S)/, '').replace(/^\/\s*/, '')
  // Dates first: their own separator would otherwise be mistaken for the role/employer one.
  line = stripDates(line)
  /**
   * The em/en dash needs no space around it to be a separator, and OCR is why.
   *
   * A scanned page came back as `Account Manager —Northgate Supplies` — the space before the dash lost
   * in the reading. Requiring whitespace on both sides left the employer empty on every job of an
   * otherwise cleanly-read CV. An em dash inside a word does not occur; the plain hyphen below still
   * requires spaces, because "mid-market" does.
   */
  const dash = /\s*[—–]\s*|\s+-\s+|\s+\|\s+|\s+at\s+|\s+en\s+|\s+hos\s+/i
  const parts = line.split(dash)
  if (parts.length >= 2) {
    return { role: parts[0].trim(), company: parts.slice(1).join(' ').trim() }
  }
  const comma = line.split(',')
  if (comma.length === 2) {
    return { role: comma[0].trim(), company: comma[1].trim() }
  }
  // One name only. Treat it as the role: a company with no role is rarer than the reverse.
  return { role: line.trim(), company: '' }
}

/**
 * The employer often lives on the metadata line rather than in the title:
 *
 *     Warehouse Supervisor
 *     Grupo Logístico Ebro · Jun 2021 – Present     ← employer is here
 *
 *     Account Manager, Northgate Supplies (Jan 2024 - Present) Manchester
 *
 * Without this the accuracy suite scored 0/3 employers on a designed CV — every role correct and not
 * one company. Take the text before the dates, drop the trailing separators, and reject anything
 * that looks like a place or a date rather than an organisation.
 */
function companyFromMeta(line: string | undefined): string {
  if (line === undefined) return ''

  const match = DATE_RANGE.exec(line)
  const before = (match === null ? line : line.slice(0, match.index))
    .replace(/[(·|,–—-]+\s*$/, '')
    .replace(/^[(·|,–—-]+\s*/, '')
    .trim()

  if (before === '') return ''
  // A bare date fragment, a month name, or a lone number is not a company.
  if (/^(19|20)\d{2}$/.test(before)) return ''
  if (/^\d/.test(before) && before.length < 12) return ''
  if (before.split(/\s+/).length > 8) return ''
  return before
}

function parseDateRange(line: string): {
  startDate?: string
  endDate: string | null
  matched: boolean
} {
  const match = DATE_RANGE.exec(line)
  if (match === null) {
    const single = normalizeDate(line)
    return { startDate: single, endDate: null, matched: single !== undefined }
  }
  const start = normalizeDate(match[1])
  const endRaw = match[2].trim()
  const end = meansPresent(endRaw) ? null : (normalizeDate(endRaw) ?? null)
  return { startDate: start, endDate: end, matched: true }
}

/**
 * Group a section's lines into entries.
 *
 * Two layouts, and real CVs use both:
 *
 *   title-first          date-first (Danish and German CVs, very common)
 *   ─────────────        ─────────────
 *   Ward Nurse           Aug. 2012 – jun. 2015
 *   Mar 2019 – Present   Bachelor i Spansk
 *   • bullet             Syddansk Universitet
 *
 * A date-only line therefore *opens* an entry rather than closing the one above, and the next line
 * supplies the title. Getting this wrong produced education entries whose degree was "Aug. 2012"
 * and whose institution was "jun. 2015".
 *
 * Bullets always attach to the open entry — the one rule that survives every layout we have seen.
 */
function toEntries(
  lines: Array<{ text: string; isBullet: boolean; index: number }>,
): Array<{
  title: string
  dateLine?: string
  detail: Array<string>
  bullets: Array<string>
  index: number
}> {
  const entries: Array<{
    title: string
    dateLine?: string
    detail: Array<string>
    bullets: Array<string>
    index: number
  }> = []

  /** A line that is *only* a date range — no other words worth keeping. */
  const isDateOnly = (text: string): boolean => {
    const match = DATE_RANGE.exec(text)
    if (match === null) return false
    return text.replace(match[0], '').replace(/[·,|\s-]/g, '').length <= 2
  }

  const startsEntry = (position: number): boolean => {
    const line = lines[position]
    if (line.isBullet) return false
    if (DATE_RANGE.test(line.text)) return true
    for (let ahead = 1; ahead <= 2; ahead++) {
      const next = lines[position + ahead]
      if (next === undefined || next.isBullet) break
      if (DATE_RANGE.test(next.text)) return true
    }
    return false
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const open = entries[entries.length - 1]

    if (line.isBullet) {
      if (open !== undefined) open.bullets.push(line.text)
      continue
    }

    /**
     * A bullet that wraps continues on a plain line, and that line is not a new entry.
     *
     * A PDF text layer has no concept of a paragraph: `— Became the shift's reference point for the
     * labelling exceptions nobody else` and `wanted.` are two separate lines, and only the first
     * carries the bullet glyph. So `wanted.` opened a fourth job — a phantom employment, with an
     * empty employer and a role of "wanted." — on a CV that has three.
     *
     * The signal is the same one the summary uses: a bullet that does not end in sentence punctuation
     * is unfinished. Restricting it to that case is what keeps a genuine next title, which almost
     * always follows a completed sentence, from being swallowed into the bullet above it.
     */
    const lastBullet = open?.bullets[open.bullets.length - 1]
    if (
      open !== undefined &&
      lastBullet !== undefined &&
      open.detail.length === 0 &&
      !/[.!?:;]$/.test(lastBullet) &&
      !DATE_RANGE.test(line.text)
    ) {
      open.bullets[open.bullets.length - 1] = `${lastBullet} ${line.text}`
      continue
    }

    /**
     * A date-first entry looks like this:
     *
     *     Aug. 2012 – jun. 2015     ← opens the entry
     *     Bachelor i Spansk         ← title
     *     Syddansk Universitet      ← institution, and this is the line at risk
     *
     * `startsEntry` looks ahead for a date and finds the *next* block's, so without this guard the
     * institution opened a fresh entry — leaving the degree filed as the school and the school as a
     * dateless orphan. An entry must collect at least one detail line before a bare line can start
     * the next one.
     */
    const openNeedsDetail =
      open !== undefined &&
      open.dateLine !== undefined &&
      open.detail.length === 0 &&
      open.bullets.length === 0 &&
      !isDateOnly(line.text)

    if ((startsEntry(i) || open === undefined) && !openNeedsDetail) {
      if (isDateOnly(line.text)) {
        const nextLine = lines[i + 1]
        // Date-first layout: the date opens the entry and the line after it is the title.
        const dateFirst =
          nextLine !== undefined &&
          !nextLine.isBullet &&
          !DATE_RANGE.test(nextLine.text)

        if (open !== undefined && open.dateLine === undefined && !dateFirst) {
          open.dateLine = line.text
          continue
        }
        if (dateFirst) {
          entries.push({
            title: nextLine.text,
            dateLine: line.text,
            detail: [],
            bullets: [],
            index: line.index,
          })
          i++ // the title line is consumed
          continue
        }
      }
      // A date line that carries other words too belongs to the entry above.
      if (
        open !== undefined &&
        DATE_RANGE.test(line.text) &&
        open.dateLine === undefined
      ) {
        open.dateLine = line.text
        continue
      }
      entries.push({
        title: line.text,
        dateLine: DATE_RANGE.test(line.text) ? line.text : undefined,
        detail: [],
        bullets: [],
        index: line.index,
      })
      continue
    }

    if (open.dateLine === undefined && DATE_RANGE.test(line.text)) {
      open.dateLine = line.text
    } else {
      open.detail.push(line.text)
    }
  }

  return entries
}

export interface FallbackResult {
  resume: Resume
  provenance: Array<FieldProvenance>
}

export function extractByRules(normalizedText: string): FallbackResult {
  const { head, sections } = toSections(normalizedText)
  const provenance: Array<FieldProvenance> = []

  const note = (
    path: string,
    confidence: number,
    sourceText?: string,
    inferred = false,
  ) => {
    provenance.push({ path, confidence, sourceText, inferred })
  }

  // ── basics ──────────────────────────────────────────────────────────────────────────────
  /**
   * Label/value pairs from a table-shaped CV, read before anything else: when `Navn` is followed by
   * a value, that value is the name, full stop. Guessing from position instead is what produced
   * "Personlige oplysninger Navn" as a candidate's name.
   */
  const paired = new Map<string, string>()
  for (let i = 0; i < head.length - 1; i++) {
    const kind = matchLabel(head[i])
    const value = head[i + 1]
    if (kind !== undefined && value !== undefined && !isLabel(value)) {
      if (!paired.has(kind)) paired.set(kind, value.trim())
      i++
    }
  }

  const headText = head.join('\n')
  const emailMatch = EMAIL.exec(headText) ?? EMAIL.exec(normalizedText)
  const phoneMatch = PHONE.exec(headText) ?? PHONE.exec(normalizedText)
  const labelledEmail = paired.get('email')
  const labelledPhone = paired.get('phone')

  /**
   * The name is the first line — unless a designed sidebar wrapped it, in which case it arrives as
   * several single-word lines: `Rocío` / `Delgado` / `Fuentes`.
   *
   * The rule this replaces continued while the *next* line held two words or fewer, which cannot
   * tell a second name line from a two-word job title. `TOM WHITFIELD` + `Account Manager` became
   * the candidate's name on three of five fixtures, with the headline left empty — and the scorer's
   * containment rule called the name correct, so it survived two rounds of measurement.
   *
   * A wrapped name is recognisable because *every* fragment is one word, so that is the only case
   * that continues now. The cost is a name like `Eline Storm` / `Johnsen` stopping one line early.
   * That is visible in review and trivially fixed there; a job title welded into someone's name is
   * neither.
   */
  const isNameFragment = (line: string | undefined): boolean => {
    if (line === undefined) return false
    const text = line.trim()
    if (text === '' || text.split(/\s+/).length !== 1) return false
    if (EMAIL.test(text) || PHONE.test(text)) return false
    if (/[@:]|\d/.test(text)) return false
    return !isLabel(text) && !isKnownSectionHeading(text)
  }

  const nameParts: Array<string> = []
  const firstLine = head[0]
  if (
    firstLine !== undefined &&
    firstLine.split(/\s+/).length <= 4 &&
    !/[@:]|\d{3}/.test(firstLine)
  ) {
    nameParts.push(firstLine)
    if (isNameFragment(firstLine)) {
      for (let i = 1; i < head.length && nameParts.length < 4; i++) {
        if (!isNameFragment(head[i])) break
        nameParts.push(head[i])
      }
    }
  }
  // A labelled name beats any positional guess: "Navn → Eline Storm Johnsen" is unambiguous, and
  // guessing by position on that CV produced "Personlige oplysninger Navn".
  const labelledName = paired.get('name')
  const fullName = (
    labelledName ??
    (nameParts.join(' ') || head[0] || 'Unnamed')
  ).trim()
  note(
    'basics.fullName',
    labelledName !== undefined || nameParts.length <= 1
      ? STRONG_CONFIDENCE
      : RULE_CONFIDENCE,
    labelledName ?? head[0],
    labelledName === undefined && nameParts.length > 1,
  )

  // Headline: the labelled job title if the CV has one, else the first line after the name that is
  // not contact detail or a field label.
  const headline =
    paired.get('title') ??
    head
      .slice(labelledName === undefined ? nameParts.length : 0)
      // Skip field labels, the name itself, and section headings: a table-shaped CV puts
      // "Personlige oplysninger" right at the top, and it is not anybody's job title.
      // Skip field labels, section headings, and the *values* of labelled fields. A table-shaped CV
      // puts "Personlige oplysninger" at the top and an address two lines below it, and neither is
      // anybody's job title — both got picked as the headline before this filter existed.
      .filter(
        (line) =>
          !isLabel(line) &&
          !isKnownSectionHeading(line) &&
          ![...paired.values()].includes(line.trim()),
      )
      .find(
        (line) =>
          !EMAIL.test(line) &&
          !PHONE.test(line) &&
          line.length > 3 &&
          line.length < 80 &&
          !/^https?:/.test(line) &&
          // One word is not evidence of a job title. In a sidebar the line after the contact block
          // is the city, and "Zaragoza" was being asserted as this person's profession — a claim
          // the document never makes. An unusual one-word title is lost; nothing is invented.
          line.trim().split(/\s+/).length >= 2,
      )
  if (headline !== undefined) note('basics.headline', RULE_CONFIDENCE, headline)

  /**
   * A summary with no heading above it lives in the preamble, and it wraps.
   *
   * Taking only the first long line cut a real fixture off mid-sentence — `...the induction of new`,
   * with `graduates.` left behind on the next line. The user then reviewed, and could have exported,
   * a CV whose profile ends in the middle of a thought.
   */
  const summaryFromHead = (lines: Array<string>): string | undefined => {
    const start = lines.findIndex((line) => line.length > 90)
    if (start === -1) return undefined
    const collected = [lines[start]]
    for (const line of lines.slice(start + 1)) {
      // Stop at anything that is the start of something else rather than more of this paragraph.
      if (EMAIL.test(line) || PHONE.test(line)) break
      if (/^https?:/.test(line)) break
      if (isLabel(line) || isKnownSectionHeading(line)) break
      collected.push(line)
    }
    return collected.join(' ')
  }

  const summarySection = sections.find((s) => s.kind === 'summary')
  const summary =
    summarySection !== undefined
      ? summarySection.lines.map((l) => l.text).join(' ')
      : summaryFromHead(head.slice(nameParts.length))

  const links = [...headText.matchAll(URL)].map((match) => ({
    label: /linkedin/i.test(match[0])
      ? 'LinkedIn'
      : /github/i.test(match[0])
        ? 'GitHub'
        : 'Website',
    url: match[0],
  }))

  // ── personal details (European convention) ──────────────────────────────────────────────
  const personalSection = sections.find((s) => s.kind === 'personal')
  const personalDetails =
    personalSection?.lines
      .map((line) => {
        const [label, ...rest] = line.text.split(':')
        return rest.length > 0
          ? { label: label.trim(), value: rest.join(':').trim() }
          : undefined
      })
      .filter(
        (entry): entry is { label: string; value: string } =>
          entry !== undefined,
      ) ?? []

  // ── experience ──────────────────────────────────────────────────────────────────────────
  /**
   * A running row counter, and the reason it exists is a bug worth naming.
   *
   * These notes used to be keyed `work.${entry.index}` — and `entry.index` is the **line number in the
   * source document**, not the row's position in `resume.work`. A three-job CV emitted `work.36`,
   * `work.42`, `work.46`. Nothing in the review form matched them, so no field in Experience or
   * Education was ever marked on the rules path, while `sectionFlagged('work')` *did* match the prefix:
   * the section header said "needs a look" and every field inside it looked confident. The one
   * mechanism the product asks people to trust was pointing at nothing.
   *
   * It has to be a counter rather than the callback's index because `flatMap` runs per section, and a CV
   * with "Experience" and "Earlier roles" as two headings would restart from zero and overwrite the
   * first section's notes.
   */
  let workRow = 0
  const work = sections
    .filter((s) => s.kind === 'experience')
    .flatMap((section) =>
      toEntries(section.lines).map((entry) => {
        const { role, company } = splitRoleCompany(entry.title)
        const dates = parseDateRange(entry.dateLine ?? '')
        // The title wins; the metadata line is the fallback for the employer.
        const employer =
          company !== '' ? company : companyFromMeta(entry.dateLine)
        const row = workRow++
        /**
         * Two notes, because they are two different claims. The role came off the title line and we are
         * as sure of it as the rules ever are. The employer, when the title did not contain one, was
         * pulled out of a metadata line — that is a guess, and `inferred` is what says so.
         */
        note(`work.${row}.role`, RULE_CONFIDENCE, entry.title)
        if (employer === '') {
          note(`work.${row}.company`, RULE_CONFIDENCE, entry.title, true)
        }
        return {
          company: employer,
          role,
          startDate: dates.startDate,
          endDate: dates.endDate,
          summary: entry.detail.find((d) => d.length > 40),
          highlights: entry.bullets,
          tech: [],
          location:
            entry.dateLine?.split(/·|,/).slice(1).join(',').trim() || undefined,
        }
      }),
    )

  // ── education ───────────────────────────────────────────────────────────────────────────
  /** Same running-counter reason as `workRow`: a line number is not a row index. */
  let educationRow = 0
  const education = sections
    .filter((s) => s.kind === 'education')
    .flatMap((section) =>
      toEntries(section.lines).map((entry) => {
        const { role, company } = splitRoleCompany(entry.title)
        const dates = parseDateRange(entry.dateLine ?? entry.title)

        /**
         * Date-first education blocks put the qualification on one line and the school on the next:
         *
         *     Aug. 2012 – jun. 2015
         *     Bachelor i Spansk- og spanskamerikanske Studier
         *     Syddansk Universitet, Odense
         *
         * so the entry's *detail* line is the institution. Reading the title as the institution
         * instead — which is what this did first — files the degree as the school and leaves the
         * school as a separate entry with no dates.
         */
        const detailInstitution = entry.detail[0]

        const institution =
          detailInstitution ?? (company === '' ? role : company)
        const degree =
          detailInstitution !== undefined
            ? entry.title
            : company === ''
              ? undefined
              : role

        /**
         * Marked on the institution, and marked `inferred`, because which line is the school and which
         * is the qualification is genuinely a guess here — see the date-first case above. The field the
         * flag lands on is now the field the person is being asked to check.
         */
        note(
          `education.${educationRow++}.institution`,
          RULE_CONFIDENCE,
          entry.title,
          true,
        )
        return {
          institution,
          degree,
          startDate: dates.startDate,
          endDate: dates.endDate,
          highlights: entry.bullets,
        }
      }),
    )

  // ── skills ──────────────────────────────────────────────────────────────────────────────
  /**
   * Row counter again, and here the old path had no index at all: every skills note was keyed `skills`,
   * which matches no field in the form — `skills.0.category` is what it looks up. So a section the rules
   * were *strongly* confident about and one they had to guess at were recorded identically, and neither
   * was ever shown.
   */
  let skillRow = 0
  const skillSections = sections.filter((s) => s.kind === 'skills')
  const skills: Array<{ category: string; items: Array<string> }> =
    skillSections.flatMap((section) => {
      const categorised = section.lines
        .map((line) => {
          const colon = line.text.indexOf(':')
          if (colon <= 0 || colon > 40) return undefined
          return {
            category: line.text.slice(0, colon).trim(),
            items: line.text
              .slice(colon + 1)
              .split(/[,;·|]/)
              .map((item) => item.trim())
              .filter((item) => item !== ''),
          }
        })
        .filter(
          (group): group is { category: string; items: Array<string> } =>
            group !== undefined && group.items.length > 0,
        )

      if (categorised.length > 0) {
        // A `Category: a, b, c` line is the shape we read best, so the confidence is the strong one and
        // it belongs to each group it produced — not to the section as a whole.
        for (const group of categorised) {
          note(`skills.${skillRow++}.items`, STRONG_CONFIDENCE, group.category)
        }
        return categorised
      }

      // No "Category: …" shape — a flat list under its own heading.
      const items = section.lines.flatMap((line) =>
        line.text
          .split(/[,;·|]/)
          .map((item) => item.trim())
          .filter((item) => item !== '' && item.length < 60),
      )
      if (items.length === 0) return []
      // A flat list under a heading: the heading became the group name, which is a guess about how this
      // person groups their own trade. `inferred` is the honest label for that.
      note(
        `skills.${skillRow++}.category`,
        RULE_CONFIDENCE,
        section.title,
        true,
      )
      return [{ category: section.title, items }]
    })

  // ── languages ───────────────────────────────────────────────────────────────────────────
  /**
   * Two shapes: one line per language (`Spanish (native)`, `English — fluent`), or a table where the
   * name and the level are separate lines. The second is why `isProficiency` exists — without it a
   * proficiency word becomes a language, and a real CV produced "Modersmål" as a language spoken.
   */
  const languages = sections
    .filter((s) => s.kind === 'languages')
    .flatMap((section) => {
      const out: Array<{ name: string; level?: 'A1'; raw?: string }> = []
      /**
       * Prose is dropped before anything is read as a language.
       *
       * In a two-column CV the main column's summary is emitted after the sidebar's last section, so
       * it lands *inside* it. Splitting that sentence on commas listed `with route` among the
       * languages this person speaks — an invention, on the document that matters most.
       *
       * The test is for prose, not for length: `Danish (mother tongue) · English (fluent) · German
       * (conversational)` is a legitimate 67-character row and must survive.
       */
      const rows = section.lines
        .map((l) => l.text)
        .filter(
          (text) => !/[.!?](\s|$)/.test(text) && text.split(/\s+/).length <= 12,
        )

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        if (row === undefined || isProficiency(row)) continue

        // Table shape: this line is a language, the next is its level.
        const next = rows[i + 1]
        if (next !== undefined && isProficiency(next)) {
          out.push({
            name: row.trim(),
            level: toCefr(next) as 'A1' | undefined,
            raw: next.trim(),
          })
          i++
          continue
        }

        // Inline shape: split on the usual separators, then on parentheses or a dash.
        for (const part of row.split(/[,;·|]/)) {
          const trimmed = part.trim()
          if (trimmed === '' || isProficiency(trimmed)) continue
          const paren = /^(.+?)\s*[（(]\s*(.+?)\s*[）)]$/.exec(trimmed)
          const dash = /^(.+?)\s+[—–-]\s+(.+)$/.exec(trimmed)
          const match = paren ?? dash
          const name = (match?.[1] ?? trimmed).trim()
          const raw = match?.[2]?.trim()
          if (name.split(/\s+/).length > 3) continue // a sentence, not a language
          out.push({
            name,
            level:
              raw === undefined ? undefined : (toCefr(raw) as 'A1' | undefined),
            raw,
          })
        }
      }
      return out
    })

  // ── certifications, projects, and everything else ───────────────────────────────────────
  const certifications = sections
    .filter((s) => s.kind === 'certifications')
    .flatMap((section) =>
      section.lines.map((line) => {
        const date = normalizeDate(line.text)
        const name = line.text
          .replace(DATE_RANGE, '')
          .replace(/\s{2,}/g, ' ')
          .trim()
        return { name: name === '' ? line.text : name, date }
      }),
    )

  const projects = sections
    .filter((s) => s.kind === 'projects')
    .flatMap((section) =>
      toEntries(section.lines).map((entry) => ({
        name: entry.title,
        description: entry.detail.join(' ') || undefined,
        highlights: entry.bullets,
        tech: [],
      })),
    )

  /**
   * A section we do not recognise whose every line is a short noun phrase is a skills group under a
   * name of the author's choosing — "LOGISTICS", "SYSTEMS", "Kernekompetencer". Ten real skills were
   * being filed as an unnamed custom section and rendering nowhere useful.
   *
   * The test is deliberately strict: any date, any sentence-length line, or any line with a verb-like
   * length disqualifies the whole section, because misfiling a job history as skills is far worse
   * than leaving an unusual section in `custom`.
   */
  const looksLikeSkillGroup = (section: Section): boolean => {
    if (section.lines.length < 2 || section.lines.length > 20) return false
    return section.lines.every((line) => {
      const text = line.text.trim()
      if (text === '' || text.length > 48) return false
      if (text.split(/\s+/).length > 5) return false
      if (/\b(19|20)\d{2}\b/.test(text)) return false
      if (/[.!?]$/.test(text)) return false
      return true
    })
  }

  const inferredSkillGroups = sections
    .filter(
      (section) => section.kind === 'other' && looksLikeSkillGroup(section),
    )
    .map((section) => ({
      category: section.title,
      items: section.lines.map((line) => line.text.trim()),
    }))

  if (inferredSkillGroups.length > 0) {
    /**
     * These were not under a skills heading at all — a section we reclassified because it *looked* like
     * one. That is the least certain claim this function makes about skills, and it is now marked on
     * every group it produced rather than once, unindexed, on behalf of the first.
     *
     * `skills.length` before the push is where these land in the final array.
     */
    for (const [offset, group] of inferredSkillGroups.entries()) {
      note(
        `skills.${skills.length + offset}.category`,
        RULE_CONFIDENCE,
        group.category,
        true,
      )
    }
    skills.push(...inferredSkillGroups)
  }

  // Nothing is discarded: unknown sections keep their original heading — except the ones just
  // reclassified as skills, which would otherwise appear twice.
  const reclassified = new Set(
    inferredSkillGroups.map((group) => group.category),
  )
  const custom = sections
    .filter(
      (s) =>
        // Sections just reclassified as skills would otherwise appear twice.
        !reclassified.has(s.title) &&
        (s.kind === 'other' ||
          s.kind === 'interests' ||
          s.kind === 'references' ||
          s.kind === 'courses'),
    )
    .map((section) => ({
      title: section.title,
      items: section.lines.map((line) => line.text),
    }))
    .filter((section) => section.items.length > 0)

  const resume = Resume.parse({
    schemaVersion: '1.0',
    basics: {
      fullName,
      headline,
      email: labelledEmail ?? emailMatch?.[0],
      phone: labelledPhone ?? phoneMatch?.[1]?.trim(),
      links,
      summary,
      personalDetails,
    },
    work,
    education,
    skills,
    projects,
    certifications,
    languages,
    custom,
  })

  return { resume: applyHeuristics(resume), provenance }
}
