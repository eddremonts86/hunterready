/**
 * A cover letter from the CV and the advert — v0.7, under the same rules as everything else here.
 *
 * ## Three guards, because a letter can lie in a way a CV cannot
 *
 * The tailored summary needed two. A letter needs a third, and it is the interesting one.
 *
 *  1. **`findFabrications`** — no number, employer, place or acronym that is not in the source material.
 *  2. **`findOverclaims`** — no claiming a requirement the gap report marked *missing*. `"I am
 *     experienced in inventory control"` invents no proper noun and is a lie if the CV never says so.
 *  3. **Nothing invented about the employer.** This is the failure specific to the form. The classic
 *     cover-letter sentence is flattery — *"I have long admired your work in paediatric oncology"* — and
 *     a model will produce it readily from a job title alone. It is a claim about the world, the
 *     candidate cannot defend it, and an interviewer who asks "what do you know about our paediatric
 *     unit?" is asking about a sentence a machine wrote.
 *
 * Guard 3 needs no new code, which is the point worth recording: `buildGrounding(resume, advert)` takes
 * an `extraSource`, so the advert joins the grounding set. A letter may then name the hospital, because
 * the advert names it — and may not name a specialty, an award or a value the advert never mentioned.
 * That is the correct grounding set for a letter and the wrong one for a CV bullet, where only the
 * candidate's own document counts.
 *
 * ## What it may say
 *
 * Which of the candidate's existing facts answer this advert, and nothing else. No enthusiasm it cannot
 * source, no research it did not do, no restatement of the whole CV. Three short paragraphs.
 *
 * ## Retry, then nothing
 *
 * `rewrite.ts` and `summary.ts` keep the candidate's original when both attempts fail. There is no
 * original here — a letter that does not exist cannot be preserved — so a failure returns `refused`
 * with what it tried to claim. That is a better outcome than a letter with an invented sentence in it,
 * and saying so plainly is more useful than a spinner that never resolves.
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
import { findOverclaims } from './summary'
import { resolveLocalProvider, resolveProvider } from '@/structure/provider'
import { unwrapToolInput } from '@/structure/tool-input'
import { errorEvent } from '@/lib/log'
import {
  describeAiTells,
  findAiTells,
  HUMAN_VOICE_RULES,
  pickCleaner,
} from './ai-tells'

/** Bump on any prompt change. */
export const COVER_LETTER_PROMPT_VERSION = 'cover-v2'

const MAX_TOKENS = 1400
const MAX_ATTEMPTS = 2

/** Three short paragraphs. Long enough to say something, short enough that it gets read. */
const MAX_LETTER_CHARS = 2200

const LetterPayload = z.object({
  /** The body only. The greeting and sign-off are assembled here, not by the model. */
  body: z.string().min(1).max(MAX_LETTER_CHARS),
  /**
   * Almost unbounded and clamped on the way out, for the reason `rewrite.ts` documents: a cap on
   * explanatory text rejects the whole payload and throws away a letter that passed every guard.
   */
  rationale: z.string().max(4000).default(''),
})

const RATIONALE_LIMIT = 400

export type CoverLetterOutcome =
  | 'drafted'
  /** Every attempt claimed something the sources do not support. Nothing is offered. */
  | 'refused'
  /** No provider, or the call failed. */
  | 'unavailable'

export interface CoverLetter {
  /** Greeting, body and sign-off, ready to send or edit. Absent unless `drafted`. */
  text?: string
  rationale: string
  outcome: CoverLetterOutcome
  rejected?: Array<FabricationFinding>
  overclaimed?: Array<string>
}

