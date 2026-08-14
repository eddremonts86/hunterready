/**
 * Does this read as though a machine wrote it? — enforcement layer 2 for *voice*.
 *
 * Built from the `humanizer` skill, which is built from Wikipedia's "Signs of AI writing" guide. The
 * patterns here are the subset that (a) a CV or cover letter actually contains and (b) can be found
 * deterministically. Tone and rhythm cannot be checked in code; a vocabulary list and a handful of
 * constructions can.
 *
 * ## Why this matters more than it looks
 *
 * A recruiter in 2026 has read a thousand generated cover letters. They spot them, and the reaction is
 * not "this is polished" — it is "this person did not write this". So a suggestion that improves a
 * sentence *and* stamps `leverage`, `showcasing` or `not only… but also` on it has made the candidate
 * worse off. The product's whole promise is that the words stay theirs; sounding like every other
 * applicant's chatbot is a way of breaking that promise without inventing a single fact.
 *
 * ## It is a *soft* guard, and the difference is deliberate
 *
 * `fabrication.ts` is hard: an invented claim is a lie, so the suggestion dies and the candidate keeps
 * their own words. An AI tell is not a lie. The suggestion is still true and may still be a real
 * improvement, so throwing it away because it says "delve" would trade something valuable for something
 * cosmetic.
 *
 * So the policy is: name the tells back to the model, take one more attempt, and **keep whichever
 * version has fewer**. That never makes the output worse than the first attempt, needs no interface, and
 * leaves the decision where it belongs — the candidate still accepts or rejects the line.
 *
 * ## What is deliberately not checked
 *
 * Em dashes. The humanizer says cut them, and in prose that is right — but this codebase sets date
 * ranges with an en dash and job titles with `Role — Employer`, both mandated by the ATS ruleset. A
 * checker that flagged those would fire on every correct document, get muted, and take the useful
 * findings with it.
 *
 * The rule of three, too: "talks, panels and networking" is a genuine list, and a CV is full of genuine
 * lists. There is no way to tell a padded triple from a real one without understanding the content, and
 * a check that guesses is a check that cries wolf.
 */

export type TellKind =
  /** A word that appears far more often in post-2023 text than before it. */
  | 'vocabulary'
  /** "Not only… but also", "it is not just X, it is Y", and tailing negations. */
  | 'negative-parallelism'
  /** ", showcasing how…" — a clause that adds emphasis and no information. */
  | 'ing-analysis'
  /** "Passionate", "results-driven": a claim about character nobody can check. */
  | 'promotional'
  /** "It is important to note that", "In today's fast-paced landscape". */
  | 'filler'
  /** "Seeking a challenging role where I can grow" and its relatives. */
  | 'cover-letter-cliche'

export interface AiTell {
  kind: TellKind
  /** The exact text found, so the retry can name it and a log can count it. */
  phrase: string
}

/**
 * The vocabulary list, from the humanizer skill.
 *
 * Matched on word boundaries and case-insensitively. Some of these are ordinary English — `key`,
 * `valuable`, `enhance` — and that is accepted: the goal is to push the model toward plainer choices,
 * and the cost of a false positive here is one retry, not a lost suggestion.
 *
 * `align` and `landscape` are matched only in their abstract senses, because a warehouse CV legitimately
 * says "align the pallets" and a landscaper legitimately works on a landscape. The audience is every
 * sector (PRODUCT.md), so a tech-flavoured word list would misfire on exactly the people this product is
 * for.
 */
const VOCABULARY = [
  'additionally',
  'crucial',
  'delve',
  'delving',
  'emphasizing',
  'emphasising',
  'enduring',
  'fostering',
  'garner',
  'garnered',
  'interplay',
  'intricate',
  'intricacies',
  'pivotal',
  'showcase',
  'showcases',
  'showcasing',
  'tapestry',
  'testament',
  'underscore',
  'underscores',
  'underscoring',
  'vibrant',
  'leverage',
  'leveraging',
  'spearheaded',
  'synergy',
  'holistic',
  'multifaceted',
  'seamless',
  'seamlessly',
  'robust',
  'myriad',
  'realm',
  'navigate',
  'navigating',
]

/** Only in the abstract uses. See the note on `VOCABULARY`. */
const CONTEXTUAL = [
  /\balign(?:s|ed|ing)?\s+with\b/gi,
  /\b(?:digital|business|competitive|professional|evolving|current)\s+landscape\b/gi,
  /\blandscape\s+of\b/gi,
]

