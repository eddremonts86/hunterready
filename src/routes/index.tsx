/**
 * THESIS: nothing about how your CV will be read should be hidden from you. The interface is plain
 * to the point of disappearing so that the document — the only object here that belongs to the user —
 * is the one thing on screen with any density.
 * OWN-WORLD: white ground, one blue (#1B3BD8), deep navy ink, pill controls, hairline cards on a
 * cool band. Depth is a hairline plus a wide low shadow, the way paper sits on a desk.
 * STORY: they see the one action, their file becomes data, they check what we were unsure about, and
 * they take a PDF away.
 * FIRST VIEWPORT: a headline that says what happens, and beside it the read-back animation — the
 * product's one interesting moment, played rather than claimed. The upload control itself was here
 * first, on the argument that the real thing beats a picture of it; that was wrong about what a first
 * viewport is for. Somebody who has just arrived wants to know what this does before handing over
 * their employment history, and the primary button opens the same picker anyway (ADR-011 still holds:
 * the artifact comes before any question — no account, no questionnaire).
 * FORM: Plain Sight — user-pinned in the v0.6 redesign, replacing the Darkroom Safelight Bay.
 *
 * Flow: docs/11-flow.md. Upload → Check → Download, all client-side state: the resume never goes
 * anywhere except to /api/render to be typeset (ADR-004).
 */
import { useCallback, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  ConsentGate,
  needsConsent,
  useProcessingConsent,
} from '@/components/consent-gate'
import { Dropzone, useFilePicker } from '@/components/dropzone'
import { Library } from '@/components/library'
import { PaperPreview } from '@/components/paper-preview'
import { ReadBackDemo } from '@/components/read-back-demo'
import { Reveal } from '@/components/reveal'
import { ReviewForm } from '@/components/review-form'
import { keyOf, RewriteReview } from '@/components/rewrite-review'
import { AdvertForm, TargetPanel } from '@/components/target-panel'
import { BeforeAfter } from '@/components/before-after'
import { DesignGallery } from '@/components/design-gallery'
import { ButtonLabel, Spinner } from '@/components/working'
import { DownloadFailed, saveRendered } from '@/lib/download'
import type {
  AdvertReadingResult,
  CoverLetterOffer,
} from '@/components/target-panel'
import type { BulletRewrite } from '@/optimize/rewrite'
import { diffResumes } from '@/optimize/variant-diff'
import { tierOf } from '@/render/designs'
import { Resume } from '@/schema/resume'
import type { FieldProvenance } from '@/schema/provenance'
import { needsReview } from '@/schema/provenance'
import { estimateFit } from '@/render/fit'
import { getTheme } from '@/render/themes'
import type { ThemeId } from '@/render/themes'
import { localeOptions, resolveLocale } from '@/render/locale'
import { templates } from '@/render/templates/registry'
import type { TemplateId } from '@/render/templates/registry'

export const Route = createFileRoute('/')({ component: HunterReady })

interface Loaded {
  resume: Resume
  /**
   * The CV exactly as it arrived, never written to again.
   *
   * Kept so "before and after" has a *before*. Until now there was none: `resume` is edited in place by
   * every correction, every accepted rewrite and every tailoring pass, so by the time somebody had
   * something to be pleased about, the thing they started with was gone.
   *
   * It is the as-ingested document rather than "one step ago", because the achievement being shown is
   * the whole distance travelled — the file they had on disk against the file they are about to send.
   * An undo history is a different feature and would answer a different question.
   */
  original: Resume
  provenance: Array<FieldProvenance>
  warnings: Array<string>
  method: 'llm' | 'local' | 'rules'
  /** Read off an image. Carried through because it changes what the review step asks of the user. */
  ocr: boolean
}

const SAMPLES = [
  { id: 'nurse-senior', label: 'Nurse · 15 yrs' },
  { id: 'sales-junior', label: 'Sales · 3 yrs' },
  { id: 'switcher', label: 'Career switch' },
] as const

/**
 * How it works, in three steps, with the time named.
 *
 * The commonest reason somebody bounces off a tool like this is not doubt about quality — it is not
 * knowing whether they are starting a two-minute job or a two-hour one. "About five minutes" is a
 * claim we can stand behind: it is an upload, a form of pre-filled fields, and a download.
 */
const STEPS_HOW = [
  {
    title: 'Upload what you have',
    body: 'A PDF, a Word file, plain text, or a photo of a printed page. No account, no forms, no retyping your history.',
  },
  {
    title: 'Check what we read',
    body: 'We show you every detail we pulled out and mark the ones we were not sure about, with the line each came from. You correct anything wrong.',
  },
  {
    title: 'Download it',
    body: 'A clean, well-set A4 PDF — or a Word file, for the portals that ask for one. Both verified by a round-trip test that reads the document back, not by eye.',
  },
]

/**
 * The three mechanisms, and every one of them is checkable.
 *
 * Deliberately not the reference's social proof. Its landing page carries "500.000+ tailored
 * applications", a 4.8 rating and named five-star reviews; we have none of those and inventing them
 * would be the same act the product exists to prevent — putting a number in front of someone that
 * nothing backs. These three are true today and a reader can verify all of them: the test suite is
 * in the repo, the guard is in `src/optimize/fabrication.ts`, and the retention policy is in the
 * privacy notice. Real proof replaces them when there is some.
 */
const MECHANISMS = [
  {
    icon: 'verified' as const,
    title: 'Verified by a test, not a claim',
    body: 'Every template is rendered, read back with an independent parser, and checked field by field in reading order. One that loses a field does not ship.',
  },
  {
    icon: 'shield' as const,
    title: 'It cannot invent anything',
    body: 'Suggestions may sharpen your own wording. A number, employer, date or outcome that is not already in your CV is blocked in code — and you accept every line by hand.',
  },
  {
    icon: 'lock' as const,
    title: 'Your CV is not our training data',
    body: 'Your phone number and address are stripped before any model sees the text, and you can decline the outside provider and be read by a model on our own server instead.',
  },
]

function Icon({
  name,
  className = 'h-5 w-5',
}: {
  name:
    | 'verified'
    | 'shield'
    | 'lock'
    | 'check'
    | 'arrow-left'
    | 'arrow-right'
    | 'download'
  className?: string
}) {
  const paths: Record<string, React.ReactNode> = {
    verified: (
      <>
        <path d="m9 12 2 2 4-4" />
        <circle cx="12" cy="12" r="9" />
      </>
    ),
    shield: <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3Z" />,
    lock: (
      <>
        <rect x="4" y="10" width="16" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    check: <path d="m5 12.5 4.5 4.5L19 7" />,
    'arrow-left': <path d="M19 12H5m0 0 6-6m-6 6 6 6" />,
    'arrow-right': <path d="M5 12h14m0 0-6-6m6 6-6 6" />,
    download: <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 20h14" />,
  }
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {paths[name]}
    </svg>
  )
}

/**
 * The wordmark. The full stop is the accent's smallest possible appearance and the only place the
 * brand mark uses colour — borrowed from the reference, kept because it does the job of a logo
 * without a logo, which matters for a product that has not commissioned one.
 */
function Wordmark({ className = 'text-[17px]' }: { className?: string }) {
  return (
    <span className={`font-bold tracking-[-0.03em] text-ink ${className}`}>
      HunterReady<span className="text-signal">.</span>
    </span>
  )
}