function clamp(text: string): string {
  if (text.length <= RATIONALE_LIMIT) return text
  const cut = text.slice(0, RATIONALE_LIMIT)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > RATIONALE_LIMIT * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

export const COVER_LETTER_SYSTEM_PROMPT = `You write the body of a cover letter for one specific job, from a CV and the advert. You are a summariser with a purpose, not an author.

WHAT A GOOD ONE IS
Three short paragraphs, and a recruiter reads it in twenty seconds.
1. Which job, and the one sentence about this person that makes them a plausible candidate for it.
2. The two or three things they have actually done that this advert asks for. Concrete. Named.
3. One line on what they are looking for, and a close.

WHAT YOU MAY USE
The CV and the advert. Nothing else. You have no other knowledge of this employer, this candidate or
this industry, and anything you add from outside those two documents is invented.

THREE THINGS YOU MAY NOT DO — ALL CHECKED IN CODE
1. Do not introduce a fact about the candidate. No number, employer, place, system, qualification,
   date or outcome that is not in the CV.
2. Do not claim a requirement the candidate has no evidence for. You will be given the list of
   requirements this CV does NOT support. Those are forbidden — do not mention them, do not say the
   person is "familiar with" them or "eager to learn" them.
3. DO NOT INVENT ANYTHING ABOUT THE EMPLOYER. This is the one this form fails at. Do not write "I have
   long admired your work in paediatric oncology", "your reputation for patient safety", "your
   innovative culture" or anything else the advert does not say. You know only what the advert states.
   Name the employer and the role, and say nothing about them you cannot point at.

All three are verified after you answer. A letter that breaks any of them is discarded and the
candidate is given nothing rather than something they would have to defend.

NO ENTHUSIASM YOU CANNOT SOURCE
"I am passionate about", "I was thrilled to see", "it would be a dream" — leave them out. They are
unverifiable, every applicant writes them, and they cost the space where a real fact would go.

DO NOT RESTATE THE CV
The reader has it attached. Pick the two or three things that answer this advert.

LANGUAGE
Write in the language of the advert. A Danish advert gets a Danish letter, even from an English CV —
the letter is read by the employer, unlike the CV, which is also read by a machine.

The candidate may be a nurse, an electrician, a warehouse supervisor or a teacher. Do not reach for
office or software vocabulary, and do not assume a desk.

${HUMAN_VOICE_RULES}`

function resumeContext(resume: Resume): string {
  const lines: Array<string> = []
  if (resume.basics.headline !== undefined) lines.push(resume.basics.headline)
  if (resume.basics.summary !== undefined) lines.push(resume.basics.summary)
  for (const job of resume.work) {
    const until = job.endDate === null ? 'present' : job.endDate
    lines.push(`${job.role} — ${job.company} (${job.startDate} to ${until})`)
    for (const highlight of job.highlights) lines.push(`  - ${highlight}`)
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
  return lines.join('\n')
}

function toolSchema(): Record<string, unknown> {
  return z.toJSONSchema(LetterPayload, { io: 'input', reused: 'inline' })
}

export interface CoverLetterRequest {
  resume: Resume
  requirements: JobRequirements
  /** The advert itself. Part of the grounding set — see guard 3. */
  advert: string
  roleTitle?: string
  company?: string
  useProvider?: boolean
  answers?: Array<string>
  signal?: AbortSignal
}

/**
 * Assemble the letter around the model's body.
 *
 * The greeting and sign-off are ours, not the model's, for one reason: a model asked for a greeting
 * invents a name. "Dear Ms Jensen" on a letter to whoever actually opens it is a small disaster, and
 * "Dear Hiring Manager" is the honest form when the advert names nobody.
 */
function assemble(body: string, resume: Resume, company?: string): string {
  const greeting =
    company === undefined
      ? 'Dear Hiring Manager,'
      : `Dear ${company} hiring team,`
  return [
    greeting,
    '',
    body.trim(),
    '',
    'Kind regards,',
    resume.basics.fullName,
  ]
    .join('\n')
    .trim()
}

/** Draft a cover letter. Never throws, never mutates the resume. */
export async function draftCoverLetter(
  request: CoverLetterRequest,
): Promise<CoverLetter> {
  const { resume, requirements, advert } = request
  const answers = (request.answers ?? []).filter((text) => text.trim() !== '')

  const unavailable = (
    code: 'no_provider' | 'call_failed' | 'no_tool_use' | 'bad_shape',
    detail?: string,
  ): CoverLetter => {
    if (code !== 'no_provider') {
      errorEvent('cover.unavailable', {
        code: detail === undefined ? code : `${code}:${detail}`,
      })
    }
    return { rationale: '', outcome: 'unavailable' }
  }

  const provider =
    request.useProvider === false ? resolveLocalProvider() : resolveProvider()
  if (provider === undefined) return unavailable('no_provider')

  const gap = buildGapReport(resume, requirements)
  const supported = gap.matches
    .filter((match) => match.evidence !== 'missing')
    .map((match) => match.requirement)

  /**
   * Grounding is the CV **and the advert** — guard 3, and it needs no new code.
   *
   * A letter legitimately names the employer, which appears in the advert and nowhere in the CV. So the
   * advert joins the grounding set through `extraSource`, and anything in neither document is reported
   * as invented. The candidate's answers join it too, exactly as they do for a bullet rewrite.
   */
  const grounding = buildGrounding(resume, [advert, ...answers].join('\n'))

  const forbidden =
    gap.missing.length === 0
      ? 'None — this CV has evidence for everything the advert asks for.'
      : gap.missing.map((item) => `- ${item}`).join('\n')

  const messages: Array<Anthropic.MessageParam> = [
    {
      role: 'user',
      content: `THE JOB: ${request.roleTitle ?? '(title not given)'}${
        request.company === undefined
          ? ''
          : `\nTHE EMPLOYER: ${request.company}`
      }

THE ADVERT — the only thing you know about this employer:
${advert}

WHAT THE ADVERT ASKS FOR AND THIS CV EVIDENCES — build the letter from these:
${supported.length === 0 ? '(none — write from the CV alone and target nothing)' : supported.map((item) => `- ${item}`).join('\n')}

FORBIDDEN. The advert asks for these and the CV does NOT support them. Do not mention them at all:
${forbidden}

THE CANDIDATE'S CV:
${resumeContext(resume)}

Write the body of the letter. No greeting and no sign-off — those are added afterwards. Call
submit_letter.`,
    },
  ]

  let lastRejected: Array<FabricationFinding> | undefined
  let lastOverclaimed: Array<string> | undefined
  /** The cleanest guard-passing draft so far. Shipped if no attempt comes back tell-free. */
  let best: { body: string; rationale: string } | undefined

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let response: Anthropic.Message
    try {
      response = await provider.client.messages.create(
        {
          model: provider.model,
          max_tokens: MAX_TOKENS,
          temperature: 0.3,
          system: COVER_LETTER_SYSTEM_PROMPT,
          tools: [
            {
              name: 'submit_letter',
              description: 'Submit the body of the cover letter.',
              input_schema: toolSchema() as Anthropic.Tool['input_schema'],
            },
          ],
          tool_choice: { type: 'tool', name: 'submit_letter' },
          messages,
        },
        { signal: request.signal },
      )
    } catch (error) {
      const status =
        typeof error === 'object' && error !== null && 'status' in error
          ? // `in` has already narrowed it; the cast eslint asked to remove was doing nothing.
            String(error.status)
          : 'none'
      return unavailable('call_failed', status)
    }

    const blocks = Array.isArray(response.content) ? response.content : []
    const toolUse = blocks.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    )
    if (toolUse === undefined) return unavailable('no_tool_use')

    const parsed = LetterPayload.safeParse(unwrapToolInput(toolUse.input))
    if (!parsed.success) {
      return unavailable(
        'bad_shape',
        parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join('.') || 'root'}.${issue.code}`)
          .join('|'),
      )
    }

    const rejected = findFabrications(parsed.data.body, grounding)
    const overclaimed = findOverclaims(parsed.data.body, gap.missing)

    if (rejected.length === 0 && overclaimed.length === 0) {
      /**
       * Three guards passed, so nothing here is invented. Now: does it read like every other generated
       * cover letter?
       *
       * This form is where it matters most. A recruiter reads the letter before the CV, and a letter
       * that opens "I was thrilled to see this vacancy" identifies itself in eight words. A **soft**
       * check, like the summary's: keep the draft, name the phrases, take one more attempt, ship the
       * cleaner of the two.
       */
      const candidate = {
        body: parsed.data.body,
        rationale: clamp(parsed.data.rationale),
      }
      const tells = findAiTells(candidate.body)

      if (tells.length === 0) {
        return {
          text: assemble(candidate.body, resume, request.company),
          rationale: candidate.rationale,
          outcome: 'drafted',
        }
      }

      best =
        best === undefined ||
        pickCleaner(best.body, candidate.body) === candidate.body
          ? candidate
          : best

      if (attempt === MAX_ATTEMPTS - 1) break

      messages.push(
        { role: 'assistant', content: blocks },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: toolUse.id,
              is_error: true,
              content: `${describeAiTells(tells)} The facts were fine — keep them and keep the structure.`,
            },
          ],
        },
      )
      continue
    }

    lastRejected = rejected.length > 0 ? rejected : undefined
    lastOverclaimed = overclaimed.length > 0 ? overclaimed : undefined

    const complaints = [
      rejected.length > 0 ? describeFabrications(rejected) : undefined,
      overclaimed.length > 0
        ? `Neither the CV nor the advert supports ${overclaimed.map((item) => `"${item}"`).join(', ')} — you may not claim it in any form.`
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
            content: `Rejected. ${complaints.join(' ')} Write it again using only what the CV and the advert say. Remember you know nothing about this employer beyond the advert.`,
          },
        ],
      },
    )
  }

  /**
   * A draft that passed all three guards but still reads a shade generated beats refusing: it is true,
   * it is aimed at this advert, and it is editable on the screen it appears on.
   */
  if (best !== undefined) {
    return {
      text: assemble(best.body, resume, request.company),
      rationale: best.rationale,
      outcome: 'drafted',
    }
  }

  return {
    rationale: '',
    outcome: 'refused',
    ...(lastRejected === undefined ? {} : { rejected: lastRejected }),
    ...(lastOverclaimed === undefined ? {} : { overclaimed: lastOverclaimed }),
  }
}
