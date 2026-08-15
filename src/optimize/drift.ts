/**
 * Cross-job drift — the one thing the fabrication guard is built not to catch.
 *
 * ## Why this is not the guard's job
 *
 * `findFabrications` grounds a rewrite on the **whole résumé**, and docs/06 says so on purpose: if
 * somebody's skills list says `Salesforce` and a bullet about their pipeline mentions it, that is
 * their own word resurfacing, not an invention. Narrowing the grounding to the single bullet would
 * reject the useful half of what the feature is for.
 *
 * The cost of that decision is a blind spot with a precise shape. A claim borrowed from a *different
 * employer* is grounded — it is in the document — so the guard passes it, and the candidate is handed
 * a sentence saying they did at Hospital A something they did at Hospital B. Nothing is invented and
 * the line is still false, which is the failure mode a reader would call lying.
 *
 * ## What is measured, and why this definition
 *
 * The narrowed grounding is the same résumé with `work` cut down to the one job the bullet belongs
 * to. Everything else — basics, skills, education, projects, certifications — stays, because those
 * belong to the person rather than to an employer and resurfacing them is the behaviour we want.
 *
 * Findings the full grounding *also* rejects are subtracted: those are ordinary fabrications, already
 * caught, and counting them here would inflate drift with something else's failure. What is left is
 * exactly the set the current guard permits and a narrower one would not — the price of the
 * whole-résumé decision, as a number instead of an anecdote.
 *
 * ## The false positive this definition exists to exclude
 *
 * The first version counted every capitalised word the narrowed grounding did not cover, and its
 * second run flagged **"Led"** — an ordinary verb, grounded in the full résumé only because another
 * bullet happens to open with it. That is vocabulary, not a claim, and a metric that counts it will
 * report drift forever without ever pointing at a real defect.
 *
 * So a borrowed **name** counts only when it comes from another job's *identifying* material — its
 * employer, its job title, its tools. Those are the tokens that make a sentence say "I did this
 * here". A borrowed **number** counts from anywhere in another job, because a quantity is a claim
 * wherever it sits, and it is the single easiest thing to move to the wrong employer.
 *
 * Nothing here calls a model. It is deterministic scoring, so the same input produces the same number.
 */
import { buildGrounding, findFabrications } from './fabrication'
import type { FabricationFinding } from './fabrication'
import type { Resume } from '@/schema/resume'

/**
 * Claims in `suggestion` that only another job in this CV supports.
 *
 * Empty for a suggestion that stays inside its own job, and empty for one that invents outright —
 * that is a fabrication, and it belongs to the guard's tally, not to this one.
 */
export function findCrossJobDrift(
  suggestion: string,
  resume: Resume,
  workIndex: number,
  extraSource = '',
): Array<FabricationFinding> {
  const ownJob = resume.work[workIndex]
  if (ownJob === undefined) return []

  const narrowed: Resume = { ...resume, work: [ownJob] }

  const invented = new Set(
    findFabrications(suggestion, buildGrounding(resume, extraSource)).map(
      (finding) => `${finding.kind} ${finding.value}`,
    ),
  )

  const others = resume.work.filter((_, index) => index !== workIndex)

  /** Employer, job title and tools — the words that say *which* job a sentence is about. */
  const identifying = wordsIn(
    others.flatMap((job) => [job.company, job.role, ...job.tech]),
  )

  /** Everything else those jobs say. Only numbers are read out of this. */
  const anywhereElse = wordsIn(
    others.flatMap((job) => [job.summary ?? '', ...job.highlights]),
  )

  return findFabrications(suggestion, buildGrounding(narrowed, extraSource))
    .filter((finding) => {
      const value = finding.value.toLowerCase()
      return finding.kind === 'number'
        ? identifying.has(value) || anywhereElse.has(value)
        : identifying.has(value)
    })
    .filter((finding) => !invented.has(`${finding.kind} ${finding.value}`))
}

/** Word-level index of some fields, so a match is a whole token rather than a substring. */
function wordsIn(values: Array<string>): Set<string> {
  const words = new Set<string>()
  for (const value of values) {
    for (const match of value.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’%-]*/gu)) {
      words.add(match[0].toLowerCase())
    }
  }
  return words
}
