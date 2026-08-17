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
import { detectLocale } from './detect-locale'
import { providerById, resolveLocalProvider, resolveProvider } from './provider'
import { recoverMissingHighlights } from './recover'
import { errorEvent } from '@/lib/log'
import { findPhone, redactForLlm, reinstateDeep } from './redact'
import { unwrapToolInput } from './tool-input'
import { ask } from './ask'
import type { NoteFn } from '@/lib/progress'

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
  /** Live narration for the waiting screen. Stage labels and counts only — never document content. */
  onProgress?: (label: string, detail?: string) => void
  /**
   * The finer narration *inside* the model call: which section of the answer is being written.
   *
   * Separate from `onProgress` rather than a second argument to it, because the two are different
   * kinds of fact — one is a stage of the pipeline, the other is a key of our own schema — and the
   * type is what keeps free text out of the second. See `narrate.ts`.
   */
  onNote?: NoteFn
  /**
   * Set false when the user declined to have their CV sent to a third-party model provider.
   *
   * This is what makes the consent gate's second button true rather than decorative: declining has to
   * change what the server *does*, not just what the interface says. With it false, the request goes to
   * the model on our own hardware — nothing leaves this infrastructure — and only if that is absent too
   * does extraction fall back to rules.
   */
  useProvider?: boolean
  /**
   * Which named company the person chose, when they chose one.
   *
   * Consent under docs/07 is consent to a *named* provider, so once more than one is on offer the
   * choice has to travel with the work rather than be re-derived from the environment. Absent, the
   * deployment's own resolution order applies — which is every caller that predates the choice.
   *
   * An id that resolves to nothing falls to the local model rather than to another company. That is
   * the only safe direction: the alternative is sending somebody's CV to a business they did not name.
   */
  providerId?: string
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
  method: 'llm' | 'local' | 'rules'
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

/**
 * `{ resume: object, provenance: array[3] }` — the keys and kinds of a value, never its contents.
 *
 * Safe to log by construction: the keys come from our own schema and the kinds are `object`, `array`,
 * `string`. A CV's text cannot reach it, because no value is ever read.
 */
function describeShape(value: unknown): string {
  if (value === null || typeof value !== 'object') return typeof value
  if (Array.isArray(value)) return `array[${value.length}]`
  return `{ ${Object.entries(value)
    .slice(0, 8)
    .map(([key, inner]) => {
      const kind = Array.isArray(inner)
        ? `array[${inner.length}]`
        : inner === null
          ? 'null'
          : typeof inner
      return `${key}: ${kind}`
    })
    .join(', ')} }`
}

/** Stamp the detected language onto a freshly extracted resume. One place, both paths. */
function withDetectedLocale<T extends { locale: string }>(
  resume: T,
  normalizedText: string,
): T {
  return { ...resume, locale: detectLocale(normalizedText) }
}

