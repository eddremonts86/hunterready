/**
 * The anti-fabrication guard — enforcement layer 2 of three (docs/06-ai-optimization.md).
 *
 * A model rewriting a CV bullet is under constant pressure to invent. "Managed a book of accounts"
 * reads weakly, and the cheapest way to strengthen it is a number nobody supplied: *"...growing
 * revenue 25%"*. The candidate signs their name to that sentence and takes it into an interview.
 *
 * Prompting is not enforcement. A prompt is a request the model may decline for reasons neither of
 * us can see, and it fails silently and plausibly — the worst possible shape. So every rewrite is
 * checked here, in ordinary deterministic code, before a human is ever shown it.
 *
 * ## What must be grounded
 *
 * Three classes of token, because these are what a reader treats as *facts about the candidate*:
 *
 *  • **Numbers** — 40, 25%, €2M, "three". A quantity is the single most load-bearing thing on a CV
 *    and the single easiest thing to invent.
 *  • **Names** — employers, products, places, technologies. Capitalised mid-sentence.
 *  • **Acronyms** — SAP, CRRT, ALS. Two or more capitals; a certification the candidate never held.
 *
 * Everything else — verbs, structure, connective tissue, ordinary vocabulary — the model may change
 * freely. That is the whole point of asking it to rewrite.
 *
 * ## What counts as grounded
 *
 * The **whole resume**, not just the bullet being rewritten. If someone's skills list says
 * `Salesforce` and a bullet about their pipeline mentions it, that is the candidate's own word
 * resurfaced, not an invention — and docs/06 says so explicitly. Restricting grounding to the single
 * bullet would reject the useful half of what this feature is for.
 *
 * ## The bias, stated plainly
 *
 * A false positive costs a slightly better sentence. A false negative puts a fabricated claim in
 * front of a recruiter with the candidate's name on it. Those are not comparable, so every ambiguous
 * case here resolves toward rejection.
 */
import type { Resume } from '@/schema/resume'

export type ClaimKind = 'number' | 'name' | 'acronym'

export interface FabricationFinding {
  kind: ClaimKind
  /** The offending token, as it appeared in the rewrite. */
  value: string
}

/**
 * Words that are capitalised for grammar rather than because they name something.
 *
 * Without this the first word of every sentence is a "proper noun" and nothing survives. Kept
 * deliberately small: it covers sentence openers and the handful of capitalised function words that
 * appear mid-bullet, not a dictionary. Anything not here that is capitalised mid-sentence has to be
 * grounded, which is the conservative direction.
 */
const CAPITALISED_BUT_NOT_A_NAME = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'from',
  'i',
  'in',
  'into',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
  'while',
  'when',
  'after',
  'before',
  'during',
  'across',
  'through',
  'over',
  'under',
  'per',
])

/**
 * Number words we can compare against digits, and the other way round.
 *
 * `three years` and `3 years` are the same claim, and a rewrite is entitled to switch between them —
 * house style on a CV usually spells out one to nine. Without this mapping, "three" in the source
 * would not ground "3" in the rewrite and every such rewrite would be rejected.
 *
 * It stops at twelve on purpose: past that, CVs write digits, and a longer table is more surface for
 * a wrong equivalence than it is worth.
 */
const NUMBER_WORDS: Record<string, string> = {
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
}

/** Scale suffixes, so `2M` and `2 million` are one claim rather than two. */
const SCALE: Record<string, string> = {
  k: '000',
  m: '000000',
  bn: '000000000',
  b: '000000000',
  thousand: '000',
  million: '000000',
  billion: '000000000',
}

function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Canonical form of a number claim: digits only, scale expanded, separators dropped.
 *
 * `1,200` `1200` `1.2k` and `1200+` all reduce to the same string, because they are the same claim
 * about the world. `25%` keeps its percent sign — a bare 25 does not license "25%".
 */
function canonicalNumber(raw: string): string {
  const text = stripAccents(raw).toLowerCase().trim()
  const percent = text.includes('%')
  const scaleMatch = /^([\d.,]+)\s*(k|m|bn|b|thousand|million|billion)\b/.exec(
    text,
  )

  let digits: string
  if (scaleMatch !== null) {
    const [, mantissa, scale] = scaleMatch
    const clean = mantissa.replace(/,/g, '')
    const zeros = SCALE[scale] ?? ''
    // 1.2k → 1200: shift the decimal point by the width of the scale.
    if (clean.includes('.')) {
      const [whole, fraction] = clean.split('.')
      const shifted = (whole + fraction).padEnd(
        whole.length + zeros.length,
        '0',
      )
      digits = shifted.replace(/^0+(?=\d)/, '')
    } else {
      digits = clean + zeros
    }
  } else {
    const word = NUMBER_WORDS[text.replace(/[^a-z]/g, '')]
    digits =
      word ??
      text
        .replace(/[^\d.]/g, '')
        .replace(/\.0+$/, '')
        .replace(/\.$/, '')
  }

  digits = digits.replace(/^0+(?=\d)/, '')
  return percent ? `${digits}%` : digits
}

