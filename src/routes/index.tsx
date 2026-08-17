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
import { useCallback, useEffect, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  ProcessingChoice,
  ConsentGate,
  needsConsent,
  useProcessingConsent,
} from '@/components/consent-gate'
import type { ConsentState } from '@/components/consent-gate'
import { AccountMenu, ModelMenu } from '@/components/topbar-controls'
import { useFilePicker } from '@/components/dropzone'
import { Library } from '@/components/library'
import { PaperPreview } from '@/components/paper-preview'
import { ReadBackDemo } from '@/components/read-back-demo'
import { Reveal } from '@/components/reveal'
import { ReviewForm } from '@/components/review-form'
import { SavedCvs } from '@/components/saved-cvs'
import { keyOf, RewriteReview } from '@/components/rewrite-review'
import { AdvertForm, TargetPanel } from '@/components/target-panel'
import { BeforeAfter } from '@/components/before-after'
import { DesignGallery } from '@/components/design-gallery'
import { ButtonLabel, Spinner } from '@/components/working'
import { ModelNotes } from '@/components/model-notes'
import type { ModelNote } from '@/components/model-notes'
import { DownloadFailed, saveRendered } from '@/lib/download'
import {
  clearWorkingCopy,
  readWorkingCopy,
  writeWorkingCopy,
} from '@/lib/working-copy'
import {
  DEFAULT_PANEL,
  PANELS,
  validateWorkspaceSearch,
} from '@/lib/workspace-search'
import type { PanelId } from '@/lib/workspace-search'
import type {
  AdvertReadingResult,
  CoverLetterOffer,
} from '@/components/target-panel'
import type { BulletRewrite } from '@/optimize/rewrite'
import { shiftTarget } from '@/optimize/rewrite-shift'
import { diffResumes } from '@/optimize/variant-diff'
import { DESIGNS, tierOf } from '@/render/designs'
import { Resume } from '@/schema/resume'
import type { FieldProvenance } from '@/schema/provenance'
import { needsReview } from '@/schema/provenance'
import { estimateFit } from '@/render/fit'
import { quoteFamily, withColours } from '@/render/themes/custom'
import { DesignAxes } from '@/components/design-axes'
import { WorkspaceSplit } from '@/components/workspace-split'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'
import { styleOf } from '@/render/themes/style'
import { getTheme } from '@/render/themes'
import type { ThemeId } from '@/render/themes'
import { localeOptions, resolveLocale } from '@/render/locale'
import type { OutputLocale } from '@/render/locale'
import { templates } from '@/render/templates/registry'
import type { TemplateId } from '@/render/templates/registry'

export const Route = createFileRoute('/')({
  // Validated in `@/lib/workspace-search`, with its reasoning and its tests.
  validateSearch: validateWorkspaceSearch,
  component: Workspace,
})

/**
 * The route, plus the one surface that has to outlive every screen inside it.
 *
 * A toast is for the thing that happened while you were looking somewhere else, so its host cannot
 * live inside a panel that unmounts when you switch tabs. `richColors` is off: this product has three
 * semantic colours with measured contrast (DESIGN.md), and sonner's own palette is a fourth opinion.
 */
function Workspace() {
  return (
    <>
      <HunterReady />
      <Toaster position="bottom-right" closeButton />
    </>
  )
}

/**
 * One row of the narrated wait, exactly as `/api/progress` sends it.
 *
 * Declared rather than imported from `src/lib/progress.ts` because that module owns a server-side Map;
 * a type-only import would be erased, but the shape is the wire contract between two halves of the app
 * and writing it out is what makes that contract visible from this side.
 */
interface Stage {
  label: string
  detail?: string
  done: boolean
  at: number
  /** Present only on the model call: which section of the answer is being written. */
  notes?: Array<ModelNote>
}

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
  /**
   * Where this document came from — and it changes what the whole second step is *for*.
   *
   * Every screen after the upload is written as "check what we read": flags on the fields we were
   * unsure of, the line each one came from, a count of what is worth a second look. All of that is
   * about **our reading of a file**. Point it at a CV nobody read and every word of it is false —
   * there is no reading to check, no provenance to flag, and "we could not tell which fields to
   * double-check" becomes a confession about a file that does not exist.
   *
   * So authoring is not "upload with an empty file". It is the same editor with a different frame.
   */
  origin: 'file' | 'blank'
  /**
   * The document as it stood immediately before "Fit my CV to this job".
   *
   * `original` is the as-ingested file, and for an uploaded CV that is the right "before" — the whole
   * distance travelled is the achievement. A CV **written here** has no upload: its `original` is an
   * empty page with a name on it, so a diff against it is "you typed all of this", which says nothing
   * and is why the comparison is hidden for authored documents.
   *
   * But fitting one to a job does produce a real before and after, and hiding it left the fit with no
   * visible answer at all — the exact dead end the audit caught on the uploaded path, reintroduced on
   * this one. So the fit records where it started from, and that becomes the baseline when there is
   * no upload to compare against.
   */
  fitFrom?: Resume
}

/**
 * A CV with nothing in it but the one thing a CV cannot be without.
 *
 * `fullName` is `min(1)` in the schema, which is right — a document with no name on it is not a CV —
 * and it is the reason the from-scratch flow asks one question before it opens. The alternative was
 * seeding "Your name" and hoping they replace it, which puts our words in their document and would
 * eventually be printed by somebody in a hurry.
 *
 * Nothing else is seeded. An empty work row would look like help and is actually a decision made on
 * their behalf, in a form whose empty states already say what goes in each section.
 */
function blankResume(fullName: string): Resume {
  return Resume.parse({
    schemaVersion: '1.0',
    basics: { fullName: fullName.trim(), links: [], personalDetails: [] },
    work: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    languages: [],
    custom: [],
  })
}

/**
 * How it works, in three steps, with the time named.
 *
 * The commonest reason somebody bounces off a tool like this is not doubt about quality — it is not
 * knowing whether they are starting a two-minute job or a two-hour one. "About five minutes" is a
 * claim we can stand behind: it is an upload, a form of pre-filled fields, and a download.
 */
const STEPS_HOW = [
  {
    icon: 'file' as const,
    title: 'Start from a file, or from nothing',
    body: 'A PDF, a Word file, plain text, or a photo of a printed page. Or an empty one, if this is your first. No account either way.',
  },
  {
    icon: 'pencil' as const,
    title: 'Correct what is on the page',
    body: 'Every detail we read, with the ones we were unsure of marked and the line each came from. Written from scratch instead? Same form, empty.',
  },
  {
    icon: 'download' as const,
    title: 'Download it',
    body: 'A clean, well-set A4 PDF, or a Word file for the portals that ask for one. We check both by reading the finished document back.',
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
    title: 'A test checks every design, on every build',
    body: 'Every design is rendered, read back with a separate parser, and checked field by field in reading order.',
    how: 'A design that loses a field does not ship',
  },
  {
    icon: 'shield' as const,
    title: 'It cannot invent anything',
    body: 'Suggestions sharpen your own wording. A number, employer, date or outcome that is not already in your CV is refused.',
    how: 'The guard runs in code, before the suggestion reaches you',
  },
  {
    icon: 'lock' as const,
    title: 'Your CV never becomes training data',
    body: 'Your phone number and street address are removed before any model sees the text, and you can keep the whole thing on our own server.',
    how: 'Say no and it stays on this machine',
  },
]

/**
 * What a CV written from nothing is going to ask for, and how much of it is optional.
 *
 * The question somebody has before starting an empty form is not "what is this" — it is "how long is
 * this going to take me". A list of five lines answers it in about two seconds, and three of the five
 * say *optional*, which is the fact that gets somebody to start.
 *
 * Rules on the page, not a taxonomy: `resume.custom` takes any heading a life needs, so this list is
 * the fixed sections only and the sentence under it says the rest is theirs.
 */
const BLANK_SECTIONS = [
  {
    icon: 'person' as const,
    label: 'Your name',
    note: 'the only one required',
  },
  { icon: 'tag' as const, label: 'What you do', note: 'one line' },
  {
    icon: 'briefcase' as const,
    label: 'Jobs',
    note: 'as many as you have',
  },
  { icon: 'cap' as const, label: 'Schooling', note: 'optional' },
  { icon: 'tools' as const, label: 'Skills', note: 'optional' },
] as const

/**
 * One field, and it is the only field a CV cannot do without.
 *
 * No longer behind a "Write one from scratch" toggle: this is now the whole point of the section it
 * sits in, and a control that hides the one thing its section is for is a click charged for nothing.
 * The field is simply there, focused by the person rather than by us — `autoFocus` on a section
 * halfway down a landing page yanks the viewport to it on load.
 */
function StartFromScratch({
  onStart,
  busy,
}: {
  onStart: (fullName: string) => void
  busy: boolean
}) {
  const [name, setName] = useState('')
  const ready = name.trim() !== ''

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (ready && !busy) onStart(name)
      }}
      className="mt-1 flex flex-col gap-2"
    >
      <label
        htmlFor="blank-name"
        className="text-[13px] font-semibold text-ink"
      >
        Your name
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="blank-name"
          type="text"
          autoComplete="name"
          placeholder="As it should read at the top of the page"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="field sm:flex-1"
        />
        <button
          type="submit"
          disabled={!ready || busy}
          className="btn btn-primary shrink-0 px-6 py-3 text-[15px] disabled:cursor-not-allowed disabled:opacity-45"
        >
          Start writing
          <Icon name="arrow-right" className="h-[18px] w-[18px]" />
        </button>
      </div>
      <span className="text-meta text-ink-soft">
        Nothing else is compulsory, and you can download it at any point.
      </span>
    </form>
  )
}

/**
 * The comparison, and the rule it follows: **the left column is not a strawman.**
 *
 * Every competitor's version of this section makes the reader's current situation sound pathetic
 * (docs/12). Ours opens by saying most CVs parse fine, because most do, and a page whose first claim
 * is false to the majority of its readers has spent its credibility before the fold. What is on the
 * left is only what genuinely cannot be checked without doing what this product does.
 *
 * Paired, one row at a time, rather than two lists side by side. Two lists ask the reader to do the
 * matching themselves and most will not bother; a row that says "this happens" beside "here is the
 * answer to that exact thing" is the same content doing the work it was written for.
 */
const COMPARISON = [
  {
    alone:
      'You send the file and find out nothing. No reply reads the same as a mangled one.',
    here: 'We read the finished document back and show you what survived.',
  },
  {
    alone:
      'A two-column layout looks right to you and arrives as one scrambled paragraph.',
    here: 'You see every field we read, and correct anything wrong before it leaves.',
  },
  {
    alone:
      'A tool sharpens a line by adding a number nobody gave it, and you defend it at the interview.',
    here: 'A claim that is not already in your CV is refused, in code.',
  },
  {
    alone:
      'Rewriting the same CV for every advert, by hand, at eleven at night.',
    here: 'Point it at one advert and get a version for that job, with what changed listed.',
  },
]

/**
 * The three fears, answered where they occur.
 *
 * Not billing objections — this product does not have billing yet, and a FAQ that answers questions
 * nobody asked in order to look complete is the exact amateurism this page is trying to lose.
 */