const NEGATIVE_PARALLELISM = [
  /\bnot\s+only\b[^.!?]*\bbut\s+also\b/gi,
  /\bit(?:'s|\s+is)\s+not\s+(?:just|merely|only)\b[^.!?]*\bit(?:'s|\s+is)\b/gi,
  /\bmore\s+than\s+just\b/gi,
  /\bnot\s+(?:just|merely)\s+a\b[^.!?]*\bbut\s+a\b/gi,
]

/**
 * The verbs enumerated rather than stemmed, and a connector allowed between the comma and the verb.
 *
 * Stemming looked tidier and was wrong twice: `solidif` + `ing` is not a word, and `, thereby
 * demonstrating` matched neither a bare `-ing` immediately after the comma nor a third-person form. A
 * list of twenty words is duller and correct.
 *
 * `-ed` is deliberately excluded. "Ran the audit, checked the gap" is an ordinary past-tense list on a
 * real CV, and catching it would fire on documents that are fine.
 */
const ING_VERBS = [
  'showcasing',
  'showcases',
  'highlighting',
  'highlights',
  'emphasizing',
  'emphasising',
  'emphasizes',
  'emphasises',
  'underscoring',
  'underscores',
  'demonstrating',
  'demonstrates',
  'reflecting',
  'reflects',
  'illustrating',
  'illustrates',
  'solidifying',
  'solidifies',
  'cementing',
  'cements',
].join('|')

const ING_ANALYSIS = [
  new RegExp(
    `,\\s*(?:thereby\\s+|thus\\s+|hence\\s+|which\\s+|and\\s+thereby\\s+)?(?:${ING_VERBS})\\b`,
    'gi',
  ),
]

/**
 * Character claims. Every applicant writes them, none can be checked, and they cost the space a real
 * fact would occupy — which is why `prompt.ts` has banned several by name since rewrite-v2.
 */
const PROMOTIONAL = [
  /\bpassionate\s+about\b/gi,
  /\bresults[- ]driven\b/gi,
  /\bresults[- ]oriented\b/gi,
  /\bdetail[- ]oriented\b/gi,
  /\bhighly\s+motivated\b/gi,
  /\bself[- ]starter\b/gi,
  /\bteam\s+player\b/gi,
  /\bdynamic\s+(?:professional|individual|leader)\b/gi,
  /\bproven\s+track\s+record\b/gi,
  /\bhit\s+the\s+ground\s+running\b/gi,
  /\bwear(?:s|ing)?\s+many\s+hats\b/gi,
  /\bthinks?\s+outside\s+the\s+box\b/gi,
]

