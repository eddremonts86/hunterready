/**
 * Targeting one job — the surface for v0.4 (docs/06-ai-optimization.md, Feature 2).
 *
 * Everything behind this screen was built and tested months before it had a way in: `buildGapReport`,
 * `scoreCv` and `applyTailoring` were reachable only from their own unit tests. This is the way in.
 *
 * ## The three things it has to say, in this order
 *
 * 1. **What the advert asks for** — and it is editable. A rule reader and a model both misread, and the
 *    candidate is the only person here who has actually read the advert. An uneditable list would make
 *    every downstream number a claim about our parser rather than about the job.
 * 2. **Where they stand, with the evidence shown.** "You have this" is an opinion; "you have this,
 *    here, in this bullet" is checkable. That is why `RequirementMatch.found` exists and why this
 *    screen prints it rather than a tick.
 * 3. **What we would change** — as a variant they choose, never a mutation. Every move is explained in
 *    one line or it is not made.
 *
 * ## The number, and what it is not
 *
 * Coverage is a ratio of hard requirements evidenced in the CV. It is not a chance of getting the job,
 * it is not a rating of the person, and it is never shown alone — it sits on top of the list it is
 * computed from, so a reader can always see what moved it. `score.ts` earns its keep the same way: the
 * findings are the output and the number is the byproduct.
 *
 * ## Gaps
 *
 * A missing requirement is reported and nothing more. Every competing tool closes that gap by writing
 * the requirement into the CV, and refusing to is the product. The copy says so in the user's words:
 * it is their decision whether to apply anyway.
 */
import { useMemo, useState } from 'react'
import { ButtonLabel } from '@/components/working'
import type { CvScore, Finding } from '@/optimize/score'
import { scoreCv } from '@/optimize/score'
import type {
  GapReport,
  JobRequirements,
  RequirementMatch,
} from '@/optimize/jd'
import { applyTailoring, buildGapReport } from '@/optimize/jd'
import { diffResumes, summarizeChanges } from '@/optimize/variant-diff'
import type { Resume } from '@/schema/resume'

/** What `/api/target` returns for the summary. Mirrors `SummarySuggestion` without the server import. */
export interface SummaryOffer {
  original: string
  suggestion?: string
  rationale: string
  outcome: 'suggested' | 'fabricated' | 'unavailable'
  rejected?: Array<{ kind: string; value: string }>
  overclaimed?: Array<string>
}

/** What `/api/cover-letter` returns. Mirrors `CoverLetter` without importing the server module. */
export interface CoverLetterOffer {
  text?: string
  rationale: string
  outcome: 'drafted' | 'refused' | 'unavailable'
  rejected?: Array<{ kind: string; value: string }>
  overclaimed?: Array<string>
  /** Set by the client when the request itself failed, so the panel can say something true. */
  message?: string
}