/**
 * How many words after a number are taken as its unit.
 *
 * `40 mid-market retail accounts` needs four to reach the noun. Past that the window starts pulling
 * in the rest of the sentence and the check stops meaning anything.
 */
const UNIT_WINDOW = 4

/**
 * Prepositions that link a counted noun to the figure that counts it: `a team **of** 14`.
 *
 * Looking only forwards was wrong, and the tailored summary is what exposed it. All three of the
 * product's languages routinely put the noun in front of the figure — `a team of 14`,
 * `un equipo de 14`, `et team på 14` — so a forward-only window compared whatever incidentally
 * followed. A CV saying "the shift rota for a team of 14 across two loading bays" failed to ground a
 * summary saying "the shift rota for a team of 14", because `across two loading bays` and
 * `and holds the forklift` share no word. The candidate's own number came back reported as invented.
 *
 * Reading backwards is gated on one of these words sitting immediately before the number, and that
 * gate is the whole design. A plain two-word backwards window looked equivalent and quietly broke the
 * guard: it picked up the **verb**, so `Handled a 1,200-strong portfolio` grounded
 * `Handled 1200 accounts` on the word "handled" — which is exactly the moved-number fabrication this
 * check exists to catch, and a regression test caught it. A verb is not a unit. Only the noun a
 * preposition points at is.
 */
const UNIT_LINKERS = new Set(
  [
    'of', // en
    'de', // es
    'på',
    'af', // da
  ]
    // Normalized at construction for the same reason as `UNIT_STOPWORDS`: these are compared against
    // words that have been through `normalizeWord`, and a list kept in mangled spelling gets it wrong.
    .map((word) => normalizeWord(word)),
)

/** How many words before the linker are read as the noun. Two covers `of the team`. */
const UNIT_WINDOW_BEFORE = 2

/**
 * Function words that may not serve as a number's unit.
 *
 * They are what a backwards window otherwise fills up with, and two numbers both followed by `and the`
 * would ground each other on nothing. Excluding them makes the check *stricter* than it was in the
 * forward direction as well, which is the right direction for a guard: `40 and` no longer grounds
 * `25 and`.
 */
const UNIT_STOPWORDS = new Set(
  [
    // en
    'a',
    'an',
    'the',
    'of',
    'in',
    'on',
    'at',
    'to',
    'for',
    'with',
    'and',
    'or',
    'by',
    'from',
    'as',
    'is',
    'was',
    'were',
    'are',
    'that',
    'this',
    'it',
    'over',
    'about',
    'across',
    'per',
    // es
    'de',
    'del',
    'la',
    'el',
    'los',
    'las',
    'un',
    'una',
    'en',
    'con',
    'por',
    'para',
    'y',
    'que',
    'su',
    'sus',
    // da
    'og',
    'til',
    'med',
    'af',
    'som',
    'på',
    'den',
    'det',
    'en',
    'et',
    'ca',
  ]
    /**
     * Normalized at construction, not hand-normalized in the list above.
     *
     * The words this is compared against have already been through `normalizeWord`, which strips a
     * trailing `s`. Writing the entries in their natural spelling and forgetting that cost a real
     * failure: `across` never matched the `acros` it becomes, so it stayed in the unit of every number
     * that had it nearby — and grounded "a fleet of 14 across the depot" against "a team of 14 across
     * two loading bays", which is precisely the moved-number claim this guard exists to reject. A list
     * that has to be maintained in a mangled spelling will be maintained wrongly.
     */
    .map((word) => normalizeWord(word)),
)

export interface NumberClaim {
  raw: string
  canonical: string
  /**
   * Normalized words around it — what the number is a count *of*.
   *
   * Both directions, function words removed. See `UNIT_WINDOW_BEFORE` for why it is not forward-only.
   */
  unit: Array<string>
}

/**
 * Every number claim in a piece of text, canonicalised, with the words it quantifies.
 *
 * Bare years are deliberately included: "2019" dropped into a bullet is a date claim, and dates are
 * on docs/06's prohibited list.
 *
 * The scale suffix requires a word boundary, and no space before a single-letter one. Without that,
 * `40 mid-market accounts` matched `40 m` and canonicalised to **forty million** — so the candidate's
 * own number failed to ground itself and every honest rewrite of that bullet was rejected.
 */
