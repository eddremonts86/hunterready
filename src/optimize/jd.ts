/**
 * Job-description tailoring — v0.4 (docs/06-ai-optimization.md, Feature 2).
 *
 * The diagram in docs/06 is the whole design, and the third branch is the one that makes this
 * honest:
 *
 *     MATCHED           WEAK EVIDENCE                MISSING
 *     keep, surface     present but buried →         not in the CV →
 *     earlier           re-emphasize, resurface      report as a gap,
 *                       from an older role           **never invent**
 *
 * Every competing tool collapses `MISSING` into `MATCHED` by writing the requirement into the CV.
 * That is the failure this product exists to refuse: it puts a claim the candidate cannot defend in
 * front of an interviewer who will ask about it. A gap reported is a gap the person can decide about
 * — apply anyway, or go and learn the thing.
 *
 * ## What tailoring is allowed to do
 *
 * Reorder. Re-emphasize. Adopt the job's vocabulary **only when it names something the candidate
 * already did**. Rewrite the summary from existing material. That is all — it may not add a skill,
 * change a date, or inflate seniority, and none of those are possible through this module's output
 * shape, which is a set of *moves* rather than a new document.
 *
 * ## Why the output is a variant
 *
 * `applyTailoring` returns a new `Resume` and never mutates its input. Each application keeps its own
 * variant so the candidate can see what they sent to whom — which matters the day someone calls them
 * back about a CV they no longer have a copy of.
 */
import type { Resume } from '@/schema/resume'

export interface JobRequirements {
  hardSkills: Array<string>
  softSkills: Array<string>
  responsibilities: Array<string>
  seniority?: string
  keywords: Array<string>
}

export type Evidence = 'matched' | 'weak' | 'missing'

export interface RequirementMatch {
  requirement: string
  evidence: Evidence
  /**
   * Where in the CV it was found — a bullet, a skill, a role title. Empty for `missing`.
   *
   * Carried so the report can *show* the evidence rather than assert it. "You have this" is an
   * opinion; "you have this, here" is checkable.
   */
  found: Array<string>
}

export interface GapReport {
  matches: Array<RequirementMatch>
  /** Requirements with nothing behind them. The list the candidate has to make a decision about. */
  missing: Array<string>
  /** 0–1 across hard skills only. Soft skills are unfalsifiable and do not belong in a ratio. */
  coverage: number
}