export async function extractResume(
  normalizedText: string,
  options: ExtractOptions = {},
): Promise<ExtractResult> {
  /**
   * Which model may read this CV.
   *
   * Declining the third-party transfer does **not** mean falling back to regular expressions. It means
   * the model on our own hardware — the `llm` service in this stack — where the document never leaves
   * the machine it was uploaded to. A rule engine is a worse product, and offering it as the privacy
   * option would make the private choice the bad choice, which is how a privacy option becomes
   * decorative.
   *
   * Order: consent given → the configured provider. Consent withheld → local. Neither available →
   * rules, which remains the floor that keeps "you can still build your CV" true.
   */
  /**
   * The private path takes a different route entirely, and that is a measured decision.
   *
   * Pointing the local model at this function's contract — one forced tool call producing a whole
   * `Resume` — failed consistently: 447 seconds, three repair rounds, then a silent fall back. The
   * schema is thousands of characters and a 3B model on CPU cannot satisfy it, while the *same model*
   * answers a small schema correctly and immediately.
   *
   * So the local model corrects the rules instead of replacing them. See `local-refine.ts`.
   */
  const onProgress = options.onProgress ?? (() => {})
  const onNote = options.onNote

  if (options.useProvider === false) {
    const local = resolveLocalProvider()
    onProgress('Structuring with rules')
    const { resume, provenance } = extractByRules(normalizedText)
    if (local === undefined) {
      return {
        ok: true,
        resume: withDetectedLocale(resume, normalizedText),
        provenance,
        promptVersion: `${PROMPT_VERSION}+rules-only`,
        repairs: 0,
        method: 'rules',
      }
    }
    const { refineLocally } = await import('./local-refine')
    /*
      The long one. A small model on our own CPU re-reads the document and files corrections; on a busy
      box this is minutes, and it is exactly the wait Edd described as "no tener puta idea de lo que está
      pasando". The label says whose hardware, because that is the promise being kept while it is slow.
    */
    onProgress(
      'The model on our own server is double-checking names, dates and employers',
    )
    const refined = await refineLocally({
      normalizedText,
      draft: resume,
      provenance,
      provider: local,
      signal: options.signal,
      onNote,
    })
    return {
      ok: true,
      resume: withDetectedLocale(refined.resume, normalizedText),
      provenance: refined.provenance,
      promptVersion: `${PROMPT_VERSION}+local-refine(${refined.corrections})`,
      repairs: 0,
      // `local`, not `llm` and not `rules`: it is neither, and collapsing it into either would make
      // the one metric that matters — how often the model path is failing — unreadable.
      method: 'local',
    }
  }

  const provider =
    options.providerId === undefined
      ? resolveProvider()
      : providerById(options.providerId)

  // Nothing available at all: rules rather than failing. The promise in every error message here is
  // "you can still build your CV", and that promise has to be true.
  if (provider === undefined) {
    const { resume, provenance } = extractByRules(normalizedText)
    return {
      ok: true,
      resume: withDetectedLocale(resume, normalizedText),
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
      onProgress('The model is reading your CV and structuring it')
      response = await ask(
        client,
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
        /*
          Reasoning asked for here and nowhere else. This is the call that takes half a minute, and
          measured against MiniMax it is the only one whose wait has anything observable in it — the
          tool JSON arrives in a single delta at the very end, so without the thinking channel the
          screen has nothing to report until the answer has already landed. `ask` climbs down to a plain
          streamed call, then an unstreamed one, if the provider will not have it.
        */
        {
          signal: options.signal,
          onNote,
          reasoning: true,
          ...(provider.forcesThinking === true ? { forcesThinking: true } : {}),
        },
      )
    } catch (error) {
      /**
       * The provider is down or the request was rejected. Rules keep the user moving.
       *
       * The error's **class and status** are logged; its message never is, because an SDK error can
       * quote the request body and that body is somebody's CV. Swallowing it entirely was the previous
       * behaviour and it cost a debugging session: a local model that answered perfectly by hand
       * produced `method: rules` through the app, with nothing anywhere saying why.
       */
      errorEvent('extract.provider_error', {
        provider: provider.label,
        kind: error instanceof Error ? error.constructor.name : typeof error,
        status:
          typeof (error as { status?: unknown })?.status === 'number'
            ? (error as { status: number }).status
            : undefined,
      })
      const { resume, provenance } = extractByRules(normalizedText)
      return {
        ok: true,
        resume: withDetectedLocale(resume, normalizedText),
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

    const payload = ExtractionPayload.safeParse(unwrapToolInput(toolUse.input))

    if (!payload.success) {
      repairs++
      /**
       * Logged, because three silent repairs and a rule-engine fallback is the quietest failure this
       * pipeline has.
       *
       * `ingest.extracted` already reports `method: rules`, which says *that* it happened and nothing
       * about why — and the difference between "the provider is down" and "this model cannot satisfy
       * the schema" is the difference between waiting and changing something. Found when DeepSeek's
       * v4-pro degraded every upload with no error anywhere: the calls all succeeded.
       *
       * Paths and codes only. An issue's `message` can quote the offending value, and that value is a
       * line of somebody's CV (docs/07). A path is a field name from our own schema.
       */
      errorEvent('extract.invalid_payload', {
        model,
        attempt: repairs,
        stop: response.stop_reason ?? 'none',
        code: payload.error.issues
          .slice(0, 6)
          .map((issue) => `${issue.path.join('.') || '(root)'}:${issue.code}`)
          .join(' '),
        /*
          The shape it sent, as key names and types — never values.

          "resume: invalid_type" says the contract was missed and nothing about how, and the how is the
          whole diagnosis: a gateway wrapping the input in one more object looks identical in the error
          to a model sending a string where an object belongs. `tool-input.ts` exists because that has
          already happened once (Ollama's extra `object` key); this is what would have found it in a
          minute instead of a session.
        */
        shape: describeShape(unwrapToolInput(toolUse.input)),
      })
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
        resume: withDetectedLocale(rules.resume, normalizedText),
        provenance: rules.provenance,
        promptVersion: `${PROMPT_VERSION}+rules-outperformed`,
        repairs,
        method: 'rules',
      }
    }

    return {
      ok: true,
      resume: withDetectedLocale(recovery.resume, normalizedText),
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
