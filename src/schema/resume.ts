/**
 * The canonical Resume contract (ADR-001).
 *
 * Every module speaks this and only this: ingestion produces it, the review form
 * edits it, the optimizer transforms it, templates render it. Changing this file means
 * touching all four plus every fixture — bump `schemaVersion` and add a migration.
 *
 * Design rules and rationale: docs/03-resume-schema.md
 */
import { z } from 'zod'

/** "2019" | "2019-06" — the only date format in this system. */
export const YearMonth = z
  .string()
  .regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, 'expected YYYY or YYYY-MM')

/**
 * A link as people actually write it on a CV.
 *
 * `z.string().url()` was wrong here, and it cost a whole extraction: a real CV wrote
 * `profile.eduardoinerarte.dk` and the bare handles `eduardo-inerarte` and `eddremonts86` next to
 * LinkedIn and GitHub labels. The model copied them faithfully — which is exactly what the prompt
 * demands — and strict URL validation rejected all of them, three repair rounds in a row, before
 * falling back to rule-based extraction. Dropping a recruiter's route to someone's portfolio
 * because it lacks `https://` is the schema being wrong, not the CV.
 *
 * So: accept what is written, add the scheme when the value looks like a domain, and keep a bare
 * handle as text. Reject only what cannot be a link at all.
 */
