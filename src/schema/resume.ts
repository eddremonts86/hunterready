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

/** The escape hatch. Real CVs have "Speaking", "Patents", "Military service". */
export const CustomSection = z.object({
  title: z.string(),
  items: z.array(z.string()).default([]),
})

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
