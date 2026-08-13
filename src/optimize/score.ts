/**
 * The CV score — rule-based and transparent, never a model's number (docs/06-ai-optimization.md).
 *
 * The decision that shapes everything here: **an LLM score would be worthless.** It is unstable
 * across runs, so a user who changes nothing sees a different number; it cannot be explained, so a
 * user who wants to improve has nothing to act on; and it cannot be tested, so we would have no idea
 * if it got worse. Every point below is traceable to a rule you can read.
 *
 * The second decision: **the checklist is the product and the score is the byproduct.** Nobody
 * improves a CV from "68/100". People improve a CV from "4 of your 11 bullets have no outcome — here
 * they are". So `findings` comes first in the type, carries the exact items, and the number exists
 * mainly to show that acting on the list moves something.
 *
 * Weights are docs/06's table, unchanged:
 *
 *   keyword coverage vs JD   30    section completeness   15
 *   bullet quality           20    concision              10
 *   ATS-safety               15    consistency            10
 *
 * Without a job description, keyword coverage is not scored and its 30 points leave the denominator
 * rather than counting as zero. Scoring someone 0/30 for not having pasted a job ad would be a
 * number about us, not about them.
 */
import type { Resume } from '@/schema/resume'

export type Dimension =
  'keywords' | 'completeness' | 'bullets' | 'concision' | 'ats' | 'consistency'

export interface Finding {
  dimension: Dimension
  /** What to do, addressed to the candidate, in their words not ours. */
  fix: string
  /** The exact items this is about, so the fix is actionable rather than a lecture. */
  items: Array<string>
  /** Points currently unearned. Shows what the work is worth. */
  cost: number
}

export interface DimensionScore {
  dimension: Dimension
  earned: number
  possible: number
  label: string
}

export interface CvScore {
  /** The list to act on, worst first. This is the output that matters. */
  findings: Array<Finding>
  dimensions: Array<DimensionScore>
  /** 0–100, rounded. A byproduct of the checklist, never presented alone. */
  score: number
}

const WEIGHTS: Record<Dimension, number> = {
  keywords: 30,
  completeness: 15,
  bullets: 20,
  concision: 10,
  ats: 15,
  consistency: 10,
}

const LABELS: Record<Dimension, string> = {
  keywords: 'Matches the job',
  completeness: 'Has the expected sections',
  bullets: 'Bullets show what happened',
  concision: 'Reads quickly',
  ats: 'Machine-readable',
  consistency: 'Internally consistent',
}

/**
 * Openers that describe a duty rather than an act.
 *
 * "Responsible for the rota" and "Ran the rota" contain the same information; only the second says
 * the person did something. This is the single most common weakness in a real CV and the cheapest
 * to fix, which is why it is called out by name rather than folded into a vague "improve wording".
 */
const WEAK_OPENERS = [
  'responsible for',
  'duties included',
  'tasked with',
  'worked on',
  'helped with',
  'assisted with',
  'involved in',
  'participated in',
  'in charge of',
  // es
  'responsable de',
  'encargado de',
  'encargada de',
  'participacion en',
  // da
  'ansvarlig for',
  'medvirkede til',
]

/** A bullet says what happened when it carries a quantity, a scale, or a stated result. */
const OUTCOME =
  /\d|\b(?:reduc|increas|cut|grew|grow|saved|won|launch|deliver|led|reduj|aument|redu|øget|reducer)/i

