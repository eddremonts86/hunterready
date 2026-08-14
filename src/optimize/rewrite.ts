/**
 * Bullet rewriting, with the guard wired in — the v0.3 feature (docs/06-ai-optimization.md).
 *
 * One bullet per call: small, cheap, and cacheable on `hash(bullet + promptVersion)`, because people
 * re-run this constantly while iterating and the same sentence must not be paid for twice.
 *
 * The control flow is the feature. A suggestion that adds a fact is **discarded**, once retried with
 * the violation named, and if the second attempt also invents, the candidate keeps their original
 * wording. Nothing that fails the guard ever reaches the screen, so the model's failure mode costs an
 * improvement rather than putting a fabricated claim in front of a recruiter.
 *
 * `outcome` records which of those happened, because it is the number that matters operationally: a
 * rising `fabricated` share means the prompt or the model has drifted, and it is invisible otherwise.
 */
import { createHash } from 'node:crypto'
import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { Resume } from '@/schema/resume'
import { resolveLocalProvider, resolveProvider } from '@/structure/provider'
import { cacheGet, cacheSet } from './cache'
import {
  buildGrounding,
  describeFabrications,
  findFabrications,
} from './fabrication'
import type { FabricationFinding, GroundingSet } from './fabrication'
import { unwrapToolInput } from '@/structure/tool-input'
import {
  buildRewritePrompt,
  REWRITE_PROMPT_VERSION,
  REWRITE_SYSTEM_PROMPT,
} from './prompt'
import { countAiTells } from './ai-tells'

const MAX_TOKENS = 1024

/** Bullets are one sentence. A model that needs a third attempt is not going to get it right. */
const MAX_ATTEMPTS = 2

/** How much of the explanatory text is kept. Text past this is cut, never rejected — see below. */
const RATIONALE_LIMIT = 400
const QUESTION_LIMIT = 240

/** What the model returns. `changed` is for the UI; `questions` is the point of the feature. */
const RewritePayload = z.object({
  /**
   * A bullet is one sentence, so length here is a real quality failure and rejection is right.
   */
  suggestion: z.string().min(1).max(600),
  /**
   * `rationale` and `questions` are deliberately almost unbounded, and clamped on the way out.
   *
   * A tight cap on either of them rejects the **whole payload**, which throws away a suggestion that
   * has already passed the fabrication guard because the *explanation* of it ran long. That is the
   * wrong trade in both directions: the candidate loses a good rewrite, and the failure surfaces as
   * "unavailable", which reads as a broken feature rather than a wordy model. It was found when the
   * summary feature — built from this same shape — lost its first genuinely good output to a rationale
   * forty characters over the limit.
   *
   * Neither field ever becomes part of the CV, so its length has no bearing on whether the suggestion
   * is honest. A limit on text that is not the product should clamp, not reject. The generous ceilings
   * remain as sanity bounds against a runaway response.
   */
  rationale: z.string().max(4000).default(''),
  questions: z.array(z.string().min(1).max(2000)).max(2).default([]),
  changed: z
    .array(z.enum(['verb', 'structure', 'concision', 'jargon']))
    .max(4)
    .default([]),
})

/** Cut over-long explanatory text at a word boundary rather than rejecting what it explains. */
function clamp(text: string, limit: number): string {
  if (text.length <= limit) return text
  const cut = text.slice(0, limit)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

export type RewriteOutcome =
  /** A suggestion that passed the guard. */
  | 'suggested'
  /** The model returned the bullet essentially unchanged — it judged it already strong. */
  | 'unchanged'
  /** Every attempt invented something. The original is kept. */
  | 'fabricated'
  /** No provider configured, or the call failed. The original is kept. */
  | 'unavailable'

export interface BulletRewrite {
  /** Where it lives, so the UI can apply an accepted suggestion without searching. */
  workIndex: number
  highlightIndex: number
  original: string
  /** Absent unless `outcome === 'suggested'`. Never a rewrite that failed the guard. */
  suggestion?: string
  rationale: string
  /** Addressed to the candidate. Answers feed back as source material, so metrics stay theirs. */
  questions: Array<string>
  changed: Array<'verb' | 'structure' | 'concision' | 'jargon'>
  outcome: RewriteOutcome
  /** Populated when a suggestion was thrown away, for logs and for the honest UI note. */
  rejected?: Array<FabricationFinding>
}

/** Cache key. The prompt version is in it so a prompt change invalidates every entry. */
export function rewriteCacheKey(bullet: string, contextKey: string): string {
  return createHash('sha256')
    .update(`${REWRITE_PROMPT_VERSION}\u0000${contextKey}\u0000${bullet}`)
    .digest('hex')
    .slice(0, 32)
}

/** Same sentence apart from whitespace and trailing punctuation. */
function essentiallyUnchanged(a: string, b: string): boolean {
  const flat = (text: string) =>
    text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[.;,]+$/, '')
      .trim()
  return flat(a) === flat(b)
}