function numbersIn(text: string): Array<NumberClaim> {
  const found: Array<NumberClaim> = []

  const words = (span: string) =>
    [...span.matchAll(/[\p{L}][\p{L}'’-]*/gu)].map((m) => normalizeWord(m[0]))

  const usable = (list: Array<string>) =>
    list.filter((word) => word !== '' && !UNIT_STOPWORDS.has(word))

  /**
   * The noun a `of`-style linker points back at, or nothing.
   *
   * Nearest word first. If it is not a linker, this contributes nothing at all — see `UNIT_LINKERS`.
   */
  const nounBefore = (before: string): Array<string> => {
    const reversed = words(before).reverse()
    const [nearest] = reversed
    if (nearest === undefined || !UNIT_LINKERS.has(nearest)) return []
    return usable(reversed.slice(1, 1 + UNIT_WINDOW_BEFORE))
  }

  const withUnit = (
    raw: string,
    canonical: string,
    before: string,
    after: string,
  ) => {
    found.push({
      raw,
      canonical,
      unit: [
        ...nounBefore(before),
        ...usable(words(after).slice(0, UNIT_WINDOW)),
      ],
    })
  }

  // Digit-led: 40, 1,200, 1.2k, 25%, £2M, 30-person. `\b` after a letter scale, and only a word
  // scale may be preceded by a space.
  for (const match of text.matchAll(
    /\d[\d.,]*(?:(?:k|m|bn|b)\b|\s*(?:thousand|million|billion)\b)?\s*%?/gi,
  )) {
    const raw = match[0].trim().replace(/[.,]+$/, '')
    if (raw === '' || !/\d/.test(raw)) continue
    withUnit(
      raw,
      canonicalNumber(raw),
      text.slice(0, match.index),
      text.slice(match.index + match[0].length),
    )
  }

  // Word-led: three, twelve — only the ones we can compare against digits.
  for (const match of text.matchAll(/\b[a-z]+\b/gi)) {
    const word = match[0].toLowerCase()
    if (word in NUMBER_WORDS) {
      withUnit(
        match[0],
        NUMBER_WORDS[word],
        text.slice(0, match.index),
        text.slice(match.index + match[0].length),
      )
    }
  }

  return found
}

/** Two or more capitals in a row: SAP, CRRT, ALS, ICU. Trailing plural `s` tolerated (KPIs). */
function acronymsIn(text: string): Array<string> {
  return [...text.matchAll(/\b[A-ZÀ-Þ]{2,}(?:s)?\b/g)].map((m) => m[0])
}

/**
 * Capitalised words that are not sentence openers.
 *
 * "Managed" at the start of a bullet is a verb; "Salesforce" in the middle is a name. The test is
 * positional because English capitalisation is positional, and it is the only signal available
 * without a dictionary of every employer on earth.
 */
function namesIn(text: string): Array<string> {
  const names: Array<string> = []
  // Split into sentence-ish spans so each one's first word is exempt.
  for (const sentence of text.split(/(?<=[.!?:;])\s+|\n+/)) {
    const words = [...sentence.matchAll(/[\p{L}][\p{L}'’-]*(?:\.[\p{L}]+)*/gu)]
    words.forEach((match, index) => {
      // Trailing punctuation is not part of the name. Without this, "Tesco." and "Tesco" were two
      // different tokens and the message quoted the full stop back at the user.
      const word = match[0].replace(/[.,;:]+$/, '')
      if (word === '') return
      if (index === 0) return // sentence opener: capitalised by grammar
      if (!/^[\p{Lu}]/u.test(word)) return
      if (CAPITALISED_BUT_NOT_A_NAME.has(word.toLowerCase())) return
      // An all-caps token is an acronym; it is checked by acronymsIn with its own rule.
      if (word === word.toUpperCase() && word.length >= 2) return
      names.push(word)
    })
  }
  return names
}

/** Case-, accent- and plural-insensitive. "Accounts" grounds "account" and vice versa. */
function normalizeWord(word: string): string {
  return stripAccents(word)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
    .replace(/(?:es|s)$/, '')
}

/** Every string the candidate actually wrote, flattened. */
function resumeText(resume: Resume): string {
  const basics = resume.basics
  return [
    basics.fullName,
    basics.headline,
    basics.summary,
    ...basics.links.map((link) => `${link.label} ${link.url}`),
    ...basics.personalDetails.map((d) => `${d.label} ${d.value}`),
    basics.location?.city,
    basics.location?.country,
    ...resume.work.flatMap((job) => [
      job.company,
      job.role,
      job.location,
      job.summary,
      ...job.highlights,
      ...job.tech,
    ]),
    ...resume.education.flatMap((entry) => [
      entry.institution,
      entry.degree,
      entry.field,
      ...entry.highlights,
    ]),
    ...resume.skills.flatMap((group) => [group.category, ...group.items]),
    ...resume.projects.flatMap((project) => [
      project.name,
      project.description,
      ...project.highlights,
      ...project.tech,
    ]),
    ...resume.certifications.flatMap((cert) => [
      cert.name,
      cert.issuer,
      cert.identifier,
    ]),
    ...resume.languages.map((language) => language.name),
    ...resume.custom.flatMap((section) => [section.title, ...section.items]),
  ]
    .filter((value): value is string => typeof value === 'string')
    .join('\n')
}

/**
 * The set of claims a rewrite is allowed to make, drawn from what the candidate wrote.
 *
 * Built once per resume and reused across every bullet — a full rewrite pass is ~25 calls and
 * rebuilding this each time would be the most expensive thing in the loop.
 */
export interface GroundingSet {
  /** Canonical number → the words it was a count *of*, everywhere the candidate used it. */
  numbers: Map<string, Set<string>>
  words: Set<string>
}

export function buildGrounding(resume: Resume, extraSource = ''): GroundingSet {
  const text = `${resumeText(resume)}\n${extraSource}`

  const numbers = new Map<string, Set<string>>()
  for (const claim of numbersIn(text)) {
    const unit = numbers.get(claim.canonical) ?? new Set<string>()
    for (const word of claim.unit) unit.add(word)
    numbers.set(claim.canonical, unit)
  }

  return {
    numbers,
    words: new Set(
      [...text.matchAll(/[\p{L}][\p{L}'’-]*/gu)].map((m) =>
        normalizeWord(m[0]),
      ),
    ),
  }
}

/**
 * Everything in `rewrite` that the candidate never wrote.
 *
 * An empty array means the rewrite says nothing new about the world — it may still be a worse
 * sentence, which is what layer 3 (the human) is for.
 */
export interface FabricationCheckOptions {
  /**
   * Check numbers only, leaving names and abbreviations alone.
   *
   * For text that explains a suggestion rather than becoming part of the CV — a rationale, a question
   * for the candidate. Those legitimately quote the new wording: *"Led is stronger than Helped with"*
   * names two verbs that are, correctly, not in the document. Checking them as claims flagged `Led`
   * and `Supported` as invented names on a real run and threw away a perfectly good rewrite.
   *
   * Numbers stay checked, because they are the one thing this text can still do damage with. A
   * question reading "Was that the 25% growth year?" plants a figure the candidate may then type in
   * themselves, and it arrives looking like help.
   */
  numbersOnly?: boolean
}

export function findFabrications(
  rewrite: string,
  grounding: GroundingSet,
  options: FabricationCheckOptions = {},
): Array<FabricationFinding> {
  const findings: Array<FabricationFinding> = []
  const seen = new Set<string>()

  const report = (kind: ClaimKind, value: string) => {
    const key = `${kind}:${value.toLowerCase()}`
    if (seen.has(key)) return
    seen.add(key)
    findings.push({ kind, value })
  }

  /**
   * A number has to be grounded **with the thing it counts**, not on its own.
   *
   * Token-level grounding looked right and was not: a summary reading "three years" licensed
   * "3 regions" anywhere in the CV, because the digit existed somewhere. Moving a real number onto a
   * different noun is the subtler half of fabrication and the half a careless rewrite actually
   * commits — the number survives review because the reader recognises it.
   *
   * So the unit has to overlap too. `40 accounts` is grounded by `a book of 40 mid-market retail
   * accounts`; `40 regions` is not, by the same source.
   *
   * When the candidate's own use of the number had no following words at all, there is nothing to
   * compare and the number alone is accepted — silence is not evidence of a mismatch.
   */
  for (const number of numbersIn(rewrite)) {
    if (number.canonical === '' || number.canonical === '%') continue
    const groundedUnits = grounding.numbers.get(number.canonical)
    if (groundedUnits === undefined) {
      report('number', number.raw)
      continue
    }
    if (groundedUnits.size === 0 || number.unit.length === 0) continue
    if (!number.unit.some((word) => groundedUnits.has(word))) {
      report('number', number.raw)
    }
  }

  if (options.numbersOnly !== true) {
    for (const acronym of acronymsIn(rewrite)) {
      if (!grounding.words.has(normalizeWord(acronym))) {
        report('acronym', acronym)
      }
    }

    for (const name of namesIn(rewrite)) {
      if (!grounding.words.has(normalizeWord(name))) {
        report('name', name)
      }
    }
  }

  return findings
}

/**
 * Plain-language explanation of a rejection, for the developer log and the review UI.
 *
 * Never phrased as an accusation against the user — they did not write it. It is our tool that
 * reached for something they never said.
 */
export function describeFabrications(
  findings: Array<FabricationFinding>,
): string {
  if (findings.length === 0) return ''
  const noun = (kind: ClaimKind) =>
    kind === 'number'
      ? 'a figure'
      : kind === 'acronym'
        ? 'an abbreviation'
        : 'a name'
  const parts = findings.map(
    (f) => `${noun(f.kind)} you did not write (${f.value})`,
  )
  return `This suggestion added ${parts.join(', ')}.`
}
