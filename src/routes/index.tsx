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
import { ButtonLabel, Spinner } from '@/components/working'
import { DownloadFailed, saveRendered } from '@/lib/download'
import type {
  AdvertReadingResult,
  CoverLetterOffer,
} from '@/components/target-panel'
import type { BulletRewrite } from '@/optimize/rewrite'
import { Resume } from '@/schema/resume'
import type { FieldProvenance } from '@/schema/provenance'
import { needsReview } from '@/schema/provenance'
import { estimateFit } from '@/render/fit'
import { getTheme, THEME_IDS, themeLabels } from '@/render/themes'
import type { ThemeId } from '@/render/themes'
import { localeOptions, resolveLocale } from '@/render/locale'
import { TEMPLATE_IDS, templates } from '@/render/templates/registry'
import type { TemplateId } from '@/render/templates/registry'

export const Route = createFileRoute('/')({ component: HunterReady })

interface Loaded {
  resume: Resume
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
 * Step chrome: a hairline rail that fills, and a counter.
 *
 * The counter is the honest part. The reference shows "9/20" through a twenty-screen questionnaire;
 * this flow has three stations and says so, because a progress bar that overstates what is left is
 * the same lie as one that understates it.
 */
function StepBar({
  step,
  total,
  onBack,
  backLabel = 'Start over',
  right,
}: {
  /** Omitted on the landing page: see below. */
  step?: number
  total?: number
  onBack?: () => void
  /**
   * What the arrow does, for a screen reader. Named per screen because it differs: from the check step
   * it discards the upload, and from the targeting branch it simply goes back to the CV.
   */
  backLabel?: string
  right?: React.ReactNode
}) {
  /*
    The rail and the counter appear only once the person has actually started.

    They were on the landing page first, showing a filled 1/3 before anyone had done anything, and
    that is the same overstatement the counter exists to avoid — progress you have not made is not
    progress. So the landing gets a plain header, and the rail appears at the consent step, which is
    the first screen where there is something to be one-third of the way through.
  */
  const showRail = step !== undefined && total !== undefined

  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-ground/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/*
          Two headers, one component. In a step the wordmark is centred between a back arrow and the
          counter, which is the reference's arrangement and the right one when the chrome's job is to
          say where you are. On the landing page there is no step to centre against, and a centred
          wordmark with only a link on the right reads as mis-aligned rather than as centred — so it
          goes left, where a landing page's mark belongs.
        */}
        {/*
          Always available, never warned about: nothing in this product is destructive.

          Drawn in both arrangements. It used to live inside the counter branch, which meant a screen
          without a step number — the targeting branch — silently lost its only way back and stranded
          the user there. The back affordance has nothing to do with whether there is a counter.
        */}
        {onBack !== undefined ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            className="-ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-band hover:text-ink"
          >
            <Icon name="arrow-left" />
          </button>
        ) : (
          showRail && <span className="w-9" />
        )}
        <Wordmark />
        {showRail ? (
          <span className="tally rounded-full border border-hairline px-2.5 py-1 text-[12px] font-semibold text-ink-soft">
            {step}/{total}
          </span>
        ) : (
          right
        )}
      </div>
      {showRail && (
        /* A 2px rail rather than a 4px one: it is orientation, not an achievement. */
        <div aria-hidden className="h-[2px] w-full bg-hairline">
          <div
            className="h-full bg-signal transition-[width] duration-500 ease-out"
            style={{ width: `${(step / total) * 100}%` }}
          />
        </div>
      )}
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
 * A radio group as choice cards — the reference's central control, and the replacement for the
 * previous world's test strip.
 *
 * It keeps the test strip's actual virtue, which was never the striped visual: every option is
 * visible at once and switching is free and reversible. What it drops is the darkroom metaphor that
 * required the user to know what a test strip is.
 */
