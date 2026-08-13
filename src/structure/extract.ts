/**
 * Normalized text → a validated `Resume`, with per-field provenance.
 *
 * Structured output is forced through a tool call whose schema is derived from the Zod schema, so
 * there is exactly one definition of the contract (ADR-001) and the model cannot drift from it.
 * Validation failures are fed back once or twice rather than thrown, because a repair round is far
 * cheaper than losing the user's upload.
 *
 * Temperature 0: extraction is transcription, not authorship.
 */
import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { Resume } from '@/schema/resume'
import type { FieldProvenance } from '@/schema/provenance'
import { applyHeuristics } from './heuristics'
import { buildUserPrompt, PROMPT_VERSION, SYSTEM_PROMPT } from './prompt'
import { extractByRules } from './fallback'
import { resolveProvider } from './provider'
import { recoverMissingHighlights } from './recover'
import { findPhone, redactForLlm, reinstateDeep } from './redact'

const MAX_TOKENS = 8192
const MAX_REPAIRS = 2

/** What the model returns: the resume plus its own confidence report. */
const ExtractionPayload = z.object({
  resume: Resume.partial({ schemaVersion: true }),
  provenance: z
    .array(
      z.object({
        path: z.string(),
        confidence: z.number().min(0).max(1),
        sourceLine: z.number().int().min(0).optional(),
        inferred: z.boolean().optional(),
      }),
    )
    .default([]),
})

export interface ExtractOptions {
  signal?: AbortSignal
}

export interface ExtractSuccess {
  ok: true
  resume: Resume
  provenance: Array<FieldProvenance>
  promptVersion: string
  /** Repair rounds used. >0 is a signal worth watching in metrics. */
  repairs: number
  /** Jobs whose content had to be recovered by code. A rising count means model drift. */
  recoveredJobs?: number
  /**
   * Which path produced this. Surfaced to the user as how carefully to review, and tracked as a
   * metric — a rising share of `rules` means the model path is failing quietly.
   */
  method: 'llm' | 'rules'
}

export interface ExtractFailure {
  ok: false
  code: 'not_configured' | 'llm_failed' | 'invalid_output'
  message: string
}

export type ExtractResult = ExtractSuccess | ExtractFailure

/**
 * Zod 4 emits JSON Schema natively, so the tool contract and the runtime validator cannot drift
 * (ADR-001). `io: 'input'` matters: it describes what the model should *send*, so fields with
 * defaults are optional rather than required.
 */
function toolSchema(): Record<string, unknown> {
  return z.toJSONSchema(ExtractionPayload, {
    io: 'input',
    // The tool-use API rejects $refs; inline everything.
    reused: 'inline',
  })
}