/** Everything the candidate wrote, trimmed to what is useful as grounding context in a prompt. */
function resumeContext(resume: Resume): string {
  const lines: Array<string> = []
  if (resume.basics.headline !== undefined) lines.push(resume.basics.headline)
  if (resume.basics.summary !== undefined) lines.push(resume.basics.summary)
  for (const job of resume.work) {
    lines.push(`${job.role} — ${job.company}`)
    for (const highlight of job.highlights) lines.push(`  - ${highlight}`)
  }
  for (const group of resume.skills) {
    lines.push(`${group.category}: ${group.items.join(', ')}`)
  }
  for (const cert of resume.certifications) lines.push(cert.name)
  return lines.join('\n')
}

function toolSchema(): Record<string, unknown> {
  return z.toJSONSchema(RewritePayload, { io: 'input', reused: 'inline' })
}

interface RewriteOneInput {
  bullet: string
  role: string
  company: string
  siblings: Array<string>
  context: string
  grounding: GroundingSet
  provider: { client: Anthropic; model: string }
  signal?: AbortSignal
}

async function rewriteOne(input: RewriteOneInput): Promise<{
  payload?: z.infer<typeof RewritePayload>
  outcome: RewriteOutcome
  rejected?: Array<FabricationFinding>
}> {
  const messages: Array<Anthropic.MessageParam> = [
    {
      role: 'user',
      content: buildRewritePrompt({
        bullet: input.bullet,
        role: input.role,
        company: input.company,
        siblings: input.siblings,
        resumeContext: input.context,
      }),
    },
  ]

  let lastRejection: Array<FabricationFinding> | undefined

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let response: Anthropic.Message
    try {
      response = await input.provider.client.messages.create(
        {
          model: input.provider.model,
          max_tokens: MAX_TOKENS,
          // Not zero: this is the one place in the pipeline where we want a *choice* of wording
          // rather than a transcription. Low enough that the same bullet is stable across runs.
          temperature: 0.3,
          system: REWRITE_SYSTEM_PROMPT,
          tools: [
            {
              name: 'submit_rewrite',
              description: 'Submit the rewritten bullet.',
              input_schema: toolSchema() as Anthropic.Tool['input_schema'],
            },
          ],
          tool_choice: { type: 'tool', name: 'submit_rewrite' },
          messages,
        },
        { signal: input.signal },
      )
    } catch {
      return { outcome: 'unavailable' }
    }

    // MiniMax has been observed sending `content: null` against a type that says array.
    const blocks = Array.isArray(response.content) ? response.content : []
    const toolUse = blocks.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    )
    if (toolUse === undefined) return { outcome: 'unavailable' }

    const parsed = RewritePayload.safeParse(unwrapToolInput(toolUse.input))
    if (!parsed.success) return { outcome: 'unavailable' }

    /**
     * The guard runs before anything else looks at the suggestion — and it treats the two kinds of
     * text differently, because they carry different risks.
     *
     * The **suggestion** becomes part of the CV, so every class of claim is checked.
     *
     * The **rationale and questions** never do. They explain the change, which means they quote the
     * new wording by design: "Led is stronger than Helped with" names two verbs that are correctly
     * not in the document. Checking those as claims flagged `Led` and `Supported` as invented names
     * on a real run and threw away a good rewrite. What this text *can* still do damage with is a
     * number — "Was that the 25% growth year?" plants a figure the candidate may then type in
     * themselves — so numbers stay checked.
     */
    const findings = [
      ...findFabrications(parsed.data.suggestion, input.grounding),
      ...findFabrications(
        [parsed.data.rationale, ...parsed.data.questions].join('\n'),
        input.grounding,
        { numbersOnly: true },
      ),
    ]

    if (findings.length === 0) {
      return {
        payload: parsed.data,
        outcome: essentiallyUnchanged(parsed.data.suggestion, input.bullet)
          ? 'unchanged'
          : 'suggested',
      }
    }

    lastRejection = findings

    // Name the violation and let it try once more. Cheaper than losing the improvement, and the
    // second attempt usually drops the invented clause rather than arguing.
    messages.push(
      { role: 'assistant', content: blocks },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result' as const,
            tool_use_id: toolUse.id,
            is_error: true,
            content: `Rejected. ${describeFabrications(findings)} Remove what the CV does not contain. If a figure would strengthen the line, put it in "questions" as a question for the candidate instead.`,
          },
        ],
      },
    )
  }

  return { outcome: 'fabricated', rejected: lastRejection }
}

export interface RewriteRequest {
  resume: Resume
  /**
   * False when the user declined the third-party transfer.
   *
   * Rewriting then runs on the local model instead of being switched off. There is no deterministic
   * way to write a better sentence, so before the local model existed this feature simply refused —
   * which made the privacy choice cost a whole feature rather than some quality.
   */
  useProvider?: boolean
  /** Which bullets to work on. Omit for every bullet in the CV. */
  only?: Array<{ workIndex: number; highlightIndex: number }>
  /**
   * What the candidate answered when we asked them a question — "about 40 accounts", "roughly six
   * months".
   *
   * This is the mechanism the whole feature is built around. A weak bullet is weak because it has no
   * scale, and the industry answer is to invent one. We ask instead, and the answer comes back here:
   * it joins the grounding set, so the figure is now something the candidate wrote and the guard will
   * *permit* it in a rewrite. The number ends up on the CV because they supplied it, not because a
   * model guessed well.
   */
  answers?: Array<string>
  signal?: AbortSignal
}