function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function normalize(text: string): string {
  return stripAccents(text).toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Rough line count at CV widths. Used only to spot a bullet that has become a paragraph. */
function looksLongerThanTwoLines(bullet: string): boolean {
  return bullet.trim().length > 190
}

export interface ScoreInput {
  resume: Resume
  /**
   * Hard requirements from a job description, if one was pasted. Absent means keyword coverage is
   * not scored at all rather than scored zero.
   */
  requiredSkills?: Array<string>
  /**
   * Whether the chosen template passed the ATS round-trip. Supplied by the caller because only the
   * renderer can answer it — this module does not guess at it.
   */
  atsVerified?: boolean
}

export function scoreCv(input: ScoreInput): CvScore {
  const { resume } = input
  const findings: Array<Finding> = []
  const dimensions: Array<DimensionScore> = []

  const record = (
    dimension: Dimension,
    ratio: number,
    finding?: Omit<Finding, 'dimension' | 'cost'>,
  ) => {
    const possible = WEIGHTS[dimension]
    const earned = Math.round(possible * Math.max(0, Math.min(1, ratio)))
    dimensions.push({
      dimension,
      earned,
      possible,
      label: LABELS[dimension],
    })
    if (finding !== undefined && earned < possible) {
      findings.push({ dimension, ...finding, cost: possible - earned })
    }
  }

  // ── keywords ────────────────────────────────────────────────────────────────────────────
  if (input.requiredSkills !== undefined && input.requiredSkills.length > 0) {
    const haystack = normalize(
      [
        resume.basics.headline,
        resume.basics.summary,
        ...resume.work.flatMap((job) => [
          job.role,
          job.summary,
          ...job.highlights,
          ...job.tech,
        ]),
        ...resume.skills.flatMap((group) => group.items),
        ...resume.certifications.map((cert) => cert.name),
      ]
        .filter((value): value is string => typeof value === 'string')
        .join(' '),
    )
    const missing = input.requiredSkills.filter(
      (skill) => !haystack.includes(normalize(skill)),
    )
    record(
      'keywords',
      1 - missing.length / input.requiredSkills.length,
      missing.length === 0
        ? undefined
        : {
            fix: 'The job asks for these and your CV does not mention them. Add the ones you have actually done — and if you have not done one, that is worth knowing before you apply.',
            items: missing,
          },
    )
  }

  // ── completeness ────────────────────────────────────────────────────────────────────────
  const expected: Array<[string, boolean]> = [
    ['an email address', resume.basics.email !== undefined],
    [
      'a phone number',
      resume.basics.phone !== undefined && resume.basics.phone !== '',
    ],
    ['a short summary', (resume.basics.summary ?? '').trim().length > 20],
    ['at least one job', resume.work.length > 0],
    ['your education', resume.education.length > 0],
    ['a skills section', resume.skills.length > 0],
  ]
  const missingSections = expected
    .filter(([, present]) => !present)
    .map(([name]) => name)
  record(
    'completeness',
    1 - missingSections.length / expected.length,
    missingSections.length === 0
      ? undefined
      : {
          fix: 'Recruiters and screening software both look for these. Anything missing reads as an incomplete application.',
          items: missingSections,
        },
  )

  // ── bullet quality ──────────────────────────────────────────────────────────────────────
  const allBullets = resume.work.flatMap((job) => job.highlights)
  if (allBullets.length === 0) {
    record('bullets', 0, {
      fix: 'None of your jobs say what you did there. A list of job titles tells a recruiter nothing they cannot get from LinkedIn.',
      items: [],
    })
  } else {
    const weak = allBullets.filter((bullet) => {
      const text = normalize(bullet)
      return WEAK_OPENERS.some((opener) => text.startsWith(opener))
    })
    const withoutOutcome = allBullets.filter(
      (bullet) => !OUTCOME.test(bullet) && !weak.includes(bullet),
    )
    const problems = weak.length + withoutOutcome.length
    record(
      'bullets',
      1 - problems / allBullets.length,
      problems === 0
        ? undefined
        : {
            fix:
              weak.length > 0
                ? 'These start by describing a duty rather than something you did. Opening with the action is the single cheapest improvement on a CV.'
                : 'These do not say what came of the work. A number, a scale or a result is what makes a bullet worth reading.',
            items: [...weak, ...withoutOutcome].slice(0, 8),
          },
    )
  }

  // ── concision ───────────────────────────────────────────────────────────────────────────
  const longBullets = allBullets.filter(looksLongerThanTwoLines)
  record(
    'concision',
    allBullets.length === 0 ? 1 : 1 - longBullets.length / allBullets.length,
    longBullets.length === 0
      ? undefined
      : {
          fix: 'These run past two lines. A recruiter scans; anything longer gets skipped rather than read.',
          items: longBullets.slice(0, 5),
        },
  )

  // ── ATS safety ──────────────────────────────────────────────────────────────────────────
  record(
    'ats',
    input.atsVerified === false ? 0 : 1,
    input.atsVerified === false
      ? {
          fix: 'We checked whether the automated screening software most employers use can read this layout back, and it could not. Pick a different one before you send it.',
          items: [],
        }
      : undefined,
  )

  // ── consistency ─────────────────────────────────────────────────────────────────────────
  const problems: Array<string> = []

  const openEnded = resume.work.filter((job) => job.endDate === null)
  if (openEnded.length > 1) {
    problems.push(
      `${openEnded.length} jobs are shown as still going: ${openEnded.map((job) => job.company || job.role).join(', ')}`,
    )
  }
  const undated = resume.work.filter((job) => job.startDate === undefined)
  if (undated.length > 0) {
    problems.push(
      `${undated.length} ${undated.length === 1 ? 'job has' : 'jobs have'} no start date`,
    )
  }
  const backwards = resume.work.filter(
    (job) =>
      job.startDate !== undefined &&
      job.endDate !== null &&
      job.endDate !== undefined &&
      job.endDate < job.startDate,
  )
  if (backwards.length > 0) {
    problems.push(
      `${backwards.length} ${backwards.length === 1 ? 'job ends' : 'jobs end'} before it starts`,
    )
  }
  /**
   * A gap of more than a year, unexplained.
   *
   * Reported, never editorialised: a career break is a normal thing and plenty of them are nobody's
   * business. What costs an interview is a *silent* gap, because the reader fills it in themselves.
   */
  const dated = resume.work
    .filter((job) => job.startDate !== undefined)
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))
  for (let i = 1; i < dated.length; i++) {
    const previousEnd = dated[i - 1].endDate
    const nextStart = dated[i].startDate
    if (previousEnd == null || nextStart === undefined) continue
    const months =
      (Number(nextStart.slice(0, 4)) - Number(previousEnd.slice(0, 4))) * 12 +
      (Number(nextStart.slice(5, 7) || '1') -
        Number(previousEnd.slice(5, 7) || '1'))
    if (months > 12) {
      problems.push(
        `a ${Math.round(months / 12)}-year gap between ${dated[i - 1].company || 'one job'} and ${dated[i].company || 'the next'}`,
      )
    }
  }

  record(
    'consistency',
    problems.length === 0 ? 1 : Math.max(0, 1 - problems.length * 0.34),
    problems.length === 0
      ? undefined
      : {
          fix: 'A reader notices these before they notice anything good. None of them are hard to fix.',
          items: problems,
        },
  )

  const possible = dimensions.reduce((sum, d) => sum + d.possible, 0)
  const earned = dimensions.reduce((sum, d) => sum + d.earned, 0)

  return {
    // Worst first: the list is a work queue, and the most expensive omission belongs at the top.
    findings: [...findings].sort((a, b) => b.cost - a.cost),
    dimensions,
    score: possible === 0 ? 0 : Math.round((earned / possible) * 100),
  }
}
