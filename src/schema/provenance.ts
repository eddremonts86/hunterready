/**
 * Extraction provenance — the sidecar that makes the review step honest.
 *
 * Kept out of the Resume schema on purpose (docs/03-resume-schema.md): confidence is a
 * fact about *this extraction run*, not about the resume. Mixing them would force every
 * consumer — templates included — to carry fields it does not care about.
 *
 * The review form highlights anything below CONFIDENCE_REVIEW_THRESHOLD or flagged
 * `inferred`. That highlight is the product's honesty mechanism: without it the user has
 * to re-read the whole form, which defeats the point of extracting anything.
 */
import { z } from 'zod'

export const FieldProvenance = z.object({
  /** Dot path into the Resume, e.g. "work.0.highlights.2". */
  path: z.string(),
  confidence: z.number().min(0).max(1),
  /** The raw span this value came from. Shown on hover so the user can check us. */
  sourceText: z.string().optional(),
  /** true = derived or normalized, not literally present in the source document. */
  inferred: z.boolean().default(false),
})

export const SourceFormat = z.enum(['pdf', 'docx', 'doc', 'txt', 'md'])

export const ExtractionResult = z.object({
  /** Validated separately against `Resume` — kept unknown here to avoid a cycle. */
  resume: z.unknown(),
  provenance: z.array(FieldProvenance).default([]),
  sourceFormat: SourceFormat,
  /** ISO timestamp. */
  extractedAt: z.string(),
  /** User-facing, e.g. "scanned PDF, no text layer" or "two-column layout detected". */
  warnings: z.array(z.string()).default([]),
  /** Lets us A/B extraction quality across prompt revisions. */
  promptVersion: z.string(),
})

export type FieldProvenance = z.infer<typeof FieldProvenance>
export type ExtractionResult = z.infer<typeof ExtractionResult>
export type SourceFormat = z.infer<typeof SourceFormat>

/** Below this, the review form marks the field as needing a human look. */
export const CONFIDENCE_REVIEW_THRESHOLD = 0.7

export function needsReview(p: FieldProvenance): boolean {
  return p.inferred || p.confidence < CONFIDENCE_REVIEW_THRESHOLD
}
