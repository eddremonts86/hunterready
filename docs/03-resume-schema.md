# 03 — Resume Schema (the contract)

Base: [JSON Resume](https://jsonresume.org/schema/) shape, deliberately diverged
where it is weak (skills are flat, no provenance, dates are loose ISO strings).
Keeping the names recognizable buys import/export compatibility later.

## Design rules

1. **Dates are `YYYY-MM` or `YYYY` strings, never `Date`.** CVs legitimately say
   "2019" with no month. A `Date` forces a lie (`2019-01-01`) that then renders wrong.
2. **`endDate: null` means current.** No separate boolean to fall out of sync with.
3. **Every repeated section is an array, ordered as it should render.** Ordering is
   data, not a template concern — the AI optimizer reorders by moving array items.
4. **One escape hatch (`custom`).** Real CVs have "Speaking", "Patents",
   "Military service". Without an escape hatch the parser silently drops them.
5. **Provenance lives in a sidecar, not in the schema.** Confidence is about _this
   extraction run_, not about the resume. Mixing them makes every consumer handle
   fields it doesn't care about.
6. **Nothing is required except `basics.fullName`.** A partially-parsed CV must
   still round-trip through validation so the user can fix it in the UI. Strict
   requirements here would turn a bad parse into a 500.

## `src/schema/resume.ts`

```ts
import { z } from 'zod'

/** "2019" | "2019-06" — the only date format in this system. */
export const YearMonth = z
  .string()
  .regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, 'expected YYYY or YYYY-MM')

export const Link = z.object({
  label: z.string(), // "GitHub", "Portfolio"
  url: z.string().url(),
})

export const Basics = z.object({
  fullName: z.string().min(1),
  headline: z.string().optional(), // "Senior Frontend Engineer"
  email: z.string().email().optional(),
  phone: z.string().optional(), // free text; formats vary by country
  location: z
    .object({
      city: z.string().optional(),
      region: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
  links: z.array(Link).default([]),
  summary: z.string().optional(),
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
  endDate: YearMonth.nullable().default(null), // null = current
  summary: z.string().optional(), // 1–2 lines of context
  highlights: z.array(z.string()).default([]), // the bullets
  tech: z.array(z.string()).default([]),
})

export const EducationItem = z.object({
  institution: z.string(),
  degree: z.string().optional(), // "MSc", "BSc"
  field: z.string().optional(), // "Computer Science"
  location: z.string().optional(),
  startDate: YearMonth.optional(),
  endDate: YearMonth.nullable().default(null),
  grade: z.string().optional(),
  highlights: z.array(z.string()).default([]),
})

export const SkillGroup = z.object({
  category: z.string(), // "Languages", "Cloud"
  items: z.array(z.string()).default([]),
})

export const ProjectItem = z.object({
  name: z.string(),
  role: z.string().optional(),
  description: z.string().optional(),
  highlights: z.array(z.string()).default([]),
  tech: z.array(z.string()).default([]),
  url: z.string().url().optional(),
  startDate: YearMonth.optional(),
  endDate: YearMonth.nullable().default(null),
})

export const CertificationItem = z.object({
  name: z.string(),
  issuer: z.string().optional(),
  date: YearMonth.optional(),
  expires: YearMonth.optional(),
  url: z.string().url().optional(),
})

/** CEFR where known; `raw` keeps whatever the CV actually said. */
export const LanguageItem = z.object({
  name: z.string(),
  level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'native']).optional(),
  raw: z.string().optional(), // "fluent", "conversational"
})

export const CustomSection = z.object({
  title: z.string(),
  items: z.array(z.string()).default([]),
})

export const Resume = z.object({
  schemaVersion: z.literal('1.0'),
  locale: z.string().default('en'), // BCP-47, drives date formatting
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
```

## `src/schema/provenance.ts`

The review UI needs to know **what to highlight**. Without this, the user has to
re-read the entire form, which defeats the purpose.

```ts
import { z } from 'zod'

export const FieldProvenance = z.object({
  path: z.string(), // "work.0.highlights.2" (JSON pointer-ish)
  confidence: z.number().min(0).max(1),
  sourceText: z.string().optional(), // the raw span it came from
  inferred: z.boolean().default(false), // true = derived, not literally present
})

export const ExtractionResult = z.object({
  resume: z.unknown(), // validated separately against Resume
  provenance: z.array(FieldProvenance).default([]),
  sourceFormat: z.enum(['pdf', 'docx', 'doc', 'txt', 'md']),
  extractedAt: z.string(), // ISO timestamp
  warnings: z.array(z.string()).default([]), // "scanned PDF, OCR used"
  promptVersion: z.string(), // for A/B-ing extraction quality
})
```

Anything under `confidence < 0.7` or with `inferred: true` gets a visual marker
in the review form. That marker is the product's honesty mechanism.

## Migration policy

`schemaVersion` is a literal, not a loose string. When the shape changes, add
`src/schema/migrations/1.0-to-1.1.ts` and a fixture that proves the migration.
Cheap now, unavoidable once resumes are persisted (v0.5).