const FAQ = [
  {
    q: 'What happens to my CV?',
    a: 'It is read, corrected by you, and rendered back. Your phone number and street address are stripped before any model sees the text. Without an account nothing is stored at all, so closing the tab is the end of it. With one, it is kept until you delete it or ninety days pass since your last visit, whichever comes first.',
  },
  {
    q: 'Can the employer tell I used this?',
    a: 'There is nothing to tell. What you download is your own CV, in a layout that parses cleanly, with wording you accepted line by line. We never write a claim into it, and the code will not let us.',
  },
  {
    q: 'Do I have to pay?',
    a: 'No. Upload, correct, and download without an account and without paying. A paid plan adds the larger model, all sixty designs, and CVs remembered between visits. It is not open yet.',
  },
  {
    q: 'What does "a CV that screening software can read" mean?',
    a: 'Employers run your file through software that turns it back into fields before a person sees it. We do the same thing to what we produce, with an independent parser, and check every field came back in the right order. A design that loses one does not ship.',
  },
  {
    q: 'What can you read?',
    a: 'PDF, Word (.doc and .docx), plain text and Markdown. If the file is a scan or a photo of a printout we read it with OCR and tell you it was a scan, because that is when what we read is worth double-checking.',
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
    | 'chevron-down'
    | 'arrow-left'
    | 'arrow-right'
    | 'download'
    | 'file'
    | 'pencil'
    | 'person'
    | 'tag'
    | 'briefcase'
    | 'cap'
    | 'tools'
    | 'blocked'
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
    'chevron-down': <path d="m6 9 6 6 6-6" />,
    /*
      One family, one stroke, one 24-grid — all of these are drawn here rather than imported.
      `lucide-react` is in the tree but only inside the vendored calendar, and a second icon family on
      the same screen is the slop the audit sweeps for: two stroke weights and two corner radii read
      as two products stitched together.
    */
    file: (
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
        <path d="M14 3v5h5" />
      </>
    ),
    pencil: (
      <>
        <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
        <path d="m15 6 3 3" />
      </>
    ),
    person: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </>
    ),
    tag: (
      <>
        <path d="M4 12V5a1 1 0 0 1 1-1h7l8 8-8 8-8-8Z" />
        <circle cx="8.5" cy="8.5" r="1.2" />
      </>
    ),
    briefcase: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
        <path d="M3 12h18" />
      </>
    ),
    cap: (
      <>
        <path d="m12 4 9 4.5-9 4.5-9-4.5L12 4Z" />
        <path d="M7 11v4.5c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V11" />
      </>
    ),
    tools: (
      <>
        <path d="M14.5 6.5a3.5 3.5 0 0 0 4.6 4.6L21 13l-8 8-2-2 8-8-1.9-1.9a3.5 3.5 0 0 0-4.6-4.6L14.5 6.5Z" />
        <path d="m6 6 3 3" />
      </>
    ),
    /** The left column of the comparison: the shape of "this cannot be checked", never a red cross. */
    blocked: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="m8 12h8" />
      </>
    ),
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
      /*
        Normalises every path to a length of 1 so `.draw-in`'s dash maths is the same whatever it is
        pointed at, instead of depending on the measured length of one particular tick.
      */
      pathLength={1}
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
/**
 * The plan, worn in the topbar. Edd's ask verbatim: "debo poder ver en la topbar que tengo el Pro user."
 *
 * Only `pro` earns a chip. `free` and `anonymous` show nothing — a "Free" badge is an upsell disguised
 * as information, and the header is not a sales surface.
 */
function PlanChip({ plan }: { plan?: string }) {
  if (plan !== 'pro') return null
  return (
    <span className="inline-flex h-6 items-center rounded-full bg-signal px-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-white">
      Pro
    </span>
  )
}

/**
 * The header's right-hand cluster: what plan you are on, which model reads your CV, and the door.
 *
 * All three are facts about the session rather than steps in editing a document, so they belong on
 * every screen. Before this, signing in lived behind `?panel=account` — a tab that only exists once a
 * CV is loaded — so the landing page, which is where a returning customer arrives, had no way in at
 * all. See `src/components/topbar-controls.tsx` for why the locked model option is drawn rather than
 * hidden.
 */
