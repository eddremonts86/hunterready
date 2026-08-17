/**
 * The private path: the local model **corrects** the rules, rather than replacing them.
 *
 * ## Why this shape, and it was measured rather than guessed
 *
 * The first attempt pointed the local model at the same contract the third-party one uses: one forced
 * tool call producing an entire `Resume`. It failed, consistently, and the failure was instructive —
 * all three repair rounds spent, then a silent fall back to rules, **447 seconds** later. Two hard
 * limits, both verified on the running container:
 *
 *   • The generated JSON Schema for `Resume` is thousands of characters. A 3B model cannot reliably
 *     emit a document that satisfies it; with a *small* schema the same model answered correctly and
 *     immediately, which is what pointed at size rather than capability.
 *   • It runs on CPU on a box already hosting a dozen applications. Minutes per call, not seconds.
 *
 * So the local model is given a job it can actually do. `extractByRules` already recovers 100% of
 * every fixture we have — it is excellent at *structure*, which is a mechanical problem. What it
 * lacks is judgement: whether a line is a job title or an employer, whether a heading was really a
 * heading. That is a small number of small questions, and small questions fit both the context window
 * and the model's ability.
 *
 * The result is better than either half alone, and strictly better than what declining used to mean.
 *
 * ## What it is allowed to change
 *
 * Only the fields below, and only by replacing a value the rules already produced — never by adding a
 * job, a bullet or a skill. That bound is deliberate: an unconstrained local pass would be a second
 * fabrication surface, and this file would then need its own version of `fabrication.ts`. Reordering
 * and rewording someone's CV is what the *rewrite* feature does, with a human accepting every line.
 */
import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { Resume } from '@/schema/resume'
import type { FieldProvenance } from '@/schema/provenance'
import type { Provider } from './provider'
import { ask } from './ask'
import { REFINE_ALIASES } from './narrate'
import type { NoteFn } from '@/lib/progress'

/**
 * Deliberately tiny, and tolerant on purpose, and every allowance below is a shape a 3B model actually produced.
 *
 * A small model expresses "no correction" as **`null`**, not by omitting the key, and it drops fields
 * it considers obvious — the `index` identifying which job it means. A strict schema rejects the whole
 * answer over either, and `refineLocally` then returns the draft unchanged: the model does useful work
 * and none of it lands, with `corrections: 0` giving no hint that anything was thrown away.
 *
 * Measured on `fixtures/private/edd.pdf`, where the model returned:
 *
 *     { "jobs": [ { "role": "Staff Frontend Engineer & Líder Técnico" } ],
 *       "fullName": null,
 *       "headline": "STAFF FRONTEND ENGINEER & LÍDER TÉCNICO" }
 *
 * `nullish` accepts the nulls; `catch` on the job array means one malformed entry costs that entry
 * rather than every correction in the answer. Being lax here is safe because nothing is trusted: every
 * value still has to appear in the document before it is used.
 */
const nullableText = z
  .string()
  .min(2)
  .max(120)
  .nullish()
  .transform((value) => value ?? undefined)

const Corrections = z.object({
  fullName: nullableText,
  headline: nullableText,
  /** One entry per job the model wants to correct, addressed by its position in the draft. */
  jobs: z
    .array(
      z
        .object({
          // No default: a correction applied to the wrong job is worse than one dropped, so an entry
          // that does not say which job it means is discarded below.
          index: z.number().int().min(0).max(40).nullish(),
          company: z.string().min(1).max(120).nullish(),
          role: z.string().min(1).max(120).nullish(),
        })
        .catch({ index: null, company: null, role: null }),
    )
    .max(20)
    .nullish()
    .transform((value) => value ?? []),
})

const SYSTEM = `You check a CV that has already been read by a rule-based parser. You correct its mistakes.

You are given the CV's text and the draft the parser produced. The parser is good at structure and bad
at judgement: it confuses a job title with an employer, it sometimes takes a line of contact detail for
a headline, and it cannot tell a person's name from the words next to it.

Return ONLY the fields that are WRONG. If the parser got something right, say nothing about it — an
empty answer is a correct and useful answer, and the common one.

Never invent. Every value you return must appear in the CV text you were given. If the text does not
say who the employer was, leave it alone rather than guessing: a wrong employer costs the candidate an
interview, and the parser's blank is honest.

Do not rewrite anything. Do not improve wording, do not expand an abbreviation, do not translate. You
are correcting a misreading, not editing a document.`

function draftFor(resume: Resume): string {
  const jobs = resume.work
    .map(
      (job, index) =>
        `  [${index}] role=${JSON.stringify(job.role)} company=${JSON.stringify(job.company)}`,
    )
    .join('\n')
  return `name=${JSON.stringify(resume.basics.fullName)}
headline=${JSON.stringify(resume.basics.headline ?? null)}
jobs:
${jobs || '  (none)'}`
}

export interface RefineResult {
  resume: Resume
  provenance: Array<FieldProvenance>
  /** How many fields the model actually changed. 0 means the rules were already right. */
  corrections: number
}