const FILLER = [
  /\bit(?:'s|\s+is)\s+(?:important|worth)\s+(?:to\s+note|noting)\b/gi,
  /\bin\s+today(?:'s)?\s+(?:fast[- ]paced|ever[- ]changing|competitive|modern)\b/gi,
  /\bin\s+the\s+realm\s+of\b/gi,
  /\bwhen\s+it\s+comes\s+to\b/gi,
  /\bplays?\s+a\s+(?:key|crucial|vital|pivotal)\s+role\b/gi,
  /\bserves?\s+as\s+a\s+testament\b/gi,
]

/** The lines a recruiter has read ten thousand times. Specific to this product's output. */
const COVER_LETTER_CLICHE = [
  /\bseeking\s+a\s+(?:challenging|dynamic|rewarding)\b/gi,
  /\bi\s+(?:was|am)\s+(?:thrilled|excited|delighted)\s+to\s+(?:see|learn|discover)\b/gi,
  /\bi\s+(?:have\s+)?long\s+admired\b/gi,
  /\byour\s+(?:esteemed|prestigious|renowned)\b/gi,
  /\bperfect\s+(?:fit|candidate)\s+for\b/gi,
  /\bi\s+believe\s+i\s+(?:would\s+be|am)\s+(?:an?\s+)?(?:ideal|excellent|great)\b/gi,
  /\bwould\s+be\s+a\s+dream\b/gi,
  /\bcontribute\s+to\s+your\s+(?:continued\s+)?success\b/gi,
]

const GROUPS: Array<[TellKind, Array<RegExp>]> = [
  ['negative-parallelism', NEGATIVE_PARALLELISM],
  ['ing-analysis', ING_ANALYSIS],
  ['promotional', PROMOTIONAL],
  ['filler', FILLER],
  ['cover-letter-cliche', COVER_LETTER_CLICHE],
  ['vocabulary', CONTEXTUAL],
]

/**
 * Every AI tell in a piece of text, de-duplicated.
 *
 * Never throws and never rewrites — it reports. The caller decides what a tell is worth, and for every
 * caller here the answer is "one more attempt", not "throw this away".
 */
export function findAiTells(text: string): Array<AiTell> {
  const found: Array<AiTell> = []
  const seen = new Set<string>()

  const add = (kind: TellKind, phrase: string) => {
    const key = `${kind}:${phrase.toLowerCase()}`
    if (seen.has(key)) return
    seen.add(key)
    found.push({ kind, phrase })
  }

  for (const [kind, patterns] of GROUPS) {
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        add(kind, match[0].replace(/\s+/g, ' ').trim())
      }
    }
  }

  // The word list last, so a phrase already reported as a construction is not counted twice.
  const words = text.toLowerCase().match(/[\p{L}']+/gu) ?? []
  for (const word of words) {
    if (VOCABULARY.includes(word)) add('vocabulary', word)
  }

  return found
}

/** How many tells, for a tally. A rising count means the prompt or the model has drifted. */
export function countAiTells(text: string): number {
  return findAiTells(text).length
}

/**
 * Plain-language complaint for the retry, addressed to the model rather than the user.
 *
 * Names the exact phrases. "Make it sound more human" is not actionable; "you wrote `showcasing` and
 * `not only… but also`" is.
 */
export function describeAiTells(tells: Array<AiTell>): string {
  if (tells.length === 0) return ''
  const quoted = tells
    .slice(0, 8)
    .map((tell) => `"${tell.phrase}"`)
    .join(', ')
  return `This reads as machine-written. Remove ${quoted} and say the same thing in the plainest words that carry it.`
}

/**
 * Of two candidate texts, the one that reads less like a machine.
 *
 * Ties go to the **first** argument, which callers pass as the earlier attempt: a retry has to earn its
 * place, and preferring the newer version on a tie would churn output for no measurable gain.
 */
export function pickCleaner(first: string, second: string): string {
  return countAiTells(second) < countAiTells(first) ? second : first
}

/**
 * The prompt-side half — layer 1 to this module's layer 2.
 *
 * Shared by bullet rewriting, the tailored summary and the cover letter, so the three cannot drift into
 * disagreeing about what plain writing is. Phrased as concrete bans with the reason attached, because
 * "write naturally" is not an instruction a model can act on and "do not write `showcasing`" is.
 *
 * The last paragraph is the one that does the most work. A model asked to sound human without being told
 * what to do instead reaches for informality — contractions, exclamation marks, a chatty aside — which on
 * a CV is worse than sounding like a machine.
 */
export const HUMAN_VOICE_RULES = `WRITE LIKE A PERSON, NOT LIKE A MODEL
A recruiter in 2026 has read a thousand generated applications and spots them instantly. The reaction
is not "how polished" — it is "this person did not write this". So the plainest wording that carries
the fact always wins.

Never use these words: leverage, delve, showcase, underscore, emphasise, robust, seamless, holistic,
multifaceted, synergy, spearheaded, pivotal, crucial, intricate, myriad, realm, tapestry, testament,
vibrant, additionally, fostering, garner, interplay. They are the vocabulary of generated text.

Never use these constructions:
  • "Not only … but also", "it's not just X, it's Y", "more than just a …"
  • A trailing clause that adds emphasis and no information: "…, showcasing my attention to detail",
    "…, thereby demonstrating initiative". If the fact is there, the reader draws the conclusion.
  • Character claims nobody can check: passionate, results-driven, detail-oriented, team player,
    self-starter, proven track record, hits the ground running, wears many hats.
  • Filler openers: "It is important to note that", "In today's fast-paced …", "When it comes to …",
    "plays a crucial role in".

This is checked in code after you answer, and the phrases are named back to you if you use them.

PLAIN IS NOT CASUAL
Do not swap the model voice for a chatty one. No contractions where the document would not use them,
no exclamation marks, no rhetorical questions, no jokes, no first-person asides. Plain means short
sentences, concrete nouns, and a verb that says what the person did. "Ran the shift rota for a team of
14" is the target — not "Leveraged my leadership skills to optimise rota management", and not "I'm
super proud of how I ran that rota!".`