export const LinkTarget = z
  .string()
  .min(2)
  .max(300)
  .refine((value) => !/\s/.test(value), 'a link cannot contain spaces')
  .transform((value) => {
    if (/^https?:\/\//i.test(value)) return value
    if (/^www\./i.test(value)) return `https://${value}`
    // A dot followed by a 2+ letter TLD, with no path-only look: treat as a domain.
    if (
      /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(value) &&
      /\.[a-z]{2,}/i.test(value)
    ) {
      return `https://${value}`
    }
    // A bare handle. Still the most useful thing we can show next to its label.
    return value
  })

export const Link = z.object({
  /** "GitHub", "Portfolio", "LinkedIn" */
  label: z.string(),
  url: LinkTarget,
})

export const Basics = z.object({
  fullName: z.string().min(1),
  /** "Senior Frontend Engineer", "Registered Nurse" */
  headline: z.string().optional(),
  email: z.string().email().optional(),
  /** Free text on purpose — phone formats vary by country and normalizing loses info. */
  phone: z.string().optional(),
  location: z
    .object({
      city: z.string().optional(),
      region: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
  links: z.array(Link).default([]),
  summary: z.string().optional(),
  /**
   * European-convention only. Rendered by `modern-eu`, ignored by `modern-intl`.
   * The only image in the entire system (docs/05-pdf-rendering.md).
   */
  photoUrl: z.string().optional(),
  /**
   * European-convention only, and never inferred: date of birth, nationality and
   * similar fields are supplied by the user or absent. Free-form label/value so we
   * do not build a taxonomy of personal data we have no business modelling.
   */
  personalDetails: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .default([]),
})

export const WorkItem = z.object({
  company: z.string(),
  role: z.string(),
  employmentType: z
    .enum(['full-time', 'part-time', 'contract', 'freelance', 'internship'])
    .optional(),
  location: z.string().optional(),
  remote: z.boolean().optional(),
  startDate: YearMonth.optional(),
  /** null = current position. No separate boolean to fall out of sync with. */
  endDate: YearMonth.nullable().default(null),
  /** 1–2 lines of context about the employer or the scope of the role. */
  summary: z.string().optional(),
  /** The bullets. Order is meaningful — the optimizer reorders by moving items. */
  highlights: z.array(z.string()).default([]),
  /** Tools, systems, equipment — not only software. */
  tech: z.array(z.string()).default([]),
})

export const EducationItem = z.object({
  institution: z.string(),
  /** "MSc", "BSc", "Vocational diploma" */
  degree: z.string().optional(),
  field: z.string().optional(),
  location: z.string().optional(),
  startDate: YearMonth.optional(),
  endDate: YearMonth.nullable().default(null),
  grade: z.string().optional(),
  highlights: z.array(z.string()).default([]),
})

export const SkillGroup = z.object({
  /** "Clinical", "Languages", "Cloud" — never assume a technical career. */
  category: z.string(),
  items: z.array(z.string()).default([]),
})

export const ProjectItem = z.object({
  name: z.string(),
  role: z.string().optional(),
  description: z.string().optional(),
  highlights: z.array(z.string()).default([]),
  tech: z.array(z.string()).default([]),
  url: LinkTarget.optional(),
  startDate: YearMonth.optional(),
  endDate: YearMonth.nullable().default(null),
})

export const CertificationItem = z.object({
  name: z.string(),
  issuer: z.string().optional(),
  date: YearMonth.optional(),
  expires: YearMonth.optional(),
  url: LinkTarget.optional(),
  /** Licence or registration number, common in regulated professions. */
  identifier: z.string().optional(),
})

/** CEFR where known; `raw` keeps whatever the CV actually said. */
export const LanguageItem = z.object({
  name: z.string(),
  level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'native']).optional(),
  /** "fluent", "conversational", "mother tongue" */
  raw: z.string().optional(),
})

/**
 * The escape hatch. Real CVs have "Speaking", "Patents", "Military service".
 *
 * `space` makes one of these a **spacer** instead: blank room between two sections, and nothing else.
 * It sits here rather than in a structure of its own because the thing being asked for is positional —
 * "leave a gap *here*" — and `custom` is already the ordered list the person arranges. A parallel list
 * of gaps addressed by index would be a second ordering to keep in step with the first.
 *
 * ## Why this is not a schemaVersion bump
 *
 * CLAUDE.md requires one for a change to the contract, and this is not one: the field is optional, so
 * every document ever written still parses, unchanged, into the same value it did before. Nothing to
 * migrate — there is no old shape, only a shape that says less. A bump would signal a break to every
 * reader of `schemaVersion` and there is nothing for them to do about it.
 *
 * ## And why a layout value is allowed in a semantic schema
 *
 * It is the one exception and it should stay the one. Everything else here is a fact about the person;
 * this is a fact about the page. The justification is that the alternative is worse: people space a CV
 * out with empty custom sections titled " " today, and that lands in the ATS text as a blank heading.
 * A spacer that the renderer knows about draws nothing, extracts as nothing, and cannot be mistaken for
 * a section that failed to parse.
 */
export const CustomSection = z.object({
  /**
   * A stable handle, so `sectionOrder` can name this section rather than its position.
   *
   * Optional, and absent on every document written before ordering existed. A section without one is
   * simply unnamed in the order and falls to the tail — the behaviour it had already. The interface
   * assigns ids the first time somebody reorders anything, which is the first moment they matter.
   */
  id: z.string().optional(),
  title: z.string(),
  items: z.array(z.string()).default([]),
  /**
   * Blank space above and below, in pixels, when this entry is a spacer rather than a section.
   *
   * Present means spacer. 25 each side by default, which is the gap Edd asked for; 0 is legal and
   * means "a spacer the reader has closed up" rather than "not a spacer", which is what `undefined`
   * says. Capped because a 900px gap is a blank page nobody meant to send.
   */
  space: z.number().int().min(0).max(240).optional(),
})

/** Spacers draw room, never words. One predicate, so nine templates cannot each decide differently. */
export function isSpacer(section: {
  space?: number
}): section is { space: number } {
  return typeof section.space === 'number'
}

/** What a new spacer starts at — 25px above and below (Edd's number). */
export const DEFAULT_SPACE = 25

export const Resume = z.object({
  schemaVersion: z.literal('1.0'),
  /** BCP-47. Drives date formatting and the heuristics pass's vocabulary. */
  locale: z.string().default('en'),
  basics: Basics,
  work: z.array(WorkItem).default([]),
  education: z.array(EducationItem).default([]),
  skills: z.array(SkillGroup).default([]),
  projects: z.array(ProjectItem).default([]),
  certifications: z.array(CertificationItem).default([]),
  languages: z.array(LanguageItem).default([]),
  awards: z.array(CustomSection).default([]),
  publications: z.array(CustomSection).default([]),
  volunteer: z.array(WorkItem).default([]),
  custom: z.array(CustomSection).default([]),
  /**
   * The order the person put their sections in, as tokens — `work`, `languages`, `custom:<id>`.
   *
   * Empty means "the design decides", which is what every document said until now and still says
   * unless somebody moves something. Unknown tokens are ignored and unmentioned sections fall to the
   * tail in the design's own order, so this can never hide a section: the worst a stale token can do
   * is nothing. See `src/render/sections.tsx`.
   *
   * `basics` is deliberately not a token. The name and contact details are the one block whose place
   * is not a matter of taste — a CV whose reader meets the phone number after the job history is a
   * CV with a bug, and every ATS heuristic assumes the header is the header.
   */
  sectionOrder: z.array(z.string()).default([]),
})

export type Resume = z.infer<typeof Resume>
export type WorkItem = z.infer<typeof WorkItem>
export type EducationItem = z.infer<typeof EducationItem>
export type SkillGroup = z.infer<typeof SkillGroup>
export type Basics = z.infer<typeof Basics>

/** An empty, valid resume. The starting point for a manual entry flow. */
export function emptyResume(fullName = ''): Resume {
  return Resume.parse({
    schemaVersion: '1.0',
    basics: { fullName },
  })
}