/**
 * Ask the local model to correct the rules' draft. Never throws: on any failure the draft stands.
 *
 * The draft is *always* a usable CV, so every error path here is "keep what we have" rather than
 * "fail the upload". That is what lets the whole function be optional without the caller caring.
 */
export async function refineLocally(input: {
  normalizedText: string
  draft: Resume
  provenance: Array<FieldProvenance>
  provider: Provider
  signal?: AbortSignal
  /** Which part of the draft is being checked, live. Section keys only — see `narrate.ts`. */
  onNote?: NoteFn
}): Promise<RefineResult> {
  const unchanged: RefineResult = {
    resume: input.draft,
    provenance: input.provenance,
    corrections: 0,
  }

  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: input.provider.model,
    max_tokens: 900,
    temperature: 0,
    system: SYSTEM,
    tools: [
      {
        name: 'submit_corrections',
        description: 'Report only the fields the parser got wrong.',
        input_schema: z.toJSONSchema(Corrections, {
          io: 'input',
          reused: 'inline',
        }) as Anthropic.Tool['input_schema'],
      },
    ],
    tool_choice: { type: 'tool', name: 'submit_corrections' },
    messages: [
      {
        role: 'user',
        content: `THE CV TEXT:\n${input.normalizedText}\n\nWHAT THE PARSER PRODUCED:\n${draftFor(input.draft)}\n\nReport only what is wrong. Call submit_corrections.`,
      },
    ],
  }

  let response: Anthropic.Message
  try {
    /**
     * Streamed, for the same reason the third-party path is: this is the longest wait in the product.
     * A 3B model on a shared CPU takes minutes over this one call, and unstreamed those minutes are a
     * single unchanging line of text. What streams is the corrections JSON, whose keys map to sections
     * through `REFINE_ALIASES` — so the screen names the part of the CV being checked, and never a
     * value from it.
     *
     * The fallback is the whole function's habit: on any failure the draft stands. Here that means one
     * unstreamed retry before giving up, since a local Ollama that cannot stream should cost narration
     * rather than every correction it would have made.
     */
    response = await ask(input.provider.client, params, {
      signal: input.signal,
      onNote: input.onNote,
      aliases: REFINE_ALIASES,
    })
  } catch {
    return unchanged
  }

  const blocks = Array.isArray(response.content) ? response.content : []
  const toolUse = blocks.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  )
  if (toolUse === undefined) return unchanged

  const { unwrapToolInput } = await import('./tool-input')
  const parsed = Corrections.safeParse(unwrapToolInput(toolUse.input))
  if (!parsed.success) return unchanged

  /**
   * Grounding, applied here rather than trusted from the prompt.
   *
   * `fabrication.ts` guards the *rewrite* feature; this is the same principle at a different door. A
   * correction must be text that appears in the document, because a model inventing an employer here
   * would be indistinguishable from the parser having read one.
   */
  const haystack = input.normalizedText.toLowerCase().replace(/\s+/g, ' ')
  const grounded = (value: string | undefined): string | undefined =>
    value !== undefined &&
    haystack.includes(value.toLowerCase().replace(/\s+/g, ' ').trim())
      ? value
      : undefined

  const corrections: Array<FieldProvenance> = []
  const basics = { ...input.draft.basics }

  const name = grounded(parsed.data.fullName)
  if (name !== undefined && name !== basics.fullName) {
    basics.fullName = name
    corrections.push({
      path: 'basics.fullName',
      confidence: 0.7,
      sourceText: name,
      inferred: true,
    })
  }
  const headline = grounded(parsed.data.headline)
  if (headline !== undefined && headline !== basics.headline) {
    basics.headline = headline
    corrections.push({
      path: 'basics.headline',
      confidence: 0.7,
      sourceText: headline,
      inferred: true,
    })
  }

  const work = input.draft.work.map((job, index) => {
    /**
     * An entry with no `index` is only usable when the CV has exactly one job — then there is nothing
     * to be ambiguous about. With several, it is discarded: applying a correction to the wrong job is
     * worse than not applying it, because the result looks deliberate.
     */
    const fix = parsed.data.jobs.find(
      (entry) =>
        entry.index === index ||
        (entry.index == null && input.draft.work.length === 1),
    )
    if (fix === undefined) return job
    const company = grounded(fix.company ?? undefined)
    const role = grounded(fix.role ?? undefined)
    if (company !== undefined && company !== job.company) {
      corrections.push({
        path: `work.${index}.company`,
        confidence: 0.7,
        sourceText: company,
        inferred: true,
      })
    }
    if (role !== undefined && role !== job.role) {
      corrections.push({
        path: `work.${index}.role`,
        confidence: 0.7,
        sourceText: role,
        inferred: true,
      })
    }
    return {
      ...job,
      company: company ?? job.company,
      role: role ?? job.role,
    }
  })

  return {
    resume: { ...input.draft, basics, work },
    // Corrections go in front: the review step surfaces low confidence first, and a field a model
    // changed is exactly the field a person should look at.
    provenance: [...corrections, ...input.provenance],
    corrections: corrections.length,
  }
}
