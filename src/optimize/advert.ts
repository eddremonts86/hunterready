/**
 * Turn a pasted job advert into the `JobRequirements` shape the rest of v0.4 already consumes.
 *
 * This is the last missing link in the targeting feature. `jd.ts` matches requirements against a CV,
 * `score.ts` scores keyword coverage against them, and `applyTailoring` reorders evidence to lead with
 * them — all of it built, tested, and until now reachable only by a caller who could hand-write a
 * structured `JobRequirements`. Nobody pastes JSON into a job application. This reads prose.
 *
 * ## The guard, in the opposite direction
 *
 * `fabrication.ts` stops a model inventing facts *about the candidate*. The risk here is the mirror
 * image: a model that has read a million job adverts knows they usually want "excellent communication
 * skills" and will supply that whether or not this advert asked for it. An invented requirement is not
 * a harmless extra — it produces a fake gap, tells the candidate they are missing something nobody
 * asked for, and reorders their CV to chase it.
 *
 * So every requirement is checked against the advert text before it survives, and one that is not
 * there is **dropped and reported**. The check is deliberately lenient (see `groundedInAdvert`): the
 * expensive error is discarding a real requirement, not keeping a doubtful one, because the candidate
 * sees and edits this list either way.
 *
 * ## Why there is a rule-based reader at all
 *
 * The same reason extraction has one. A user who declines the third-party transfer, or an installation
 * with no model configured, should lose accuracy and not the feature. An advert is also far more
 * tractable than a CV: it is written to be read in one pass, its requirements are nearly always a
 * bulleted list under a heading that says so, and those headings come from a vocabulary small enough
 * to enumerate in three languages.
 *
 * ## Privacy
 *
 * An advert is public text, not the candidate's data — but it travels in the same request as their CV,
 * so it obeys the same rules: no advert content in logs, and the transfer is gated by the same consent
 * as extraction (docs/07-privacy.md).
 */
import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { JobRequirements } from './jd'
import { stripRequirementFraming } from './jd'
import { resolveLocalProvider, resolveProvider } from '@/structure/provider'
import { unwrapToolInput } from '@/structure/tool-input'

/** Bump on any prompt change. Same discipline as `REWRITE_PROMPT_VERSION`. */
export const ADVERT_PROMPT_VERSION = 'advert-v1'

const MAX_TOKENS = 2048

/**
 * Longer than any real advert, short enough to bound the request.
 *
 * Adverts run to about 5,000 characters at the wordiest. This allows three times that so a paste that
 * includes the company boilerplate still works, and refuses a whole careers page.
 */
export const MAX_ADVERT_CHARS = 15_000

/** Enough text to be an advert rather than a job title someone typed. */
export const MIN_ADVERT_CHARS = 80

const AdvertPayload = z.object({
  hardSkills: z.array(z.string().min(1).max(120)).max(30).default([]),
  softSkills: z.array(z.string().min(1).max(120)).max(15).default([]),
  responsibilities: z.array(z.string().min(1).max(300)).max(20).default([]),
  seniority: z.string().max(60).optional(),
  keywords: z.array(z.string().min(1).max(80)).max(40).default([]),
  /** Shown to the candidate as the advert's own words for the job, never written into the CV. */
  roleTitle: z.string().max(160).optional(),
})

