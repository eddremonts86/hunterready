/**
 * Recover job content the model dropped, deterministically and verbatim.
 *
 * Some CVs describe each role in prose rather than bullets. A real one — twelve roles, every
 * description a paragraph, not a single "•" in the document — came back from the model with twelve
 * job titles and **zero** highlights, which renders a CV listing where someone worked and nothing
 * about what they did. Telling the prompt to treat prose as highlights did not fix it; the model
 * simply does not comply on that document.
 *
 * So this is code's job, per the project's own rule: never ask the model to do what code does
 * reliably. We locate the role in the normalized text and take the prose beneath it, copied exactly.
 * Nothing is invented — every recovered line is a substring of the user's own document — and every
 * recovery is marked `inferred`, so the review step flags it for a human.
 *
 * It only ever *adds* to an empty highlights list. A model that did the job keeps its answer.
 */
import type { Resume } from '@/schema/resume'
import type { FieldProvenance } from '@/schema/provenance'

/** Confidence for recovered prose: real text, uncertain placement. */
const RECOVERED_CONFIDENCE = 0.5

/** Stop after this many paragraphs; beyond it we are almost certainly into the next role. */
const MAX_RECOVERED = 6

/** Prose shorter than this is a label or a fragment, not a description of work. */
const MIN_PROSE_CHARS = 40

function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** A line that states where and when, rather than what: "01/08/2024 SCHILLING APS Copenhagen". */
function looksLikeMetadata(line: string): boolean {
  const digits = (line.match(/\d/g) ?? []).length
  if (digits >= 6 && line.length < 90) return true
  if (/^(present|present day|nu|actualidad|hoy)\b/i.test(line.trim()))
    return true
  return false
}

export interface RecoveryResult {
  resume: Resume
  provenance: Array<FieldProvenance>
  /** How many jobs got their content back. Worth logging: a rising number means model drift. */
  recovered: number
}

export function recoverMissingHighlights(
  resume: Resume,
  normalizedText: string,
): RecoveryResult {
  const lines = normalizedText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')

  if (lines.length === 0) {
    return { resume, provenance: [], recovered: 0 }
  }

  const normalizedLines = lines.map(normalizeForMatch)

  // Where each role's own heading sits, so we know where to stop.
  const roleAnchors = new Map<number, number>()
  resume.work.forEach((job, jobIndex) => {
    if (job.role.trim() === '') return
    const needle = normalizeForMatch(job.role)
    if (needle.length < 6) return

    const at = normalizedLines.findIndex(
      (line) => line.includes(needle) || needle.includes(line),
    )
    if (at !== -1) roleAnchors.set(jobIndex, at)
  })

  const anchorPositions = new Set(roleAnchors.values())
  const provenance: Array<FieldProvenance> = []
  let recovered = 0

  const work = resume.work.map((job, jobIndex) => {
    if (job.highlights.length > 0) return job

    const anchor = roleAnchors.get(jobIndex)
    if (anchor === undefined) return job

    const collected: Array<string> = []

    for (let at = anchor + 1; at < lines.length; at++) {
      const line = lines[at]

      // The next role, or a section boundary: the current job's content has ended.
      if (anchorPositions.has(at)) break
      if (line.startsWith('## ')) break
      if (collected.length >= MAX_RECOVERED) break

      if (looksLikeMetadata(line)) continue
      if (line.length < MIN_PROSE_CHARS) continue

      collected.push(line.replace(/^[-•·]\s*/, ''))
    }

    if (collected.length === 0) return job

    recovered++
    provenance.push({
      path: `work.${jobIndex}.highlights`,
      confidence: RECOVERED_CONFIDENCE,
      sourceText: collected[0],
      // Copied from the document, but *we* decided it belonged to this job.
      inferred: true,
    })

    return { ...job, highlights: collected }
  })

  return { resume: { ...resume, work }, provenance, recovered }
}