/**
 * The header: a way back, the wordmark, and whatever the screen wants on the right.
 *
 * ## The step counter is gone, and it should never have shipped
 *
 * It read `n/3` for Upload → Check → Download, and **no screen was ever step 3**. Downloading is a file
 * save, not a station, so the rail sat permanently at 66% and the counter permanently said "2 of 3" —
 * promising a place nobody arrives at. Edd asked the question that settles it: *"en algún momento
 * llegamos al 3/3?"* No.
 *
 * The counter was written to be the honest alternative to the reference's "9/20" through a twenty-screen
 * questionnaire, and DESIGN.md argued for it in exactly those terms: *"a progress bar that overstates
 * what is left is the same lie as one that understates it."* A bar frozen at two thirds understates,
 * every time, on the screen where the work is actually finished. The rule was right and the
 * implementation was on the wrong side of it.
 *
 * There is also nothing left to count. The tabs collapsed the flow into one workspace: there is a
 * landing page and there is the CV, and a progression indicator over two screens is furniture.
 */
function StepBar({
  onBack,
  backLabel = 'Start over',
  right,
}: {
  onBack?: () => void
  /**
   * What the arrow does, for a screen reader. Named per screen because it differs: from the check step
   * it discards the upload, and from the targeting branch it simply goes back to the CV.
   */
  backLabel?: string
  right?: React.ReactNode
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-ground/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/*
          Always available, never warned about: nothing in this product is destructive.

          Drawn independently of anything else in the header. It used to live inside the counter's
          branch, which meant a screen without a step number — the targeting branch — silently lost its
          only way back and stranded the user there.
        */}
        {onBack !== undefined && (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            className="-ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-band hover:text-ink"
          >
            <Icon name="arrow-left" />
          </button>
        )}
        <Wordmark />
        {/*
          A counterweight, so the wordmark is centred between two things rather than shoved to one side
          by `justify-between`. Removing the step counter took the right-hand element away and left the
          mark 493px off centre — measured, because a centred logo is the sort of thing the eye notices
          without being able to say why.

          `w-9` matches the back arrow exactly. Empty rather than a spacer div when there is no arrow
          *and* no right slot, so the landing page keeps its mark on the left, which is where a landing
          page's mark belongs.
        */}
        {right ??
          (onBack !== undefined && <span aria-hidden className="w-9" />)}
      </div>
    </header>
  )
}

/**
 * POSTs the edited resume so the download is what the user is looking at, not a fixture.
 *
 * `format` is `'docx'` for the Word export (v0.6). Template and theme are still sent and the server
 * ignores them for `.docx`: there is one ATS-safe Word layout, and passing the user's design choice into
 * a format that cannot honour it would be a promise made in the query string.
 *
 * This used to build a hidden form and submit it. `src/lib/download.ts` carries the full reason it does
 * not any more; the short version is that a form POST is a navigation, so a failed render replaced the
 * page and took every unsaved correction with it.
 */
async function downloadDocument(
  resume: Resume,
  templateId: TemplateId,
  themeId: ThemeId,
  format: 'pdf' | 'docx' = 'pdf',
): Promise<void> {
  await saveRendered(
    `/api/render?template=${templateId}&theme=${themeId}&download=1&format=${format}`,
    resume,
    `CV.${format}`,
  )
}

/**
 * The two download buttons, their busy state and their failure message.
 *
 * Per format rather than one flag, because both buttons are on screen together: a single `busy` would
 * grey out the Word button while the PDF is rendering and leave the person unable to tell which one
 * they had pressed.
 *
 * ## On the flash, which is deliberate
 *
 * Measured on a warm server, a PDF render answers in about 50ms, so the spinner appears and vanishes
 * inside two frames. The usual remedy is to delay showing it by 150ms or so, and it is the wrong one
 * here: it would mean a fast render shows *nothing at all*, which is the state this exists to remove.
 * A download has no other completion signal on the page — the browser's own indicator is not on every
 * platform and not in every window — and the same button also serves the cold first render and a loaded
 * production box, where the wait is seconds. A brief flash is the cost of never being silent.
 */
function useDownloads() {
  const [format, setFormat] = useState<'pdf' | 'docx' | undefined>()
  const [failure, setFailure] = useState<string | undefined>()

  const start = useCallback(
    async (
      resume: Resume,
      templateId: TemplateId,
      themeId: ThemeId,
      wanted: 'pdf' | 'docx' = 'pdf',
    ) => {
      // Two clicks would build the same document twice and save two copies to Downloads.
      if (format !== undefined) return
      setFormat(wanted)
      setFailure(undefined)
      try {
        await downloadDocument(resume, templateId, themeId, wanted)
      } catch (error) {
        setFailure(
          error instanceof DownloadFailed
            ? error.message
            : 'Something went wrong building the file. Your CV is still here — try again.',
        )
      } finally {
        setFormat(undefined)
      }
    },
    [format],
  )

  return { busyFormat: format, failure, start }
}

/**
 * One document choice, as a segmented control, sitting on the document it changes.
 *
 * ## Why this is not the choice card any more
 *
 * These three choices — layout, language, type — were three stacked `ChoiceGroup`s in the sidebar, and
 * the sidebar had grown to **2593px on a 1285px viewport**, with this block alone accounting for 991px
 * of it. Measured, because "it feels tall" is not a diagnosis. Edd's report was that the document
 * eventually cannot be seen at all, which is exactly what a column twice the height of the screen does
 * to the pane beside it.
 *
 * The card was not the wrong control; it was in the wrong column. Layout, language and type are
 * decisions about **the document**, not about the data — the sidebar's whole subject is "is this what
 * your CV says". Moving them onto the document puts each control next to the thing it changes, and the
 * sidebar loses 38% of its height without hiding anything behind a click. Nothing is collapsed, nothing
 * is tabbed away: the review form, which is the actual work of this screen, stays fully visible.
 *
 * ## What the hint does now
 *
 * A choice card carried a hint per option — "No photo, no personal details" — and three cards meant nine
 * lines of hint on screen at once. A segmented control has no room for any of them, and dropping them
 * would lose the one thing that tells somebody why International differs from European.
 *
 * So the hint for the **selected** option is shown once, below the row. That is fewer words and better
 * reading: you get told what you have chosen, rather than scanning three descriptions to compare.
 * `Band` is documented as "the segmented track" in DESIGN.md's own colour notes, so this control was
 * anticipated by the system rather than smuggled into it.
 */