export interface AdvertReading {
  requirements: JobRequirements
  /** The advert's own name for the job. Used as a label; never becomes a claim on the CV. */
  roleTitle?: string
  /**
   * How this was read.
   *
   * `rules` is not a failure state, it is the no-consent and no-provider path. The UI says which one
   * happened, because "check this list" means something different when a rule engine wrote it.
   */
  source: 'model' | 'rules'
  /**
   * Requirements the model produced that the advert does not contain, dropped before anyone saw them.
   *
   * Surfaced for the same reason `rewrite.ts` surfaces a rejected suggestion: it is the only place a
   * user watches the guard work on their behalf, and a silent drop is indistinguishable from a model
   * that never invents.
   */
  invented: Array<string>
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
   Grounding
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
 * Words too common to carry meaning, in the three languages the product targets.
 *
 * Only used to decide which words of a requirement have to be present in the advert. A phrase made
 * entirely of these is not a requirement at all.
 */
const STOPWORDS = new Set([
  // en
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
  'you',
  'your',
  'we',
  'our',
  'able',
  'good',
  'strong',
  'excellent',
  'skills',
  'skill',
  'experience',
  'knowledge',
  'ability',
  'must',
  'have',
  'has',
  'plus',
  'least',
  'years',
  'year',
  // es
  'y',
  'o',
  'el',
  'la',
  'los',
  'las',
  'de',
  'del',
  'en',
  'con',
  'para',
  'por',
  'un',
  'una',
  'se',
  'su',
  'sus',
  'que',
  'anos',
  'experiencia',
  'conocimiento',
  'conocimientos',
  'capacidad',
  'habilidades',
  // da
  'og',
  'eller',
  'den',
  'det',
  'de',
  'til',
  'med',
  'for',
  'pa',
  'af',
  'som',
  'du',
  'din',
  'dit',
  'vi',
  'vores',
  'har',
  'er',
  'kan',
  'erfaring',
  'ar',
  'gode',
  'god',
])

/** The words of a phrase that have to be found in the advert for it to count as grounded. */
function significantWords(phrase: string): Array<string> {
  return normalize(phrase)
    .split(' ')
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word))
}

/**
 * Is this phrase actually in the advert?
 *
 * Matching is on a four-character prefix rather than the whole word, so `shift scheduling` is grounded
 * by an advert that says "scheduling shifts" and `management` by one that says "manage". That
 * deliberately admits the occasional false positive (`care` matches `career`), and the bias is chosen:
 *
 *   • a false positive keeps a requirement the candidate can delete in one click;
 *   • a false negative silently deletes something the employer asked for.
 *
 * The second is the error that costs somebody an interview, so leniency wins. The guard exists to
 * catch wholesale invention — a soft skill the advert never mentions — not to parse morphology.
 */
function groundedInAdvert(
  phrase: string,
  advertTokens: Array<string>,
): boolean {
  const words = significantWords(phrase)
  if (words.length === 0) return false
  return words.every((word) => {
    const stem = word.slice(0, 4)
    return advertTokens.some((token) => token.startsWith(stem))
  })
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
   The rule-based reader
   ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Headings that introduce what the employer wants, in EN / ES / DA.
 *
 * Kept separate from `src/ingest/labels.ts` on purpose: that vocabulary describes the sections of a
 * *CV*, and an advert's structure has nothing in common with it beyond both being documents.
 */
const REQUIREMENT_HEADINGS = [
  'requirements',
  'qualifications',
  'what we are looking for',
  'what we re looking for',
  'who you are',
  'you have',
  'your profile',
  'we expect',
  'skills',
  'must have',
  'essential',
  'you bring',
  'about you',
  'requisitos',
  'perfil',
  'que buscamos',
  'lo que buscamos',
  'imprescindible',
  'se requiere',
  'necesitamos',
  'aptitudes',
  'krav',
  'kvalifikationer',
  'vi forventer',
  'du har',
  'om dig',
  'din profil',
  'vi soger',
  'vi leder efter',
]

/** Headings that introduce the work itself. Kept apart because they become `responsibilities`. */
const RESPONSIBILITY_HEADINGS = [
  'responsibilities',
  'the role',
  'your tasks',
  'what you will do',
  'what you ll do',
  'the job',
  'duties',
  'your day',
  'responsabilidades',
  'funciones',
  'tareas',
  'el puesto',
  'tu dia a dia',
  'ansvar',
  'opgaver',
  'dine opgaver',
  'jobbet',
  'arbejdsopgaver',
]

/** Headings that end a list we care about — benefits and boilerplate. */
const CLOSING_HEADINGS = [
  'we offer',
  'benefits',
  'what we offer',
  'about us',
  'how to apply',
  'salary',
  'perks',
  'why join',
  'ofrecemos',
  'te ofrecemos',
  'beneficios',
  'sobre nosotros',
  'como aplicar',
  'salario',
  'vi tilbyder',
  'om os',
  'ansogning',
  'sadan soger du',
  'lon',
]

/**
 * Words that mark a requirement as a disposition rather than a capability.
 *
 * The distinction is load-bearing: `buildGapReport` keeps soft skills out of the coverage ratio
 * because "excellent communicator" cannot be falsified from a CV, so misfiling one as a hard skill
 * makes the percentage a measurement of the advert's adjectives.
 */
const SOFT_MARKERS = [
  'communicat',
  'team',
  'collaborat',
  'interpersonal',
  'flexib',
  'proactiv',
  'motivat',
  'organis',
  'organiz',
  'detail',
  'independ',
  'reliab',
  'attitude',
  'passionat',
  'adaptab',
  'initiative',
  'pressure',
  'empath',
  'patien',
  'comunicac',
  'equipo',
  'flexibl',
  'proactiv',
  'organizad',
  'responsab',
  'iniciativa',
  'empat',
  'trabajo en equipo',
  'kommunikat',
  'samarbejd',
  'fleksib',
  'selvstaend',
  'engager',
  'positiv',
  'ansvarsbevidst',
]

/**
 * Seniority is read from the advert's **title line only**, and these are why.
 *
 * Scanning the whole advert for them looked obviously right and was wrong on the first real-shaped
 * input: a nurse advert whose duties included "hand over to the incoming shift lead" came back as a
 * Lead vacancy. The body of an advert talks about the work and the people already doing it; the title
 * is the one place that names the level of *this* vacancy. Missing a seniority stated only in prose
 * costs a label, and the field is optional — inventing one mislabels the application.
 */
const SENIORITY_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:head of|director|chief)\b/i, 'Head of / Director'],
  [/\b(?:lead|principal|teamlead|team lead)\b/i, 'Lead'],
  [/\b(?:senior|sr\.?|erfaren|senior-)\b/i, 'Senior'],
  [
    /\b(?:junior|jr\.?|entry.level|graduate|trainee|nyuddannet|becario)\b/i,
    'Junior',
  ],
  [/\b(?:mid.level|intermediate|medior)\b/i, 'Mid-level'],
]

