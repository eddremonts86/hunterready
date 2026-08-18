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

/* ────────────────────────────────────────────────────────────────────────────────────────────────
   Keeping the flags attached to the right row
   ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * A provenance path is indexed by position — `work.2.role`, `work.0.highlights.1` — which is fine
 * while the list is the one the extraction produced and wrong the moment somebody edits its shape.
 *
 * Delete the second of three jobs and, without this, the flags for the third job stay on `work.2` while
 * the job itself becomes `work.1`. The visible result is "we were not sure we read this correctly"
 * pointing at a row the person just typed by hand, and nothing at all on the row that actually needs
 * checking. That is worse than having no flags: the whole mechanism asks the user to trust that a mark
 * means something.
 *
 * So structural edits remap. Three rules, and the third is the one that carries the honesty:
 *
 *   1. Rows before the edit keep their paths.
 *   2. Rows after it shift by the delta.
 *   3. A row that was **removed** takes its flags with it, and a row that was **inserted** has none —
 *      because nothing extracted it. A field the user typed is not a field we are unsure about, and
 *      inheriting a neighbour's confidence score would be inventing a measurement.
 */
/**
 * One path format, whoever produced the path.
 *
 * **The contract is dotted: `work.0.company`.** Everything that consumes a path assumes it —
 * `shiftProvenance` below splits on `.` and reads the next segment as an index, and the review form
 * filters rows with `` `${list}.${at}.` ``.
 *
 * The rule engine emits that form. **The model does not**, because the model writes these strings
 * itself and reaches for the JSON-path style it has seen everywhere: `work[0].company`. Neither
 * consumer matches that, so every flag from the model survived a row deletion pointing at the old
 * index — which is precisely the failure the note above calls worse than having no flags at all, and
 * it was live for everyone, since ADR-030 puts every visitor on the model path.
 *
 * Normalising here rather than in the prompt is deliberate: a prompt is a request, and this is a
 * contract. A model that ignores the instruction once would put it straight back.
 *
 * Found on 2026-08-18 by following `docs/api/README.md` as a stranger would, which is what block 7
 * of plan 16 asked for and the reason that verification step is worth its cost.
 */
export function normalizePath(path: string): string {
  // `work[0].company` → `work.0.company`; `skills[1]` → `skills.1`; already-dotted is left alone.
  return path.replace(/\[(\d+)\]/g, '.$1').replace(/\.\./g, '.')
}

export function shiftProvenance(
  provenance: Array<FieldProvenance>,
  listPath: string,
  at: number,
  delta: 1 | -1,
): Array<FieldProvenance> {
  const prefix = `${listPath}.`
  const out: Array<FieldProvenance> = []

  for (const entry of provenance) {
    if (!entry.path.startsWith(prefix)) {
      out.push(entry)
      continue
    }

    const rest = entry.path.slice(prefix.length)
    const [head, ...tail] = rest.split('.')
    const index = Number(head)
    // A path segment that is not a number is not an index into this list — leave it exactly alone
    // rather than guessing, because a wrong guess here is a mislabelled field.
    if (!Number.isInteger(index)) {
      out.push(entry)
      continue
    }

    if (index < at) {
      out.push(entry)
      continue
    }
    // Removal: the row at `at` is gone, and so is everything said about it.
    if (delta === -1 && index === at) continue

    const moved = index + delta
    out.push({
      ...entry,
      path: [`${listPath}.${moved}`, ...tail].join('.'),
    })
  }

  return out
}