function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: ReadonlyArray<{ id: T; label: string; hint?: string }>
  value: T
  onChange: (id: T) => void
}) {
  const chosen = options.find((option) => option.id === value)
  return (
    <fieldset className="flex min-w-0 flex-col gap-1">
      <legend className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
        {label}
      </legend>
      <div className="flex flex-wrap gap-0.5 rounded-full bg-band p-0.5">
        {options.map((option) => {
          const on = option.id === value
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={on}
              /*
                Four signals on the chosen segment, as DESIGN.md requires: surface, border, text colour
                and weight. No check mark — in a control this tight the glyph costs more width than it
                adds certainty, and the other three already carry it.
              */
              className={[
                'rounded-full px-3 py-1.5 text-[13px] transition-colors',
                on
                  ? 'border border-signal-edge bg-ground font-semibold text-signal'
                  : 'border border-transparent font-medium text-ink-soft hover:text-ink',
              ].join(' ')}
              onClick={() => onChange(option.id)}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {chosen?.hint !== undefined && (
        <span className="text-meta leading-snug text-ink-soft">
          {chosen.hint}
        </span>
      )}
    </fieldset>
  )
}

/**
 * The sidebar's five panels, one at a time.
 *
 * This replaces a stack of five cards that had grown to 2593px on a 1285px viewport — Edd's report was
 * that the document eventually could not be seen at all. Moving the design controls onto the document
 * cut it to 1536px, which was an improvement and not the answer: the column was still taller than any
 * screen, and the fix had scattered the controls across two places.
 *
 * Tabs put every panel back in one column at a fixed height. What it costs is real and worth naming: the
 * four panels you are not looking at are now invisible rather than merely below the fold, and DESIGN.md
 * warns about exactly this — a browsable column becomes one you have to navigate. Two things pay for it.
 * The tab strip lists all five, so nothing is hidden in the sense of being unfindable; and the badges
 * carry each panel's state — the count still to check, the number of suggestions waiting — so the
 * information that used to make you scroll is on the tab itself.
 *
 * `Check` is the default because it is the work of this screen. The other four are things you may do.
 */
type PanelId = 'check' | 'wording' | 'design' | 'job' | 'account'

const PANELS: ReadonlyArray<{ id: PanelId; label: string }> = [
  { id: 'check', label: 'Check' },
  { id: 'wording', label: 'Wording' },
  { id: 'design', label: 'Design' },
  { id: 'job', label: 'Job' },
  { id: 'account', label: 'Account' },
]

function PanelTabs({
  active,
  onChange,
  badges,
}: {
  active: PanelId
  onChange: (id: PanelId) => void
  /** Per-tab state, so switching away does not hide what a panel is telling you. */
  badges: Partial<Record<PanelId, { text: string; tone: 'signal' | 'caution' }>>
}) {
  return (
    <div
      role="tablist"
      aria-label="CV panels"
      className="flex shrink-0 flex-wrap gap-1 rounded-full bg-band p-1"
    >
      {PANELS.map((panel) => {
        const on = panel.id === active
        const badge = badges[panel.id]
        return (
          <button
            key={panel.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(panel.id)}
            className={[
              'flex flex-1 items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] transition-colors',
              on
                ? 'border border-signal-edge bg-ground font-semibold text-signal'
                : 'border border-transparent font-medium text-ink-soft hover:text-ink',
            ].join(' ')}
          >
            {panel.label}
            {badge !== undefined && (
              <span
                className={[
                  'tally rounded-full px-1.5 text-[11px] font-bold',
                  badge.tone === 'caution'
                    ? 'bg-caution text-white'
                    : 'bg-signal text-white',
                ].join(' ')}
              >
                {badge.text}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function HunterReady() {
  const [loaded, setLoaded] = useState<Loaded | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const consent = useProcessingConsent()
  const [rewrites, setRewrites] = useState<Array<BulletRewrite> | undefined>()
  const [rewriting, setRewriting] = useState(false)
  const [rewriteNote, setRewriteNote] = useState<string | undefined>()
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const [templateId, setTemplateId] = useState<TemplateId>('modern-intl')
  const [themeId, setThemeId] = useState<ThemeId>('modern')
  /**
   * Targeting is a branch off the check step, not a fourth step everyone walks through.
   *
   * Plenty of people want a cleanly typeset PDF of a CV that already parsed correctly, and forcing
   * them through a job advert to reach it would be the questionnaire this product exists to avoid
   * (ADR-011: the artifact comes before any question).
   */
  const [targeting, setTargeting] = useState(false)
  const [reading, setReading] = useState<AdvertReadingResult | undefined>()
  const [targetBusy, setTargetBusy] = useState(false)
  const [targetError, setTargetError] = useState<string | undefined>()
  /**
   * The advert text, kept after the request so an application row can store what it was aimed at.
   *
   * A gap report is only interpretable against the requirements it was computed from, and "why is my
   * CV in this order?" is unanswerable months later without the advert beside it.
   */
  const [advertText, setAdvertText] = useState<string | undefined>()
  /**
   * Which stored row the CV on screen came from, so saving an application attaches to it rather than
   * creating another base. It lives here because two screens need it — the library card and the
   * targeting panel — and `Library` holding it privately duplicated the base CV on every application.
   */
  const [savedResumeId, setSavedResumeId] = useState<string | undefined>()
  const downloads = useDownloads()
  /** Whether the document pane is showing the comparison instead of the current CV. */
  const [comparing, setComparing] = useState(false)
  /**
   * Pages as the preview actually laid them out, once it has.
   *
   * Preferred over `estimateFit` when present: the estimator counts characters per line and over-counted
   * three pages on a document the renderer put on two, while the measured layout matched the PDF exactly.
   * A label about page count is one a person acts on — they cut a bullet because of it — so it should come
   * from the strongest evidence available at the time.
   */
  const [measuredPages, setMeasuredPages] = useState<number | undefined>()
  const [panel, setPanel] = useState<PanelId>('check')

  const upload = useCallback(
    async (file: File) => {
      setBusy(true)
      setError(undefined)
      try {
        const body = new FormData()
        body.append('file', file)
        /**
         * The consent decision travels with the file, and the server defaults to *not* sending when
         * the field is absent. Declining has to change what happens, not what is displayed — otherwise
         * the second button on the gate is decoration.
         */
        body.append(
          'processing',
          consent.choice === 'granted' ? 'provider' : 'local',
        )
        const response = await fetch('/api/ingest', { method: 'POST', body })
        const payload = (await response.json()) as Record<string, unknown>

        if (!response.ok) {
          setError(
            typeof payload.message === 'string'
              ? payload.message
              : 'Something went wrong reading that file. Please try again.',
          )
          return
        }

        // Validate what came back rather than trusting it: the renderer must never see a shape it
        // would reject, and a bad response should surface here, not as a blank preview.
        const parsed = Resume.safeParse(payload.resume)
        if (!parsed.success) {
          setError(
            'We read your file but could not make sense of the result. Please try again.',
          )
          return
        }

        setLoaded({
          resume: parsed.data,
          // The same object, and it must never be reassigned: this is the "before".
          original: parsed.data,
          provenance:
            (payload.provenance as Array<FieldProvenance> | undefined) ?? [],
          warnings: (payload.warnings as Array<string> | undefined) ?? [],
          method:
            payload.method === 'rules'
              ? 'rules'
              : payload.method === 'local'
                ? 'local'
                : 'llm',
          ocr: payload.ocr === true,
        })
      } catch {
        setError(
          'We could not reach the server. Check your connection and try again.',
        )
      } finally {
        setBusy(false)
      }
      // `consent.choice` is read inside, so it belongs here. Without it the first upload after a
      // decision would still send the previous answer — the exact bug this gate exists to prevent.
    },
    [consent.choice],
  )

  /**
   * Ask for suggestions. Deliberately a separate, explicit action rather than something that runs
   * with the upload: a rewrite pass costs ~25 model calls and the candidate has not yet checked that
   * we read their CV correctly. Improving wording we misread is worse than not improving it.
   */
  const askForRewrites = useCallback(
    async (answers?: Array<string>) => {
      if (loaded === undefined) return
      setRewriting(true)
      setRewriteNote(undefined)
      try {
        const response = await fetch('/api/rewrite', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            resume: loaded.resume,
            processing: consent.choice === 'granted' ? 'provider' : 'local',
            answers,
          }),
        })
        const payload = (await response.json()) as Record<string, unknown>
        if (!response.ok) {
          setRewriteNote(
            typeof payload.message === 'string'
              ? payload.message
              : 'We could not look at your wording just now.',
          )
          return
        }
        setRewrites(
          (payload.rewrites as Array<BulletRewrite> | undefined) ?? [],
        )
        setAccepted(new Set())
      } catch {
        setRewriteNote('We could not reach the server. Your CV is untouched.')
      } finally {
        setRewriting(false)
      }
    },
    [loaded, consent.choice],
  )

  /**
   * Apply one accepted suggestion. One bullet, one decision — there is no path in this component
   * that writes a suggestion the user did not click (docs/06, enforcement layer 3).
   */
  const acceptRewrite = useCallback((rewrite: BulletRewrite) => {
    if (rewrite.suggestion === undefined) return
    setLoaded((current) => {
      if (current === undefined) return current
      const work = current.resume.work.map((job, jobIndex) =>
        jobIndex === rewrite.workIndex
          ? {
              ...job,
              highlights: job.highlights.map((text, index) =>
                index === rewrite.highlightIndex
                  ? (rewrite.suggestion as string)
                  : text,
              ),
            }
          : job,
      )
      return { ...current, resume: { ...current.resume, work } }
    })
    setAccepted((current) => new Set(current).add(keyOf(rewrite)))
  }, [])

  const dismissRewrite = useCallback((rewrite: BulletRewrite) => {
    setRewrites((current) =>
      current?.filter((item) => keyOf(item) !== keyOf(rewrite)),
    )
  }, [])

  /**
   * Read one advert. One request, and everything downstream of it runs in the browser.
   *
   * `buildGapReport`, `scoreCv` and `applyTailoring` are pure, so the requirement list stays editable
   * without a round trip per checkbox — see `/api/target` for why that split is a product decision.
   */
  const targetJob = useCallback(
    async (advert: string) => {
      if (loaded === undefined) return
      setTargetBusy(true)
      setTargetError(undefined)
      setAdvertText(advert)
      try {
        const response = await fetch('/api/target', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            advert,
            resume: loaded.resume,
            processing: consent.choice === 'granted' ? 'provider' : 'local',
          }),
        })
        const payload = (await response.json()) as Record<string, unknown>
        if (!response.ok) {
          setTargetError(
            typeof payload.message === 'string'
              ? payload.message
              : 'We could not read that advert just now.',
          )
          return
        }
        setReading(payload as unknown as AdvertReadingResult)
      } catch {
        setTargetError('We could not reach the server. Your CV is untouched.')
      } finally {
        setTargetBusy(false)
      }
    },
    [loaded, consent.choice],
  )

  const loadSample = useCallback(async (id: string) => {
    setBusy(true)
    setError(undefined)
    try {
      const response = await fetch(`/api/resume?fixture=${id}`)
      const parsed = Resume.safeParse(await response.json())
      if (parsed.success) {
        setLoaded({
          resume: parsed.data,
          original: parsed.data,
          provenance: [],
          warnings: [],
          method: 'rules',
          ocr: false,
        })
      }
    } catch {
      setError('Could not load the sample.')
    } finally {
      setBusy(false)
    }
  }, [])

  /**
   * One picker, opened by three buttons (hero, upload card, closing call-to-action).
   *
   * Declared here rather than inside `Dropzone` because more than one control needs it — see
   * `useFilePicker` for why duplicating the hidden input per button is a trap.
   */
  const picker = useFilePicker(upload, busy)

  // ── Step 1: the one action ──────────────────────────────────────────────────────────────
  if (loaded === undefined) {
    /*
      The decision comes before the file, not after it. Asking once a document is already chosen is
      how a "consent" screen becomes a formality someone clicks through — and by then they have
      committed to the flow. `needsConsent` is false when no provider is configured, because there is
      no transfer to consent to.

      It gets the whole screen, centred, with no hero competing for the answer: this is the
      reference's one-decision-per-screen pattern used where the flow genuinely has one decision.
    */
    if (needsConsent(consent)) {
      return (
        <div className="flex min-h-screen flex-col bg-ground">
          <StepBar />
          <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
            <ConsentGate
              provider={consent.provider as string}
              onDecide={consent.decide}
            />
          </div>
        </div>
      )
    }

    /*
      Reading gets its own screen, and it has to.

      The hero's button opens the picker from the top of a long page. Without this, choosing a file
      there would start the upload and leave the person looking at marketing copy, with the only
      progress indicator in a card several sections below the fold. So the whole page becomes the
      progress indicator while the file is being read.

      What it deliberately does NOT do is show a percentage or a staged checklist. `/api/ingest` is
      one request and reports nothing until it answers, so any "Finding your experience… 60%" here
      would be an animation pretending to be telemetry. An indeterminate bar is the honest shape for
      work of unknown length, and the copy covers the slow case rather than promising the fast one.
    */
    if (busy) {
      return (
        <div className="relative flex min-h-screen flex-col overflow-hidden bg-ground">
          <div aria-hidden className="aurora" />
          <StepBar />
          <div className="relative z-[1] flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
            <div
              className="rise flex w-full max-w-md flex-col items-center gap-6 text-center"
              role="status"
              aria-live="polite"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-signal-wash text-signal">
                <Spinner className="h-7 w-7" />
              </span>

              <div className="flex flex-col gap-3">
                <h1 className="text-display text-balance text-ink">
                  Reading your CV
                  <span className="text-signal">…</span>
                </h1>
                <p className="text-lead text-ink-soft">
                  A few seconds — longer for a scan or a photo of a printed
                  page.
                </p>
              </div>

              <div
                aria-hidden
                className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-band"
              >
                <div
                  data-motion="essential"
                  className="indeterminate h-full w-1/3 rounded-full bg-signal"
                />
              </div>

              <p className="text-meta text-ink-soft">
                Your phone number and street address were removed before the
                text was sent.
              </p>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="flex min-h-screen flex-col bg-ground">
        {picker.input}
        <StepBar
          right={
            <a
              href="/privacy"
              className="text-meta font-medium text-ink-soft transition-colors hover:text-signal"
            >
              Privacy
            </a>
          }
        />

        {/*
          The failure, once, at the top.

          Two controls now open the same picker — the hero button and the upload card further down —
          so an error rendered inside the upload card would be off-screen for anybody who used the
          hero. It lives here instead, directly under the header, where it is visible whichever
          control was used, and the card is passed no error of its own so it cannot appear twice.
        */}
        {error !== undefined && (
          <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6 lg:px-8">
            <p
              role="alert"
              className="rounded-card border border-alert/25 bg-alert-wash px-4 py-3 text-[14px] leading-relaxed text-ink"
            >
              {error}
            </p>
          </div>
        )}

        <main className="flex-1">
          {/*
            The hero. Its right-hand object is the read-back animation, not the upload control.

            The upload control was here first, on the argument that the real thing beats a picture of
            it. That was wrong about what a first viewport is for. Somebody who has just arrived does
            not yet want to hand over their employment history — they want to know what this does.
            The animation answers that in about three seconds, and the primary button opens the same
            picker anyway, so nothing was lost by moving the card down to its own section.
          */}
          <section className="relative overflow-hidden border-b border-hairline">
            <div aria-hidden className="aurora" />
            <div className="relative z-[1] mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14 lg:px-8 lg:py-24">
              <div className="flex flex-col gap-6">
                <span
                  className="rise flex items-center gap-2.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-signal"
                  style={{ animationDelay: '40ms' }}
                >
                  <span aria-hidden className="h-3.5 w-[3px] bg-signal" />
                  Your CV, read back to you
                </span>

                {/*
                  No manual <br />, and `text-balance` instead.

                  A hard break is a guess about one viewport width. This headline had one after "way",
                  and at 1440px it produced four lines with "way" and "it." each stranded alone —
                  the break fought the natural wrap rather than replacing it. Balancing lets the
                  browser even out the rag at every width instead.
                */}
                <h1
                  className="rise text-hero text-balance text-ink"
                  style={{ animationDelay: '100ms' }}
                >
                  See your CV the way the software sees it
                  <span className="text-signal">.</span>
                </h1>

                <p
                  className="rise max-w-lg text-lead text-ink-soft"
                  style={{ animationDelay: '160ms' }}
                >
                  Upload the file you already have. We pull out every detail and
                  show you exactly what we found, you correct anything we got
                  wrong, and you download a PDF that automated screening can
                  actually read.
                </p>

                <div
                  className="rise flex flex-col gap-3 sm:flex-row sm:items-center"
                  style={{ animationDelay: '220ms' }}
                >
                  <button
                    type="button"
                    disabled={busy}
                    onClick={picker.open}
                    className="btn btn-primary px-7 py-3.5 text-[16px]"
                  >
                    Add your CV
                    <Icon name="arrow-right" className="h-[18px] w-[18px]" />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void loadSample('nurse-senior')}
                    className="btn btn-quiet px-6 py-3.5 text-[15px]"
                  >
                    See a finished example
                  </button>
                </div>

                <ul
                  className="rise flex flex-wrap gap-x-5 gap-y-2"
                  style={{ animationDelay: '280ms' }}
                >
                  {[
                    'No account needed',
                    'PDF, Word, or a photo',
                    'Free to try',
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-center gap-1.5 text-[14px] text-ink-soft"
                    >
                      <Icon
                        name="check"
                        className="h-4 w-4 shrink-0 text-affirm"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rise" style={{ animationDelay: '300ms' }}>
                <ReadBackDemo />
              </div>
            </div>
          </section>

          {/* How it works — three steps, because the product is three steps and saying so removes
              the main reason somebody hesitates: not knowing how long this will take. */}
          <section className="border-b border-hairline bg-band">
            <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
              <Reveal>
                <h2 className="max-w-2xl text-display text-balance text-ink">
                  Three steps, about five minutes
                  <span className="text-signal">.</span>
                </h2>
              </Reveal>
              <div className="mt-10 grid gap-4 md:grid-cols-3">
                {STEPS_HOW.map((step, index) => (
                  <Reveal key={step.title} delay={index * 90}>
                    <div className="card hover-lift flex h-full flex-col gap-3 p-6">
                      <span className="tally flex h-9 w-9 items-center justify-center rounded-full bg-signal text-[15px] font-bold text-white">
                        {index + 1}
                      </span>
                      <h3 className="text-title text-ink">{step.title}</h3>
                      <p className="text-[14px] leading-relaxed text-ink-soft">
                        {step.body}
                      </p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          {/* The upload section proper: the drop target, the formats, the consent sentence, and the
              samples — everything that needs room to explain itself. */}
          <section id="upload" className="border-b border-hairline bg-ground">
            <div className="mx-auto w-full max-w-xl px-4 py-16 sm:px-6 lg:py-20">
              <Reveal>
                <div className="mb-8 flex flex-col gap-3 text-center">
                  <h2 className="text-display text-balance text-ink">
                    Start with the CV you already have
                    <span className="text-signal">.</span>
                  </h2>
                  <p className="text-lead text-ink-soft">
                    Even if it is years old, in Word, or a photo of a printed
                    page.
                  </p>
                </div>
              </Reveal>

              <Reveal delay={80}>
                <Dropzone onFile={upload} onPick={picker.open} busy={busy} />
              </Reveal>

              <Reveal delay={140}>
                <div className="mt-8 flex flex-col items-center gap-2.5">
                  <span className="text-meta text-ink-soft">
                    Or look at a finished example first
                  </span>
                  <div className="flex flex-wrap justify-center gap-2">
                    {SAMPLES.map((sample) => (
                      <button
                        key={sample.id}
                        type="button"
                        disabled={busy}
                        onClick={() => void loadSample(sample.id)}
                        className="btn btn-quiet px-3.5 py-1.5 text-[13px]"
                      >
                        {sample.label}
                      </button>
                    ))}
                  </div>
                </div>
              </Reveal>
            </div>
          </section>

          <section className="bg-band">
            <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
              <Reveal>
                <h2 className="max-w-2xl text-display text-balance text-ink">
                  Three things we can prove, not just say
                  <span className="text-signal">.</span>
                </h2>
              </Reveal>
              <div className="mt-10 grid gap-4 md:grid-cols-3">
                {MECHANISMS.map((item, index) => (
                  <Reveal key={item.title} delay={index * 90}>
                    <div className="card hover-lift flex h-full flex-col gap-3 p-6">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-signal-wash text-signal">
                        <Icon name={item.icon} />
                      </span>
                      <h3 className="text-title text-ink">{item.title}</h3>
                      <p className="text-[14px] leading-relaxed text-ink-soft">
                        {item.body}
                      </p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          {/* One last door, for the reader who scrolled the whole page before deciding. */}
          <section className="border-t border-hairline bg-ground">
            <div className="mx-auto w-full max-w-6xl px-4 py-16 text-center sm:px-6 lg:px-8">
              <Reveal>
                <div className="flex flex-col items-center gap-5">
                  <h2 className="max-w-xl text-display text-balance text-ink">
                    Ready to see what the software sees
                    <span className="text-signal">?</span>
                  </h2>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={picker.open}
                    className="btn btn-primary px-7 py-3.5 text-[16px]"
                  >
                    Add your CV
                    <Icon name="arrow-right" className="h-[18px] w-[18px]" />
                  </button>
                </div>
              </Reveal>
            </div>
          </section>
        </main>

        <footer className="border-t border-hairline bg-band">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 sm:px-6">
            <Wordmark className="text-[15px]" />
            <a
              href="/privacy"
              className="text-meta font-medium text-signal underline decoration-signal/30 underline-offset-4 hover:decoration-signal"
            >
              What we do with your data
            </a>
          </div>
        </footer>
      </div>
    )
  }

  const template = templates[templateId]
  const theme = getTheme(themeId)

  // ── The branch: targeting one job ────────────────────────────────────────────────────────
  if (targeting) {
    return (
      <div className="flex min-h-screen flex-col bg-band">
        {/*
          No step number. Targeting is optional, so numbering it would either invent a fourth step
          everybody is behind on or claim progress through a flow they may never enter — the same
          overstatement the honest counter exists to avoid.
        */}
        <StepBar
          right={
            <span className="text-meta text-ink-soft">Targeting a job</span>
          }
          onBack={() => setTargeting(false)}
          backLabel="Back to your CV"
        />

        {/* Same `lg:flex-none` as the check step, for the same reason — see the note there. */}
        <div className="mx-auto flex w-full flex-1 flex-col gap-5 px-4 py-5 sm:px-6 lg:h-[calc(100vh-3.5rem)] lg:min-h-0 lg:flex-none lg:px-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-display text-ink">
              {reading === undefined
                ? 'Which job is this for'
                : 'How you match this job'}
              <span className="text-signal">.</span>
            </h1>
            <p className="max-w-[70ch] text-[14px] leading-relaxed text-ink-soft">
              {reading === undefined
                ? 'We read what they are asking for, show you where your CV already answers it, and tell you plainly where it does not. We never add a skill you have not claimed.'
                : 'Everything here is reversible, and nothing has changed in your CV yet.'}
            </p>
          </div>

          <div className="flex flex-1 flex-col gap-5 lg:min-h-0 lg:flex-row">
            <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[440px] lg:overflow-y-auto lg:pb-2 lg:pr-1">
              {reading === undefined ? (
                <div className="card p-4">
                  <AdvertForm
                    busy={targetBusy}
                    error={targetError}
                    onSubmit={(advert) => void targetJob(advert)}
                  />
                </div>
              ) : (
                <>
                  <TargetPanel
                    resume={loaded.resume}
                    reading={reading}
                    atsVerified={template.atsRating === 'verified'}
                    onUseVariant={(variant) =>
                      setLoaded({ ...loaded, resume: variant })
                    }
                    onAcceptSummary={(summary) =>
                      setLoaded({
                        ...loaded,
                        resume: {
                          ...loaded.resume,
                          basics: { ...loaded.resume.basics, summary },
                        },
                      })
                    }
                    /*
                      Resolves to `false` rather than throwing when there is no account: the endpoint
                      answers 404 for both "not signed in" and "this installation stores nothing", and
                      neither is an error worth an alarm on a screen about a job advert.
                    */
                    /*
                      Its own request, not part of targeting: most people who read a gap report will not
                      want a letter, and drafting one on every paste would spend a model call on
                      curiosity. Given the *edited* requirement list — a requirement the candidate
                      removed should not shape the letter either.
                    */
                    onDraftLetter={async (requirements) => {
                      try {
                        const response = await fetch('/api/cover-letter', {
                          method: 'POST',
                          headers: { 'content-type': 'application/json' },
                          body: JSON.stringify({
                            resume: loaded.resume,
                            advert: advertText,
                            requirements,
                            roleTitle: reading.roleTitle,
                            company: reading.company,
                            processing:
                              consent.choice === 'granted'
                                ? 'provider'
                                : 'local',
                          }),
                        })
                        const payload = (await response.json()) as Record<
                          string,
                          unknown
                        >
                        if (!response.ok) {
                          return {
                            rationale: '',
                            outcome: 'unavailable',
                            message:
                              typeof payload.message === 'string'
                                ? payload.message
                                : 'We could not write one just now.',
                          }
                        }
                        return payload as unknown as CoverLetterOffer
                      } catch {
                        return {
                          rationale: '',
                          outcome: 'unavailable',
                          message:
                            'We could not reach the server. Your CV is untouched.',
                        }
                      }
                    }}
                    /*
                      The *edited* text is what is sent — re-drafting here would quietly throw away
                      their wording.

                      Not a form POST any more, for the reason in `src/lib/download.ts`, and the letter
                      is where that mattered most: it is the one document on screen that the candidate
                      has been writing by hand, and a navigation away from this panel discarded it.
                    */
                    onDownloadLetter={(text) =>
                      saveRendered(
                        '/api/render-letter',
                        { resume: loaded.resume, letter: text },
                        'Cover-letter.docx',
                      )
                    }
                    onSaveApplication={async ({
                      variant,
                      role,
                      company,
                      gap,
                    }) => {
                      try {
                        const response = await fetch('/api/application', {
                          method: 'POST',
                          headers: { 'content-type': 'application/json' },
                          body: JSON.stringify({
                            resume: variant,
                            // The row this CV already occupies, when it has one. Without it the
                            // endpoint has to create a base, and every saved application left another
                            // copy of the same CV in the library.
                            ...(savedResumeId === undefined
                              ? { baseResume: loaded.resume }
                              : { resumeId: savedResumeId }),
                            role,
                            company,
                            advert: advertText,
                            gapReport: gap,
                          }),
                        })
                        return response.ok
                      } catch {
                        return false
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setReading(undefined)
                      setTargetError(undefined)
                    }}
                    className="btn btn-quiet self-start px-4 py-2.5 text-[14px]"
                  >
                    Target a different job
                  </button>
                </>
              )}
            </aside>

            {/*
              The document stays on screen throughout. Reordering is invisible in a list of moves and
              obvious on the page, so the claim "we only moved things" is checkable while it happens.
            */}
            <main className="card flex min-h-[70vh] flex-1 flex-col overflow-hidden lg:min-h-0">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-hairline px-4 py-2.5">
                <span className="text-[13px] font-semibold text-ink">
                  Your CV, as it stands
                </span>
                <button
                  type="button"
                  disabled={downloads.busyFormat !== undefined}
                  aria-busy={downloads.busyFormat === 'pdf'}
                  onClick={() =>
                    void downloads.start(loaded.resume, templateId, themeId)
                  }
                  className="btn btn-quiet px-3.5 py-1.5 text-[13px]"
                >
                  {downloads.busyFormat === 'pdf' ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    <Icon name="download" className="h-4 w-4" />
                  )}
                  {downloads.busyFormat === 'pdf' ? 'Building…' : 'Download'}
                </button>
              </div>
              {downloads.failure !== undefined && (
                <p
                  role="status"
                  className="border-b border-alert/25 bg-alert-wash px-4 py-2 text-[13px] leading-relaxed text-ink"
                >
                  {downloads.failure}
                </p>
              )}
              <PaperPreview
                resume={loaded.resume}
                theme={theme}
                Template={template.Component}
                onPagesMeasured={setMeasuredPages}
              />
            </main>
          </div>
        </div>
      </div>
    )
  }

  // ── Step 2: check what we read, and take the print ──────────────────────────────────────
  const toCheck = loaded.provenance.filter(needsReview).length
  /**
   * What the document has gained since it arrived — the number the comparison is offered on.
   *
   * Computed every render rather than memoised: `diffResumes` walks two documents of a few hundred
   * fields, which is nothing beside the sheet being laid out next to it, and a stale diff would offer a
   * comparison of a document that is no longer on screen.
   */
  const changes = diffResumes(loaded.original, loaded.resume)
  /** Suggestions still awaiting a decision, for the Wording tab's badge. */
  const pendingRewrites =
    rewrites === undefined
      ? 0
      : rewrites.filter(
          (rewrite) =>
            rewrite.outcome === 'suggested' && !accepted.has(keyOf(rewrite)),
        ).length
  const readFields = loaded.provenance.length
  // A hint while they edit; the PDF is the authority on pagination.
  const fit = estimateFit(loaded.resume, theme, {
    // Passed, not inferred: the estimate is only honest if it knows what the template will draw.
    photo:
      template.convention === 'eu' &&
      loaded.resume.basics.photoUrl !== undefined,
  })
  /**
   * Measured if the preview has measured, estimated until then.
   *
   * The estimator counts characters per line and over-counts on an unusual block — it claimed three pages
   * on a document the renderer put on two, while the preview's measurement of real laid-out boxes matched
   * the renderer exactly. A page count is a label somebody acts on, so it takes the better evidence as soon
   * as there is any.
   */
  const pages = measuredPages ?? fit.pages
  /**
   * Whether the design on screen is one this visitor cannot download.
   *
   * Previewing a locked design is deliberately allowed — it is HTML, it costs nothing, and choosing a look
   * you cannot see first is not a choice. What must not happen is finding out at the download: that is the
   * surprise-at-the-checkout pattern, where somebody composes a whole CV and is refused at the last step.
   * So it is said where the choice is made, and on the button that would otherwise fail.
   */
  const lockedDesign =
    tierOf(templateId, themeId) === 'paid' && consent.paidDesigns !== true

  return (
    <div className="flex min-h-screen flex-col bg-band">
      <StepBar
        onBack={() => {
          setLoaded(undefined)
          setError(undefined)
        }}
      />

      {/*
        `lg:flex-none` is load-bearing, and its absence was the bug behind "the document eventually
        cannot be seen".

        The intent of `lg:h-[calc(100vh-3.5rem-2px)]` is a row exactly one viewport tall, so the sidebar
        scrolls inside its own column and the document stays put. It never worked. `flex-1` expands to
        `flex: 1 1 0%`, and a `flex-basis` on the main axis **overrides** `height` — so the explicit
        height was ignored, `flex-grow` then sized this to its tallest child, and the whole page scrolled
        instead. Measured before the fix: 1665px where `100vh - 58px` is 1227px.

        The visible consequence was the sidebar's `lg:overflow-y-auto` never engaging, because a box that
        is already as tall as its content has nothing to scroll. Every pixel the sidebar grew pushed the
        document further down the page.
      */}
      <div className="mx-auto flex w-full flex-1 flex-col gap-5 px-4 py-5 sm:px-6 lg:h-[calc(100vh-3.5rem-2px)] lg:min-h-0 lg:flex-none lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-display text-ink">
              Check what we read
              <span className="text-signal">.</span>
            </h1>
            <p className="text-[14px] text-ink-soft">
              {toCheck > 0
                ? `${toCheck} ${toCheck === 1 ? 'detail is' : 'details are'} worth your eyes. Everything else looked clear.`
                : 'Your dates and job titles are the ones worth a second look.'}
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-5 lg:min-h-0 lg:flex-row">
          {/* What changes the document, and what still needs checking. */}
          {/*
            One column, five panels, one at a time.

            `overflow-y-auto` moved from the column to the *panel* below: the tab strip has to stay put
            while its content scrolls, or the way back out of a long panel scrolls away with it.
          */}
          <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-[400px] lg:min-h-0">
            <PanelTabs
              active={panel}
              onChange={setPanel}
              badges={{
                ...(toCheck > 0
                  ? {
                      check: {
                        text: String(toCheck),
                        tone: 'caution' as const,
                      },
                    }
                  : {}),
                ...(rewrites !== undefined && pendingRewrites > 0
                  ? {
                      wording: {
                        text: String(pendingRewrites),
                        tone: 'signal' as const,
                      },
                    }
                  : {}),
              }}
            />

            <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-2 lg:pr-1">
              {panel === 'check' && loaded.warnings.length > 0 && (
                <div className="rounded-card border border-caution/25 bg-caution-wash p-4">
                  <h2 className="text-[13px] font-semibold text-caution">
                    Worth knowing
                  </h2>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {loaded.warnings.map((warning, i) => (
                      <li
                        key={i}
                        className="text-[13px] leading-relaxed text-ink"
                      >
                        {warning}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {panel === 'check' && (
                <ReviewForm
                  resume={loaded.resume}
                  provenance={loaded.provenance}
                  ocr={loaded.ocr}
                  /*
                The provenance comes back on structural edits, and taking it is not optional: adding or
                removing a row renumbers every index-based path after it, so keeping the old list would
                leave "we were not sure we read this" pointing at a row the person just typed.
              */
                  onChange={(resume, provenance) =>
                    setLoaded({
                      ...loaded,
                      resume,
                      ...(provenance === undefined ? {} : { provenance }),
                    })
                  }
                  /*
                    Read off the registry rather than compared against a template id, so a third
                    convention would be one entry in one file — that check does not want to live in the
                    form, which has no business knowing which templates exist.
                  */
                  photoShown={template.convention === 'eu'}
                  onUseEuropeanLayout={() => setTemplateId('modern-eu')}
                />
              )}

              {/*
              Wording comes *after* the check, never before it — which a tab strip states less firmly
              than a stack did, so the copy carries it: "Once your details are right". The order is the
              argument, and improving a sentence we misread is worse than leaving it alone.
            */}
              {panel === 'wording' && (
                <div className="card flex flex-col gap-3 p-4">
                  <div className="flex flex-col gap-1">
                    <h2 className="text-[15px] font-semibold text-ink">
                      Wording
                    </h2>
                    <p className="text-[13px] leading-relaxed text-ink-soft">
                      Once your details are right, we can suggest stronger
                      wording for each bullet. Nothing changes unless you accept
                      it.
                    </p>
                  </div>

                  {rewrites === undefined ? (
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        disabled={rewriting}
                        aria-busy={rewriting}
                        onClick={() => void askForRewrites()}
                        className="btn btn-quiet px-4 py-2.5 text-[14px]"
                      >
                        <ButtonLabel
                          busy={rewriting}
                          idle="Suggest better wording"
                          working="Reading your bullets…"
                        />
                      </button>
                      {rewriting && (
                        <span className="text-meta leading-relaxed text-ink-soft">
                          One pass over every bullet — the longer your history,
                          the longer this takes.
                        </span>
                      )}
                    </div>
                  ) : (
                    <RewriteReview
                      rewrites={rewrites}
                      accepted={accepted}
                      onAccept={acceptRewrite}
                      onDismiss={dismissRewrite}
                      onAnswer={(answers) => void askForRewrites(answers)}
                      busy={rewriting}
                    />
                  )}

                  {rewriteNote !== undefined && (
                    <p
                      role="status"
                      className="text-[13px] leading-relaxed text-ink-soft"
                    >
                      {rewriteNote}
                    </p>
                  )}
                </div>
              )}

              {/*
              The account, offered after the CV exists and never before it (ADR-004, ADR-011: the
              artifact comes before any question). It renders nothing at all on an installation with no
              database, so a deployment that cannot keep an account never offers one.
            */}
              {panel === 'account' && (
                <Library
                  resume={loaded.resume}
                  /*
                A CV opened from the library gets a fresh `original`, because it is a different
                document. Keeping the old one would compare a stored CV against a file uploaded earlier
                in the same session, and "before and after" would show a distance nobody travelled.
              */
                  onLoad={(resume) =>
                    setLoaded({ ...loaded, resume, original: resume })
                  }
                  savedId={savedResumeId}
                  onSavedIdChange={setSavedResumeId}
                />
              )}

              {/*
              Targeting sits below wording for the same reason wording sits below the check: each step
              is only worth doing once the one above it is right. Tailoring a CV we misread aims the
              wrong document at the job.
            */}
              {panel === 'job' && (
                <div className="card flex flex-col gap-3 p-4">
                  <div className="flex flex-col gap-1">
                    <h2 className="text-[15px] font-semibold text-ink">
                      Applying for something specific?
                    </h2>
                    <p className="text-[13px] leading-relaxed text-ink-soft">
                      Paste the advert and we will show you which of their
                      requirements your CV already answers, which are buried,
                      and which are missing. We never add one you have not
                      claimed.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTargeting(true)}
                    className="btn btn-quiet self-start px-4 py-2.5 text-[14px]"
                  >
                    {reading === undefined
                      ? 'Target a job advert'
                      : 'Back to this job'}
                    <Icon name="arrow-right" className="h-4 w-4" />
                  </button>
                </div>
              )}

              {panel === 'design' && (
                <div className="card flex flex-col gap-3 p-4">
                  {/*
                    Thirty pairings, replacing the three segmented rows that were here.

                    The rows were a fine control for twelve combinations spread across two questions. They
                    cannot present thirty: a person choosing a design is not choosing a structure and a
                    theme separately, they are choosing a look, and the gallery is the shape of that
                    question. `design-gallery.tsx` carries why the cards show a type specimen rather than a
                    thumbnail of a page.
                  */}
                  <div className="flex flex-col gap-1">
                    <h2 className="text-[15px] font-semibold text-ink">
                      Design
                    </h2>
                    <p className="text-[13px] leading-relaxed text-ink-soft">
                      The layout decides what a reader meets first. The type
                      decides how it sounds. Both are free to change at any
                      point — nothing about your CV is rewritten.
                    </p>
                  </div>

                  <DesignGallery
                    templateId={templateId}
                    themeId={themeId}
                    /*
                      `=== true` on purpose: the field is `undefined` until the server answers, and an
                      unknown entitlement must draw as locked rather than as unlocked. A padlock that
                      appears a moment late is untidy; one that vanishes a moment late offers something
                      the render endpoint will refuse.
                    */
                    entitled={consent.paidDesigns === true}
                    onChoose={(design) => {
                      setTemplateId(design.structure)
                      setThemeId(design.theme)
                    }}
                  />

                  {/*
                    The document's language stays a separate control, deliberately.

                    It is not a design choice — it changes the *words* of the furniture (headings, month
                    names) and a person looking for a look is not looking for that. Folding it into
                    thirty cards would have multiplied the catalogue by three and hidden a decision about
                    language inside a decision about type.
                  */}
                  <div className="border-t border-hairline pt-3">
                    <Segmented
                      label="Language"
                      options={localeOptions().map((option) => ({
                        id: option.id,
                        label: option.label,
                        hint: 'Headings and dates. Your own words stay exactly as written.',
                      }))}
                      value={resolveLocale(loaded.resume.locale)}
                      onChange={(locale) =>
                        setLoaded({
                          ...loaded,
                          resume: { ...loaded.resume, locale },
                        })
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            {/*
              The download, at the foot of its own column.

              Restored here after being deleted by accident: the edit that swapped the Design panel for the
              gallery replaced everything up to `</aside>`, and this footer was inside that range. The
              product's primary action disappeared and the build stayed green, which is the reason CLAUDE.md
              says to check a feature is reachable rather than to trust a passing suite.

              Outside the scrolling panel, so the last action never scrolls out of reach, and a full-width
              primary pill because DESIGN.md is right that it reads as one decisive action.
            */}
            <div className="flex shrink-0 flex-col gap-2 border-t border-hairline pt-3">
              {/*
                Disabled on a locked design rather than left to fail at the endpoint. `/api/render` is the
                real gate — a client cannot be trusted with one — but letting somebody press a button whose
                only possible outcome is a refusal is not respect for the gate, just a worse way to say no.
              */}
              <button
                type="button"
                disabled={downloads.busyFormat !== undefined || lockedDesign}
                aria-busy={downloads.busyFormat === 'pdf'}
                onClick={() =>
                  void downloads.start(loaded.resume, templateId, themeId)
                }
                className="btn btn-primary w-full px-6 py-3 text-[15px]"
              >
                {downloads.busyFormat === 'pdf' ? (
                  <Spinner className="h-[18px] w-[18px]" />
                ) : (
                  <Icon name="download" className="h-[18px] w-[18px]" />
                )}
                {downloads.busyFormat === 'pdf'
                  ? 'Building your PDF…'
                  : 'Download the PDF'}
              </button>
              {/*
                Word, beside the PDF rather than hidden behind a menu — v0.6. Many ATS portals require or
                prefer `.docx`, and several parse it better than any PDF. It stays the quiet button: the PDF
                is what most people send and the one whose look they just chose.
              */}
              <button
                type="button"
                disabled={downloads.busyFormat !== undefined || lockedDesign}
                aria-busy={downloads.busyFormat === 'docx'}
                onClick={() =>
                  void downloads.start(
                    loaded.resume,
                    templateId,
                    themeId,
                    'docx',
                  )
                }
                title="For portals that ask for a Word file"
                className="btn btn-quiet w-full px-4 py-2.5 text-[14px]"
              >
                <ButtonLabel
                  busy={downloads.busyFormat === 'docx'}
                  idle="Word (.docx)"
                  working="Building…"
                />
              </button>
              {lockedDesign && (
                <p className="text-meta leading-relaxed text-ink-soft">
                  Pick a design marked Included to download, or keep this one to
                  compare.
                </p>
              )}
              {downloads.failure !== undefined && (
                <p
                  role="status"
                  className="rounded-field border border-alert/25 bg-alert-wash px-3 py-2 text-[13px] leading-relaxed text-ink"
                >
                  {downloads.failure}
                </p>
              )}
            </div>
          </aside>

          {/*
            The document. It is the only element in this world allowed real visual density, and it
            keeps its own surround so it reads as a sheet on a desk rather than as another panel.
          */}
          <main className="card flex min-h-[70vh] flex-1 flex-col overflow-hidden lg:min-h-0">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-hairline px-4 py-2.5">
              <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                Your PDF
                {template.atsRating === 'verified' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-affirm-wash px-2 py-0.5 text-[11px] font-semibold text-affirm">
                    <Icon name="verified" className="h-3.5 w-3.5" />
                    Parse verified
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-caution-wash px-2 py-0.5 text-[11px] font-semibold text-caution">
                    Design-first
                  </span>
                )}
              </span>
              <span className="flex flex-wrap items-center gap-3">
                {/*
                  The before-and-after switch, and it exists only once there is something to show.

                  DESIGN.md: don't show a progress indicator for progress that has not happened. A button
                  offering to display an achievement on a document nobody has changed yet is the
                  interface version of the invented statistic this product refuses to print — so on a
                  freshly uploaded CV this is simply not here, and it appears the moment the first
                  correction or accepted suggestion lands.
                */}
                {changes.length > 0 && (
                  <button
                    type="button"
                    aria-pressed={comparing}
                    onClick={() => setComparing(!comparing)}
                    className={[
                      'flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors',
                      comparing
                        ? 'border-signal-edge bg-signal-wash text-signal'
                        : 'border-hairline-strong text-ink-soft hover:text-ink',
                    ].join(' ')}
                  >
                    {comparing ? 'Just the new one' : 'Before and after'}
                    <span className="tally rounded-full bg-signal px-1.5 text-[11px] font-bold text-white">
                      {changes.length}
                    </span>
                  </button>
                )}
                <span className="tally text-meta text-ink-soft">
                  A4 · {pages} page{pages === 1 ? '' : 's'}
                  {readFields > 0 &&
                    ` · ${readFields - toCheck}/${readFields} read cleanly`}
                </span>
              </span>
            </div>
            {/*
              Said where the document is, because the document is the thing that cannot be downloaded.
              Caution rather than alert: nothing has failed — this is a fact about the plan, and colouring a
              price as an error would make it feel like a fault.
            */}
            {lockedDesign && (
              <p className="border-b border-caution/25 bg-caution-wash px-4 py-2 text-[13px] leading-relaxed text-ink">
                This design is part of the paid plan. You can see it here, and
                download any design marked <strong>Included</strong> — they
                produce the same document, checked by the same parse test.
              </p>
            )}
            {fit.advice !== undefined && (
              <p className="border-b border-hairline bg-band px-4 py-2 text-[13px] leading-relaxed text-ink-soft">
                {fit.advice}
              </p>
            )}
            {/*
              Comparing replaces the preview rather than opening beside it or over it. A modal would put
              the achievement in a box to be dismissed, and a third column would shrink both sheets to
              the point where neither is legible. The switch is one click away in either direction, which
              is what makes replacing it safe — every station in this flow is re-enterable.
            */}
            {comparing ? (
              <BeforeAfter
                original={loaded.original}
                current={loaded.resume}
                changes={changes}
                theme={theme}
                Template={template.Component}
              />
            ) : (
              <PaperPreview
                resume={loaded.resume}
                theme={theme}
                Template={template.Component}
                /*
                  This is the preview whose count the header beside it shows. The first attempt wired the
                  callback to the targeting branch's preview instead — the label kept reading the estimate
                  while the sheets beside it disagreed, which is the bug being fixed, one screen over.
                */
                onPagesMeasured={setMeasuredPages}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