/**
 * Is this line one of these headings?
 *
 * A **single-word** heading has to match exactly. Tolerating it as a prefix or suffix seems harmless
 * and is not: `skills` is a real advert heading, and matching it at the end of a line ate the
 * requirement "Excellent communication skills" as though it were a section title — so the advert
 * silently lost a requirement and the soft-skills list came back empty. Real requirement lines end in
 * generic words like that constantly.
 *
 * A **multi-word** heading is specific enough to tolerate a prefix, which is what catches
 * "What we are looking for in you".
 */
function matchesAnyHeading(line: string, headings: Array<string>): boolean {
  const flat = normalize(line)
  if (flat === '' || flat.split(' ').length > 8) return false
  return headings.some((heading) => {
    if (flat === heading) return true
    return heading.includes(' ') && flat.startsWith(`${heading} `)
  })
}

/** Strip a leading bullet glyph, number or dash so the requirement is the text and not the marker. */
function unbullet(line: string): string {
  return line.replace(/^\s*(?:[-•*·–—▪◦]|\d+[.)])\s*/u, '').trim()
}

/**
 * A requirement line trimmed to the thing being asked for.
 *
 * Adverts write "3+ years' experience with inventory control in a retail environment". The part that
 * can be matched against a CV is `inventory control`; the rest is framing. Cutting the framing is what
 * makes the synonym map in `jd.ts` able to do its job.
 */
function coreRequirement(line: string): string {
  // The framing patterns live in `jd.ts` because matching needs them too — a requirement the candidate
  // types into the add box carries the same "Experience with …" wrapper and has never been through here.
  let text = stripRequirementFraming(line)

  // Take the first clause. "Inventory control, ideally in a warehouse" is one requirement, and the
  // qualifier after the comma is not a second one. This part stays local: it is advert *parsing*, not
  // requirement matching, and splitting a hand-typed requirement on its first comma would be wrong.
  const [first] = text.split(
    /\s*(?:,|;|\band\b|\bor\b|\by\b|\bo\b|\bog\b|\beller\b)\s+/i,
  )
  if (first !== undefined && significantWords(first).length > 0) text = first

  return text.replace(/[.;:]+$/, '').trim()
}

function isSoft(text: string): boolean {
  const flat = normalize(text)
  return SOFT_MARKERS.some((marker) => flat.includes(marker))
}

/**
 * Read an advert with rules alone.
 *
 * Exported so it can be tested directly and so the API route can use it as the no-consent path
 * without a model round-trip.
 */