function ChoiceGroup<T extends string>({
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
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="pb-1 text-[13px] font-semibold text-ink">
        {label}
      </legend>
      {options.map((option) => {
        const on = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.id)}
            className="choice !px-3.5 !py-2.5"
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-[14px] font-semibold">{option.label}</span>
              {option.hint !== undefined && (
                <span
                  className={`text-meta ${on ? 'text-signal/75' : 'text-ink-soft'}`}
                >
                  {option.hint}
                </span>
              )}
            </span>
            {on && <Icon name="check" className="h-4 w-4 shrink-0" />}
          </button>
        )
      })}
    </fieldset>
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
          <StepBar step={1} total={3} />
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
          <StepBar step={1} total={3} />
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

        <div className="mx-auto flex w-full max-w-[1560px] flex-1 flex-col gap-5 px-4 py-5 sm:px-6 lg:h-[calc(100vh-3.5rem)] lg:min-h-0 lg:px-8">
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
              />
            </main>
          </div>
        </div>
      </div>
    )
  }

  // ── Step 2: check what we read, and take the print ──────────────────────────────────────
  const toCheck = loaded.provenance.filter(needsReview).length
  const readFields = loaded.provenance.length
  // A hint while they edit; the PDF is the authority on pagination.
  const fit = estimateFit(loaded.resume, theme)

  return (
    <div className="flex min-h-screen flex-col bg-band">
      <StepBar
        step={2}
        total={3}
        onBack={() => {
          setLoaded(undefined)
          setError(undefined)
        }}
      />

      <div className="mx-auto flex w-full max-w-[1560px] flex-1 flex-col gap-5 px-4 py-5 sm:px-6 lg:h-[calc(100vh-3.5rem-2px)] lg:min-h-0 lg:px-8">
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
          {/*
            The primary action stays reachable from the top of the screen rather than at the bottom
            of a long form: someone who only wants a cleaner PDF of a CV that parsed correctly should
            not have to scroll past their whole history to find it.
          */}
          <button
            type="button"
            disabled={downloads.busyFormat !== undefined}
            aria-busy={downloads.busyFormat === 'pdf'}
            onClick={() =>
              void downloads.start(loaded.resume, templateId, themeId)
            }
            className="btn btn-primary px-6 py-3 text-[15px]"
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
            Word, beside the PDF rather than hidden behind a menu — v0.6.
            Many ATS portals require or prefer `.docx`, and several parse it better than any PDF, so a
            candidate who needs it needs it *now*, at the moment they are uploading. It is the quiet
            button because the PDF is what most people send and the one whose look they just chose;
            the Word file has one ATS-safe layout and no design to pick.
          */}
          <button
            type="button"
            disabled={downloads.busyFormat !== undefined}
            aria-busy={downloads.busyFormat === 'docx'}
            onClick={() =>
              void downloads.start(loaded.resume, templateId, themeId, 'docx')
            }
            title="For portals that ask for a Word file"
            className="btn btn-quiet px-4 py-3 text-[14px]"
          >
            <ButtonLabel
              busy={downloads.busyFormat === 'docx'}
              idle="Word (.docx)"
              working="Building…"
            />
          </button>
        </div>

        {/*
          The failure, in words, where the button is — and the page is still standing to show it.
          That is the whole difference: this message could not have existed while the download was a
          form POST, because a failed render navigated away from the screen that would have carried it.
        */}
        {downloads.failure !== undefined && (
          <p
            role="status"
            className="rounded-field border border-alert/25 bg-alert-wash px-3.5 py-2.5 text-[14px] leading-relaxed text-ink"
          >
            {downloads.failure}
          </p>
        )}

        <div className="flex flex-1 flex-col gap-5 lg:min-h-0 lg:flex-row">
          {/* What changes the document, and what still needs checking. */}
          <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[380px] lg:overflow-y-auto lg:pb-2 lg:pr-1">
            {loaded.warnings.length > 0 && (
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

            <ReviewForm
              resume={loaded.resume}
              provenance={loaded.provenance}
              ocr={loaded.ocr}
              onChange={(resume) => setLoaded({ ...loaded, resume })}
            />

            {/*
              Wording comes *after* the check, never before it. The order is the argument: improving
              a sentence we misread is worse than leaving it alone, and asking the candidate to judge
              a rewrite of something they have not yet confirmed is asking the wrong question.
            */}
            <div className="card flex flex-col gap-3 p-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-[15px] font-semibold text-ink">Wording</h2>
                <p className="text-[13px] leading-relaxed text-ink-soft">
                  Once your details are right, we can suggest stronger wording
                  for each bullet. Nothing changes unless you accept it.
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
                      One pass over every bullet — the longer your history, the
                      longer this takes.
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

            {/*
              The account, offered after the CV exists and never before it (ADR-004, ADR-011: the
              artifact comes before any question). It renders nothing at all on an installation with no
              database, so a deployment that cannot keep an account never offers one.
            */}
            <Library
              resume={loaded.resume}
              onLoad={(resume) => setLoaded({ ...loaded, resume })}
              savedId={savedResumeId}
              onSavedIdChange={setSavedResumeId}
            />

            {/*
              Targeting sits below wording for the same reason wording sits below the check: each step
              is only worth doing once the one above it is right. Tailoring a CV we misread aims the
              wrong document at the job.
            */}
            <div className="card flex flex-col gap-3 p-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-[15px] font-semibold text-ink">
                  Applying for something specific?
                </h2>
                <p className="text-[13px] leading-relaxed text-ink-soft">
                  Paste the advert and we will show you which of their
                  requirements your CV already answers, which are buried, and
                  which are missing. We never add one you have not claimed.
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

            <div className="card flex flex-col gap-5 p-4">
              <ChoiceGroup
                label="Layout"
                options={TEMPLATE_IDS.map((id) => ({
                  id,
                  label: templates[id].label.replace('Modern — ', ''),
                  hint: templates[id].hint,
                }))}
                value={templateId}
                onChange={setTemplateId}
              />
              {/*
                The document's language — v0.8. It changes the *furniture* only: section headings, month
                names, the word for a current role. The candidate's own words are never translated, which
                the hint says outright, because a user offered "Language" would reasonably expect us to
                translate their bullets and would be right to be alarmed if we silently did.

                Detected from the CV and overridable, because detection is a guess and the person
                applying knows which country they are applying in.
              */}
              <ChoiceGroup
                label="Language of the document"
                options={localeOptions().map((option) => ({
                  id: option.id,
                  label: option.label,
                  hint:
                    option.id === resolveLocale(loaded.resume.locale)
                      ? 'Headings and dates. Your own words stay exactly as written.'
                      : undefined,
                }))}
                value={resolveLocale(loaded.resume.locale)}
                onChange={(locale) =>
                  setLoaded({
                    ...loaded,
                    resume: { ...loaded.resume, locale },
                  })
                }
              />
              <ChoiceGroup
                label="Type and spacing"
                options={THEME_IDS.map((id) => ({
                  id,
                  label: themeLabels[id].label,
                  hint: themeLabels[id].hint,
                }))}
                value={themeId}
                onChange={setThemeId}
              />
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
              <span className="tally text-meta text-ink-soft">
                A4 · {fit.pages} page{fit.pages === 1 ? '' : 's'}
                {readFields > 0 &&
                  ` · ${readFields - toCheck}/${readFields} read cleanly`}
              </span>
            </div>
            {fit.advice !== undefined && (
              <p className="border-b border-hairline bg-band px-4 py-2 text-[13px] leading-relaxed text-ink-soft">
                {fit.advice}
              </p>
            )}
            <PaperPreview
              resume={loaded.resume}
              theme={theme}
              Template={template.Component}
            />
          </main>
        </div>
      </div>
    </div>
  )
}