function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function normalize(text: string): string {
  return stripAccents(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * A controlled synonym map, not free rein (docs/06).
 *
 * The rule it encodes: a job's phrase may stand in for the candidate's phrase **only when they name
 * the same thing the candidate actually did**. `CI/CD` ↔ `GitHub Actions pipelines` is one thing
 * under two names. `leadership` ↔ `management` is not — one can be true of someone the other is not,
 * and collapsing them is how a CV starts claiming a job the person never had.
 *
 * Sector-neutral on purpose. The audience is every profession (PRODUCT.md), so a tech-only map would
 * work for the smallest slice of it.
 */
const SYNONYMS: Array<Array<string>> = [
  ['ci cd', 'continuous integration', 'github actions', 'gitlab ci', 'jenkins'],
  ['rota', 'rostering', 'shift scheduling', 'shift planning'],
  ['stock control', 'inventory control', 'inventory management'],
  ['crm', 'salesforce', 'hubspot', 'customer relationship management'],
  ['erp', 'sap', 'navision', 'dynamics'],
  ['h and s', 'health and safety', 'hse', 'arbejdsmiljo'],
  ['first aid', 'primeros auxilios', 'forstehjaelp'],
  ['forklift', 'carretilla', 'truckcertifikat'],
  ['patient care', 'nursing care', 'pleje'],
  ['bookkeeping', 'accounts payable', 'accounts receivable', 'contabilidad'],
  ['customer service', 'atencion al cliente', 'kundeservice'],
  ['spreadsheets', 'excel', 'google sheets'],
]

/**
 * The framing an advert wraps a requirement in, which the CV never repeats.
 *
 * Adverts do not write `Advanced Life Support`; they write **"Certification in** advanced life support",
 * "3 years' **experience with** ventilators", "**Licence for** a forklift". A CV writes the thing itself.
 * Matching is containment of the requirement inside the CV's text, so every one of those framings makes
 * a requirement *longer* than the evidence and guarantees a miss.
 *
 * That produced the worst possible result on the first real run: a nurse's CV listing
 * `Advanced Life Support (ALS)` under Certifications was told "Not in your CV. Nothing here matches
 * this." For the regulated professions this product is aimed at, a certification is not one signal among
 * many — it is the one the employer screens on first.
 *
 * Lives here rather than in `advert.ts` because the requirement list is **editable**: a candidate typing
 * "Experience with CRRT" into the add box hits exactly the same wall, and so would any hand-written
 * `JobRequirements`. Stripping at the point of matching covers every source; stripping at the point of
 * parsing covers one.
 */
const FRAMING: Array<RegExp> = [
  // A leading duration clause: "at least 3 years' experience of …"
  /^(?:at least\s+|minimum\s+|min\.?\s+|mindst\s+|al menos\s+)?\d+\s*\+?\s*(?:years?|yrs?|anos|ar)['’]?\s*(?:\s*(?:of|de|med|with|i)\b)?\s*/i,
  /^(?:experience|erfaring|experiencia)\s+(?:with|in|of|med|i|en|con|de)\s+/i,
  /^(?:knowledge|kendskab|conocimiento[s]?)\s+(?:of|in|til|af|de|en)\s+/i,
  // The regulated-profession framings, which are the ones that cost the most when missed.
  /^(?:certification|certificate|certificat|certificado|certifikat)\s+(?:in|of|for|i|en|de)\s+/i,
  /^(?:qualification|qualified|kvalifikation|titulacion)\s+(?:in|as|of|i|som|en|de)\s+/i,
  /^(?:licence|license|licencia|kort|bevis)\s+(?:in|for|to|til|de|para)\s+/i,
  /^(?:training|uddannelse|formacion)\s+(?:in|as|of|i|som|en|de)\s+/i,
  /^(?:degree|diploma|grado|eksamen)\s+(?:in|of|i|en|de)\s+/i,
  /^(?:you (?:have|are|must|will)|du (?:har|er)|debes|tienes que)\s+/i,
]

/**
 * A requirement reduced to the thing being asked for, or unchanged if it carries no framing.
 *
 * Applied repeatedly, because adverts stack it: "3 years' experience of certification in …" is not
 * elegant English but it is written every day.
 */
export function stripRequirementFraming(requirement: string): string {
  let text = requirement.trim()
  for (let pass = 0; pass < 3; pass++) {
    const before = text
    for (const pattern of FRAMING) text = text.replace(pattern, '')
    if (text === before) break
  }
  return text.trim() === '' ? requirement.trim() : text.trim()
}

/**
 * Words that carry no claim, so a requirement sharing only these with a line has matched nothing.
 *
 * Short words are already dropped by length, so this only needs the long connectives.
 */
const FILLER = new Set([
  'and',
  'the',
  'with',
  'for',
  'from',
  'that',
  'this',
  'their',
  'para',
  'como',
  'sobre',
  'samt',
  'eller',
])

function significantWords(phrase: string): Array<string> {
  return normalize(phrase)
    .split(' ')
    .filter((word) => word.length >= 4 && !FILLER.has(word))
}

/**
 * Does this line evidence the requirement, allowing for ordinary rewording?
 *
 * Containment of the exact phrase is the primary test and it is very brittle in one specific way: a CV
 * describes what somebody *did*, an advert names the *thing*, and the two are rarely the same string.
 * A CV saying "Precepted 14 newly graduated nurses through their first six months" was reported as no
 * evidence at all for "Preceptorship of newly graduated nurses" — telling a nurse to add something she
 * plainly has, which is the same harm as missing a certification.
 *
 * So: **every** claim-bearing word of the requirement must appear in the same line, matched on a
 * five-character stem. Requiring all of them, in one span, is what keeps this conservative — and the
 * case that proves it is the one it must keep refusing: "Experience with paediatric intensive care"
 * against a CV full of intensive care still fails, because nothing in it starts with `paedi`. A looser
 * any-word rule would have claimed paediatric experience from an adult ICU, which is exactly the
 * fabrication the missing verdict exists to report instead.
 *
 * Only for multi-word requirements. A single word needs no help from a stem match, and giving it one
 * would loosen the common case to fix the rare one.
 */
function everyWordPresent(phrase: string, span: string): boolean {
  const words = significantWords(phrase)
  if (words.length < 2) return false
  const tokens = normalize(span).split(' ')
  return words.every((word) =>
    tokens.some((token) => token.startsWith(word.slice(0, 5))),
  )
}

/** Every phrase that may stand in for this one, including itself. */
function equivalents(phrase: string): Array<string> {
  const key = normalize(phrase)
  const group = SYNONYMS.find((set) => set.some((entry) => entry === key))
  return group === undefined ? [key] : group
}

/**
 * Where a requirement is evidenced in the CV, and how strongly.
 *
 * `matched` — it is in a job's bullets, a role title, or a current-ish job's tech list. The candidate
 * did this, and a reader will see it.
 *
 * `weak` — it is only in the skills list, or only in a job that ended years ago. The claim is there
 * but a recruiter skimming the first half of page one will not find it. That is the case tailoring
 * exists for: resurface it, do not invent it.
 *
 * `missing` — nothing. Reported.
 */
function locate(requirement: string, resume: Resume): RequirementMatch {
  /**
   * Both the requirement as written and its framing-stripped core, so `Certification in advanced life
   * support` finds `Advanced Life Support (ALS)`. The full phrase is kept as well as the core because
   * a CV that happens to repeat the advert's framing should still match on it.
   */
  const core = stripRequirementFraming(requirement)
  const phrases = [
    ...new Set([...equivalents(requirement), ...equivalents(core)]),
  ]
  const hit = (haystack: string | undefined): boolean => {
    if (haystack === undefined || haystack === '') return false
    const text = normalize(haystack)
    if (phrases.some((phrase) => text.includes(phrase))) return true
    return everyWordPresent(core, haystack)
  }

  const strong: Array<string> = []
  const weak: Array<string> = []

  resume.work.forEach((job, index) => {
    // "Recent" is the first two jobs, because that is what a recruiter reads before deciding.
    const recent = index < 2
    for (const bullet of job.highlights) {
      if (hit(bullet)) (recent ? strong : weak).push(bullet)
    }
    if (hit(job.role))
      (recent ? strong : weak).push(`${job.role} — ${job.company}`)
    for (const tech of job.tech) {
      if (hit(tech)) (recent ? strong : weak).push(`${tech} (${job.company})`)
    }
    if (hit(job.summary)) (recent ? strong : weak).push(job.summary ?? '')
  })

  for (const group of resume.skills) {
    for (const item of group.items) {
      // A skills-list entry alone is a claim with no story behind it.
      if (hit(item)) weak.push(`${item} (in your skills list)`)
    }
  }
  for (const cert of resume.certifications) {
    if (hit(cert.name)) strong.push(cert.name)
  }
  if (hit(resume.basics.summary)) weak.push('your summary')

  if (strong.length > 0) {
    return { requirement, evidence: 'matched', found: strong.slice(0, 3) }
  }
  if (weak.length > 0) {
    return { requirement, evidence: 'weak', found: weak.slice(0, 3) }
  }
  return { requirement, evidence: 'missing', found: [] }
}

export function buildGapReport(
  resume: Resume,
  requirements: JobRequirements,
): GapReport {
  /**
   * Hard skills only in the ratio.
   *
   * "Excellent communicator" is not falsifiable from a CV, so counting it would make coverage a
   * number about how many adjectives the advert used. Soft skills are still matched and shown; they
   * just do not move a percentage.
   */
  const matches = [
    ...requirements.hardSkills.map((skill) => locate(skill, resume)),
    ...requirements.softSkills.map((skill) => locate(skill, resume)),
  ]

  const hard = matches.slice(0, requirements.hardSkills.length)
  const covered = hard.filter((m) => m.evidence !== 'missing').length

  return {
    matches,
    missing: matches
      .filter((m) => m.evidence === 'missing')
      .map((m) => m.requirement),
    coverage: hard.length === 0 ? 1 : covered / hard.length,
  }
}

export interface TailoringMove {
  kind: 'reorder-highlights' | 'reorder-skills'
  /** Plain language, shown to the candidate. Every change is explained or it is not made. */
  because: string
  workIndex?: number
}

export interface Tailored {
  resume: Resume
  moves: Array<TailoringMove>
}

/**
 * Produce a tailored **variant**. The input is never mutated.
 *
 * Only two moves, and both are reorderings — nothing is written, nothing is removed, nothing is
 * invented. A reordering cannot make a CV say something untrue, which is why it is the whole of what
 * this is permitted to do without a model in the loop.
 */
export function applyTailoring(
  resume: Resume,
  requirements: JobRequirements,
): Tailored {
  const moves: Array<TailoringMove> = []
  const wanted = [...requirements.hardSkills, ...requirements.keywords]

  const relevance = (text: string): number => {
    const haystack = normalize(text)
    return wanted.filter((requirement) =>
      equivalents(requirement).some((phrase) => haystack.includes(phrase)),
    ).length
  }

  const work = resume.work.map((job, index) => {
    const scored = job.highlights.map((text, position) => ({
      text,
      position,
      score: relevance(text),
    }))
    // Stable: equal relevance keeps the candidate's own order, because they know their job and we
    // do not. Only genuine evidence moves.
    const sorted = [...scored].sort(
      (a, b) => b.score - a.score || a.position - b.position,
    )
    const changed = sorted.some((item, at) => item.position !== at)
    if (changed && sorted[0].score > 0) {
      moves.push({
        kind: 'reorder-highlights',
        workIndex: index,
        because: `Moved the work that matches this job to the top of ${job.company || job.role || 'this role'}, so a recruiter sees it in the first two lines.`,
      })
    }
    return { ...job, highlights: sorted.map((item) => item.text) }
  })

  const skills = resume.skills.map((group) => {
    const scored = group.items.map((text, position) => ({
      text,
      position,
      score: relevance(text),
    }))
    const sorted = [...scored].sort(
      (a, b) => b.score - a.score || a.position - b.position,
    )
    return { ...group, items: sorted.map((item) => item.text) }
  })

  const skillsChanged = skills.some(
    (group, index) =>
      group.items.join('|') !== resume.skills[index].items.join('|'),
  )
  if (skillsChanged) {
    moves.push({
      kind: 'reorder-skills',
      because:
        'Put the skills this job names first in each group, so they are the ones read.',
    })
  }

  return { resume: { ...resume, work, skills }, moves }
}