export interface AdvertReadingResult {
  source: 'model' | 'rules'
  roleTitle?: string
  /** The employer, for the application tracker. A label, never a claim on the CV. */
  company?: string
  requirements: JobRequirements
  invented: Array<string>
  summary: SummaryOffer
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
   Small pieces
   ──────────────────────────────────────────────────────────────────────────────────────────────── */

function Cross({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

/**
 * The three verdicts, in the candidate's language rather than ours.
 *
 * `weak` is the one that needs a sentence: "it is in there but a recruiter skimming will not find it"
 * is the whole reason the third branch exists, and a bare label would read as a worse version of
 * `matched`.
 */
const VERDICT: Record<
  RequirementMatch['evidence'],
  { label: string; note: string; chip: string }
> = {
  matched: {
    label: 'In your CV',
    note: 'A reader will see this.',
    chip: 'bg-affirm-wash text-affirm',
  },
  weak: {
    label: 'Buried',
    note: 'It is in there, but only in your skills list or in an old job — someone skimming the first half of page one will miss it.',
    chip: 'bg-caution-wash text-caution',
  },
  missing: {
    label: 'Not in your CV',
    note: 'Nothing here matches this. We will not add it.',
    chip: 'bg-alert-wash text-alert',
  },
}

function MatchRow({
  match,
  onDismiss,
}: {
  match: RequirementMatch
  onDismiss: () => void
}) {
  const verdict = VERDICT[match.evidence]
  return (
    <li className="flex flex-col gap-1.5 border-b border-hairline py-2.5 last:border-b-0">
      <div className="flex items-start gap-2">
        <span
          className={`mt-px inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${verdict.chip}`}
        >
          {verdict.label}
        </span>
        <span className="min-w-0 flex-1 text-[14px] font-medium text-ink">
          {match.requirement}
        </span>
        {/*
          Removing a requirement is a real action, not a nicety. Both readers produce the occasional
          line that is not a requirement at all — a benefit, a sentence fragment — and leaving it in
          drags the coverage number and the tailoring with it.
        */}
        <button
          type="button"
          onClick={onDismiss}
          title="They did not ask for this"
          className="shrink-0 rounded-full p-1 text-ink-soft transition-colors hover:bg-band hover:text-ink"
        >
          <Cross />
          <span className="sr-only">
            Remove “{match.requirement}” — they did not ask for this
          </span>
        </button>
      </div>

      {/* The evidence, quoted. This is the difference between a claim and a check. */}
      {match.found.length > 0 && (
        <ul className="flex flex-col gap-1 pl-1">
          {match.found.map((line, index) => (
            <li
              key={index}
              className="border-l-2 border-l-hairline pl-2.5 text-[13px] leading-relaxed text-ink-soft"
            >
              {line}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function ScoreBars({ score }: { score: CvScore }) {
  return (
    <ul className="flex flex-col gap-2">
      {score.dimensions.map((dimension) => {
        const ratio =
          dimension.possible === 0 ? 0 : dimension.earned / dimension.possible
        return (
          <li key={dimension.dimension} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] text-ink">{dimension.label}</span>
              <span className="tally text-[12px] font-semibold text-ink-soft">
                {dimension.earned}/{dimension.possible}
              </span>
            </div>
            <div aria-hidden className="h-1 w-full rounded-full bg-band">
              <div
                className={`h-full rounded-full ${ratio >= 0.999 ? 'bg-affirm' : 'bg-signal'}`}
                style={{ width: `${Math.round(ratio * 100)}%` }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function FixList({ findings }: { findings: Array<Finding> }) {
  if (findings.length === 0) {
    return (
      <p className="text-[13px] leading-relaxed text-ink-soft">
        Nothing on the checklist. Every rule this scores against is already
        satisfied.
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-2.5">
      {[...findings]
        // Worst first: the list is meant to be worked down, and the expensive item belongs at the top.
        .sort((a, b) => b.cost - a.cost)
        .map((finding, index) => (
          <li key={index} className="flex flex-col gap-1">
            <div className="flex items-start gap-2">
              <span className="tally mt-px shrink-0 rounded-full bg-signal-wash px-1.5 py-0.5 text-[11px] font-semibold text-signal">
                +{finding.cost}
              </span>
              <span className="text-[13px] leading-relaxed text-ink">
                {finding.fix}
              </span>
            </div>
            {finding.items.length > 0 && (
              <ul className="flex flex-wrap gap-1 pl-8">
                {finding.items.slice(0, 6).map((item, at) => (
                  <li key={at} className="chip !py-0.5 !text-[11px]">
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
    </ul>
  )
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
   Paste the advert
   ──────────────────────────────────────────────────────────────────────────────────────────────── */

export function AdvertForm({
  busy,
  error,
  stages,
  onSubmit,
}: {
  busy: boolean
  error?: string
  /** The narrated wait — the server's own stage list, same channel as the upload screen. */
  stages?: Array<{ label: string; detail?: string; done: boolean }>
  onSubmit: (advert: string) => void
}) {
  const [text, setText] = useState('')
  const enough = text.trim().length >= 80

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(fired) => {
        fired.preventDefault()
        if (enough && !busy) onSubmit(text.trim())
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="advert" className="text-[14px] font-semibold text-ink">
          Paste the job advert
        </label>
        <p className="text-[13px] leading-relaxed text-ink-soft">
          The part that lists what they are looking for is the part that
          matters. We will show you what we read from it before anything happens
          to your CV.
        </p>
      </div>

      <textarea
        id="advert"
        value={text}
        onChange={(fired) => setText(fired.target.value)}
        rows={10}
        placeholder={
          'Registered Nurse — Intensive Care\n\nRequirements\n- Danish nursing authorisation\n- Ventilator management\n…'
        }
        className="field min-h-[180px] resize-y font-sans leading-relaxed"
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!enough || busy}
          className="btn btn-primary px-5 py-2.5 text-[14px] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? 'Reading the advert…' : 'See how you match'}
        </button>
        {busy && stages !== undefined && stages.length > 0 && (
          <ol className="flex flex-col gap-1.5">
            {stages.map((stage, index) => (
              <li key={index} className="flex items-center gap-2 text-[13px]">
                {stage.done ? (
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    className="h-3.5 w-3.5 shrink-0 text-affirm"
                  >
                    <path d="m5 12.5 4.5 4.5L19 7" />
                  </svg>
                ) : (
                  <span
                    aria-hidden
                    className="h-3 w-3 shrink-0 animate-spin rounded-full border-[1.5px] border-signal border-t-transparent"
                    data-motion="essential"
                  />
                )}
                <span
                  className={stage.done ? 'text-ink-faint' : 'text-ink-soft'}
                >
                  {stage.label}
                  {stage.detail === undefined ? '' : ` — ${stage.detail}`}
                </span>
              </li>
            ))}
          </ol>
        )}
        {!enough && text.trim() !== '' && (
          <span className="text-[13px] text-ink-soft">
            A little more of it, and we can work with this.
          </span>
        )}
      </div>

      {error !== undefined && (
        <p
          role="alert"
          className="rounded-field border border-alert/25 bg-alert-wash px-3 py-2 text-[13px] leading-relaxed text-ink"
        >
          {error}
        </p>
      )}
    </form>
  )
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
   The report
   ──────────────────────────────────────────────────────────────────────────────────────────────── */

export function TargetPanel({
  resume,
  reading,
  atsVerified,
  onUseVariant,
  onAcceptSummary,
  onSaveApplication,
  onDraftLetter,
  onDownloadLetter,
}: {
  resume: Resume
  reading: AdvertReadingResult
  /** Only the renderer can answer this, so it is passed in. See `ScoreInput.atsVerified`. */
  atsVerified: boolean
  onUseVariant: (variant: Resume) => void
  onAcceptSummary: (summary: string) => void
  /**
   * Store this variant against the job it was tailored for. Absent when there is no account, which is
   * the common case — the feature is offered, never required.
   *
   * The tailored document is passed rather than the one on screen, because that is the artifact this
   * row exists to reproduce months later. The gap report goes with it: reordering is only interpretable
   * against the requirements it was computed from.
   */
  onSaveApplication?: (input: {
    variant: Resume
    role?: string
    company?: string
    gap: GapReport
  }) => Promise<boolean>
  /**
   * Draft a cover letter for this job. Given the edited requirement list, not the original reading —
   * a requirement the candidate removed should not shape the letter either.
   */
  onDraftLetter?: (requirements: JobRequirements) => Promise<CoverLetterOffer>
  /**
   * Download the letter on screen, including any edits, as `.docx`.
   *
   * Async because it now buffers the file rather than submitting a form — so this panel can say the
   * document is being built, and can show a failure instead of the page navigating into one. Rejects
   * with a message fit to display.
   */
  onDownloadLetter?: (text: string) => Promise<void>
}) {
  /**
   * Requirements the candidate has said were never asked for.
   *
   * Held as a set of the requirement strings rather than by editing the list, so the original reading
   * stays intact and a mistaken dismissal is one click from being undone.
   */
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [added, setAdded] = useState<Array<string>>([])
  const [draft, setDraft] = useState('')
  const [summaryUsed, setSummaryUsed] = useState(false)
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'failed'
  >('idle')
  const [letter, setLetter] = useState<CoverLetterOffer | undefined>()
  const [letterBusy, setLetterBusy] = useState(false)
  /** The letter as edited. Held separately so re-drafting cannot silently discard their wording. */
  const [letterText, setLetterText] = useState('')
  const [letterSaving, setLetterSaving] = useState(false)
  const [letterSaveError, setLetterSaveError] = useState<string | undefined>()

  const requirements = useMemo<JobRequirements>(() => {
    const keep = (items: Array<string>) =>
      items.filter((item) => !dismissed.has(item))
    return {
      hardSkills: [...keep(reading.requirements.hardSkills), ...added],
      softSkills: keep(reading.requirements.softSkills),
      responsibilities: reading.requirements.responsibilities,
      ...(reading.requirements.seniority === undefined
        ? {}
        : { seniority: reading.requirements.seniority }),
      keywords: [...keep(reading.requirements.keywords), ...added],
    }
  }, [reading.requirements, dismissed, added])

  /**
   * All three recomputed in the browser on every edit.
   *
   * These are pure functions of two plain objects, so a checkbox does not need a network round trip —
   * which is what makes the list worth editing at all. See `/api/target` for the split.
   */
  const gap: GapReport = useMemo(
    () => buildGapReport(resume, requirements),
    [resume, requirements],
  )
  const score: CvScore = useMemo(
    () =>
      scoreCv({
        resume,
        requiredSkills: requirements.hardSkills,
        atsVerified,
      }),
    [resume, requirements, atsVerified],
  )
  const tailored = useMemo(
    () => applyTailoring(resume, requirements),
    [resume, requirements],
  )
  const changes = useMemo(
    () => diffResumes(resume, tailored.resume),
    [resume, tailored.resume],
  )

  const hardCount = requirements.hardSkills.length
  const covered = Math.round(gap.coverage * hardCount)

  /**
   * Hard and soft requirements are listed apart, and the arithmetic is why.
   *
   * `coverage` counts hard requirements only — a CV cannot evidence "excellent communicator", so
   * including soft skills would make the ratio a measurement of how many adjectives the advert used
   * (`buildGapReport` documents this). Listing them together anyway printed "2 of the 4 things they ask
   * for" above a list of five, which a reader can simply count. A number that disagrees with the list
   * it sits on top of destroys the credibility of both.
   *
   * Split by position rather than by string, because that is how `buildGapReport` builds the array and
   * a requirement could legitimately appear in both lists.
   */
  const hardMatches = gap.matches.slice(0, hardCount)
  const softMatches = gap.matches.slice(hardCount)

  const grouped: Array<
    [RequirementMatch['evidence'], Array<RequirementMatch>]
  > = [
    ['missing', hardMatches.filter((m) => m.evidence === 'missing')],
    ['weak', hardMatches.filter((m) => m.evidence === 'weak')],
    ['matched', hardMatches.filter((m) => m.evidence === 'matched')],
  ]

  const dismiss = (requirement: string) =>
    setDismissed((current) => new Set(current).add(requirement))

  return (
    <div className="flex flex-col gap-4">
      {/* ── How we read the advert, and how well ────────────────────────────────────────── */}
      <div className="card flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-[15px] font-semibold text-ink">
            {reading.roleTitle ?? 'This job'}
          </h2>
          {reading.requirements.seniority !== undefined && (
            <span className="chip !py-0.5 !text-[11px]">
              {reading.requirements.seniority}
            </span>
          )}
        </div>

        <p className="text-[13px] leading-relaxed text-ink-soft">
          {hardCount === 0
            ? 'We did not find a list of requirements in that advert. Paste the part that says what they are looking for, or add them below.'
            : `${covered} of the ${hardCount} things they ask for ${covered === 1 ? 'is' : 'are'} somewhere in your CV.`}{' '}
          {reading.source === 'rules' &&
            'We read this advert with rules rather than a model, so check the list.'}
        </p>

        {/*
          The guard, visible. This is the only place a user watches an invented requirement being
          thrown away on their behalf, and a silent drop is indistinguishable from a model that never
          invents — the same argument as showing a rejected bullet rewrite.
        */}
        {reading.invented.length > 0 && (
          <p className="rounded-field border border-hairline bg-band px-3 py-2 text-[13px] leading-relaxed text-ink-soft">
            We dropped {reading.invented.map((item) => `“${item}”`).join(', ')}{' '}
            — the model listed {reading.invented.length === 1 ? 'it' : 'them'}{' '}
            but the advert does not ask for{' '}
            {reading.invented.length === 1 ? 'it' : 'them'}.
          </p>
        )}
      </div>

      {/* ── Where you stand ─────────────────────────────────────────────────────────────── */}
      <div className="card flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold text-ink">
            What they ask for, and where it is
          </h2>
          <p className="text-[13px] leading-relaxed text-ink-soft">
            Remove anything they did not actually ask for — it changes
            everything below.
          </p>
        </div>

        {grouped.map(([evidence, matches]) =>
          matches.length === 0 ? null : (
            <section key={evidence} className="flex flex-col gap-1">
              <h3 className="pt-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
                {VERDICT[evidence].label}
                <span className="tally ml-1.5 font-normal normal-case tracking-normal">
                  {matches.length}
                </span>
              </h3>
              <p className="pb-1 text-[13px] leading-relaxed text-ink-soft">
                {VERDICT[evidence].note}
              </p>
              <ul className="flex flex-col">
                {matches.map((match) => (
                  <MatchRow
                    key={match.requirement}
                    match={match}
                    onDismiss={() => dismiss(match.requirement)}
                  />
                ))}
              </ul>
            </section>
          ),
        )}

        {/*
          Qualities, listed but not counted, and told why in one line.
          Marking "excellent communication skills" as a gap the way a missing licence is a gap invites
          the candidate to go and fix something no CV can demonstrate — and it is the interview's job
          to judge, not ours.
        */}
        {softMatches.length > 0 && (
          <section className="flex flex-col gap-1 border-t border-hairline pt-3">
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
              What they want in a person
              <span className="tally ml-1.5 font-normal normal-case tracking-normal">
                {softMatches.length}
              </span>
            </h3>
            <p className="pb-1 text-[13px] leading-relaxed text-ink-soft">
              Not counted above, and not a gap to fix. No CV can prove these —
              they are what the interview is for.
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {softMatches.map((match) => (
                <li
                  key={match.requirement}
                  className="chip !py-0.5 !text-[12px]"
                >
                  {match.requirement}
                </li>
              ))}
            </ul>
          </section>
        )}

        {dismissed.size > 0 && (
          <button
            type="button"
            onClick={() => setDismissed(new Set())}
            className="btn btn-quiet self-start px-3.5 py-2 text-[13px]"
          >
            Put back {dismissed.size} removed{' '}
            {dismissed.size === 1 ? 'requirement' : 'requirements'}
          </button>
        )}

        {/* Missing the other direction: something the advert asks for that neither reader found. */}
        <form
          className="flex flex-wrap gap-2 border-t border-hairline pt-3"
          onSubmit={(fired) => {
            fired.preventDefault()
            const value = draft.trim()
            if (value === '') return
            setAdded((current) =>
              current.includes(value) ? current : [...current, value],
            )
            setDraft('')
          }}
        >
          <input
            value={draft}
            onChange={(fired) => setDraft(fired.target.value)}
            placeholder="Something else they asked for"
            aria-label="Add a requirement the advert asks for"
            className="field flex-1 !py-2 text-[13px]"
          />
          <button
            type="submit"
            disabled={draft.trim() === ''}
            className="btn btn-quiet px-3.5 py-2 text-[13px] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Add
          </button>
        </form>
      </div>

      {/* ── The summary ─────────────────────────────────────────────────────────────────── */}
      <div className="card flex flex-col gap-3 p-4">
        <h2 className="text-[15px] font-semibold text-ink">
          The summary at the top
        </h2>

        {reading.summary.outcome === 'suggested' &&
        reading.summary.suggestion !== undefined ? (
          <>
            {reading.summary.original !== '' && (
              <div className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
                  Yours
                </span>
                <p className="text-[13px] leading-relaxed text-ink-soft">
                  {reading.summary.original}
                </p>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-signal">
                Aimed at this job
              </span>
              <p className="rounded-field border border-signal-edge bg-signal-wash px-3 py-2 text-[14px] leading-relaxed text-ink">
                {reading.summary.suggestion}
              </p>
            </div>
            {reading.summary.rationale !== '' && (
              <p className="text-[13px] leading-relaxed text-ink-soft">
                {reading.summary.rationale}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={summaryUsed}
                onClick={() => {
                  onAcceptSummary(reading.summary.suggestion as string)
                  setSummaryUsed(true)
                }}
                className="btn btn-primary px-4 py-2 text-[13px] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {summaryUsed ? 'Used' : 'Use this one'}
              </button>
              {!summaryUsed && (
                <span className="self-center text-[13px] text-ink-soft">
                  or keep yours — nothing changes until you click.
                </span>
              )}
            </div>
          </>
        ) : reading.summary.outcome === 'fabricated' ? (
          /*
            The guard worked and the user is told so. Naming what it tried to claim is the point: it is
            the only evidence available that the refusal is real rather than a slogan.
          */
          <p className="text-[13px] leading-relaxed text-ink">
            We kept your own summary.
            {reading.summary.overclaimed !== undefined &&
            reading.summary.overclaimed.length > 0
              ? ` Every version we tried claimed ${reading.summary.overclaimed
                  .map((item) => `“${item}”`)
                  .join(
                    ', ',
                  )}, which your CV does not evidence — so we threw them away.`
              : ' Every version we tried added something you had not written, so we threw them away.'}
          </p>
        ) : (
          <p className="text-[13px] leading-relaxed text-ink-soft">
            Rewriting the summary is not available on this installation.
            Everything else on this screen still works.
          </p>
        )}
      </div>

      {/* ── The variant ─────────────────────────────────────────────────────────────────── */}
      <div className="card flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold text-ink">
            What we would move
          </h2>
          <p className="text-[13px] leading-relaxed text-ink-soft">
            Reordering only. Nothing is added, nothing is removed, and nothing
            is reworded — a reordering cannot make your CV say something untrue.
          </p>
        </div>

        {tailored.moves.length === 0 ? (
          <p className="text-[13px] leading-relaxed text-ink-soft">
            Nothing worth moving. Your CV already leads with what this job asks
            for.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {tailored.moves.map((move, index) => (
                <li
                  key={index}
                  className="border-l-2 border-l-signal-edge pl-2.5 text-[13px] leading-relaxed text-ink"
                >
                  {move.because}
                </li>
              ))}
            </ul>
            <p className="tally text-[12px] text-ink-soft">
              {summarizeChanges(changes)}
            </p>
            <button
              type="button"
              onClick={() => onUseVariant(tailored.resume)}
              className="btn btn-primary self-start px-4 py-2 text-[13px]"
            >
              Use this order
            </button>
          </>
        )}
      </div>

      {/*
        ── The cover letter ──────────────────────────────────────────────────────────────
        Offered here rather than as its own screen: this is where the advert already is, and a letter
        without one is a template. Deliberately a separate action from targeting — most people who look
        at a gap report will not want a letter, and drafting one on every paste would spend a model call
        on curiosity.
      */}
      {onDraftLetter !== undefined && (
        <div className="card flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-[15px] font-semibold text-ink">
              A cover letter for this job
            </h2>
            <p className="text-[13px] leading-relaxed text-ink-soft">
              Built from your CV and this advert only. It will not claim
              anything you have not written, and it will not say we admire a
              company we know nothing about — we only know what the advert says.
            </p>
          </div>

          {letter === undefined ? (
            <button
              type="button"
              disabled={letterBusy}
              onClick={() => {
                setLetterBusy(true)
                void onDraftLetter(requirements)
                  .then((offer) => {
                    setLetter(offer)
                    setLetterText(offer.text ?? '')
                  })
                  .finally(() => setLetterBusy(false))
              }}
              className="btn btn-quiet self-start px-4 py-2.5 text-[14px] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <ButtonLabel
                busy={letterBusy}
                idle="Write a first draft"
                working="Writing…"
              />
            </button>
          ) : letter.outcome === 'drafted' ? (
            <>
              {/*
                Editable, and the edit is what downloads. A letter is the one artifact here written in
                the candidate's own voice, and handing back something uneditable would make the draft a
                take-it-or-leave-it.
              */}
              <textarea
                value={letterText}
                onChange={(fired) => setLetterText(fired.target.value)}
                rows={14}
                aria-label="Your cover letter"
                className="field min-h-[260px] resize-y font-sans leading-relaxed"
              />
              {letter.rationale !== '' && (
                <p className="text-[13px] leading-relaxed text-ink-soft">
                  {letter.rationale}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {onDownloadLetter !== undefined && (
                  <button
                    type="button"
                    disabled={letterSaving}
                    aria-busy={letterSaving}
                    onClick={() => {
                      setLetterSaving(true)
                      setLetterSaveError(undefined)
                      void onDownloadLetter(letterText)
                        .catch((error: unknown) => {
                          setLetterSaveError(
                            error instanceof Error
                              ? error.message
                              : 'We could not build that file. Your letter is unchanged.',
                          )
                        })
                        .finally(() => setLetterSaving(false))
                    }}
                    className="btn btn-quiet px-4 py-2 text-[13px]"
                  >
                    <ButtonLabel
                      busy={letterSaving}
                      idle="Download as Word"
                      working="Building…"
                    />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(letterText)
                  }}
                  className="btn btn-quiet px-4 py-2 text-[13px]"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLetter(undefined)
                    setLetterText('')
                  }}
                  className="text-meta text-ink-soft underline decoration-hairline-strong underline-offset-4 transition-colors hover:text-ink"
                >
                  Start again
                </button>
              </div>
              {letterSaveError !== undefined && (
                <p
                  role="status"
                  className="rounded-field border border-alert/25 bg-alert-wash px-3 py-2 text-[13px] leading-relaxed text-ink"
                >
                  {letterSaveError}
                </p>
              )}
            </>
          ) : letter.outcome === 'refused' ? (
            /*
              The guard worked and the user is told what it caught. There is no original letter to fall
              back on, so a refusal is the outcome — which is better than a letter carrying a sentence
              the candidate would be asked to defend.
            */
            <p className="text-[13px] leading-relaxed text-ink">
              We did not write one.
              {letter.overclaimed !== undefined && letter.overclaimed.length > 0
                ? ` Every version claimed ${letter.overclaimed
                    .map((item) => `“${item}”`)
                    .join(', ')}, which your CV does not evidence.`
                : ''}
              {letter.rejected !== undefined && letter.rejected.length > 0
                ? ` Every version added something neither your CV nor the advert says (${letter.rejected
                    .map((finding) => finding.value)
                    .join(
                      ', ',
                    )}) — usually a compliment about the employer that nothing backs.`
                : ''}{' '}
              Try again, or write the first line yourself and we will leave it
              alone.
            </p>
          ) : (
            <p className="text-[13px] leading-relaxed text-ink-soft">
              {letter.message ??
                'Writing a cover letter is not available on this installation. Everything else on this screen still works.'}
            </p>
          )}
        </div>
      )}

      {/*
        ── Keep it ───────────────────────────────────────────────────────────────────────
        Only when there is an account. The question it answers is the one a recruiter asks five weeks
        later: "what did you send us?" — by which time the candidate has tailored the CV four more
        times and has no copy of the version in front of the person on the phone.
      */}
      {onSaveApplication !== undefined && (
        <div className="card flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-[15px] font-semibold text-ink">
              Keep this application
            </h2>
            <p className="text-[13px] leading-relaxed text-ink-soft">
              Stores this version of your CV with the advert it was aimed at, so
              you can see exactly what you sent if they call back.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={saveState === 'saving' || saveState === 'saved'}
              onClick={() => {
                setSaveState('saving')
                void onSaveApplication({
                  variant: tailored.resume,
                  ...(reading.roleTitle === undefined
                    ? {}
                    : { role: reading.roleTitle }),
                  ...(reading.company === undefined
                    ? {}
                    : { company: reading.company }),
                  gap,
                }).then((ok) => setSaveState(ok ? 'saved' : 'failed'))
              }}
              className="btn btn-quiet px-4 py-2 text-[13px] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {saveState === 'saved' ? (
                'Saved'
              ) : (
                <ButtonLabel
                  busy={saveState === 'saving'}
                  idle="Save this application"
                  working="Saving…"
                />
              )}
            </button>
            {saveState === 'failed' && (
              <span role="status" className="text-[13px] text-ink-soft">
                We could not save it just now.
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── The checklist ───────────────────────────────────────────────────────────────── */}
      <div className="card flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-[15px] font-semibold text-ink">
            What would make it stronger
          </h2>
          <span className="tally text-[13px] font-semibold text-ink-soft">
            {score.score}/100
          </span>
        </div>
        {/*
          The number never travels alone. It is a byproduct of the checklist below and of the bars
          beside it, both of which say where every point went — a score with nothing behind it is a
          judgement, and this product does not make those.
        */}
        <FixList findings={score.findings} />
        <div className="border-t border-hairline pt-3">
          <ScoreBars score={score} />
        </div>
      </div>
    </div>
  )
}