export async function extractResume(
  normalizedText: string,
  options: ExtractOptions = {},
): Promise<ExtractResult> {
  const provider = resolveProvider()

  // No provider configured: fall back to rules rather than failing. The promise in every error
  // message here is "you can still build your CV", and that promise has to be true.
  if (provider === undefined) {
    const { resume, provenance } = extractByRules(normalizedText)
    return {
      ok: true,
      resume,
      provenance,
      promptVersion: `${PROMPT_VERSION}+rules-only`,
      repairs: 0,
      method: 'rules',
    }
  }

  // Data minimisation: the phone and street address never reach the provider.
  const { text: redacted, restore } = redactForLlm(normalizedText)

  const { client, model } = provider
  const messages: Array<Anthropic.MessageParam> = [
    { role: 'user', content: buildUserPrompt(redacted) },
  ]

  let repairs = 0

  while (repairs <= MAX_REPAIRS) {
    let response: Anthropic.Message
    try {
      response = await client.messages.create(
        {
          model,
          max_tokens: MAX_TOKENS,
          temperature: 0,
          system: SYSTEM_PROMPT,
          tools: [
            {
              name: 'submit_cv',
              description:
                'Submit the extracted CV. Every string must be copied from the input.',
              input_schema: toolSchema() as Anthropic.Tool['input_schema'],
            },
          ],
          tool_choice: { type: 'tool', name: 'submit_cv' },
          messages,
        },
        { signal: options.signal },
      )
    } catch {
      // The provider is down or the request was rejected. Rules keep the user moving; the cause
      // is deliberately not surfaced because an SDK error can quote request content.
      const { resume, provenance } = extractByRules(normalizedText)
      return {
        ok: true,
        resume,
        provenance,
        promptVersion: `${PROMPT_VERSION}+rules-fallback`,
        repairs,
        method: 'rules',
      }
    }

    /**
     * `content` is typed as an array, and MiniMax sometimes sends `null` — which crashed the whole
     * request with "Cannot read properties of null" rather than degrading. A gateway that is
     * Anthropic-*compatible* is not Anthropic, so the shape gets checked rather than trusted.
     */
    const blocks = Array.isArray(response.content) ? response.content : []
    const toolUse = blocks.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    )

    if (toolUse === undefined) {
      repairs++
      messages.push(
        { role: 'assistant', content: response.content },
        {
          role: 'user',
          content:
            'You must call the submit_cv tool. Call it now with the extracted CV.',
        },
      )
      continue
    }

    const payload = ExtractionPayload.safeParse(toolUse.input)

    if (!payload.success) {
      repairs++
      messages.push(
        { role: 'assistant', content: blocks },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: toolUse.id,
              is_error: true,
              // Only the validation errors go back — never the document, which is already in
              // the conversation and does not need repeating.
              content: `The output did not validate:\n${payload.error.issues
                .map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
                .join('\n')}\nCall submit_cv again with these fixed.`,
            },
          ],
        },
      )
      continue
    }

    // Put the redacted values back before validating against the real schema.
    const restored = reinstateDeep(payload.data.resume, restore)

    const parsed = Resume.safeParse({ ...restored, schemaVersion: '1.0' })
    if (!parsed.success) {
      repairs++
      messages.push(
        { role: 'assistant', content: blocks },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: toolUse.id,
              is_error: true,
              content: `The CV did not match the schema:\n${parsed.error.issues
                .map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
                .join('\n')}\nCall submit_cv again with these fixed.`,
            },
          ],
        },
      )
      continue
    }

    // The phone was never sent, so recover it here.
    const phone = parsed.data.basics.phone ?? findPhone(normalizedText)
    const withPhone: Resume = {
      ...parsed.data,
      basics: { ...parsed.data.basics, phone },
    }

    const lines = normalizedText.split('\n')
    const provenance: Array<FieldProvenance> = payload.data.provenance.map(
      (entry) => ({
        path: entry.path,
        confidence: entry.confidence,
        sourceText:
          entry.sourceLine !== undefined ? lines[entry.sourceLine] : undefined,
        inferred: entry.inferred ?? false,
      }),
    )

    // Recover job content the model dropped. Verbatim from the document, flagged as inferred.
    const recovery = recoverMissingHighlights(
      applyHeuristics(withPhone),
      normalizedText,
    )

    /**
     * The model's answer only wins if it actually beat the rules.
     *
     * `fallback.ts` has always claimed rules are "the baseline the LLM has to beat", and ADR-013 says
     * a prompt change that does not beat plain rules is not an improvement — but nothing enforced
     * either statement at runtime. The model was trusted the moment its answer *parsed*.
     *
     * That is not a theoretical gap. Requesting the same clean, single-column fixture three times in a
     * row, MiniMax returned a schema-valid CV with **zero** jobs, zero skills and zero languages once —
     * and we served it as `method: 'llm'` while the deterministic path, on that exact input, recovers
     * every field. The user gets a blank CV and no indication anything went wrong; a retry silently
     * fixes it, which is the worst possible shape for a bug.
     *
     * So the two results are compared on how much of the document each recovered, and the better one
     * ships. This can only ever improve the answer: the model wins every tie, and it wins outright
     * whenever it is doing its job.
     */
    const rules = extractByRules(normalizedText)
    if (recovered(rules.resume) > recovered(recovery.resume)) {
      return {
        ok: true,
        resume: rules.resume,
        provenance: rules.provenance,
        promptVersion: `${PROMPT_VERSION}+rules-outperformed`,
        repairs,
        method: 'rules',
      }
    }

    return {
      ok: true,
      resume: recovery.resume,
      provenance: [...provenance, ...recovery.provenance],
      promptVersion: PROMPT_VERSION,
      repairs,
      method: 'llm',
      recoveredJobs: recovery.recovered,
    }
  }

  // Out of repair rounds. Rules are worse than a good model run and better than nothing, and the
  // low confidences they report send the user straight to the review step.
  //
  // (See `recovered` below for how a *successful* model run is still compared against this one.)
  const { resume, provenance } = extractByRules(normalizedText)
  return {
    ok: true,
    resume,
    provenance,
    promptVersion: `${PROMPT_VERSION}+rules-fallback`,
    repairs,
    method: 'rules',
  }
}

/**
 * How much of a CV a result actually recovered.
 *
 * Deliberately crude, and weighted by what costs someone an interview. It is not a quality score and
 * must never be presented as one — its only job is to answer "did this run lose the document?", which
 * a count answers and a subtler metric would obscure.
 *
 * Employers and roles carry the most weight because an empty experience section is the failure mode
 * this exists to catch. Identity fields count too: a result with no name has lost more than a result
 * missing a language.
 */
function recovered(resume: Resume): number {
  const filled = (value: string | undefined) =>
    value !== undefined && value.trim() !== '' ? 1 : 0

  return (
    filled(
      resume.basics.fullName === 'Unnamed' ? undefined : resume.basics.fullName,
    ) *
      3 +
    filled(resume.basics.email) * 2 +
    resume.work.filter((job) => job.company.trim() !== '').length * 3 +
    resume.work.filter((job) => job.role.trim() !== '').length * 3 +
    resume.work.reduce((sum, job) => sum + job.highlights.length, 0) +
    resume.education.filter((entry) => entry.institution.trim() !== '').length *
      2 +
    resume.skills.reduce((sum, group) => sum + group.items.length, 0) +
    resume.languages.length +
    resume.certifications.length
  )
}