export interface RewriteResult {
  rewrites: Array<BulletRewrite>
  promptVersion: string
  /** Counts by outcome. `fabricated` rising is the signal that the prompt or model has drifted. */
  tally: Record<RewriteOutcome, number>
  /**
   * How many suggestions still read as machine-written, and how many phrases in total.
   *
   * **Measured here, not retried.** The summary and the cover letter get a second attempt when they trip
   * the voice check, because each is one model call. A rewrite pass is roughly twenty-five, so retrying
   * every bullet that says "robust" would double the cost of the feature for a style fix the candidate
   * can make in two seconds — they are reading and accepting each line anyway.
   *
   * So the prompt does the work (`HUMAN_VOICE_RULES`) and this counts whether it is working. A rising
   * share is the signal to spend the retry after all, and without it that decision would be a guess.
   */
  voice: { suggestionsWithTells: number; tells: number }
}

/**
 * Rewrite the requested bullets.
 *
 * Never throws and never mutates the resume: it returns suggestions for a human to accept or reject,
 * which is enforcement layer 3. A bullet whose call failed comes back with its original text and an
 * `unavailable` outcome rather than disappearing from the list — the UI has to be able to say "we
 * could not look at this one", and a silent omission reads as "this one was fine".
 */
export async function rewriteBullets(
  request: RewriteRequest,
): Promise<RewriteResult> {
  const { resume } = request
  const answers = (request.answers ?? []).filter((text) => text.trim() !== '')
  // The candidate's answers are source material, exactly like the CV itself.
  const grounding = buildGrounding(resume, answers.join('\n'))
  const context =
    answers.length === 0
      ? resumeContext(resume)
      : `${resumeContext(resume)}\n\nTHE CANDIDATE ALSO TOLD US:\n${answers.map((a) => `- ${a}`).join('\n')}`
  const provider =
    request.useProvider === false ? resolveLocalProvider() : resolveProvider()

  /**
   * The cache key has to cover the answers as well as the bullet.
   *
   * Answering a question is precisely the moment a bullet's *correct* rewrite changes, so a key that
   * ignored answers would serve back the pre-answer suggestion and make the question pointless.
   */
  const contextKey = createHash('sha256')
    .update(answers.join('\u0000'))
    .digest('hex')
    .slice(0, 16)

  const targets =
    request.only ??
    resume.work.flatMap((job, workIndex) =>
      job.highlights.map((_, highlightIndex) => ({
        workIndex,
        highlightIndex,
      })),
    )

  const tally: Record<RewriteOutcome, number> = {
    suggested: 0,
    unchanged: 0,
    fabricated: 0,
    unavailable: 0,
  }

  const rewrites: Array<BulletRewrite> = []
  const voice = { suggestionsWithTells: 0, tells: 0 }

  for (const target of targets) {
    const job = resume.work[target.workIndex]
    const original = job?.highlights[target.highlightIndex]
    if (job === undefined || original === undefined) continue

    const key = rewriteCacheKey(original, contextKey)
    const cached = cacheGet(key)
    if (cached !== undefined) {
      tally[cached.outcome]++
      rewrites.push({ ...cached, ...target })
      continue
    }

    if (provider === undefined) {
      tally.unavailable++
      rewrites.push({
        ...target,
        original,
        rationale: '',
        questions: [],
        changed: [],
        outcome: 'unavailable',
      })
      continue
    }

    const result = await rewriteOne({
      bullet: original,
      role: job.role,
      company: job.company,
      siblings: job.highlights.filter((_, i) => i !== target.highlightIndex),
      context,
      grounding,
      provider,
      signal: request.signal,
    })

    tally[result.outcome]++
    const rewrite: BulletRewrite = {
      ...target,
      original,
      suggestion:
        result.outcome === 'suggested' ? result.payload?.suggestion : undefined,
      rationale: clamp(result.payload?.rationale ?? '', RATIONALE_LIMIT),
      questions: (result.payload?.questions ?? []).map((question) =>
        clamp(question, QUESTION_LIMIT),
      ),
      changed: result.payload?.changed ?? [],
      outcome: result.outcome,
      rejected: result.rejected,
    }
    if (rewrite.suggestion !== undefined) {
      const tells = countAiTells(rewrite.suggestion)
      if (tells > 0) {
        voice.suggestionsWithTells++
        voice.tells += tells
      }
    }

    cacheSet(key, rewrite)
    rewrites.push(rewrite)
  }

  return { rewrites, promptVersion: REWRITE_PROMPT_VERSION, tally, voice }
}