export function readAdvertWithRules(advert: string): {
  requirements: JobRequirements
  roleTitle?: string
} {
  const lines = advert
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')

  const hardSkills: Array<string> = []
  const softSkills: Array<string> = []
  const responsibilities: Array<string> = []

  /**
   * Which list the current lines belong to.
   *
   * `undefined` before any heading is seen. Lines in that region are the advert's own introduction —
   * company blurb, role summary — and are not requirements, so they are skipped rather than guessed at.
   */
  let region: 'requirements' | 'responsibilities' | 'closed' | undefined

  for (const raw of lines) {
    if (matchesAnyHeading(raw, CLOSING_HEADINGS)) {
      region = 'closed'
      continue
    }
    if (matchesAnyHeading(raw, REQUIREMENT_HEADINGS)) {
      region = 'requirements'
      continue
    }
    if (matchesAnyHeading(raw, RESPONSIBILITY_HEADINGS)) {
      region = 'responsibilities'
      continue
    }
    if (region === undefined || region === 'closed') continue

    const text = unbullet(raw)
    // A paragraph is prose about the company, not a requirement. Requirements in adverts are short.
    if (text.length < 3 || text.length > 220) continue

    if (region === 'responsibilities') {
      responsibilities.push(text.replace(/[.;:]+$/, ''))
      continue
    }

    const core = coreRequirement(text)
    if (core === '') continue
    if (isSoft(core)) softSkills.push(core)
    else hardSkills.push(core)
  }

  /**
   * A last resort when the advert has no headings we recognise.
   *
   * Some adverts are one block of prose, and some are pasted from a page that lost its structure. Any
   * bulleted line is a better guess at a requirement than nothing — and the candidate is editing this
   * list on the next screen either way, which is what makes a guess acceptable here and not in
   * extraction.
   */
  if (hardSkills.length === 0 && softSkills.length === 0) {
    for (const raw of lines) {
      if (!/^\s*(?:[-•*·–—▪◦]|\d+[.)])\s+/u.test(raw)) continue
      const core = coreRequirement(unbullet(raw))
      if (core === '' || core.length > 220) continue
      if (isSoft(core)) softSkills.push(core)
      else hardSkills.push(core)
    }
  }

  /**
   * The advert's own title, taken as the first line only when it looks like one.
   *
   * A title is short and is not a sentence. Anything else and we say nothing rather than labelling the
   * application with a fragment of a company mission statement.
   */
  const first = lines[0]
  const roleTitle =
    first !== undefined && first.length <= 90 && !first.endsWith('.')
      ? first
      : undefined

  const seniority =
    roleTitle === undefined
      ? undefined
      : SENIORITY_PATTERNS.find(([pattern]) => pattern.test(roleTitle))?.[1]

  return {
    requirements: {
      hardSkills: dedupe(hardSkills).slice(0, 30),
      softSkills: dedupe(softSkills).slice(0, 15),
      responsibilities: dedupe(responsibilities).slice(0, 20),
      ...(seniority === undefined ? {} : { seniority }),
      // The rule reader does not guess at keywords beyond the skills it already found. A separate
      // keyword list produced by the same pass would be the same information twice, and
      // `applyTailoring` treats keywords as evidence to reorder by — so padding it changes the CV.
      keywords: dedupe(hardSkills).slice(0, 30),
    },
    ...(roleTitle === undefined ? {} : { roleTitle }),
  }
}

