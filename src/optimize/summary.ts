/**
 * Rewrite `basics.summary` to target one job, from existing material only — the last v0.4 item
 * (docs/06-ai-optimization.md, Feature 2: "Rewrite `basics.summary` to target the role, from existing
 * material only").
 *
 * ## Why this is the most dangerous text in the product
 *
 * Every other AI feature here edits a *sentence about one job*. This writes a free paragraph about a
 * person, positioned at the top of the page, in the first thing a recruiter reads — and the model has
 * just been handed a list of exactly what the employer wants. That is the strongest invitation to
 * fabricate anywhere in this codebase, and the invented claim would sit in the most-read three lines
 * of the document.
 *
 * So this feature carries **two** guards, not one:
 *
 *  1. `findFabrications` with every class enabled, exactly as bullet rewriting uses it. A number, an
 *     employer, a place or an acronym that is not somewhere in the CV kills the suggestion.
 *  2. A check that the summary does not mention a requirement the gap report marked **missing**. This
 *     is the failure the first guard cannot catch: `"Experienced in inventory control"` invents no
 *     name and no number, so it passes every fabrication test — and it is a lie if the CV never
 *     mentions inventory control. The gap report already knows which requirements have nothing behind
 *     them, so the list of forbidden phrases is not guesswork.
 *
 * Guard 2 is the reason this module takes requirements rather than a bare instruction to "tailor".
 * Knowing what is missing is what makes it possible to forbid claiming it.
 *
 * ## Retry, then keep the original
 *
 * Identical control flow to `rewrite.ts`, for the same reason: a violation is named back to the model
 * and it gets one more attempt, and if the second try also invents, the candidate's own summary stands.
 * A CV whose summary did not improve is a small loss. A CV claiming a skill its owner does not have is
 * a person sitting in an interview being asked about it.
 */
import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { Resume } from '@/schema/resume'
import type { JobRequirements } from './jd'
import { buildGapReport } from './jd'
import {
  buildGrounding,
  describeFabrications,
  findFabrications,
} from './fabrication'
import type { FabricationFinding } from './fabrication'
import { resolveLocalProvider, resolveProvider } from '@/structure/provider'
import { unwrapToolInput } from '@/structure/tool-input'
import { errorEvent } from '@/lib/log'

/**
 * Bump on any prompt change.
 *
 * Both changes came from measured runs rather than from reasoning, per ADR-016.
 *
 * **v2 — keep the CV's own words around a figure.** Five runs of v1 gave three suggestions and two
 * refusals, and the refusal inspected was a *false* positive: the CV said "precepted 14 newly graduated
 * nurses", the model wrote "14 new graduates", and the guard checks a number together with the words
 * around it. The guard is deliberately biased that way (`fabrication.ts` states the trade), so the fix
 * belongs in layer 1 — ask for wording the check can verify — never in the check.
 *
 * **v3 — do not count things.** v2 measured no better, and the reason was visible in the rejections:
 * three of five refused on the word "two". The model was adding up the CV — "across two hospitals" —
 * which is a new fact even though each part of it is true. `prompt.ts` has forbidden this by name since
 * rewrite-v2 and the rule simply had not been carried across, and a summary needs it *more* than a
 * bullet does, because compressing a career is what invites the arithmetic.
 */
export const SUMMARY_PROMPT_VERSION = 'summary-v3'

const MAX_TOKENS = 800
const MAX_ATTEMPTS = 2

/**
 * How much of the rationale is shown. Text past this is cut, never rejected — see below.
 */
const RATIONALE_LIMIT = 400