function SessionControls({
  consent,
  onOpenAccount,
}: {
  consent: ConsentState
  onOpenAccount?: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <PlanChip plan={consent.plan} />
      <ModelMenu
        provider={consent.provider}
        choice={consent.choice}
        onDecide={consent.decide}
      />
      <AccountMenu plan={consent.plan} onOpenAccount={onOpenAccount} />
    </div>
  )
}

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
  format: DownloadFormat = 'pdf',
  axes: {
    fonts?: { body?: string; heading?: string }
    colours?: { accent?: string; paper?: string }
  } = {},
): Promise<void> {
  /* The chosen axes travel with the request, so the file matches the preview. */
  const extra = new URLSearchParams()
  if (axes.fonts?.body !== undefined) extra.set('bodyFont', axes.fonts.body)
  if (axes.fonts?.heading !== undefined)
    extra.set('headingFont', axes.fonts.heading)
  if (axes.colours?.accent !== undefined)
    extra.set('accent', axes.colours.accent)
  if (axes.colours?.paper !== undefined) extra.set('paper', axes.colours.paper)
  const suffix = extra.toString() === '' ? '' : `&${extra.toString()}`
  await saveRendered(
    `/api/render?template=${templateId}&theme=${themeId}&download=1&format=${format}${suffix}`,
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
/** The three files this workspace can hand somebody. Named once so the menu and the hook agree. */
export type DownloadFormat = 'pdf' | 'docx' | 'html'

function useDownloads() {
  const [format, setFormat] = useState<DownloadFormat | undefined>()
  const [failure, setFailure] = useState<string | undefined>()

  const start = useCallback(
    async (
      resume: Resume,
      templateId: TemplateId,
      themeId: ThemeId,
      wanted: DownloadFormat = 'pdf',
      /* The reader's axes, so the file that lands matches the preview they were looking at. */
      axes: {
        fonts?: { body?: string; heading?: string }
        colours?: { accent?: string; paper?: string }
      } = {},
    ) => {
      // Two clicks would build the same document twice and save two copies to Downloads.
      if (format !== undefined) return
      setFormat(wanted)
      setFailure(undefined)
      try {
        await downloadDocument(resume, templateId, themeId, wanted, axes)
      } catch (error) {
        const message =
          error instanceof DownloadFailed
            ? error.message
            : 'Something went wrong building the file. Your CV is still here. Try again.'
        setFailure(message)
        /*
          Said twice on purpose, and they are not the same message doing the same job. The inline note
          stays beside the button that failed, which is where somebody looks when they try again. The
          toast is for the case the note cannot cover: a long panel scrolled away from its own footer,
          where a failure would otherwise be silent.
        */
        toast.error('That file did not build', { description: message })
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
  /**
   * `disabled` renders the option **visibly** and refuses the click.
   *
   * Hiding an option a person cannot use would answer "what am I missing?" with silence; showing it
   * greyed answers it, and the hint says what would unlock it. Used by the processing control, where
   * an anonymous visitor must be able to see that a second model exists without being offered a
   * choice the server would quietly overrule (ADR-023).
   */
  options: ReadonlyArray<{
    id: T
    label: string
    hint?: string
    disabled?: boolean
  }>
  value: T
  onChange: (id: T) => void
}) {
  /*
    The hint follows the chosen option, except when an option is disabled — then its hint is the more
    useful one, because "why can I not pick that?" is the question actually being asked.
  */
  const blocked = options.find((option) => option.disabled === true)
  const chosen =
    blocked?.hint !== undefined
      ? blocked
      : options.find((option) => option.id === value)
  return (
    <fieldset className="flex min-w-0 flex-col gap-1">
      <legend className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
        {label}
      </legend>
      <div className="flex flex-wrap gap-0.5 rounded-full bg-band p-0.5">
        {options.map((option) => {
          const on = option.id === value
          const off = option.disabled === true
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={on}
              disabled={off}
              /*
                Four signals on the chosen segment, as DESIGN.md requires: surface, border, text colour
                and weight. No check mark — in a control this tight the glyph costs more width than it
                adds certainty, and the other three already carry it.
              */
              className={[
                'rounded-full px-3 py-1.5 text-[13px] transition-colors',
                off
                  ? 'cursor-not-allowed border border-transparent font-medium text-ink-faint'
                  : on
                    ? 'border border-signal-edge bg-ground font-semibold text-signal'
                    : 'border border-transparent font-medium text-ink-soft hover:text-ink',
              ].join(' ')}
              onClick={() => {
                if (off) return
                onChange(option.id)
              }}
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
    /*
      Radix `Tabs` rather than the hand-rolled strip that was here.

      The roles were already right — `tablist`, `tab`, `aria-selected` — and that is the half that is
      easy. The half that was missing is the behaviour the ARIA pattern actually requires: arrow keys
      move between tabs, Home and End jump to the ends, and only the selected tab is in the tab order
      so a keyboard user tabs *past* the strip rather than through five stops in it. None of that was
      here, and all of it comes with the primitive.

      Rendered without `TabsContent`: the panels live further down the tree, keyed off the same state,
      and pulling them in here would mean moving five large blocks to satisfy a component.

      One row, always — scrolling rather than wrapping. `flex-wrap` put four tabs on the first line and
      stranded "Account" alone beneath them at 375px, which reads as a rendering fault rather than a
      fifth tab. A tab strip is a single axis by definition: the fix is to let it scroll, not fold.
    */
    <Tabs
      value={active}
      onValueChange={(next) => onChange(next as PanelId)}
      className="shrink-0"
    >
      <TabsList
        aria-label="CV panels"
        className="scrollbar-none flex w-full gap-1 overflow-x-auto rounded-full bg-band p-1"
      >
        {PANELS.map((panel) => {
          const badge = badges[panel.id]
          return (
            <TabsTrigger
              key={panel.id}
              value={panel.id}
              className="flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-transparent px-2.5 py-1.5 text-[13px] font-medium text-ink-soft transition-colors hover:text-ink data-[state=active]:border-signal-edge data-[state=active]:bg-ground data-[state=active]:font-semibold data-[state=active]:text-signal sm:flex-1 sm:shrink"
            >
              {panel.label}
              {badge !== undefined && (
                <Badge
                  className={[
                    'tally rounded-full border-transparent px-1.5 text-[11px] font-bold text-white',
                    badge.tone === 'caution' ? 'bg-caution' : 'bg-signal',
                  ].join(' ')}
                >
                  {badge.text}
                </Badge>
              )}
            </TabsTrigger>
          )
        })}
      </TabsList>
    </Tabs>
  )
}

function HunterReady() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  const [loaded, setLoaded] = useState<Loaded | undefined>()
  /**
   * Whether the "Worth knowing" panel has been closed for the CV currently loaded.
   *
   * Keyed to the document rather than to the session: the remarks are about *this* file — a table
   * flattened, headings guessed from the text — so a second upload has its own, and closing the first
   * one must not hide them. `origin` and the name are enough to tell two loads apart without holding a
   * copy of the document to compare against.
   */
  const [dismissedNotice, setDismissedNotice] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  /**
   * The live stage list while a file is being read — polled from /api/progress against an id this
   * client minted. What turns a five-minute spinner into a narrated wait (task: Edd's complaint that
   * the user "no tiene puta idea de lo que está pasando").
   */
  const [stages, setStages] = useState<Array<Stage>>([])
  const progressIdRef = useRef<string | undefined>(undefined)
  const [error, setError] = useState<string | undefined>()
  const consent = useProcessingConsent()
  const [rewrites, setRewrites] = useState<Array<BulletRewrite> | undefined>()
  const [rewriting, setRewriting] = useState(false)
  /**
   * The visible checklist of a rewrite pass: every bullet named upfront, ticked green as the model
   * finishes it. Edd's design, verbatim: "si ya sabes cuáles son los bullets, por qué no los muestras
   * y vas marcando con un check verde cuando lo ejecutas".
   */
  const [rewriteChecklist, setRewriteChecklist] = useState<
    | Array<{
        workIndex: number
        highlightIndex: number
        company: string
        text: string
        status: 'pending' | 'working' | 'done' | 'failed'
      }>
    | undefined
  >()
  const [rewriteNote, setRewriteNote] = useState<string | undefined>()
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const [templateId, setTemplateId] = useState<TemplateId>('modern-intl')
  const [themeId, setThemeId] = useState<ThemeId>('modern')
  /**
   * The reader's own axes, layered over whichever design they picked.
   *
   * Kept apart from `templateId`/`themeId` rather than folded into them, because a design is a
   * catalogued pairing that carries a tier and a parse rating, and these are adjustments on top of
   * one. Choosing a new design keeps them, which is the point: somebody who found their colour wants
   * to see it on the next layout too.
   */
  const [customFonts, setCustomFonts] = useState<{
    body?: string
    heading?: string
  }>({})
  const [customColours, setCustomColours] = useState<{
    accent?: string
    paper?: string
  }>({})
  /**
   * The previous look, kept so one wrong click is not a hunt back through a hundred cards.
   *
   * One step, not a stack. Two clicks into a catalogue this size and a person is exploring rather
   * than retracing, and an undo list they have to reason about costs more than it returns. The step
   * covers all four axes together because that is how a look is chosen: the design, then the type and
   * the colour laid over it.
   */
  const [previousLook, setPreviousLook] = useState<
    | {
        templateId: TemplateId
        themeId: ThemeId
        fonts: { body?: string; heading?: string }
        colours: { accent?: string; paper?: string }
        label: string
      }
    | undefined
  >(undefined)
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
  /** True while a cover letter drafts, so the stage polling runs for it too. */
  const [letterDrafting, setLetterDrafting] = useState(false)
  /** True while the document translates after a language switch. */
  const [translating, setTranslating] = useState(false)
  const [translateNote, setTranslateNote] = useState<string | undefined>()
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

  /**
   * Open a stored CV.
   *
   * Shared by the library card, the landing-page list and the `?cv=` link, because all three mean the same
   * thing and one of them getting it subtly different is how a document ends up saving over the wrong row.
   */
  const openSaved = useCallback(
    ({ id, resume }: { id: string; resume: Resume }) => {
      setLoaded({
        resume,
        // A stored CV is its own starting point: the "before" is the version on the server.
        original: resume,
        provenance: [],
        warnings: [],
        method: 'rules',
        ocr: false,
        // A stored CV was a file once, whatever it was authored from. It is not being authored now.
        origin: 'file',
      })
      setSavedResumeId(id)
    },
    [],
  )

  /**
   * Put back whatever this tab was working on: the session copy, or the CV the URL names.
   *
   * Read on mount rather than as `useState`'s initial value: `sessionStorage` is not available while the
   * server renders this route, and reading it in an initialiser would throw during hydration.
   *
   * **The session copy always wins.** When both exist and they disagree, following the URL would replace
   * edits made in this tab with a document from the server — the exact loss the session copy was added to
   * prevent, now caused by a bookmark. So `?cv=` acts only on a cold start. The cost is that opening a
   * bookmark for CV B while CV A is on screen keeps showing A, which is confusing for a moment; the
   * alternative silently destroys work, which is not a moment.
   */
  useEffect(() => {
    const copy = readWorkingCopy()
    if (copy !== undefined) {
      setLoaded({
        resume: copy.resume,
        original: copy.original,
        provenance: copy.provenance,
        warnings: copy.warnings,
        method: copy.method,
        ocr: copy.ocr,
        origin: copy.origin ?? 'file',
        ...(copy.fitFrom === undefined ? {} : { fitFrom: copy.fitFrom }),
      })
      if (copy.savedResumeId !== undefined) setSavedResumeId(copy.savedResumeId)
      return
    }

    const wanted = search.cv
    if (wanted === undefined) return

    /*
      One row, fetched through the list endpoint. `/api/library` answers 404 for a visitor with no account
      and for an installation with no database, and a link to somebody else's CV finds nothing in the list
      it is allowed to see — so a stranger following a shared `?cv=` link lands on the landing page rather
      than on a hint that the id was real.
    */
    let cancelled = false
    void fetch('/api/library')
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as { resumes?: Array<unknown> })
          : { resumes: [] },
      )
      .then((payload) => {
        if (cancelled) return
        for (const row of payload.resumes ?? []) {
          const shape = row as { id?: unknown; resume?: unknown }
          if (shape.id !== wanted) continue
          const parsed = Resume.safeParse(shape.resume)
          if (parsed.success) openSaved({ id: wanted, resume: parsed.data })
          return
        }
      })
      .catch(() => {
        // A library that cannot be reached leaves the landing page exactly as it was. Nothing to say.
      })
    return () => {
      cancelled = true
    }
    // Once, on mount. A dependency on `loaded` would restore over the person's own edits.
  }, [])

  /**
   * Keep it in step with every edit.
   *
   * Written on each change rather than on an interval or on unload: `beforeunload` is unreliable on mobile
   * — a tab killed in the background never fires it — and an interval loses whatever happened since the
   * last tick. A CV is a few tens of kilobytes and this is a synchronous write to the same tab.
   */
  useEffect(() => {
    if (loaded === undefined) return
    writeWorkingCopy({
      resume: loaded.resume,
      original: loaded.original,
      provenance: loaded.provenance,
      warnings: loaded.warnings,
      method: loaded.method,
      ocr: loaded.ocr,
      origin: loaded.origin,
      ...(loaded.fitFrom === undefined ? {} : { fitFrom: loaded.fitFrom }),
      ...(savedResumeId === undefined ? {} : { savedResumeId }),
    })
  }, [loaded, savedResumeId])

  /**
   * Put the CV's id in the address bar once there is one, so the link exists without anybody asking for it.
   *
   * `replace` rather than a push: this annotates where you already are — it is not a navigation the person
   * made, and a history entry per save would make the back button undo saves in the URL while the row on
   * the server stayed saved. Guarded on inequality so it fires once per document rather than on every
   * keystroke, since the persist effect above runs on each edit.
   */
  useEffect(() => {
    if (savedResumeId === undefined || search.cv === savedResumeId) return
    void navigate({
      replace: true,
      search: (prev) => ({ ...prev, cv: savedResumeId }),
    })
  }, [savedResumeId, search.cv, navigate])
  const downloads = useDownloads()
  /**
   * Pages as the preview actually laid them out, once it has.
   *
   * Preferred over `estimateFit` when present: the estimator counts characters per line and over-counted
   * three pages on a document the renderer put on two, while the measured layout matched the PDF exactly.
   * A label about page count is one a person acts on — they cut a bullet because of it — so it should come
   * from the strongest evidence available at the time.
   */
  const [measuredPages, setMeasuredPages] = useState<number | undefined>()

  /**
   * The panel and the comparison come from the URL, not from `useState`.
   *
   * Derived rather than mirrored: there is one source of truth, so the address bar can never disagree with
   * the screen. A `useState` kept in sync by an effect would be two, and the two drift the moment somebody
   * presses back.
   *
   * The default is left **out** of the URL rather than written into it, so the front door stays `/` instead
   * of `/?panel=check&compare=false`. Both push a history entry — that is the whole point, since the
   * complaint was that back left the app rather than the panel.
   */
  const panel: PanelId = search.panel ?? DEFAULT_PANEL
  const setPanel = useCallback(
    (id: PanelId) => {
      void navigate({
        search: (prev) => ({
          ...prev,
          panel: id === DEFAULT_PANEL ? undefined : id,
        }),
      })
    },
    [navigate],
  )

  /** Whether the document pane is showing the comparison instead of the current CV. */
  const comparing = search.compare === true
  const setComparing = useCallback(
    (next: boolean) => {
      void navigate({
        search: (prev) => ({ ...prev, compare: next ? true : undefined }),
      })
    },
    [navigate],
  )

  /**
   * Poll the stage list while an upload is in flight. 700ms against an in-memory map is nothing, and
   * polling — unlike a second streaming response — survives every proxy between a phone and the server.
   */
  useEffect(() => {
    if (!busy && !targetBusy && !letterDrafting && !translating) return
    const timer = setInterval(() => {
      const id = progressIdRef.current
      if (id === undefined) return
      void fetch(`/api/progress?id=${id}`)
        .then(async (response) =>
          response.ok ? ((await response.json()) as { steps?: unknown }) : {},
        )
        .then((payload) => {
          if (Array.isArray(payload.steps)) {
            setStages(payload.steps as Array<Stage>)
          }
        })
        .catch(() => {
          // A failed poll changes nothing: the upload itself is the source of truth.
        })
    }, 700)
    return () => clearInterval(timer)
  }, [busy, targetBusy, letterDrafting, translating])

  const upload = useCallback(
    async (file: File) => {
      setBusy(true)
      setError(undefined)
      setStages([])
      progressIdRef.current = crypto.randomUUID()
      try {
        const body = new FormData()
        body.append('file', file)
        body.append('progress', progressIdRef.current)
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
          origin: 'file',
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

      /**
       * One request per bullet, and every bullet on a visible checklist before the first call.
       *
       * The person sees the whole queue upfront — each bullet named under its employer — and a green
       * tick lands on each one as the model finishes it. The suggestions stream into the review list
       * below at the same moments, readable and acceptable while the rest are still cooking. The model
       * does the same work in the same order; only the silence is gone (Edd: "es difícil esperar cinco
       * minutos sin saber qué está pasando").
       *
       * Per bullet rather than per job because the tick IS the product here: a six-bullet job that
       * ticks once at the end is a half-minute of stillness. The rewrite cache makes re-runs cheap and
       * the endpoint's own rate bucket absorbs the extra requests — they multiply HTTP calls, not
       * model calls.
       */
      const queue = loaded.resume.work.flatMap((job, workIndex) =>
        job.highlights.map((text, highlightIndex) => ({
          workIndex,
          highlightIndex,
          company: job.company,
          text,
          status: 'pending' as const,
        })),
      )
      setRewriteChecklist(queue.map((entry) => ({ ...entry })))

      const collected: Array<BulletRewrite> = []
      let failures = 0
      // Reset the acceptances, but leave `rewrites` alone until the first result lands: the checklist
      // is the right screen while nothing has arrived yet.
      setAccepted(new Set())

      const mark = (
        at: number,
        status: 'pending' | 'working' | 'done' | 'failed',
      ) => {
        setRewriteChecklist((current) =>
          current?.map((entry, i) => (i === at ? { ...entry, status } : entry)),
        )
      }

      try {
        for (const [at, target] of queue.entries()) {
          mark(at, 'working')
          const response = await fetch('/api/rewrite', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              resume: loaded.resume,
              processing: consent.choice === 'granted' ? 'provider' : 'local',
              answers,
              only: [
                {
                  workIndex: target.workIndex,
                  highlightIndex: target.highlightIndex,
                },
              ],
            }),
          })
          const payload = (await response.json()) as Record<string, unknown>

          if (response.status === 429) {
            // The limiter is telling us to stop, so stop — keep what already arrived.
            mark(at, 'failed')
            setRewriteNote(
              typeof payload.message === 'string'
                ? payload.message
                : 'We have to pause the rewrites for a while. What arrived so far is below.',
            )
            break
          }
          if (!response.ok) {
            /*
              One failed bullet does not throw away the rest. Mark it amber, keep going, and say at the
              end how much was skipped — the pre-split behaviour lost the entire pass to one hiccup.
            */
            failures++
            mark(at, 'failed')
            continue
          }
          const chunk =
            (payload.rewrites as Array<BulletRewrite> | undefined) ?? []
          collected.push(...chunk)
          setRewrites([...collected])
          mark(at, 'done')
        }

        if (failures > 0) {
          setRewriteNote(
            `We could not look at ${failures} of your bullets just now. The rest are below. Run it again later for the missing ones.`,
          )
        }
      } catch {
        if (collected.length > 0) {
          setRewriteNote(
            'The connection dropped part-way. What arrived so far is below; your CV is untouched.',
          )
        } else {
          setRewriteNote('We could not reach the server. Your CV is untouched.')
        }
      } finally {
        setRewriting(false)
        setRewriteChecklist(undefined)
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
      /*
        Belt and braces under the coordinate shifting: apply only when the bullet at these coordinates
        is still the text the model actually read. If anything slipped past the shift — a code path
        that forgot to emit its edit — the failure is "nothing happened", never "a different line was
        overwritten".
      */
      const present =
        current.resume.work[rewrite.workIndex]?.highlights[
          rewrite.highlightIndex
        ]
      if (present !== rewrite.original) return current
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

  /**
   * Accept every open suggestion at once — the person asked the product to do it, so it does it.
   *
   * One `setLoaded` applying all of them, not a loop of single accepts: each accept maps over the whole
   * work array, and N sequential state updates for a 25-bullet CV is both slower and harder to undo in
   * one motion. The anti-fabrication guard already ran per suggestion; the per-bullet diffs stay on
   * screen after the bulk accept, so nothing is hidden by the shortcut.
   */
  const acceptAllRewrites = useCallback(() => {
    setLoaded((current) => {
      if (current === undefined || rewrites === undefined) return current
      const open = rewrites.filter(
        (entry) =>
          entry.suggestion !== undefined && !accepted.has(keyOf(entry)),
      )
      if (open.length === 0) return current
      const work = current.resume.work.map((job, jobIndex) => {
        const mine = open.filter((entry) => entry.workIndex === jobIndex)
        if (mine.length === 0) return job
        return {
          ...job,
          highlights: job.highlights.map((text, index) => {
            const hit = mine.find((entry) => entry.highlightIndex === index)
            // Same guard as the single accept: the suggestion applies only to the text it was about.
            return hit !== undefined && text === hit.original
              ? (hit.suggestion ?? text)
              : text
          }),
        }
      })
      return { ...current, resume: { ...current.resume, work } }
    })
    setAccepted((current) => {
      const next = new Set(current)
      for (const entry of rewrites ?? []) {
        if (entry.suggestion !== undefined) next.add(keyOf(entry))
      }
      return next
    })
  }, [rewrites, accepted])

  /**
   * Switch the document's language — the whole document, not just its furniture.
   *
   * v0.8 drew the line at headings and dates ("your own words stay exactly as written"), and its owner
   * moved it: picking a language now translates the full text, on demand, inside the guards recorded in
   * src/optimize/translate.ts — numbers verbatim, identity untouched, any dubious field keeps its
   * original. The locale flips first so headings and dates change even if the model then fails, the
   * wait narrates itself batch by batch, and the comparison opens after so the person reads exactly
   * what changed. The pre-switch document sits in `original`, one toggle away.
   */
  const switchLanguage = useCallback(
    async (locale: OutputLocale) => {
      if (loaded === undefined) return
      if (resolveLocale(loaded.resume.locale) === locale) return
      setTranslateNote(undefined)
      // The furniture immediately; the words in flight.
      setLoaded({ ...loaded, resume: { ...loaded.resume, locale } })
      setTranslating(true)
      progressIdRef.current = crypto.randomUUID()
      setStages([])
      try {
        const response = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            resume: { ...loaded.resume, locale },
            target: locale,
            processing: consent.choice === 'granted' ? 'provider' : 'local',
            progress: progressIdRef.current,
          }),
        })
        const payload = (await response.json()) as Record<string, unknown>
        if (!response.ok) {
          setTranslateNote(
            typeof payload.message === 'string'
              ? payload.message
              : 'We could not translate just now. Headings and dates changed; your words did not.',
          )
          return
        }
        const parsed = Resume.safeParse(payload.resume)
        if (!parsed.success) {
          setTranslateNote(
            'The translation came back in a shape we could not trust, so your words were left alone.',
          )
          return
        }
        setLoaded((current) =>
          current === undefined ? current : { ...current, resume: parsed.data },
        )
        // Suggestions were about the pre-translation text — same staleness as the tailoring actions.
        setRewrites(undefined)
        setAccepted(new Set())
        setComparing(true)
        const kept = typeof payload.kept === 'number' ? payload.kept : 0
        if (kept > 0) {
          setTranslateNote(
            `${kept} ${kept === 1 ? 'line' : 'lines'} stayed in the original language. The translation did not keep their numbers intact, so we kept your words instead.`,
          )
        }
      } catch {
        setTranslateNote(
          'We could not reach the server. Headings and dates changed; your words did not.',
        )
      } finally {
        setTranslating(false)
      }
    },
    [loaded, consent.choice, setComparing],
  )

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
      // The same narrated-wait channel as the upload: the advert read is one or two model calls,
      // and on the local model that is long enough to deserve names on its stages.
      progressIdRef.current = crypto.randomUUID()
      setStages([])
      try {
        const response = await fetch('/api/target', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            advert,
            resume: loaded.resume,
            processing: consent.choice === 'granted' ? 'provider' : 'local',
            progress: progressIdRef.current,
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

  /**
   * Start with nothing but a name.
   *
   * Until now this product could only *correct* a CV, which quietly excluded the person who most needs
   * one: a first job, a return to work after years out, a trade where nobody ever wrote one down. The
   * editor has done full add/remove on every section since v0.5 and the custom sections take any
   * heading a life needs — so the feature was already built and only the door was missing.
   *
   * It asks for the name because the schema requires one (`fullName` is `min(1)`, correctly: a document
   * with no name on it is not a CV), and asking beats seeding "Your name" and hoping it gets replaced
   * before somebody in a hurry prints it.
   */
  const startBlank = useCallback((fullName: string) => {
    const resume = blankResume(fullName)
    setLoaded({
      resume,
      original: resume,
      provenance: [],
      warnings: [],
      method: 'rules',
      ocr: false,
      origin: 'blank',
    })
  }, [])

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
          origin: 'file',
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
      // `100dvh`, not `100vh`: on iOS Safari the address bar makes the two differ, and this screen
      // is centred inside it, so the difference is a visible jump under the answer.
      return (
        <div className="flex min-h-[100dvh] flex-col bg-ground">
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
            <div className="rise flex w-full max-w-lg flex-col gap-6">
              {/*
                Left-aligned, not centred, and that is the whole redesign in one decision.

                The old screen centred a headline, a big spinner and an indeterminate bar above a
                left-aligned list of stages — four axes fighting, and the bar read as a progress meter
                stuck at zero rather than as motion. DESIGN.md forbids "a percentage we were not given";
                a thin line with a dot at its left end is that percentage drawn anyway. The stages ARE
                the progress, so they get the weight and everything else lines up behind them.
              */}
              <div className="flex flex-col gap-2">
                <h1 className="text-display text-balance text-ink">
                  Reading your CV
                  <span className="text-signal">…</span>
                </h1>
                {/*
                  The shape of the wait, never a duration — DESIGN.md's rule, which the old copy broke.
                  "A few seconds" was measured at fifty on the production box, and a promise that has
                  already expired is how a working request starts looking broken.
                */}
                <p className="text-lead text-ink-soft">
                  However long your document needs. A scan or a photo takes the
                  longest, and nothing is lost while you wait.
                </p>
              </div>

              {/*
                The work itself, as an object on the page (DESIGN.md's two-layer elevation): one row per
                stage the server has actually reported, a tick when it finishes, a spinner and a live
                counter on the one running. The labels come from the pipeline (src/lib/progress.ts), so
                this list cannot drift from what the code does the way a hardcoded "step 2 of 4" would —
                and it never claims a step that has not started.
              */}
              <ol
                className="card flex flex-col divide-y divide-hairline"
                role="status"
                aria-live="polite"
              >
                {(stages.length > 0
                  ? stages
                  : [
                      {
                        label: 'Sending your file',
                        done: false,
                        at: Date.now(),
                        detail: undefined,
                      },
                    ]
                ).map((stage, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-3 px-4 py-3.5"
                  >
                    <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center">
                      {stage.done ? (
                        <svg
                          aria-hidden
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.6"
                          strokeLinecap="round"
                          className="h-4 w-4 text-affirm"
                        >
                          <path d="m5 12.5 4.5 4.5L19 7" />
                        </svg>
                      ) : (
                        <Spinner className="h-4 w-4 text-signal" />
                      )}
                    </span>

                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span
                        className={
                          stage.done
                            ? 'text-[14px] text-ink-faint'
                            : 'text-[14px] font-semibold text-ink'
                        }
                      >
                        {stage.label}
                      </span>
                      {stage.detail !== undefined && (
                        <span className="text-meta text-ink-soft">
                          {stage.detail}
                        </span>
                      )}
                      {/*
                        The long stage narrating itself. Only the model call carries notes, and only
                        while it streams, so every other row is unchanged — including on the screens
                        that render this same list for a translation or a cover letter.
                      */}
                      {stage.notes !== undefined && (
                        <ModelNotes notes={stage.notes} />
                      )}
                    </span>

                    {/*
                      Seconds on the running stage — measured, never predicted, and the difference
                      matters: an elapsed count is a fact about what has happened, where an estimate is
                      a promise about what has not. It answers the only question a long wait provokes
                      ("is this stuck?") without pretending to know the end.

                      `aria-hidden` because the row is inside a live region: a screen reader announcing
                      a new number every second would bury the stage name it exists to convey.
                    */}
                    {!stage.done && (
                      <span
                        aria-hidden
                        className="tally mt-0.5 shrink-0 text-meta text-ink-faint"
                      >
                        {Math.max(
                          0,
                          Math.round((Date.now() - stage.at) / 1000),
                        )}
                        s
                      </span>
                    )}
                  </li>
                ))}
              </ol>

              <p className="text-meta leading-relaxed text-ink-soft">
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
            <div className="flex items-center gap-3">
              <a
                href="/privacy"
                className="hidden text-meta font-medium text-ink-soft transition-colors hover:text-signal sm:inline"
              >
                Privacy
              </a>
              {/*
                The landing page is where a returning customer arrives, and until now it was the one
                screen with no way to sign in — the form lived in a tab that only exists after an
                upload. So the person who had already saved a CV had to upload another one to find
                the door back to it.
              */}
              <SessionControls consent={consent} />
            </div>
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
                  show you exactly what we found. You correct anything we got
                  wrong, then download a PDF that automated screening can
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
                  {/*
                    Proof beside the promise, which is the one structural thing every competitor does
                    in the hero and we did not (docs/12). "Free to try" was a price, not evidence, and
                    it is said twice more further down the page; the parse check is the claim nobody
                    else in this category makes about *your* file, so it belongs in the first viewport.
                  */}
                  {[
                    'Checked by reading the PDF back',
                    'No account needed',
                    'PDF, Word, or a photo',
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

                {/*
                  The way back to a saved CV, under the upload control rather than above it.
                
                  Order matters here: the upload is what a first-time visitor came for and it stays the
                  first thing (ADR-011, the artifact before any question). This is for the returning one,
                  and it renders nothing at all for everybody else — no empty state, no invitation, no row
                  of grey boxes explaining what would be here if they had an account.
                */}
                <SavedCvs onOpen={openSaved} />
              </div>

              <div className="rise" style={{ animationDelay: '300ms' }}>
                <ReadBackDemo />
              </div>
            </div>
          </section>

          {/*
            How it works. A numbered rail, not three cards in a row.

            Two card rows ran back to back on this page — this one and the proof section below — so
            the eye met the identical rhythm twice and read neither. Neither needed a box either:
            DESIGN.md gives a card an elevation, and elevation says "this sits above that", which is
            false of three equal steps. Hairlines group them for nothing.

            The heading holds the left column and stays put while the steps scroll past it, which is
            what a heading is for when its list is long enough to leave it behind.
          */}
          <section className="border-b border-hairline bg-band">
            <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20 lg:px-8 lg:py-16">
              <Reveal>
                <div className="flex flex-col gap-4 lg:sticky lg:top-24">
                  <span className="eyebrow">How it goes</span>
                  <h2 className="text-section text-balance text-ink">
                    Three steps, about five minutes
                    <span className="text-signal">.</span>
                  </h2>
                  <p className="max-w-xs text-[15px] leading-relaxed text-ink-soft">
                    People rarely put this off because they doubt it works. They
                    put it off because they cannot tell whether they are
                    starting a two-minute job or a two-hour one.
                  </p>
                </div>
              </Reveal>

              <ol className="flex flex-col divide-y divide-hairline-strong border-y border-hairline-strong">
                {STEPS_HOW.map((step, index) => (
                  <Reveal key={step.title} delay={index * 80}>
                    <li className="row-nudge grid grid-cols-[2.5rem_1fr] gap-x-5 gap-y-1.5 py-6 sm:grid-cols-[3.5rem_1fr] sm:py-7">
                      <span className="row-marker flex items-center gap-2 text-ink-faint">
                        <span className="tally text-[13px] font-bold leading-6 sm:text-[15px]">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                      </span>
                      <h3 className="flex items-center gap-2.5 text-title text-ink">
                        <Icon
                          name={step.icon}
                          className="h-[18px] w-[18px] shrink-0 text-signal"
                        />
                        {step.title}
                      </h3>
                      <p className="col-start-2 max-w-[58ch] text-[14px] leading-relaxed text-ink-soft">
                        {step.body}
                      </p>
                    </li>
                  </Reveal>
                ))}
              </ol>
            </div>
          </section>

          {/*
            The other way in, and now the only thing this section does.

            It used to be the upload section, and it had stopped making sense: a drop target, a
            consent sentence, a from-scratch prompt and three sample buttons, in a stack — four
            offers competing in one column, and two of them (upload, samples) repeats of the hero
            twenty lines above. One section, one decision.

            Uploading did not move; it stayed in the hero where it belongs, and `Dropzone` is
            untouched in `src/components/dropzone.tsx` for wherever it earns its place next. What
            leaves the page with it is the drag-and-drop target — the picker button remains.

            Asymmetric on purpose: the invitation and its one field on the left, and on the right the
            shape of what is about to be filled in. That column is not decoration. The question
            somebody asks before starting a form from nothing is "how much is this going to ask of
            me", and the honest answer is a short list where most of it is optional.
          */}
          <section id="upload" className="border-b border-hairline bg-ground">
            <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:px-8 lg:py-24">
              <Reveal>
                <div className="flex max-w-lg flex-col gap-5">
                  <span className="eyebrow">No CV yet</span>
                  <h2 className="text-display text-balance text-ink">
                    Write one from nothing
                    <span className="text-signal">.</span>
                  </h2>
                  <p className="text-lead text-ink-soft">
                    A first job, a return to work after years out, a trade where
                    nobody ever wrote one down. Same editor, same checked
                    document at the end. It just starts empty.
                  </p>
                  <StartFromScratch onStart={startBlank} busy={busy} />
                </div>
              </Reveal>

              <Reveal delay={90}>
                <div className="flex flex-col gap-3 lg:pt-2">
                  {/* Ink Soft, not Ink Faint. DESIGN.md's own rule reserves Faint (3.07:1) for rules,
                      disabled labels and strike decoration; this is a column heading somebody reads.
                      Measured at 3.09:1 against the 4.5:1 AA floor before the change. */}
                  <span className="text-meta font-semibold uppercase tracking-[0.08em] text-ink-soft">
                    What it will ask for
                  </span>
                  <ul className="flex flex-col divide-y divide-hairline border-y border-hairline">
                    {BLANK_SECTIONS.map((item) => (
                      <li
                        key={item.label}
                        className="row-nudge flex items-center justify-between gap-4 py-3"
                      >
                        <span className="flex items-center gap-3 text-[15px] font-medium text-ink">
                          <Icon
                            name={item.icon}
                            className="row-marker h-[18px] w-[18px] shrink-0 text-ink-faint"
                          />
                          {item.label}
                        </span>
                        <span className="text-meta text-ink-soft">
                          {item.note}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-meta leading-relaxed text-ink-soft">
                    Add sections of your own for anything this list does not
                    cover: courses, references, licences, publications.
                  </p>
                </div>
              </Reveal>
            </div>
          </section>

          {/*
            The proof section, as a ledger.

            This is the page's whole argument — everyone in this category says "ATS-friendly" and
            only this one checks the file it just produced (docs/12) — and it was three identical
            boxes with a circled icon each, indistinguishable at a glance from the three steps above.

            Now each claim carries the mechanism that enforces it on the same line, in plain words
            rather than a file path: the audience is every sector, not this one, and a nurse does not
            want a source reference. It is the one place on the page where saying HOW is more
            persuasive than saying WHAT.
          */}
          <section className="border-b border-hairline bg-band">
            <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
              <Reveal>
                <span className="eyebrow">Evidence</span>
                <h2 className="mt-4 max-w-2xl text-section text-balance text-ink">
                  Three things you can check yourself
                  <span className="text-signal">.</span>
                </h2>
              </Reveal>
              <div className="mt-10 flex flex-col divide-y divide-hairline border-y border-hairline">
                {MECHANISMS.map((item, index) => (
                  <Reveal key={item.title} delay={index * 80}>
                    <div className="row-nudge grid gap-x-10 gap-y-3 py-7 lg:grid-cols-[1.15fr_0.85fr] lg:py-8">
                      <div className="flex gap-4">
                        <span className="row-marker mt-0.5 shrink-0 text-ink-faint">
                          <Icon name={item.icon} className="h-5 w-5" />
                        </span>
                        <div className="flex flex-col gap-2">
                          <h3 className="text-title text-ink">{item.title}</h3>
                          <p className="max-w-[52ch] text-[14px] leading-relaxed text-ink-soft">
                            {item.body}
                          </p>
                        </div>
                      </div>
                      <p className="text-[14px] font-medium leading-relaxed text-ink lg:pt-1 lg:text-right">
                        {item.how}
                      </p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          {/*
            The cost of doing it yourself, paired with the answer to each line of it.

            Two boxes side by side made the reader do the matching, and most will not: the left list
            and the right list were about the same four things and nothing said so. Row by row, each
            problem meets its own answer, and the boxes go — a card promises elevation, and these two
            columns sit on the same plane by definition.

            The left column deliberately does not exaggerate. "Your CV probably parses fine" is in the
            lead, because for most people it does, and a page that opens by telling somebody their
            document is broken has already lied to the majority of its readers.

            **This is the page's one dark band, and its only Hero-sized heading after the hero.** Seven
            sections alternating between two greys is a rhythm with no accent in it — the reader has no
            way to tell which one the product is actually about. Everything else on the page is a
            feature or a reassurance; this is the argument. It gets the tonal event, and nothing else
            may have one (see `.band-ink`).
          */}
          <section className="band-ink">
            <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:px-8 lg:py-32">
              <Reveal>
                <span className="eyebrow text-white">The problem</span>
                <h2 className="mt-5 max-w-3xl text-hero text-balance text-white">
                  What you cannot check on your own
                  <span className="text-signal-edge">.</span>
                </h2>
                <p className="on-ink-soft mt-6 max-w-2xl text-lead">
                  Your CV probably parses fine. The problem is that there is no
                  way to find out before you send it, and the ways it fails are
                  invisible in the document you are looking at.
                </p>
              </Reveal>

              <div className="mt-14 flex flex-col divide-y divide-white/12 border-y border-white/12">
                <div className="hidden gap-10 py-3 lg:grid lg:grid-cols-2">
                  <span className="on-ink-faint text-[12px] font-semibold uppercase tracking-[0.1em]">
                    On your own
                  </span>
                  <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-affirm-wash">
                    Here
                  </span>
                </div>
                {COMPARISON.map((row, index) => (
                  <Reveal key={row.here} delay={index * 70}>
                    <div className="grid gap-3 py-7 lg:grid-cols-2 lg:gap-10">
                      {/* 72% white, not the 45% the column labels use: this column recedes by size
                          and by position, and it still has to be read. The glyph mirrors the tick
                          opposite it, so the pairing is visible before either line is. */}
                      <p className="on-ink-soft flex max-w-[52ch] gap-2.5 text-[14px] leading-relaxed">
                        <Icon
                          name="blocked"
                          className="on-ink-faint mt-0.5 h-4 w-4 shrink-0"
                        />
                        {row.alone}
                      </p>
                      <p className="flex max-w-[52ch] gap-2.5 text-[16px] leading-relaxed text-white">
                        <Icon
                          name="check"
                          className="draw-in mt-1 h-4 w-4 shrink-0 text-affirm-wash"
                        />
                        {row.here}
                      </p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          {/*
            The questions somebody asks before they trust a stranger with their employment history.

            Every competitor has this section and every one of them uses it to handle objections about
            *billing*. Ours answers the three things a person actually hesitates over — where the file
            goes, whether the employer can tell, and whether they have to pay — because those are the
            ones that stop somebody starting, and a page that dodges them is asking for trust it has
            not offered anything for.

            Five identical white pills in a narrow column, with the right half of the page empty, was
            a wall of sameness with nothing to aim at. The heading takes that empty half; the
            questions are a plain divided list, because a question is a line of text and does not need
            a container to be one.

            `<details>` rather than a JS accordion: it works before hydration, it is keyboard-operable
            for free, and find-in-page can reach inside a closed one.
          */}
          <section className="border-b border-hairline bg-ground">
            <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20 lg:px-8 lg:py-16">
              <Reveal>
                <div className="flex flex-col gap-4 lg:sticky lg:top-24">
                  <span className="eyebrow">Straight answers</span>
                  <h2 className="text-section text-balance text-ink">
                    Before you start
                    <span className="text-signal">.</span>
                  </h2>
                  {/* Said "the three that actually stop people" while the list held five. A page
                      whose whole argument is that we check things should not miscount its own
                      section, and the number was load-bearing for nobody. */}
                  <p className="max-w-xs text-[15px] leading-relaxed text-ink-soft">
                    The questions that actually stop people. Anything still
                    unclear is worth an email.
                  </p>
                </div>
              </Reveal>

              <div className="flex flex-col divide-y divide-hairline border-y border-hairline">
                {FAQ.map((item, index) => (
                  <Reveal key={item.q} delay={index * 60}>
                    <details className="group py-5">
                      <summary className="flex cursor-pointer list-none items-baseline justify-between gap-6 text-[16px] font-semibold text-ink transition-colors hover:text-signal">
                        {item.q}
                        <Icon
                          name="chevron-down"
                          className="mt-1 h-4 w-4 shrink-0 text-ink-faint transition-transform duration-200 group-open:rotate-180"
                        />
                      </summary>
                      <p className="mt-3 max-w-[68ch] text-[14px] leading-relaxed text-ink-soft">
                        {item.a}
                      </p>
                    </details>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          {/* One last door, for the reader who scrolled the whole page before deciding.

              On Signal Wash rather than white: it is the only section whose job is a single action,
              and the accent's own tint says so without a second button or a louder word. It is also
              the fourth ground on a page that had two, which is what stops the last screen before the
              footer reading as more of the same. */}
          <section className="bg-signal-wash">
            <div className="mx-auto w-full max-w-6xl px-4 py-20 text-center sm:px-6 lg:px-8 lg:py-24">
              <Reveal>
                <div className="flex flex-col items-center gap-6">
                  <h2 className="max-w-xl text-display text-balance text-ink">
                    Ready to see what the software sees
                    <span className="text-signal">?</span>
                  </h2>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={picker.open}
                      className="btn btn-primary px-7 py-3.5 text-[16px]"
                    >
                      Add your CV
                      <Icon name="arrow-right" className="h-[18px] w-[18px]" />
                    </button>
                    <a
                      href="#upload"
                      className="btn btn-quiet bg-ground px-6 py-3.5 text-[15px]"
                    >
                      Or write one from nothing
                    </a>
                  </div>
                </div>
              </Reveal>
            </div>
          </section>
        </main>

        {/*
          A footer somebody can find something in.

          Two links was not a footer, it was the end of the page. Every competitor's carries the four
          things a person looks for before they trust a stranger with their employment history, and
          the absence of them reads as a site that has not thought about being answerable to anyone.

          Nothing here is invented: it links only to pages that exist, and it says out loud that this
          product has no company behind it yet, which is a fact a reader is entitled to before they
          upload. When there is one, this is where its name goes.
        */}
        <footer className="border-t border-hairline bg-band">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
            <div className="flex flex-col gap-3">
              <Wordmark className="text-[17px]" />
              <p className="max-w-xs text-[13px] leading-relaxed text-ink-soft">
                A CV that automated screening can actually read. We check by
                parsing it back, rather than claiming it parses.
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                The product
              </span>
              <button
                type="button"
                onClick={picker.open}
                className="self-start text-[13px] text-ink-soft transition-colors hover:text-signal"
              >
                Add your CV
              </button>
              <button
                type="button"
                onClick={() => void loadSample('nurse-senior')}
                className="self-start text-[13px] text-ink-soft transition-colors hover:text-signal"
              >
                See a finished example
              </button>
              <a
                href="#upload"
                className="text-[13px] text-ink-soft transition-colors hover:text-signal"
              >
                What we can read
              </a>
            </div>

            <div className="flex flex-col gap-2.5">
              <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                Straight answers
              </span>
              <a
                href="/privacy"
                className="text-[13px] text-ink-soft transition-colors hover:text-signal"
              >
                What we do with your data
              </a>
              <a
                href="mailto:hello@hunterready.dev"
                className="text-[13px] text-ink-soft transition-colors hover:text-signal"
              >
                Ask us something
              </a>
            </div>
          </div>
          <div className="border-t border-hairline">
            <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
              <p className="text-meta leading-relaxed text-ink-soft">
                HunterReady is in development and free to use. There is no
                company behind it yet and no paid plan open. When there is, both
                will be named here.
              </p>
            </div>
          </div>
        </footer>
      </div>
    )
  }

  const template = templates[templateId]
  /*
    The preview is painted with the same two functions the renderer uses, so what is on screen and
    what downloads cannot drift. `withColours` throws on a pairing below the floor; the picker never
    submits one, and the catch keeps a bad value from blanking the workspace.
  */
  const theme = (() => {
    const base = getTheme(themeId)
    let next = base
    try {
      next = withColours(base, customColours)
    } catch {
      /* Refused pairing: keep the design's own colours until the picker offers a legible one. */
    }
    if (customFonts.body === undefined && customFonts.heading === undefined) {
      return next
    }
    return {
      ...next,
      typography: {
        ...next.typography,
        body: {
          ...next.typography.body,
          fontFamily: quoteFamily(
            customFonts.body ?? next.typography.body.fontFamily,
          ),
        },
        heading: {
          ...next.typography.heading,
          fontFamily: quoteFamily(
            customFonts.heading ?? next.typography.heading.fontFamily,
          ),
        },
      },
    }
  })()

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
                    stages={stages}
                    onSubmit={(advert) => void targetJob(advert)}
                  />
                </div>
              ) : (
                <>
                  <TargetPanel
                    resume={loaded.resume}
                    reading={reading}
                    atsVerified={template.atsRating === 'verified'}
                    onUseVariant={(variant) => {
                      setLoaded({ ...loaded, resume: variant })
                      // Reordering moves the bullets the open suggestions point at — same correctness
                      // fix as onFitCv: stale coordinates would overwrite the wrong bullet.
                      setRewrites(undefined)
                      setAccepted(new Set())
                    }}
                    onFitCv={(variant, summary) => {
                      /*
                        The one-click fit: reorderings and the aimed summary applied together, with the
                        comparison switched on so the document pane shows before/after. The original is
                        intact and "Just the new one" is the same toggle back.
                      */
                      setLoaded({
                        ...loaded,
                        resume: {
                          ...variant,
                          basics: {
                            ...variant.basics,
                            ...(summary === undefined ? {} : { summary }),
                          },
                        },
                        // Where this started, so a CV written here still has a "before" to show.
                        fitFrom: loaded.resume,
                      })
                      /*
                        Everything downstream revalidates, not just the document (Edd: "hay que
                        revalidar todo").

                        The wording suggestions are DISCARDED, and that is a correctness fix wearing a
                        UX hat: their {workIndex, highlightIndex} coordinates point at pre-reorder
                        positions, so accepting one after the fit would overwrite the WRONG bullet.
                        Stale advice that misfires is worse than asking again.
                      */
                      setRewrites(undefined)
                      setAccepted(new Set())
                      setRewriteNote(undefined)
                      setComparing(true)
                      /*
                        And come back to the document, because targeting is a separate top-level view
                        that has no comparison surface in it.

                        Leaving the person there was the bug the audit caught: `setComparing(true)`
                        set the state and the URL, `diffResumes` had correctly found the changes, and
                        none of it could be drawn — the only visible answer to "fit my CV" was a move
                        list collapsing to "Nothing worth moving", which reads as nothing having
                        happened. (The first diagnosis blamed `diffResumes` for ignoring array order.
                        It does not; `diffList` detects a reorder. The view was the problem.)

                        The gap report is not lost by leaving: it recomputed against the fitted CV on
                        the way out, `reading` is still held, and "Back to this job" returns to it
                        with one click.
                      */
                      setTargeting(false)
                    }}
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
                      // The narrated wait, same channel as everything else that makes a person wait.
                      progressIdRef.current = crypto.randomUUID()
                      setStages([])
                      setLetterDrafting(true)
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
                            progress: progressIdRef.current,
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
                      } finally {
                        setLetterDrafting(false)
                      }
                    }}
                    letterStages={stages}
                    locale={resolveLocale(loaded.resume.locale)}
                    onTranslateText={async (text) => {
                      try {
                        const response = await fetch('/api/translate', {
                          method: 'POST',
                          headers: { 'content-type': 'application/json' },
                          body: JSON.stringify({
                            text,
                            target: resolveLocale(loaded.resume.locale),
                            processing:
                              consent.choice === 'granted'
                                ? 'provider'
                                : 'local',
                          }),
                        })
                        if (!response.ok) return undefined
                        const payload = (await response.json()) as {
                          text?: unknown
                        }
                        return typeof payload.text === 'string'
                          ? payload.text
                          : undefined
                      } catch {
                        return undefined
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
                    void downloads.start(
                      loaded.resume,
                      templateId,
                      themeId,
                      'pdf',
                      {
                        fonts: customFonts,
                        colours: customColours,
                      },
                    )
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
   * Which document the "Worth knowing" panel is talking about.
   *
   * The warnings themselves are the identity: they are a fixed set of sentences the ingest produced
   * about this file, so two loads that produced the same remarks are, for the purpose of "have I read
   * this already", the same remarks. Cheaper and more honest than a document hash, which would bring
   * the panel back every time somebody edited a bullet it does not mention.
   */
  const noticeKey = `${loaded.origin}|${loaded.warnings.join('|')}`
  /**
   * What the document has gained since it arrived — the number the comparison is offered on.
   *
   * Computed every render rather than memoised: `diffResumes` walks two documents of a few hundred
   * fields, which is nothing beside the sheet being laid out next to it, and a stale diff would offer a
   * comparison of a document that is no longer on screen.
   */
  /**
   * What the comparison compares against, and whether there is one at all.
   *
   * An uploaded CV is measured from the file. A CV written here is measured from the moment before
   * the fit, because its `original` is an empty page and "you typed all of this" is not an
   * achievement worth a side-by-side. Before it has been fitted there is nothing to compare, so the
   * toggle does not appear — which is the honest version of hiding it.
   */
  const comparisonBase =
    loaded.origin === 'blank' ? loaded.fitFrom : loaded.original
  const changes =
    comparisonBase === undefined
      ? []
      : diffResumes(comparisonBase, loaded.resume)
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

  /**
   * One place that knows how to ask for a file, so the button and every item in its menu agree.
   *
   * The two controls used to build their argument lists separately, and they had already drifted: the
   * PDF passed the reader's chosen fonts and colours, the Word button passed none. That was defensible
   * while `.docx` had one fixed layout and no axes to carry — but it is the kind of difference that
   * survives a refactor by accident, and the menu was about to add a third caller to copy it wrong.
   */
  const download = (format: DownloadFormat) =>
    downloads.start(loaded.resume, templateId, themeId, format, {
      fonts: customFonts,
      colours: customColours,
    })

  return (
    <div className="flex min-h-screen flex-col bg-band">
      <StepBar
        onBack={() => {
          /*
            "Start over" has to clear the saved copy too, or the restore on the next mount would put back
            the very CV the person just walked away from — a back arrow that undoes itself.
          */
          clearWorkingCopy()
          setLoaded(undefined)
          setSavedResumeId(undefined)
          setError(undefined)
          /*
            And empty the address bar, or starting over undoes itself on the next reload: `?cv=` would
            still name the CV that was just put away, and the mount effect would fetch it straight back.
            The same trap as forgetting `clearWorkingCopy` here, one layer out.
          */
          void navigate({ replace: true, search: {} })
        }}
        right={
          <SessionControls
            consent={consent}
            onOpenAccount={() => setPanel('account')}
          />
        }
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
            {/*
              Two headings, because there are two situations and one of them was being lied to.

              "Check what we read" is about our reading of a file. Somebody who started from nothing has
              no file and no reading — telling them to check it, and counting details we were unsure of
              in a document nobody parsed, is a sentence with no referent.
            */}
            {/*
              The heading follows the panel, because it used to lie on four screens out of five.

              It branched on where the document came from and never on which panel was open, so
              "Check what we read." sat over the design gallery and over the account controls, and
              under it "Your dates and job titles are the ones worth a second look" made a claim
              about a screen the person had already left. A title that describes the wrong screen is
              worse than no title: it is the one thing on the page a reader trusts without checking.

              Each line is the one fact that screen is about, said once (reference/clarify.md), and
              none of them names a side of the layout, because on a phone there are no sides.
            */}
            <h1 className="text-display text-ink">
              {panel === 'check'
                ? loaded.origin === 'blank'
                  ? 'Write your CV'
                  : 'Check what we read'
                : panel === 'wording'
                  ? 'Sharpen the wording'
                  : panel === 'design'
                    ? 'Choose how it looks'
                    : panel === 'job'
                      ? 'Aim it at one job'
                      : 'Your account'}
              <span className="text-signal">.</span>
            </h1>
            <p className="text-[14px] text-ink-soft">
              {panel === 'check'
                ? loaded.origin === 'blank'
                  ? 'Fill in what you have. The preview updates as you type, and you can download at any point.'
                  : toCheck > 0
                    ? `${toCheck} ${toCheck === 1 ? 'detail is' : 'details are'} worth your eyes. Everything else looked clear.`
                    : 'Your dates and job titles are the ones worth a second look.'
                : panel === 'wording'
                  ? 'Suggestions on your own lines. Nothing changes unless you accept it.'
                  : panel === 'design'
                    ? 'Every layout here has been read back and checked field by field.'
                    : panel === 'job'
                      ? 'Paste an advert and see what it asks for that your CV already shows.'
                      : 'Sign in to keep your CV between visits, or take everything with you.'}
            </p>
          </div>
        </div>

        <WorkspaceSplit
          storageId="hunterready.workspace-split.v1"
          panel={
            <>
              {/* What changes the document, and what still needs checking. */}
              {/*
            One column, five panels, one at a time.

            `overflow-y-auto` moved from the column to the *panel* below: the tab strip has to stay put
            while its content scrolls, or the way back out of a long panel scrolls away with it.
          */}
              <aside className="flex w-full min-w-0 flex-col gap-3 lg:min-h-0">
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
                  {panel === 'check' &&
                    dismissedNotice !== noticeKey &&
                    (loaded.warnings.length > 0 ||
                      fit.advice !== undefined) && (
                      <Alert className="relative rounded-card border-caution/25 bg-caution-wash p-4">
                        <AlertTitle className="pr-7 text-[13px] font-semibold text-caution">
                          Worth knowing
                        </AlertTitle>
                        {/*
                          Dismissible, because it is a remark and not a blocker.

                          It says how the file was read — a table flattened, headings guessed — which is
                          worth knowing exactly once. Unclosable, it sits above the form for the whole
                          session, taking the top of a panel that is one long list of things to correct
                          and pushing the actual work down on every visit to the tab. Nothing is lost by
                          closing it: everything it describes is visible in the fields it is describing,
                          which are marked.

                          It comes back when a different CV is loaded — `noticeDismissed` resets with
                          `loaded` — because then it is a remark about a different document.
                        */}
                        <button
                          type="button"
                          onClick={() => setDismissedNotice(noticeKey)}
                          aria-label="Dismiss this notice"
                          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-caution/70 transition-colors hover:bg-caution/10 hover:text-caution"
                        >
                          <svg
                            aria-hidden
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            className="h-4 w-4"
                          >
                            <path d="M6 6l12 12M18 6 6 18" />
                          </svg>
                        </button>
                        <AlertDescription>
                          <ul className="mt-2 flex flex-col gap-1.5">
                            {loaded.warnings.map((warning, i) => (
                              <li
                                key={i}
                                className="text-[13px] leading-relaxed text-ink"
                              >
                                {warning}
                              </li>
                            ))}
                            {/*
                        Length advice belongs beside the other remarks about the document's content,
                        not as a caption over the render. It is last because it is the softest: the
                        others describe something we could not read, this one describes a judgement
                        call that is the candidate's to make.
                      */}
                            {fit.advice !== undefined && (
                              <li className="text-[13px] leading-relaxed text-ink">
                                {fit.advice}
                              </li>
                            )}
                          </ul>
                        </AlertDescription>
                      </Alert>
                    )}

                  {panel === 'check' && (
                    <ReviewForm
                      resume={loaded.resume}
                      provenance={loaded.provenance}
                      ocr={loaded.ocr}
                      authoring={loaded.origin === 'blank'}
                      /*
                The provenance comes back on structural edits, and taking it is not optional: adding or
                removing a row renumbers every index-based path after it, so keeping the old list would
                leave "we were not sure we read this" pointing at a row the person just typed.
              */
                      onChange={(resume, provenance, edit) => {
                        setLoaded({
                          ...loaded,
                          resume,
                          ...(provenance === undefined ? {} : { provenance }),
                        })
                        /*
                      A structural edit renumbers the coordinates the open suggestions point at, so
                      they shift with it — the same arithmetic the provenance flags just went through.
                      The accepted set is keyed by those coordinates too, so it is rebuilt through the
                      same mapping: an accepted suggestion stays accepted at its new address, and the
                      deleted row's entries leave both lists together.
                    */
                        if (edit !== undefined && rewrites !== undefined) {
                          const moved = rewrites.flatMap((entry) => {
                            const next = shiftTarget(entry, edit)
                            return next === undefined
                              ? []
                              : [{ before: keyOf(entry), entry: next }]
                          })
                          setRewrites(moved.map((m) => m.entry))
                          setAccepted(
                            (current) =>
                              new Set(
                                moved
                                  .filter((m) => current.has(m.before))
                                  .map((m) => keyOf(m.entry)),
                              ),
                          )
                        }
                      }}
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
                      {/*
                    Language, at the head of Wording — moved here from Design at Edd's direction: it is
                    a decision about *words*, and this is the words panel. Switching now translates the
                    whole document (src/optimize/translate.ts carries the guards and the history of the
                    line it moves); the wait narrates itself below, and the comparison opens after.
                  */}
                      <div className="flex flex-col gap-2 border-b border-hairline pb-4">
                        <Segmented
                          label="Language"
                          options={localeOptions().map((option) => ({
                            id: option.id,
                            label: option.label,
                            hint: 'The whole document: headings, dates and your own words. We show you the before and after.',
                          }))}
                          value={resolveLocale(loaded.resume.locale)}
                          onChange={(locale) => void switchLanguage(locale)}
                        />
                        {translating && stages.length > 0 && (
                          <ol className="flex flex-col gap-1.5">
                            {stages.map((stage, index) => (
                              <li
                                key={index}
                                className="flex items-center gap-2 text-[13px]"
                              >
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
                                  <Spinner className="h-3 w-3 shrink-0 text-signal" />
                                )}
                                <span
                                  className={
                                    stage.done
                                      ? 'text-ink-faint'
                                      : 'text-ink-soft'
                                  }
                                >
                                  {stage.label}
                                  {stage.detail === undefined
                                    ? ''
                                    : `. ${stage.detail}`}
                                </span>
                              </li>
                            ))}
                          </ol>
                        )}
                        {translateNote !== undefined && (
                          <p
                            role="status"
                            className="text-[13px] leading-relaxed text-ink-soft"
                          >
                            {translateNote}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col gap-1">
                        <h2 className="text-[15px] font-semibold text-ink">
                          Wording
                        </h2>
                        <p className="text-[13px] leading-relaxed text-ink-soft">
                          Once your details are right, we can suggest stronger
                          wording for each bullet. Nothing changes unless you
                          accept it.
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
                          {rewriting && rewriteChecklist === undefined && (
                            <span
                              role="status"
                              className="text-meta leading-relaxed text-ink-soft"
                            >
                              One pass over every bullet. The longer your
                              history, the longer this takes.
                            </span>
                          )}
                          {rewriteChecklist !== undefined && (
                            <div className="flex max-h-72 flex-col gap-2 overflow-y-auto rounded-field border border-hairline bg-ground px-3 py-2.5">
                              {/*
                            Every bullet named before the first model call, ticked green as each one
                            finishes. The queue is the progress bar — no percentage can lie about what
                            is left when what is left is listed.
                          */}
                              {rewriteChecklist.map((entry, i) => {
                                const previous = rewriteChecklist[i - 1]
                                const showCompany =
                                  previous === undefined ||
                                  previous.company !== entry.company
                                return (
                                  <div key={i} className="flex flex-col gap-1">
                                    {showCompany && (
                                      <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-faint first:mt-0">
                                        {entry.company}
                                      </span>
                                    )}
                                    <span className="flex items-start gap-2">
                                      {entry.status === 'done' ? (
                                        <svg
                                          aria-hidden
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2.6"
                                          strokeLinecap="round"
                                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-affirm"
                                        >
                                          <path d="m5 12.5 4.5 4.5L19 7" />
                                        </svg>
                                      ) : entry.status === 'working' ? (
                                        <Spinner className="mt-0.5 h-3 w-3 shrink-0 text-signal" />
                                      ) : entry.status === 'failed' ? (
                                        <span
                                          aria-label="skipped"
                                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-center text-[11px] font-bold leading-none text-caution"
                                        >
                                          !
                                        </span>
                                      ) : (
                                        <span
                                          aria-hidden
                                          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full border border-hairline-strong"
                                        />
                                      )}
                                      <span
                                        className={`line-clamp-1 text-[12px] leading-relaxed ${
                                          entry.status === 'done'
                                            ? 'text-ink-faint'
                                            : 'text-ink-soft'
                                        }`}
                                      >
                                        {entry.text}
                                      </span>
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {rewriteChecklist !== undefined && (
                            <div className="flex max-h-72 flex-col gap-2 overflow-y-auto rounded-field border border-hairline bg-ground px-3 py-2.5">
                              {/*
                            Every bullet named before the first model call, ticked green as each one
                            finishes. The queue is the progress bar — no percentage can lie about what
                            is left when what is left is listed.
                          */}
                              {rewriteChecklist.map((entry, i) => {
                                const previous = rewriteChecklist[i - 1]
                                const showCompany =
                                  previous === undefined ||
                                  previous.company !== entry.company
                                return (
                                  <div key={i} className="flex flex-col gap-1">
                                    {showCompany && (
                                      <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-faint first:mt-0">
                                        {entry.company}
                                      </span>
                                    )}
                                    <span className="flex items-start gap-2">
                                      {entry.status === 'done' ? (
                                        <svg
                                          aria-hidden
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2.6"
                                          strokeLinecap="round"
                                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-affirm"
                                        >
                                          <path d="m5 12.5 4.5 4.5L19 7" />
                                        </svg>
                                      ) : entry.status === 'working' ? (
                                        <Spinner className="mt-0.5 h-3 w-3 shrink-0 text-signal" />
                                      ) : entry.status === 'failed' ? (
                                        <span
                                          aria-label="skipped"
                                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-center text-[11px] font-bold leading-none text-caution"
                                        >
                                          !
                                        </span>
                                      ) : (
                                        <span
                                          aria-hidden
                                          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full border border-hairline-strong"
                                        />
                                      )}
                                      <span
                                        className={`line-clamp-1 text-[12px] leading-relaxed ${
                                          entry.status === 'done'
                                            ? 'text-ink-faint'
                                            : 'text-ink-soft'
                                        }`}
                                      >
                                        {entry.text}
                                      </span>
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                          {rewrites.filter(
                            (entry) =>
                              entry.suggestion !== undefined &&
                              !accepted.has(keyOf(entry)),
                          ).length >= 2 && (
                            <button
                              type="button"
                              onClick={acceptAllRewrites}
                              className="btn btn-quiet self-start px-4 py-2 text-[13px]"
                            >
                              Accept all{' '}
                              {
                                rewrites.filter(
                                  (entry) =>
                                    entry.suggestion !== undefined &&
                                    !accepted.has(keyOf(entry)),
                                ).length
                              }{' '}
                              suggestions
                            </button>
                          )}
                          <RewriteReview
                            rewrites={rewrites}
                            accepted={accepted}
                            onAccept={acceptRewrite}
                            onDismiss={dismissRewrite}
                            onAnswer={(answers) => void askForRewrites(answers)}
                            busy={rewriting}
                          />
                        </div>
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
                    <div className="flex flex-col gap-4">
                      {/*
                    The standing answer to "who reads my CV", reachable at any moment.

                    It lives here rather than beside a button because it is a fact about the person,
                    not about one action — it governs reading, rewriting, targeting, the letter and
                    the translation alike. The gate still asks once on the first upload; this is
                    where the answer lives afterwards, which is what makes the gate's promise true.
                  */}
                      <ProcessingChoice
                        provider={consent.provider}
                        choice={consent.choice}
                        onDecide={consent.decide}
                        Control={Segmented}
                      />
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
                    </div>
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
                          requirements your CV already answers, which are
                          buried, and which are missing. We never add one you
                          have not claimed.
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
                          point, and nothing about your CV is rewritten.
                        </p>
                        {/*
                      Said here because a control that only appears on hover is a control most people
                      never find. The card's "Full page" button is deliberately quiet so that a
                      hundred of them do not shout; the cost of that is one sentence of telling.
                    */}
                        <p className="text-[13px] leading-relaxed text-ink-soft">
                          To see a whole page before choosing, use{' '}
                          <strong className="font-semibold text-ink">
                            Full page
                          </strong>{' '}
                          on any card. From there the arrows, or the left and
                          right keys, walk the rest without closing it.
                        </p>
                      </div>

                      {previousLook !== undefined && (
                        /*
                      Offered rather than announced: a banner every time somebody picks a card would be
                      noise on the action they most repeat. It sits where the change happened and says
                      what it goes back *to*, because "Undo" alone asks the reader to remember.
                    */
                        <button
                          type="button"
                          onClick={() => {
                            setTemplateId(previousLook.templateId)
                            setThemeId(previousLook.themeId)
                            setCustomFonts(previousLook.fonts)
                            setCustomColours(previousLook.colours)
                            setPreviousLook(undefined)
                          }}
                          className="btn btn-quiet self-start px-3 py-1.5 text-[13px]"
                        >
                          <Icon name="arrow-left" className="h-4 w-4" />
                          Back to {previousLook.label}
                        </button>
                      )}

                      <DesignGallery
                        templateId={templateId}
                        themeId={themeId}
                        resume={loaded.resume}
                        /*
                      `=== true` on purpose: the field is `undefined` until the server answers, and an
                      unknown entitlement must draw as locked rather than as unlocked. A padlock that
                      appears a moment late is untidy; one that vanishes a moment late offers something
                      the render endpoint will refuse.
                    */
                        entitled={consent.paidDesigns === true}
                        onChoose={(design) => {
                          setPreviousLook({
                            templateId,
                            themeId,
                            fonts: customFonts,
                            colours: customColours,
                            label:
                              DESIGNS.find(
                                (d) =>
                                  d.structure === templateId &&
                                  d.theme === themeId,
                              )?.label ?? 'the last look',
                          })
                          setTemplateId(design.structure)
                          setThemeId(design.theme)
                        }}
                      />

                      <DesignAxes
                        axes={{ fonts: customFonts, colours: customColours }}
                        /*
                      The same flag the gallery reads, and for the same reason it uses `=== true`: the
                      field is `undefined` until the server answers, and an unknown entitlement has to
                      draw as locked. Offering the pickers a moment early would offer something
                      `/api/render` then refuses.
                    */
                        entitled={consent.paidDesigns === true}
                        defaults={{
                          body: getTheme(
                            themeId,
                          ).typography.body.fontFamily.replace(
                            /^["']|["']$/g,
                            '',
                          ),
                          heading: getTheme(
                            themeId,
                          ).typography.heading.fontFamily.replace(
                            /^["']|["']$/g,
                            '',
                          ),
                          accent:
                            styleOf(getTheme(themeId)).accent ??
                            getTheme(themeId).colors.primary,
                          paper: getTheme(themeId).colors.background,
                        }}
                        onChange={(next) => {
                          setCustomFonts(next.fonts)
                          setCustomColours(next.colours)
                        }}
                      />
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
                {/*
                  Pinned to the bottom, and `sticky` rather than `fixed`.

                  It was already outside the scrolling panel, which pins it whenever the workspace owns
                  the scroll — and on a short viewport the *page* owns the scroll instead, so the last
                  action slid away under the fold exactly when the column was longest. `sticky bottom-0`
                  holds it in both cases without taking it out of the flow: `fixed` would need a matching
                  spacer under the column or the final section would sit behind it forever.

                  The background is opaque and the shadow is DESIGN.md's elevation, saying the true
                  thing — this surface is above the one scrolling past beneath it.
                */}
                <div className="lift sticky bottom-0 z-10 -mx-1 flex shrink-0 flex-col gap-2 border-t border-hairline bg-band px-1 pb-1 pt-3">
                  {/*
                One button, and a menu beside it — Edd's ask, and the split is the point.

                Two full-width buttons stacked said the choice was even. It is not: the PDF is what
                almost everyone sends, and it is the one whose look they have just spent time choosing.
                Word is for the portals that demand it. A split control puts the common case one click
                away and the other one two, which is the true shape of the decision, and it gives back
                the vertical space a second pill was taking from the panel above.

                Disabled on a locked design rather than left to fail at the endpoint. `/api/render` is
                the real gate — a client cannot be trusted with one — but letting somebody press a
                button whose only possible outcome is a refusal is not respect for the gate, just a
                worse way to say no.
              */}
                  <div className="flex w-full items-stretch gap-px">
                    <button
                      type="button"
                      disabled={
                        downloads.busyFormat !== undefined || lockedDesign
                      }
                      aria-busy={downloads.busyFormat === 'pdf'}
                      onClick={() => void download('pdf')}
                      className="btn btn-primary flex-1 rounded-r-none px-6 py-3 text-[15px]"
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
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        disabled={
                          downloads.busyFormat !== undefined || lockedDesign
                        }
                        aria-label="Choose another format"
                        className="btn btn-primary rounded-l-none px-3 py-3 disabled:pointer-events-none disabled:opacity-50"
                      >
                        <Icon
                          name="chevron-down"
                          className="h-[18px] w-[18px]"
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[17rem]">
                        <DropdownMenuItem
                          onSelect={() => void download('pdf')}
                          className="flex-col items-start gap-0.5"
                        >
                          <span className="text-[14px] font-semibold text-ink">
                            PDF
                          </span>
                          <span className="text-[12px] leading-snug text-ink-soft">
                            The design you chose, checked by the parse test.
                          </span>
                        </DropdownMenuItem>
                        {/*
                          Word says what it is *for* rather than what it is. Nobody prefers .docx; they
                          are told to upload one, and that is the moment this menu has to answer.
                        */}
                        <DropdownMenuItem
                          onSelect={() => void download('docx')}
                          className="flex-col items-start gap-0.5"
                        >
                          <span className="text-[14px] font-semibold text-ink">
                            Word (.docx)
                          </span>
                          <span className="text-[12px] leading-snug text-ink-soft">
                            For portals that ask for a Word file. One fixed
                            layout, not the design.
                          </span>
                        </DropdownMenuItem>
                        {/*
                          HTML says what it is *not*, because that is the surprising half. It carries
                          the design faithfully — same template, same theme, fonts embedded — and it has
                          no pages, which is the one thing somebody expecting "the PDF as a web page"
                          would otherwise discover after sending it.
                        */}
                        <DropdownMenuItem
                          onSelect={() => void download('html')}
                          className="flex-col items-start gap-0.5"
                        >
                          <span className="text-[14px] font-semibold text-ink">
                            Web page (.html)
                          </span>
                          <span className="text-[12px] leading-snug text-ink-soft">
                            The same design, one continuous page, fonts
                            included. Opens anywhere, offline.
                          </span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {lockedDesign && (
                    <p className="text-meta leading-relaxed text-ink-soft">
                      Pick a design marked Included to download, or keep this
                      one to compare.
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
            </>
          }
          document={
            /*
            The document. It is the only element in this world allowed real visual density, and it
            keeps its own surround so it reads as a sheet on a desk rather than as another panel.
          */
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
                  {/*
                  And never on a CV written here, whatever the diff says.

                  Found in the browser walk: authoring one from scratch put "5 changes since you
                  uploaded it" over a blank sheet labelled "the file you already had". Nothing was
                  uploaded and there is no before — the diff against an empty document is just a list
                  of everything the person has typed, presented as an achievement over a file that
                  never existed. Same falsehood as the counter and the empty states, one pane over.
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
                  download any design marked <strong>Included</strong>, which
                  produce the same document, checked by the same parse test.
                </p>
              )}
              {/*
              The fit advice used to sit here, in a band across the top of the paper. It is a remark
              about the *content* — that a fifteen-year history squeezed onto one page has probably
              lost something — and content is what the Check panel is for. Above the document it read
              as a caption on the render, which is the one thing it is not about, and it was there on
              every panel including the ones where nobody is editing anything.
            */}
              {/*
              Comparing replaces the preview rather than opening beside it or over it. A modal would put
              the achievement in a box to be dismissed, and a third column would shrink both sheets to
              the point where neither is legible. The switch is one click away in either direction, which
              is what makes replacing it safe — every station in this flow is re-enterable.
            */}
              {/*
              `changes.length > 0` as well as `comparing`, because `compare=true` is now something a URL
              can assert and a URL can be wrong.

              The toggle button lives inside the `changes.length > 0` block above, so a comparison of an
              unchanged document — a link followed after the edits were saved, say, which makes the current
              CV its own "before" — would render two identical sheets with no way back but editing the
              address bar. Ignoring the flag instead is the same rule the search validator follows: an
              impossible request falls back to the ordinary screen rather than to a dead end.
            */}
              {comparing && changes.length > 0 ? (
                <BeforeAfter
                  original={comparisonBase ?? loaded.original}
                  current={loaded.resume}
                  changes={changes}
                  theme={theme}
                  Template={template.Component}
                  since={loaded.origin === 'blank' ? 'fit' : 'upload'}
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
          }
        />
      </div>
    </div>
  )
}