function dedupe(items: Array<string>): Array<string> {
  const seen = new Set<string>()
  const out: Array<string> = []
  for (const item of items) {
    const key = normalize(item)
    if (key === '' || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
   The model reader
   ──────────────────────────────────────────────────────────────────────────────────────────────── */

export const ADVERT_SYSTEM_PROMPT = `You read one job advert and list what the employer is asking for. You are a transcriber, not a recruiter.

WHAT YOU RETURN
- hardSkills: the specific, checkable things the employer wants — a qualification, a licence, a
  system, a tool, a technique, a language, a certification. Use the advert's own wording, because
  automated screening matches phrases literally.
- softSkills: dispositions the advert names — communication, teamwork, flexibility.
- responsibilities: what the person will actually do, one short line each.
- seniority: only if the advert states or clearly implies it.
- keywords: the exact terms a screening system would search this advert for. These may repeat
  hardSkills; that is expected.
- roleTitle: the advert's own name for the job.

THE ONE RULE — AND IT IS CHECKED IN CODE
Every item must come from THIS advert. Do not add what job adverts usually want. If it does not
mention teamwork, teamwork is not on the list. If it does not name a qualification, do not infer one
from the profession.

This is verified after you answer: anything not present in the advert text is deleted, and the
candidate is shown that you invented it. There is no benefit to guessing.

Why it matters: this list is compared against a real person's CV. An invented requirement tells them
they are missing something nobody asked for, and reorders their CV to chase it.

DO NOT INTERPRET
Do not merge two requirements into one, do not split one into two, and do not translate. A Danish
advert produces Danish requirements. Do not soften a hard requirement into a nice-to-have or promote
a nice-to-have into a hard one.

The employer may be a hospital, a warehouse, a school, a building site or a software company. Do not
assume an office, and do not reach for software vocabulary.`

function toolSchema(): Record<string, unknown> {
  return z.toJSONSchema(AdvertPayload, { io: 'input', reused: 'inline' })
}

export interface ReadAdvertRequest {
  advert: string
  /** False when the candidate declined the third-party transfer — routes to the local model. */
  useProvider?: boolean
  signal?: AbortSignal
}

/**
 * Read an advert into requirements.
 *
 * Never throws. A failed or unconfigured model call falls back to the rule reader rather than
 * surfacing an error, because a worse list is still a working feature and a 500 is not.
 */
export async function readAdvert(
  request: ReadAdvertRequest,
): Promise<AdvertReading> {
  const advert = request.advert.slice(0, MAX_ADVERT_CHARS)
  const fallback = readAdvertWithRules(advert)

  const provider =
    request.useProvider === false ? resolveLocalProvider() : resolveProvider()
  if (provider === undefined) {
    return { ...fallback, source: 'rules', invented: [] }
  }

  let response: Anthropic.Message
  try {
    response = await provider.client.messages.create(
      {
        model: provider.model,
        max_tokens: MAX_TOKENS,
        // Transcription, not composition. Zero, unlike the rewrite call.
        temperature: 0,
        system: ADVERT_SYSTEM_PROMPT,
        tools: [
          {
            name: 'submit_requirements',
            description: 'Submit what this advert asks for.',
            input_schema: toolSchema() as Anthropic.Tool['input_schema'],
          },
        ],
        tool_choice: { type: 'tool', name: 'submit_requirements' },
        messages: [
          {
            role: 'user',
            content: `THE JOB ADVERT:\n\n${advert}\n\nList what it asks for. Call submit_requirements.`,
          },
        ],
      },
      { signal: request.signal },
    )
  } catch {
    return { ...fallback, source: 'rules', invented: [] }
  }

  // MiniMax has been observed sending `content: null` against a type that says array.
  const blocks = Array.isArray(response.content) ? response.content : []
  const toolUse = blocks.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  )
  if (toolUse === undefined)
    return { ...fallback, source: 'rules', invented: [] }

  const parsed = AdvertPayload.safeParse(unwrapToolInput(toolUse.input))
  if (!parsed.success) return { ...fallback, source: 'rules', invented: [] }

  const advertTokens = normalize(advert).split(' ')
  const invented: Array<string> = []
  const keep = (items: Array<string>): Array<string> =>
    dedupe(items).filter((item) => {
      if (groundedInAdvert(item, advertTokens)) return true
      invented.push(item)
      return false
    })

  const hardSkills = keep(parsed.data.hardSkills)
  const softSkills = keep(parsed.data.softSkills)

  /**
   * Responsibilities are not guard-checked phrase by phrase.
   *
   * They are sentences describing the work, so a whole-phrase grounding test would fail on ordinary
   * paraphrase and delete most of them. They also cannot do the damage a fake requirement does: they
   * are shown as context, never matched against the CV, and never reordered by. The two lists that
   * *do* drive behaviour are the ones that are checked.
   */
  const responsibilities = dedupe(parsed.data.responsibilities)

  return {
    requirements: {
      hardSkills,
      softSkills,
      responsibilities,
      ...(parsed.data.seniority === undefined ||
      parsed.data.seniority.trim() === ''
        ? {}
        : { seniority: parsed.data.seniority.trim() }),
      keywords: keep(parsed.data.keywords),
    },
    ...(parsed.data.roleTitle === undefined ||
    parsed.data.roleTitle.trim() === ''
      ? {}
      : { roleTitle: parsed.data.roleTitle.trim() }),
    source: 'model',
    invented: dedupe(invented),
  }
}