const SummaryPayload = z.object({
  /**
   * Three lines at most. A summary that fills a paragraph is not read, so length here is a real
   * quality failure and rejection is the right answer.
   */
  summary: z.string().min(1).max(700),
  /**
   * Deliberately almost unbounded, and clamped on the way out instead.
   *
   * A tight `max(300)` here threw away the first genuinely good summary this feature ever produced.
   * The model wrote a correct, guard-passing summary and a wordy explanation of it; the explanation was
   * 40 characters over, the whole payload failed to parse, and the candidate was told the feature was
   * unavailable. The rationale is not part of the CV — its length has no bearing on whether the
   * suggestion is honest. A limit on text that is not the product should clamp, not reject.
   *
   * The generous ceiling stays as a sanity bound against a runaway response, not as a style rule.
   */
  rationale: z.string().max(4000).default(''),
})

export type SummaryOutcome =
  /** A suggestion that passed both guards. */
  | 'suggested'
  /** Every attempt invented something, or claimed a missing requirement. The original stands. */
  | 'fabricated'
  /** No provider, or the call failed. The original stands. */
  | 'unavailable'

export interface SummarySuggestion {
  /** What the CV says now. Empty string when the CV had no summary at all. */
  original: string
  /** Absent unless `outcome === 'suggested'`. */
  suggestion?: string
  rationale: string
  outcome: SummaryOutcome
  /** Why a suggestion was thrown away. Shown, like a rejected bullet rewrite is shown. */
  rejected?: Array<FabricationFinding>
  /**
   * Requirements the model tried to claim that the CV does not evidence.
   *
   * Separate from `rejected` because it is a different kind of failure and reads differently to a
   * user: not "it invented a number" but "it said you can do something you have not said you can do".
   */
  overclaimed?: Array<string>
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
   Guard 2 — do not claim what the CV cannot support
   ──────────────────────────────────────────────────────────────────────────────────────────────── */

function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function normalize(text: string): string {
  return stripAccents(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * Words that carry no claim, so a phrase sharing only these with the summary is not a match.
 *
 * Without this, a missing requirement of "experience with stock control" would be "mentioned" by any
 * summary containing the word "experience" — which is nearly all of them — and the feature would
 * always refuse. The list is small on purpose: it covers the framing words adverts use, not a
 * dictionary.
 */
const HOLLOW = new Set([
  'and',
  'or',
  'the',
  'a',
  'an',
  'of',
  'in',
  'to',
  'for',
  'with',
  'on',
  'at',
  'as',
  'is',
  'are',
  'be',
  'able',
  'good',
  'strong',
  'excellent',
  'skills',
  'skill',
  'experience',
  'experienced',
  'knowledge',
  'ability',
  'years',
  'year',
  'y',
  'o',
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'en',
  'con',
  'para',
  'un',
  'una',
  'experiencia',
  'conocimientos',
  'conocimiento',
  'anos',
  'capacidad',
  'og',
  'til',
  'med',
  'af',
  'som',
  'har',
  'er',
  'kan',
  'erfaring',
  'gode',
  'god',
  'ar',
])

/** Cut an over-long rationale at a word boundary rather than rejecting the suggestion it explains. */
function clamp(text: string): string {
  if (text.length <= RATIONALE_LIMIT) return text
  const cut = text.slice(0, RATIONALE_LIMIT)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > RATIONALE_LIMIT * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

function claimWords(phrase: string): Array<string> {
  return normalize(phrase)
    .split(' ')
    .filter((word) => word.length >= 4 && !HOLLOW.has(word))
}

/**
 * Which of these missing requirements does the summary claim?
 *
 * A requirement counts as claimed when **every** one of its claim-bearing words appears in the
 * summary. Requiring all of them rather than any is what keeps this from firing on an incidental word:
 * a summary mentioning "patients" has not claimed "paediatric intensive care".
 *
 * The bias is the opposite of the advert guard's, and deliberately so. There, a false negative deleted
 * something an employer asked for. Here, a false negative puts an unsupported claim on a CV — so this
 * check errs toward *permitting* only when the overlap is complete, and the retry loop gives the model
 * a second chance to say the same thing without the claim.
 */
export function findOverclaims(
  summary: string,
  missing: Array<string>,
): Array<string> {
  const haystack = normalize(summary)
  const tokens = haystack.split(' ')
  return missing.filter((requirement) => {
    const words = claimWords(requirement)
    if (words.length === 0) return false
    return words.every((word) =>
      // Prefix match on five characters, so "scheduling" claims "schedule". Long enough that
      // "care" does not claim "career" the way the advert reader's four-character stem can.
      tokens.some((token) => token.startsWith(word.slice(0, 5))),
    )
  })
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
   The prompt
   ──────────────────────────────────────────────────────────────────────────────────────────────── */

export const SUMMARY_SYSTEM_PROMPT = `You rewrite the summary at the top of a CV so it speaks to one specific job. You are an editor working from a source document, not an author.

WHAT A GOOD SUMMARY IS
Two or three sentences. What this person is, how long they have done it, and the two or three things
they have actually done that this employer is asking for. Concrete and plain. No adjectives about
character, no ambition, no "seeking a challenging role".

WHAT YOU MAY USE
Only what is in the CV below. You are choosing which of the candidate's existing facts to put first,
and saying them in the employer's vocabulary when it names the same thing. That is the whole job.

WHAT YOU MAY NOT DO — BOTH ARE CHECKED IN CODE
1. You may not introduce a fact. Not a number, an employer, a place, a system, a qualification, a
   date or an outcome that is not already in this CV.
2. You may not claim a requirement the candidate has no evidence for. You will be given the list of
   requirements this CV does NOT support. Those are forbidden. Do not mention them, do not gesture at
   them, do not say the person is "familiar with" them or "keen to develop" them.

Both are verified after you answer. A summary that breaks either is discarded and the candidate keeps
their own, so there is nothing to gain by trying.

Point 2 is the one that matters most and the one that feels most helpful to break. The employer wants
inventory control and this candidate has never mentioned it; writing "experienced in inventory
control" is the single most damaging sentence you could produce, because it is not caught by any
spell-check and it is discovered in the interview.

DO NOT COUNT THINGS
This is the trap this particular task falls into, because summarising a career invites you to add it
up. Not "across two hospitals", not "in three intensive care units", not "several years". You are
compressing a CV, and a total nobody wrote down is a new fact even when every part of it is true. If
the CV lists two employers, say what the person did — do not say "two employers".

IF YOU MENTION A NUMBER, KEEP THE CV'S OWN WORDS AROUND IT
A figure is checked together with the thing it counts, not on its own. If the CV says "precepted 14
newly graduated nurses", write those words. "14 new graduates" is the same claim to you and a
different one to the check, and the check is what decides — so a harmless-looking paraphrase around a
number costs the candidate the whole suggestion.

WHAT TO DO WITH A GAP INSTEAD
Nothing. Say what the person does have. The gap is reported to them separately and it is their
decision, not yours.

LANGUAGE
Write in the language the CV is written in. A Danish CV gets a Danish summary, even if the advert is
in English.

The candidate may be a nurse, an electrician, a warehouse supervisor or a teacher. Do not reach for
office or software vocabulary.`

/** Everything the candidate wrote, as grounding material. Mirrors `rewrite.ts`'s context builder. */
function resumeContext(resume: Resume): string {
  const lines: Array<string> = []
  if (resume.basics.headline !== undefined) lines.push(resume.basics.headline)
  if (resume.basics.summary !== undefined)
    lines.push(`CURRENT SUMMARY: ${resume.basics.summary}`)
  for (const job of resume.work) {
    const until = job.endDate === null ? 'present' : job.endDate
    lines.push(`${job.role} — ${job.company} (${job.startDate} to ${until})`)
    if (job.summary !== undefined) lines.push(`  ${job.summary}`)
    for (const highlight of job.highlights) lines.push(`  - ${highlight}`)
    if (job.tech.length > 0) lines.push(`  uses: ${job.tech.join(', ')}`)
  }
  for (const study of resume.education) {
    lines.push(
      `${study.degree ?? study.field ?? 'Studied'} — ${study.institution}`,
    )
  }
  for (const group of resume.skills) {
    lines.push(`${group.category}: ${group.items.join(', ')}`)
  }
  for (const cert of resume.certifications) lines.push(cert.name)
  for (const language of resume.languages) {
    const level = language.level ?? language.raw
    lines.push(`${language.name}${level === undefined ? '' : ` (${level})`}`)
  }
  return lines.join('\n')
}

function buildPrompt(input: {
  resume: Resume
  requirements: JobRequirements
  roleTitle?: string
  missing: Array<string>
  supported: Array<string>
}): string {
  const forbidden =
    input.missing.length === 0
      ? 'None — this CV has evidence for everything the advert asks for.'
      : input.missing.map((item) => `- ${item}`).join('\n')

  const supported =
    input.supported.length === 0
      ? '(none of the advert’s requirements are evidenced — write a summary from the CV alone and target nothing)'
      : input.supported.map((item) => `- ${item}`).join('\n')

  return `THE JOB: ${input.roleTitle ?? '(title not given)'}${
    input.requirements.seniority === undefined
      ? ''
      : `\nLEVEL: ${input.requirements.seniority}`
  }

WHAT THE JOB ASKS FOR, AND THIS CV HAS EVIDENCE FOR — lead with these:
${supported}

FORBIDDEN. The job asks for these and this CV does NOT support them. Do not mention them in any form:
${forbidden}

THE CANDIDATE'S CV — the only material you may use:
${resumeContext(input.resume)}

Write the summary. Call submit_summary.`
}

function toolSchema(): Record<string, unknown> {
  return z.toJSONSchema(SummaryPayload, { io: 'input', reused: 'inline' })
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
   The call
   ──────────────────────────────────────────────────────────────────────────────────────────────── */

export interface TailorSummaryRequest {
  resume: Resume
  requirements: JobRequirements
  roleTitle?: string
  /** False when the candidate declined the third-party transfer — routes to the local model. */
  useProvider?: boolean
  /** Answers the candidate gave to `questions`. Source material, exactly as in `rewrite.ts`. */
  answers?: Array<string>
  signal?: AbortSignal
}

/**
 * Suggest a tailored summary. Never throws, never mutates the resume.
 *
 * Returns a *suggestion* for the same reason `/api/rewrite` does: the candidate accepts it, which is
 * enforcement layer 3. Nothing here writes to the CV.
 */
export async function tailorSummary(
  request: TailorSummaryRequest,
): Promise<SummarySuggestion> {
  const { resume, requirements } = request
  const original = resume.basics.summary ?? ''
  const answers = (request.answers ?? []).filter((text) => text.trim() !== '')

  /**
   * `unavailable` is four different operational stories and used to be indistinguishable.
   *
   * No provider configured, a call that threw, an answer with no tool call in it, and an answer whose
   * shape we could not read all end at the same outcome — correctly, because the candidate's response
   * is identical in every case. But they need entirely different responses from *us*, and a single
   * outcome made the first real failure of this feature take four wrong guesses to explain. The code is
   * a fixed vocabulary and `code` is already allowlisted in `log.ts`, so nothing here can carry content.
   */
  const unavailable = (
    code: 'no_provider' | 'call_failed' | 'no_tool_use' | 'bad_shape',
    /**
     * For `bad_shape`, which field and which rule — `summary.too_big`.
     *
     * A Zod issue *message* can quote what it received, so only the `code` and `path` are ever used.
     * Both are structural: a field name and a fixed rule name, never a word the model wrote. Without
     * this, "the shape was wrong" took a rebuild and a guess to turn into "the summary was too long".
     */
    detail?: string,
  ): SummarySuggestion => {
    errorEvent('summary.unavailable', {
      code: detail === undefined ? code : `${code}:${detail}`,
    })
    return { original, rationale: '', outcome: 'unavailable' }
  }

  const provider =
    request.useProvider === false ? resolveLocalProvider() : resolveProvider()
  if (provider === undefined) return unavailable('no_provider')

  const gap = buildGapReport(resume, requirements)
  const supported = gap.matches
    .filter((match) => match.evidence !== 'missing')
    .map((match) => match.requirement)

  // The candidate's answers are source material, exactly like the CV itself.
  const grounding = buildGrounding(resume, answers.join('\n'))

  const messages: Array<Anthropic.MessageParam> = [
    {
      role: 'user',
      content: buildPrompt({
        resume,
        requirements,
        ...(request.roleTitle === undefined
          ? {}
          : { roleTitle: request.roleTitle }),
        missing: gap.missing,
        supported,
      }),
    },
  ]

  let lastRejected: Array<FabricationFinding> | undefined
  let lastOverclaimed: Array<string> | undefined

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let response: Anthropic.Message
    try {
      response = await provider.client.messages.create(
        {
          model: provider.model,
          max_tokens: MAX_TOKENS,
          // Same reasoning as the bullet rewrite: this is a choice of wording, not a transcription,
          // but low enough that the same CV and advert give the same answer twice.
          temperature: 0.3,
          system: SUMMARY_SYSTEM_PROMPT,
          tools: [
            {
              name: 'submit_summary',
              description: 'Submit the tailored summary.',
              input_schema: toolSchema() as Anthropic.Tool['input_schema'],
            },
          ],
          tool_choice: { type: 'tool', name: 'submit_summary' },
          messages,
        },
        { signal: request.signal },
      )
    } catch {
      return unavailable('call_failed')
    }

    // MiniMax has been observed sending `content: null` against a type that says array.
    const blocks = Array.isArray(response.content) ? response.content : []
    const toolUse = blocks.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    )
    if (toolUse === undefined) return unavailable('no_tool_use')

    const parsed = SummaryPayload.safeParse(unwrapToolInput(toolUse.input))
    if (!parsed.success) {
      return unavailable(
        'bad_shape',
        parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join('.') || 'root'}.${issue.code}`)
          .join('|'),
      )
    }

    /**
     * Both guards, on the summary itself.
     *
     * The rationale is checked for numbers only, for the reason `rewrite.ts` documents: a rationale
     * quotes the wording it changed, so checking it for names flagged the candidate's own verbs as
     * inventions and threw away good work.
     */
    const rejected = [
      ...findFabrications(parsed.data.summary, grounding),
      ...findFabrications(parsed.data.rationale, grounding, {
        numbersOnly: true,
      }),
    ]
    const overclaimed = findOverclaims(parsed.data.summary, gap.missing)

    if (rejected.length === 0 && overclaimed.length === 0) {
      return {
        original,
        suggestion: parsed.data.summary,
        rationale: clamp(parsed.data.rationale),
        outcome: 'suggested',
      }
    }

    lastRejected = rejected.length > 0 ? rejected : undefined
    lastOverclaimed = overclaimed.length > 0 ? overclaimed : undefined

    const complaints = [
      rejected.length > 0 ? describeFabrications(rejected) : undefined,
      overclaimed.length > 0
        ? `This CV has no evidence for ${overclaimed.map((item) => `"${item}"`).join(', ')} — you may not claim it in any form.`
        : undefined,
    ].filter((line): line is string => line !== undefined)

    messages.push(
      { role: 'assistant', content: blocks },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result' as const,
            tool_use_id: toolUse.id,
            is_error: true,
            content: `Rejected. ${complaints.join(' ')} Write the summary again using only what this CV already says.`,
          },
        ],
      },
    )
  }

  return {
    original,
    rationale: '',
    outcome: 'fabricated',
    ...(lastRejected === undefined ? {} : { rejected: lastRejected }),
    ...(lastOverclaimed === undefined ? {} : { overclaimed: lastOverclaimed }),
  }
}
