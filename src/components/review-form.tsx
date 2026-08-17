/**
 * Step 2 — Check. The review form.
 *
 * The honesty mechanism of the whole product lives here: fields the extraction was unsure about
 * are marked, with the line they came from, so the user is *checking our work* rather than
 * retyping their life (docs/03-resume-schema.md, docs/11-flow.md).
 *
 * Deliberately not one-question-per-screen yet — that is the generated Check flow, and it needs
 * the questions to come from provenance rather than from a script (ADR-011). This is the form
 * underneath it: sections collapsed by default, uncertain ones open.
 */
import { Fragment, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { DateField } from '@/components/date-field'
import { PhotoField } from '@/components/photo-field'
import {
  CONFIDENCE_REVIEW_THRESHOLD,
  needsReview,
  shiftProvenance,
} from '@/schema/provenance'
import type { StructuralEdit } from '@/optimize/rewrite-shift'
import type { FieldProvenance } from '@/schema/provenance'
import { DEFAULT_SPACE, isSpacer } from '@/schema/resume'
import type { Resume } from '@/schema/resume'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatRange } from '@/render/format'
import { ExtraSections } from '@/components/extra-sections'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ButtonGroup, ButtonGroupSeparator } from '@/components/ui/button-group'
import { orderedSections, tokenFor } from '@/render/sections'
import type { SectionName } from '@/render/sections'

/** What each named section is called on screen, for the tooltips that name a neighbour. */
const SECTION_TITLES: Record<SectionName, string> = {
  work: 'Experience',
  education: 'Education',
  skills: 'Skills',
  projects: 'Projects',
  certifications: 'Certifications',
  languages: 'Languages',
  awards: 'Awards',
  publications: 'Publications',
  volunteer: 'Volunteering',
}

/** Matches the schema's ceiling. A gap taller than this is a blank page nobody meant to send. */
const MAX_SPACE = 240

/** Provenance is keyed by dot path; look up the closest entry covering a field. */
function useProvenanceIndex(provenance: Array<FieldProvenance>) {
  return useMemo(() => {
    const byPath = new Map<string, FieldProvenance>()
    for (const entry of provenance) {
      const existing = byPath.get(entry.path)
      // Keep the least confident claim about a path: that is the one worth surfacing.
      if (existing === undefined || entry.confidence < existing.confidence) {
        byPath.set(entry.path, entry)
      }
    }
    return byPath
  }, [provenance])
}

/**
 * Caution, not alert.
 *
 * "We were not sure we read this correctly" is a question, and a red badge would make it read as an
 * error the user caused. The amber is the same token the "worth knowing" panel uses, so the two
 * things that mean "have a look" look alike.
 */
function Flag({ entry }: { entry: FieldProvenance | undefined }) {
  if (entry === undefined || !needsReview(entry)) return null
  return (
    <span
      title={
        entry.sourceText === undefined
          ? 'We were not confident about this one.'
          : `We read this from: “${entry.sourceText}”`
      }
      className="inline-flex items-center gap-1 rounded-full bg-caution-wash px-1.5 py-0.5 text-[11px] font-semibold text-caution"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="h-3 w-3"
      >
        <path d="M12 8v5m0 3.5v.01" />
        <circle cx="12" cy="12" r="9" />
      </svg>
      check
    </span>
  )
}

function Field({
  label,
  value,
  onChange,
  provenance,
  multiline = false,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  provenance?: FieldProvenance
  multiline?: boolean
}) {
  const flagged = provenance !== undefined && needsReview(provenance)
  const shared = flagged ? 'field field-flagged' : 'field'

  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
        {label}
        <Flag entry={provenance} />
      </span>
      {multiline ? (
        <AutoTextarea
          value={value}
          minRows={3}
          onChange={onChange}
          className={shared}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={shared}
        />
      )}
    </label>
  )
}

/**
 * Remove a row, and add a row.
 *
 * A quiet button, never the red one. DESIGN.md reserves Alert for account deletion, and it is right to:
 * this is reversible — see the undo strip — and colouring it like the irreversible action would teach
 * people to fear a control that costs them nothing. CLAUDE.md's rule is that nothing here is
 * irreversible *and* nothing warns that it is.
 */
function RemoveRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex shrink-0 items-center gap-1.5 self-start rounded-full px-2 py-1 text-[12px] font-medium text-ink-soft transition-colors hover:bg-band hover:text-ink"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5"
      >
        <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
      </svg>
      Remove
    </button>
  )
}

/**
 * One editable line, and the control that removes it, in a container of their own.
 *
 * They used to sit side by side — a textarea with "Remove" pinned to its right. That gave the least
 * width to the longest thing on the page (a sentence somebody is writing about their own work, which
 * wraps after four or five words in a squeezed box), and it put the control that deletes that
 * sentence directly beside the cursor writing it. Edd's words: the button goes under the text, the
 * text takes the whole column, and the pair sits in a bubble that separates it from the next line.
 *
 * Tinted and flat, never a `.card`. DESIGN.md's elevation rule says a shadow means "this surface is
 * above that one", and these are *inside* an open section — a nested card would claim a layer it does
 * not have. Recessed says the true thing: a well holding one line of the document.
 */
function LineBubble({
  children,
  removeLabel,
  onRemove,
}: {
  children: React.ReactNode
  removeLabel: string
  onRemove: () => void
}) {
  return (
    <div className="flex flex-col gap-2 rounded-choice border border-hairline bg-band p-2.5">
      {children}
      <RemoveRow label={removeLabel} onClick={onRemove} />
    </div>
  )
}

/**
 * A textarea that is always exactly as tall as what is written in it.
 *
 * A fixed `rows={2}` hid the end of the sentence the moment the column got narrow — on a phone, the
 * third line of a bullet sat behind a scrollbar inside a box two lines high, in the panel whose entire
 * job is *checking what we read*. You cannot check a line you cannot see. Two rows is the floor, not
 * the ceiling: it grows to the text and shrinks back when the text does.
 *
 * `useLayoutEffect` rather than `useEffect` so the height is set before the browser paints — measuring
 * after paint makes the box visibly jump on every keystroke. The `height: auto` first is not
 * redundant: `scrollHeight` on an already-stretched element reports the old height forever, so
 * deleting text would never shrink it back.
 */
function AutoTextarea({
  value,
  onChange,
  className,
  ariaLabel,
  minRows = 2,
}: {
  value: string
  onChange: (next: string) => void
  className: string
  ariaLabel?: string
  minRows?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      {...(ariaLabel === undefined ? {} : { 'aria-label': ariaLabel })}
      onChange={(event) => onChange(event.target.value)}
      className={`${className} resize-none overflow-hidden leading-relaxed`}
    />
  )
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn btn-quiet self-start px-3.5 py-2 text-[13px]"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="h-4 w-4"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
      {label}
    </button>
  )
}

/**
 * A header control: move up, move down, remove.
 *
 * The glyphs are drawn here in the same 24-grid at the same 1.8 stroke as the bin in `RemoveRow`,
 * because DESIGN.md allows one icon family and the bin is already a member of it. `lucide-react` is in
 * the tree but only inside the vendored calendar, and borrowing from it here would put two stroke
 * weights in one header row.
 */
function HeaderIcon({ shape }: { shape: 'up' | 'down' | 'bin' }) {
  /*
    Arrows with a stem, not chevrons — and that is the fix rather than a preference.

    "Move down" was `m6 9 6 6 6-6`, which is character for character the same path as the chevron that
    expands the section, sitting four pixels away from it in the same row at the same weight. Two
    controls that do entirely different things drawn as the same glyph: one opens the section, one
    moves it past its neighbour. A stem makes it an arrow — it points somewhere, which is what moving
    is — and leaves the bare chevron to mean "unfold", which is what it means everywhere else.
  */
  const paths = {
    up: <path d="M12 19V5m-6 6 6-6 6 6" />,
    down: <path d="M12 5v14m6-6-6 6-6-6" />,
    bin: <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />,
  }
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      {paths[shape]}
    </svg>
  )
}

/**
 * A header control, and the sentence that says what it does.
 *
 * `title` was doing this job and doing it badly. The browser's own tooltip waits a second or more,
 * appears in the OS's font at the pointer rather than beside the control, and never shows at all on a
 * touch screen — and these three buttons are 28px icons with no text, which is exactly the case where
 * the reader most needs telling. Edd: *"estos botones necesitan ser mas descriptivos, incluso con
 * tooltips de ser necesario."*
 *
 * So the label is a full sentence about the **consequence** ("Move Referencer above References") rather
 * than a name for the control ("Up"), it is the accessible name as well as the tooltip, and it is drawn
 * by the same `Tooltip` the design gallery uses so there is one tooltip in the product.
 *
 * A disabled trigger fires no pointer events, so its tooltip would never open — the wrapper is on a
 * `span` for that reason, which stays live when the button inside it does not.
 */
function HeaderButton({
  label,
  onClick,
  disabled,
  grouped = false,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  /** Inside a `ButtonGroup`: square off the corners so the group draws the shape, not each button. */
  grouped?: boolean
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            className={`flex h-7 w-7 shrink-0 items-center justify-center text-ink-faint transition-colors hover:bg-band hover:text-ink disabled:pointer-events-none disabled:opacity-25 ${
              grouped
                ? 'first:rounded-l-full last:rounded-r-full'
                : 'rounded-full'
            }`}
          >
            {children}
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * A spacer, as it appears in the panel: a rule with a number on it.
 *
 * Drawn as the thing it produces rather than described in words. A row reading "Spacer — 25px" would
 * be a label for an effect nobody can see from the form; a dashed rule with room around it is a
 * picture of the gap, at roughly the proportion the document will have. The number is editable in
 * place because that is the only property it has.
 *
 * The input is a `number` field and not a slider: people arriving here have a specific gap in mind —
 * they are matching the space above another section — and a slider makes an exact value the hardest
 * thing to reach.
 */
function SpacerRow({
  space,
  onChange,
  actions,
}: {
  space: number
  onChange: (space: number) => void
  actions: React.ReactNode
}) {
  return (
    <div className="card flex items-center gap-3 px-4 py-3">
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <span className="text-[15px] font-semibold text-ink">Space</span>
        <span
          aria-hidden
          className="h-px min-w-6 flex-1 border-t border-dashed border-hairline-strong"
        />
      </span>
      <label className="flex shrink-0 items-center gap-1.5">
        <span className="sr-only">Space above and below, in pixels</span>
        <input
          type="number"
          min={0}
          max={MAX_SPACE}
          step={5}
          value={space}
          onChange={(event) => {
            const next = Number(event.target.value)
            // A cleared field reads as NaN. Treat it as 0 rather than writing NaN into the document,
            // which would fail the schema on the next render and lose the section.
            onChange(
              Number.isFinite(next)
                ? Math.min(MAX_SPACE, Math.max(0, Math.round(next)))
                : 0,
            )
          }}
          className="field w-[4.5rem] py-1 text-center text-[13px]"
        />
        <span className="text-[13px] text-ink-soft">px</span>
      </label>
      {actions}
    </div>
  )
}

/**
 * What a person can add to their CV, and the one place the list lives.
 *
 * ## Why a table and not two buttons
 *
 * Because it is about to be longer than two. `custom` started as "a section this CV has that our
 * schema does not name", then gained a spacer, and a spacer is not a section — it is a *block*. pdfcn
 * publishes twenty-four components and roughly half of them are things a CV could legitimately hold:
 * a rule between sections, a page break before the references, a paragraph that belongs to no heading,
 * a label/value pair. Each of those is another entry here and another arm of `renderBlock`, and
 * nothing else has to move.
 *
 * ## What will never be in this list
 *
 * Tables, page headers and footers, watermarks, QR codes and charts. Not an oversight and not a
 * roadmap item — every one of them breaks the single promise this product makes. docs/05: a table is
 * the commonest way a CV loses its employment history in a screener; header and footer regions are
 * discarded by many parsers, so anything only there is gone; a chart and a QR code extract as nothing
 * at all, which makes them a claim the reader can see and the software cannot. The round-trip test
 * would fail every one of them, and it would be right to.
 */
const BLOCKS = [
  {
    key: 'section',
    label: 'A section',
    hint: 'A heading and its lines — courses, volunteering, awards, references.',
    make: () => ({ title: '', items: [''] }),
  },
  {
    key: 'space',
    label: 'Space',
    hint: 'Room between two sections. 25px above and below, adjustable.',
    make: () => ({ title: '', items: [], space: DEFAULT_SPACE }),
  },
] as const

function AddMenu({
  onAdd,
}: {
  onAdd: (block: Resume['custom'][number]) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Add something to your CV"
        className="ml-auto flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-hairline-strong bg-ground px-3.5 text-[13px] font-semibold text-signal transition-colors hover:bg-signal-wash"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="h-4 w-4"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[17rem]">
        {BLOCKS.map((block) => (
          <DropdownMenuItem
            key={block.key}
            onSelect={() => onAdd(block.make())}
            className="flex-col items-start gap-0.5"
          >
            <span className="text-[14px] font-semibold text-ink">
              {block.label}
            </span>
            <span className="text-[12px] leading-snug text-ink-soft">
              {block.hint}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Section({
  title,
  count,
  flagged,
  children,
  defaultOpen,
  actions,
}: {
  title: string
  count?: number
  /**
   * How many fields in this section we were unsure about.
   *
   * A number rather than the "needs a look" pill it replaces. The pill said *that* something in the
   * section wanted checking and never *how much*, so a section hiding one soft flag looked exactly
   * like one hiding nine — and the only way to find out was to open all of them in turn, which is the
   * work the collapsed list exists to save. Edd asked for the count in the header, and the header is
   * where the decision about whether to open it gets made.
   */
  flagged: number
  children: React.ReactNode
  defaultOpen: boolean
  /**
   * Controls that act on the section itself, drawn beside the toggle rather than inside it.
   *
   * Beside, because a button inside a button is invalid HTML and browsers resolve it by guessing —
   * usually by firing both, so "remove this section" would also toggle it open on the way out.
   */
  actions?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-1 pr-2 transition-colors hover:bg-band">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-ink">
              {title}
            </span>
            {count !== undefined && (
              <span className="tally shrink-0 rounded-full bg-band px-1.5 py-0.5 text-[12px] font-semibold text-ink-soft">
                {count}
              </span>
            )}
            {flagged > 0 && (
              <span className="shrink-0 rounded-full bg-caution-wash px-2 py-0.5 text-[11px] font-semibold text-caution">
                {/* "1 to check", not "1 needs a look": it is the same word the panel's tally uses. */}
                {flagged} to check
              </span>
            )}
          </span>
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-4 w-4 shrink-0 text-ink-faint transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {actions}
      </div>
      {open && (
        <div className="flex flex-col gap-4 border-t border-hairline px-4 pb-4 pt-4">
          {children}
        </div>
      )}
    </div>
  )
}

/** A row lifted out of the CV, kept whole so undo restores it exactly rather than approximately. */
type Removed = {
  /** Which list, as a provenance prefix: `work`, `education`, `skills`. */
  list: 'work' | 'education' | 'skills'
  at: number
  row: unknown
  /** The flags that belonged to it. Restored with it, or the undo would quietly launder the row. */
  provenance: Array<FieldProvenance>
  /** What to call it in the undo strip. Never a field we are unsure we read — see `describe`. */
  label: string
}

export function ReviewForm({
  resume,
  provenance,
  onChange,
  ocr = false,
  authoring = false,
  photoShown = false,
  onUseEuropeanLayout,
}: {
  resume: Resume
  provenance: Array<FieldProvenance>
  /**
   * The provenance travels with the resume on **structural** edits.
   *
   * Adding or removing a row renumbers every path after it, so the caller has to accept both or the
   * flags end up on the wrong rows — see `shiftProvenance`. Field edits leave the shape alone and pass
   * nothing, which is why this is optional rather than always required.
   */
  onChange: (
    next: Resume,
    provenance?: Array<FieldProvenance>,
    /**
     * Which structural edit happened, when one did — a row or bullet inserted or removed.
     *
     * The parent holds open rewrite suggestions addressed by {workIndex, highlightIndex}, and every
     * structural edit renumbers those coordinates exactly as it renumbers the provenance paths.
     * Without this descriptor, accepting a suggestion after deleting a row writes the model's text
     * over the WRONG bullet. Text edits pass nothing: they move no indices.
     */
    edit?: StructuralEdit,
  ) => void
  /** The text was read off an image, which changes the honest answer to "how much of this?" */
  ocr?: boolean
  /**
   * Nobody read this document — it is being written here.
   *
   * Everything in this form's chrome is about *our reading of a file*: a count of fields we were
   * unsure of, a banner asking the person to check what we found, "we could not tell which fields to
   * double-check". Point that at a CV typed from nothing and every line of it refers to a file that
   * does not exist. So the counter is replaced by the one number that does mean something here — how
   * much of the document has anything in it — and the sections start open, because there is nothing
   * to collapse and the empty states are the instructions.
   */
  authoring?: boolean
  /**
   * Whether the chosen template draws a photo — the European one does, the international one does not.
   *
   * Passed in rather than read here, because the template is the parent's state and this form has no
   * business knowing the registry. What it does with the answer is tell the truth about where the photo
   * will end up (docs/05, ADR-010).
   */
  photoShown?: boolean
  /** Offered beside the photo when the current layout would not show it. Never called automatically. */
  onUseEuropeanLayout?: () => void
}) {
  const index = useProvenanceIndex(provenance)
  /**
   * One slot, not a stack.
   *
   * An undo history here would be a second source of truth about the document, racing the one in the
   * parent — and the failure mode is restoring a row into a list that has since changed shape. One
   * pending removal covers the actual mistake, which is a misplaced click a second ago.
   */
  const [removed, setRemoved] = useState<Removed | undefined>()

  const flaggedPaths = useMemo(
    () => provenance.filter(needsReview).map((p) => p.path),
    [provenance],
  )
  /**
   * How many fields under a section we were unsure about.
   *
   * The boundary is `prefix.` rather than a bare `startsWith`, which is a fix as well as a change:
   * `custom.1` matched `custom.10` through `custom.19`, so the tenth section onwards lent its flags to
   * the second. Nobody had eleven custom sections yet, which is the only reason it never showed.
   */
  const sectionFlagged = (prefix: string) =>
    flaggedPaths.filter(
      (path) => path === prefix || path.startsWith(`${prefix}.`),
    ).length

  /** One path, one answer. An absent entry is not a flagged one: we said nothing about that field. */
  const isFlagged = (path: string) => {
    const entry = index.get(path)
    return entry !== undefined && needsReview(entry)
  }
  const fieldClass = (path: string) =>
    isFlagged(path) ? 'field field-flagged' : 'field'

  const setBasics = (patch: Partial<Resume['basics']>) => {
    onChange({ ...resume, basics: { ...resume.basics, ...patch } })
  }

  const setWork = (i: number, patch: Partial<Resume['work'][number]>) => {
    const work = resume.work.map((item, at) =>
      at === i ? { ...item, ...patch } : item,
    )
    onChange({ ...resume, work })
  }

  const setEducation = (
    i: number,
    patch: Partial<Resume['education'][number]>,
  ) => {
    const education = resume.education.map((item, at) =>
      at === i ? { ...item, ...patch } : item,
    )
    onChange({ ...resume, education })
  }

  const setSkillGroup = (
    i: number,
    patch: Partial<Resume['skills'][number]>,
  ) => {
    const skills = resume.skills.map((group, at) =>
      at === i ? { ...group, ...patch } : group,
    )
    onChange({ ...resume, skills })
  }

  /* ── Structural edits ────────────────────────────────────────────────────────────────────────
     Every one of these goes through `shiftProvenance`, without exception. A row added or removed
     renumbers the paths after it, and a flag left on the wrong row is worse than no flag at all.
     ──────────────────────────────────────────────────────────────────────────────────────────── */

  /** Append a row and hand the caller the renumbered flags. Appending shifts nothing, and says so. */
  const addRow = <TList extends 'work' | 'education' | 'skills'>(
    list: TList,
    row: Resume[TList][number],
  ) => {
    const next = { ...resume, [list]: [...resume[list], row] }
    // Appended at the end, so no existing index moves — the shift is a no-op and passing the list
    // through anyway keeps one code path for all insertions if we ever add "insert above".
    onChange(
      next,
      shiftProvenance(provenance, list, resume[list].length, 1),
      list === 'work'
        ? { kind: 'work-row', at: resume[list].length, delta: 1 }
        : undefined,
    )
  }

  /** The dynamic sections' own helpers. Separate from `addRow` — that one is typed to the fixed lists. */
  const setCustomSection = (
    at: number,
    patch: Partial<Resume['custom'][number]>,
  ) => {
    const custom = resume.custom.map((section, i) =>
      i === at ? { ...section, ...patch } : section,
    )
    onChange({ ...resume, custom })
  }
  const setCustomItem = (at: number, item: number, value: string) => {
    const section = resume.custom[at]
    if (section === undefined) return
    setCustomSection(at, {
      items: section.items.map((line, j) => (j === item ? value : line)),
    })
  }
  const addCustomItem = (at: number) => {
    const section = resume.custom[at]
    if (section === undefined) return
    setCustomSection(at, { items: [...section.items, ''] })
  }
  const removeCustomItem = (at: number, item: number) => {
    const section = resume.custom[at]
    if (section === undefined) return
    setCustomSection(at, {
      items: section.items.filter((_, j) => j !== item),
    })
  }
  /** Everything the Add menu offers lands the same way: on the end, then moved into place. */
  const addBlock = (block: Resume['custom'][number]) =>
    onChange({ ...resume, custom: [...resume.custom, block] })

  const removeCustomSection = (at: number) => {
    onChange({
      ...resume,
      custom: resume.custom.filter((_, i) => i !== at),
    })
  }

  /**
   * Move a section up or down, and take its flags with it.
   *
   * The provenance paths are positional — `custom.2.items.0` means "the third section" and nothing
   * else — so a swap that moves the rows and leaves the paths puts every "check this" marker on the
   * wrong section. Same failure `shiftProvenance` exists for on insert and remove; this is the swap
   * case, which is simpler because no path appears or disappears, only two indices trade places.
   *
   * The document follows immediately: every template renders `resume.custom` in array order, so this
   * is the order on the page rather than a preference about the form.
   */
  /**
   * The document's own order, which is also the order this panel lists them in.
   *
   * Filtered to the sections that are actually *there*. The resolver returns every slot a design could
   * place, including the empty ones, and leaving them in made both halves of the control lie: "Move
   * Skills down, below Projects" named a section nobody could see, and pressing it swapped Skills with
   * nothing, which reads as a broken button. Experience, Education and Skills stay whatever their
   * contents, because the panel draws those three even when empty — that is where the "we did not find
   * any" copy lives.
   */
  const ALWAYS_SHOWN = new Set<SectionName>(['work', 'education', 'skills'])
  /**
   * Used by the list *and* by the move, and that is the point of it being a function.
   *
   * They were two expressions for a moment and it was immediately wrong: the header numbered its
   * buttons against the filtered list while the move indexed the unfiltered one, so pressing "up" on
   * Languages swapped two empty sections three rows away and looked like a dead button. Same list,
   * same indices, one definition.
   */
  const visibleSlots = (of: Resume) =>
    orderedSections(of).filter(
      (slot) =>
        slot.kind === 'custom' ||
        ALWAYS_SHOWN.has(slot.name) ||
        authoring ||
        of[slot.name].length > 0,
    )
  const ordered = visibleSlots(resume)

  /**
   * The form's own chrome, handed to the table-driven sections so they cannot drift from these.
   *
   * Passed rather than imported because the components live here: `extra-sections.tsx` describes six
   * lists and draws none of the furniture itself, which is what keeps one styling change from having
   * to be made twice.
   */
  const chrome = {
    index,
    fieldClass,
    sectionFlagged,
    Section,
    Field,
    AddRow,
    RemoveRow,
    LineBubble,
    AutoTextarea,
  }

  /**
   * The controls on every section header except You.
   *
   * `at` is the position in the *document's* order, not in this file, which is what makes "up" mean
   * the same thing here and on the page. You has none of these on purpose: a CV whose reader meets the
   * phone number after the job history is a CV with a bug, and every ATS heuristic assumes the header
   * is the header (src/render/sections.tsx).
   */
  const sectionActions = (at: number, what: string) => {
    const nameOf = (position: number) => {
      const slot = ordered[position]
      if (slot === undefined) return undefined
      if (slot.kind === 'named') return SECTION_TITLES[slot.name]
      const section = resume.custom[slot.index]
      if (isSpacer(section)) return 'the space'
      return section.title === '' ? 'the untitled section' : section.title
    }
    const above = nameOf(at - 1)
    const below = nameOf(at + 1)
    return (
      <>
        {/*
          The pair, joined. Two floating round icons read as two unrelated buttons that happen to be
          adjacent; a segmented control reads as one thing with two directions, which is what it is —
          and the shared border is what says the second button is the opposite of the first rather
          than the next in a row of four.
        */}
        <ButtonGroup className="mr-0.5 rounded-full border border-hairline">
          <HeaderButton
            grouped
            label={
              above === undefined
                ? `${what} is already first`
                : `Move ${what} up, above ${above}`
            }
            disabled={at === 0}
            onClick={() => moveSection(at, -1)}
          >
            <HeaderIcon shape="up" />
          </HeaderButton>
          {/*
            The hairline between them. `ButtonGroup` strips the left border off every child after the
            first, on the assumption that each child brings its own — these are bare icon buttons, so
            without this the pair is one blank pill with two glyphs floating in it.
          */}
          <ButtonGroupSeparator className="bg-hairline" />
          <HeaderButton
            grouped
            label={
              below === undefined
                ? `${what} is already last`
                : `Move ${what} down, below ${below}`
            }
            disabled={at === ordered.length - 1}
            onClick={() => moveSection(at, 1)}
          >
            <HeaderIcon shape="down" />
          </HeaderButton>
        </ButtonGroup>
        {slotIsCustom(at) && (
          <HeaderButton
            label={`Remove ${what} from the CV`}
            onClick={() => removeSlot(at)}
          >
            <HeaderIcon shape="bin" />
          </HeaderButton>
        )}
      </>
    )
  }

  /**
   * Move a section, by rewriting the document's order rather than its content.
   *
   * Nothing in `resume` moves — only `sectionOrder`, a list of tokens. That is why this needs no
   * provenance surgery where the old custom-only version did: the paths are positional and no position
   * changes, so every "check this" marker stays on the field it was about.
   *
   * Ids are assigned here, at the first moment they matter. A document that has never been reordered
   * carries none, renders in the design's order, and is untouched by any of this.
   */
  const moveSection = (at: number, by: -1 | 1) => {
    const to = at + by
    if (to < 0 || to >= ordered.length) return

    const used = new Set(
      resume.custom
        .map((s) => s.id)
        .filter((id): id is string => id !== undefined),
    )
    let n = 0
    const custom = resume.custom.map((section) => {
      if (section.id !== undefined) return section
      let id = `s${++n}`
      while (used.has(id)) id = `s${++n}`
      used.add(id)
      return { ...section, id }
    })
    const named = { ...resume, custom }

    const shown = visibleSlots(named)
    const moved = shown[at]
    const displaced = shown[to]
    if (moved === undefined || displaced === undefined) return
    shown[at] = displaced
    shown[to] = moved

    /*
      The written order is the *visible* sequence followed by everything else, so an empty section
      keeps its place in the design's tail instead of being dragged to the front by a swap it was not
      part of. `orderedSections` puts unmentioned slots back in the design's order anyway; listing the
      hidden ones explicitly is what stops them jumping when they later gain content.
    */
    const tokens = [...shown, ...orderedSections(named)]
      .map((slot) => tokenFor(slot, named))
      .filter((token): token is string => token !== undefined)

    onChange({ ...named, sectionOrder: [...new Set(tokens)] })
  }

  const slotIsCustom = (at: number) => ordered[at]?.kind === 'custom'

  const removeSlot = (at: number) => {
    const slot = ordered[at]
    if (slot === undefined || slot.kind !== 'custom') return
    removeCustomSection(slot.index)
  }

  const removeRow = (
    list: 'work' | 'education' | 'skills',
    at: number,
    label: string,
  ) => {
    const rows = [...resume[list]]
    const [row] = rows.splice(at, 1)
    const prefix = `${list}.${at}.`
    setRemoved({
      list,
      at,
      row,
      // Exactly the entries about this row, kept so undo restores what we knew, not a clean slate.
      provenance: provenance.filter((p) => p.path.startsWith(prefix)),
      label,
    })
    onChange(
      { ...resume, [list]: rows },
      shiftProvenance(provenance, list, at, -1),
      list === 'work' ? { kind: 'work-row', at, delta: -1 } : undefined,
    )
  }

  const undoRemove = () => {
    if (removed === undefined) return
    const rows = [...(resume[removed.list] as Array<unknown>)]
    // Clamped: the list may be shorter than it was if the parent changed underneath us.
    const at = Math.min(removed.at, rows.length)
    rows.splice(at, 0, removed.row)
    /**
     * Make room in the paths first, then put the row's own flags back at their original index. In that
     * order — restoring the flags before the shift would push them along with everything else.
     */
    const shifted = shiftProvenance(provenance, removed.list, at, 1)
    const restored = removed.provenance.map((entry) => ({
      ...entry,
      path: entry.path.replace(
        `${removed.list}.${removed.at}.`,
        `${removed.list}.${at}.`,
      ),
    }))
    onChange(
      { ...resume, [removed.list]: rows },
      [...shifted, ...restored],
      removed.list === 'work' ? { kind: 'work-row', at, delta: 1 } : undefined,
    )
    setRemoved(undefined)
  }

  /** Bullets live inside a work row, so they renumber inside it rather than shifting the list. */
  const setHighlights = (i: number, highlights: Array<string>) =>
    setWork(i, { highlights })

  /**
   * Removing or adding a bullet is a structural edit twice over: the provenance paths
   * `work.i.highlights.N` renumber (a bug this fixes in passing — they never shifted before, so a
   * confidence flag could sit on the wrong line after a deletion), and the parent's open suggestions
   * renumber with them.
   */
  const removeBullet = (i: number, b: number) => {
    const work = resume.work.map((job, index) =>
      index === i
        ? { ...job, highlights: job.highlights.filter((_, at) => at !== b) }
        : job,
    )
    onChange(
      { ...resume, work },
      shiftProvenance(provenance, `work.${i}.highlights`, b, -1),
      { kind: 'work-bullet', workIndex: i, at: b, delta: -1 },
    )
  }
  const addBullet = (i: number) => {
    const at = resume.work[i]?.highlights.length ?? 0
    const work = resume.work.map((job, index) =>
      index === i ? { ...job, highlights: [...job.highlights, ''] } : job,
    )
    onChange({ ...resume, work }, undefined, {
      kind: 'work-bullet',
      workIndex: i,
      at,
      delta: 1,
    })
  }

  const total = provenance.length
  const flaggedCount = flaggedPaths.length
  const unsure = ocr || total === 0

  /**
   * How much of the document exists yet — the only count that means anything while authoring.
   *
   * Five sections, ticked as each gets its first entry. Not a percentage: a CV with no education is
   * finished for plenty of people, and a bar at 80% would invent a deficiency out of a life.
   */
  const written = [
    resume.basics.headline !== undefined && resume.basics.headline !== '',
    resume.basics.summary !== undefined && resume.basics.summary !== '',
    resume.work.length > 0,
    resume.education.length > 0,
    resume.skills.length > 0,
  ].filter(Boolean).length

  const blocks: Partial<Record<SectionName, (at: number) => React.ReactNode>> =
    {
      work: (at) => (
        <Section
          title="Experience"
          count={resume.work.length}
          flagged={sectionFlagged('work')}
          actions={sectionActions(at, 'Experience')}
          defaultOpen={authoring || sectionFlagged('work') > 0}
        >
          {resume.work.length === 0 && (
            <p className="text-[13px] leading-relaxed text-ink-soft">
              {authoring
                ? 'One entry per job, the most recent first. A job you left, a placement, an apprenticeship or self-employment all count.'
                : 'We did not find any jobs. That is usually a sign the file was hard to read. check the original, or add them here.'}
            </p>
          )}
          {resume.work.map((item, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 border-l-2 border-l-hairline pl-3.5"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Job title"
                  value={item.role}
                  onChange={(role) => setWork(i, { role })}
                  provenance={index.get(`work.${i}.role`)}
                />
                <Field
                  label="Employer"
                  value={item.company}
                  onChange={(company) => setWork(i, { company })}
                  provenance={index.get(`work.${i}.company`)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {/*
                  Picked, not typed as a format. The label no longer teaches ISO-8601 — "Started" is the
                  question, and `DateField` handles the shape.
                */}
                <DateField
                  label="Started"
                  value={item.startDate ?? ''}
                  onChange={(startDate) =>
                    setWork(i, { startDate: startDate || undefined })
                  }
                  provenance={index.get(`work.${i}.startDate`)}
                />
                <DateField
                  label="Ended"
                  value={item.endDate ?? ''}
                  onChange={(endDate) =>
                    setWork(i, { endDate: endDate || null })
                  }
                  provenance={index.get(`work.${i}.endDate`)}
                  openEndedLabel="Still here"
                />
              </div>
              <p className="text-meta text-ink-soft">
                Reads as: {formatRange(item.startDate, item.endDate) || '—'}
              </p>

              {/*
                The bullets, editable. They used to be a count — "4 bullets" — which meant the lines a
                recruiter actually reads were the one part of the CV the person could not touch, unless
                they accepted a machine's rewrite of them. That inverted the product: the wording pass is
                a suggestion, and typing your own sentence should not be the harder path.
              */}
              <div className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold text-ink">
                  What you did here
                </span>
                {item.highlights.length === 0 && (
                  <p className="text-meta leading-relaxed text-ink-soft">
                    Nothing here yet. One line per thing you did: what you were
                    responsible for, and the size of it.
                  </p>
                )}
                {item.highlights.map((text, b) => (
                  <LineBubble
                    key={b}
                    removeLabel={`Remove bullet ${b + 1}`}
                    onRemove={() => removeBullet(i, b)}
                  >
                    <AutoTextarea
                      value={text}
                      ariaLabel={`Bullet ${b + 1} for ${item.role || 'this job'}`}
                      onChange={(next) =>
                        setHighlights(
                          i,
                          item.highlights.map((line, at) =>
                            at === b ? next : line,
                          ),
                        )
                      }
                      className={fieldClass(`work.${i}.highlights.${b}`)}
                    />
                  </LineBubble>
                ))}
                <AddRow label="Add a line" onClick={() => addBullet(i)} />
              </div>

              <RemoveRow
                label={`Remove ${item.role || 'this job'}`}
                onClick={() =>
                  removeRow(
                    'work',
                    i,
                    [item.role, item.company].filter(Boolean).join(', ') ||
                      'that job',
                  )
                }
              />
            </div>
          ))}
          <AddRow
            label="Add a job"
            onClick={() =>
              addRow('work', {
                company: '',
                role: '',
                endDate: null,
                highlights: [],
                tech: [],
              })
            }
          />
        </Section>
      ),
      education: (at) => (
        <Section
          title="Education"
          count={resume.education.length}
          flagged={sectionFlagged('education')}
          actions={sectionActions(at, 'Education')}
          defaultOpen={authoring}
        >
          {/*
            These were four read-only paragraphs. Somebody whose institution came out of a two-column PDF
            as "Kø benhavns Professionshøjskole" could see the mistake, could see the flag telling them to
            check it, and had nowhere to fix it — which turns the honesty mechanism into a taunt.
          */}
          {resume.education.length === 0 && (
            <p className="text-[13px] leading-relaxed text-ink-soft">
              {authoring
                ? 'Whatever you have. A course or a certificate counts, and so does an apprenticeship. Leave it empty if there is nothing to put here.'
                : 'We did not find any. Add what you have: a course or a certificate counts, and so does an apprenticeship.'}
            </p>
          )}
          {resume.education.map((item, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 border-l-2 border-l-hairline pl-3.5"
            >
              <Field
                label="School, college or provider"
                value={item.institution}
                onChange={(institution) => setEducation(i, { institution })}
                provenance={index.get(`education.${i}.institution`)}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Qualification"
                  value={item.degree ?? ''}
                  onChange={(degree) =>
                    setEducation(i, { degree: degree || undefined })
                  }
                  provenance={index.get(`education.${i}.degree`)}
                />
                <Field
                  label="Subject"
                  value={item.field ?? ''}
                  onChange={(field) =>
                    setEducation(i, { field: field || undefined })
                  }
                  provenance={index.get(`education.${i}.field`)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <DateField
                  label="Started"
                  value={item.startDate ?? ''}
                  onChange={(startDate) =>
                    setEducation(i, { startDate: startDate || undefined })
                  }
                  provenance={index.get(`education.${i}.startDate`)}
                />
                <DateField
                  label="Finished"
                  value={item.endDate ?? ''}
                  onChange={(endDate) =>
                    setEducation(i, { endDate: endDate || null })
                  }
                  provenance={index.get(`education.${i}.endDate`)}
                  openEndedLabel="Still studying"
                />
              </div>
              <p className="text-meta text-ink-soft">
                Reads as: {formatRange(item.startDate, item.endDate) || '—'}
              </p>
              <RemoveRow
                label={`Remove ${item.institution || 'this entry'}`}
                onClick={() =>
                  removeRow(
                    'education',
                    i,
                    [item.degree, item.institution]
                      .filter(Boolean)
                      .join(', ') || 'that entry',
                  )
                }
              />
            </div>
          ))}
          <AddRow
            label="Add a qualification"
            onClick={() =>
              addRow('education', {
                institution: '',
                endDate: null,
                highlights: [],
              })
            }
          />
        </Section>
      ),
      skills: (at) => (
        <Section
          title="Skills"
          count={resume.skills.reduce((n, g) => n + g.items.length, 0)}
          flagged={sectionFlagged('skills')}
          actions={sectionActions(at, 'Skills')}
          defaultOpen={authoring}
        >
          {/*
            Comma-separated, one field per group, rather than a chip editor.

            Chips look better and are worse here: adding one means click, type, press Enter, and getting a
            typo out of the middle of a list means finding the right little ✕. This is the shape the data
            is already read *back* in — "Intensive care, Ventilator management, Triage" — so what somebody
            sees on the page is what they edit, and pasting a list from an old CV works on the first try.

            Splitting happens on the way in, so the field never fights the person typing: a lone comma
            mid-sentence would otherwise vanish an item as they went.
          */}
          {resume.skills.length === 0 && (
            <p className="text-[13px] leading-relaxed text-ink-soft">
              {authoring
                ? 'Group them however your trade does. The headings are yours, not a fixed list. "Clinical", "Machines I have run", "Languages".'
                : 'We did not find any. Group them however your trade does. The headings are yours, not a fixed list.'}
            </p>
          )}
          {resume.skills.map((group, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 border-l-2 border-l-hairline pl-3.5"
            >
              <Field
                label="Heading"
                value={group.category}
                onChange={(category) => setSkillGroup(i, { category })}
                provenance={index.get(`skills.${i}.category`)}
              />
              <label className="flex flex-col gap-1.5">
                <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                  What goes under it
                  <Flag entry={index.get(`skills.${i}.items`)} />
                </span>
                <AutoTextarea
                  value={group.items.join(', ')}
                  onChange={(next) =>
                    setSkillGroup(i, {
                      items: next
                        .split(',')
                        .map((item) => item.trim())
                        .filter((item) => item !== ''),
                    })
                  }
                  className={fieldClass(`skills.${i}.items`)}
                />
                <span className="text-meta text-ink-soft">
                  Separated by commas.
                </span>
              </label>
              <RemoveRow
                label={`Remove the ${group.category || 'unnamed'} group`}
                onClick={() =>
                  removeRow('skills', i, group.category || 'that group')
                }
              />
            </div>
          ))}
          <AddRow
            label="Add a group"
            onClick={() => addRow('skills', { category: '', items: [] })}
          />
        </Section>
      ),
      projects: (at) => (
        <ExtraSections
          resume={resume}
          onChange={(next) => onChange(next)}
          authoring={authoring}
          only="projects"
          actionsFor={(_, title) => sectionActions(at, title)}
          chrome={chrome}
        />
      ),
      certifications: (at) => (
        <ExtraSections
          resume={resume}
          onChange={(next) => onChange(next)}
          authoring={authoring}
          only="certifications"
          actionsFor={(_, title) => sectionActions(at, title)}
          chrome={chrome}
        />
      ),
      languages: (at) => (
        <ExtraSections
          resume={resume}
          onChange={(next) => onChange(next)}
          authoring={authoring}
          only="languages"
          actionsFor={(_, title) => sectionActions(at, title)}
          chrome={chrome}
        />
      ),
      awards: (at) => (
        <ExtraSections
          resume={resume}
          onChange={(next) => onChange(next)}
          authoring={authoring}
          only="awards"
          actionsFor={(_, title) => sectionActions(at, title)}
          chrome={chrome}
        />
      ),
      publications: (at) => (
        <ExtraSections
          resume={resume}
          onChange={(next) => onChange(next)}
          authoring={authoring}
          only="publications"
          actionsFor={(_, title) => sectionActions(at, title)}
          chrome={chrome}
        />
      ),
      volunteer: (at) => (
        <ExtraSections
          resume={resume}
          onChange={(next) => onChange(next)}
          authoring={authoring}
          only="volunteer"
          actionsFor={(_, title) => sectionActions(at, title)}
          chrome={chrome}
        />
      ),
    }

  return (
    /*
      One provider around the whole form. The three header controls are the only tooltips in here, but
      they repeat per section — a provider each would be a dozen of them coordinating hover delays with
      each other, which is how a tooltip ends up flickering as the pointer crosses two buttons.
    */
    <TooltipProvider delayDuration={250}>
      <div className="flex flex-col gap-3">
        {/**
         * Honest counter: real remaining work, never a padded total (docs/11-flow.md rule 5).
         *
         * A scan gets no count at all, and that is the point. Confidence scores describe how sure the
         * *extraction* was about text it was given — they say nothing about whether the text was read
         * off the page correctly. Printing "8 of 33" next to a banner that says "please check every
         * field" tells the user two different things, and the smaller number is the one they act on.
         *
         * The number is set in the accent at display size because it is the one figure on this screen
         * worth reading from across a desk. It is the accent's only numeric use in the app.
         */}
        <div
          className={[
            'flex items-center gap-3.5 rounded-card border p-4',
            authoring
              ? 'border-signal-edge bg-signal-wash'
              : unsure
                ? 'border-caution/25 bg-caution-wash'
                : 'border-signal-edge bg-signal-wash',
          ].join(' ')}
        >
          <span
            className={[
              'tally text-[34px] font-extrabold leading-none tracking-[-0.03em]',
              authoring
                ? 'text-signal'
                : unsure
                  ? 'text-caution'
                  : 'text-signal',
            ].join(' ')}
          >
            {authoring ? written : unsure ? '?' : flaggedCount}
          </span>
          <span className="flex flex-col">
            <span className="text-[14px] font-semibold text-ink">
              {authoring
                ? 'Sections filled in'
                : unsure
                  ? 'Check everything'
                  : 'To check'}
            </span>
            <span className="text-[13px] leading-snug text-ink-soft">
              {authoring
                ? 'of 5, none of them compulsory'
                : ocr
                  ? 'read from a picture'
                  : total === 0
                    ? 'we could not tell which fields'
                    : `of ${total} fields we read`}
            </span>
          </span>
          {/*
            Adding, as one control at the top instead of two buttons at the bottom.

            They were two full-width cards under a list that grows — so the way to add a section was
            below every section you already had, which is the wrong end of a scroll and got longer the
            more you used it. Up here it is in the same place whatever the document holds, and it is
            one button rather than one per kind of thing, which is what makes room for the kinds that
            are coming (see BLOCKS in this file).
          */}
          <AddMenu onAdd={addBlock} />
        </div>

        {ocr && (
          <p className="text-[13px] leading-relaxed text-ink-soft">
            We know how sure we were about the words we found, but not about
            whether we read them off the page correctly, so the whole thing
            needs your eyes, not just the parts we flagged.
          </p>
        )}

        {/**
         * An empty provenance list must never read as "nothing to check". It means the extraction
         * did not report which fields it was unsure about, so we know *less* than usual — and
         * saying "0 to check" there would be the opposite of the truth.
         */}
        {authoring && (
          <p className="text-[13px] leading-relaxed text-ink-soft">
            Nothing here is required except your name. Add what you have, in any
            order. The document beside the form updates as you type, and you can
            download it at any point.
          </p>
        )}

        {/*
        Deliberately no paragraph for the `total === 0` case, and this is the removal rather than an
        omission.

        Three elements were saying one thing. The page subtitle carries the advice ("your dates and
        job titles are the ones worth a second look"), the tally beside it carries the state ("Check
        everything" over "we could not tell which fields"), and a paragraph underneath repeated both
        and added "read through all of them", which is what "Check everything" already says in two
        words. The reader was being told the same thing three times in three registers, which reads
        as insistence rather than as help (reference/distill.md).

        The `ocr` and `flaggedCount === 0` branches keep their paragraphs: each says something the
        tally cannot, namely *why* the whole document needs eyes in one case and that nothing looked
        uncertain in the other.
      */}

        {!authoring && !ocr && flaggedCount === 0 && total > 0 && (
          <p className="text-[13px] leading-relaxed text-ink-soft">
            Nothing looked uncertain. Still worth a glance at your dates and job
            titles, because those are the ones that cost you an interview if
            they are wrong.
          </p>
        )}

        {/*
        The undo, and it is the reason none of the Remove buttons is red or asks "are you sure?".

        CLAUDE.md: nothing here is irreversible, and nothing warns that it is. A confirmation dialog on
        a row deletion would add a click to every correct removal in order to guard against a rare
        wrong one; this costs nothing until the wrong one happens. It names what went, because "Item
        removed" leaves somebody who clicked twice unable to tell which.

        It sits at the top rather than beside the gap the row left, so it is in the same place whichever
        section it came from — and a strip that appears where a row just vanished shifts the layout
        under the cursor that is still moving.
      */}
        {removed !== undefined && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-card border border-hairline-strong bg-band px-3.5 py-2.5"
          >
            <span className="text-[13px] leading-snug text-ink">
              Removed <span className="font-semibold">{removed.label}</span>.
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={undoRemove}
                className="btn btn-quiet bg-ground px-3.5 py-1.5 text-[13px]"
              >
                Undo
              </button>
              <button
                type="button"
                onClick={() => setRemoved(undefined)}
                aria-label="Dismiss"
                className="rounded-full px-2 py-1.5 text-[13px] text-ink-soft transition-colors hover:text-ink"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <Section title="You" flagged={sectionFlagged('basics')} defaultOpen>
          <Field
            label="Full name"
            value={resume.basics.fullName}
            onChange={(fullName) => setBasics({ fullName })}
            provenance={index.get('basics.fullName')}
          />
          <Field
            label="What you do"
            value={resume.basics.headline ?? ''}
            onChange={(headline) =>
              setBasics({ headline: headline || undefined })
            }
            provenance={index.get('basics.headline')}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Email"
              value={resume.basics.email ?? ''}
              onChange={(email) => setBasics({ email: email || undefined })}
              provenance={index.get('basics.email')}
            />
            <Field
              label="Phone"
              value={resume.basics.phone ?? ''}
              onChange={(phone) => setBasics({ phone: phone || undefined })}
              provenance={index.get('basics.phone')}
            />
          </div>
          <Field
            label="Summary"
            multiline
            value={resume.basics.summary ?? ''}
            onChange={(summary) => setBasics({ summary: summary || undefined })}
            provenance={index.get('basics.summary')}
          />
          {/*
          Last in "You", because it is the least load-bearing thing on the screen and the only optional
          one. A photo above the name would suggest the picture matters more than what the CV says.
        */}
          <PhotoField
            value={resume.basics.photoUrl}
            onChange={(photoUrl) => setBasics({ photoUrl })}
            shown={photoShown}
            {...(onUseEuropeanLayout === undefined
              ? {}
              : { onUseEuropeanLayout })}
          />
        </Section>

        {/*
          Every section below You, in the order the *document* asks for.

          The list used to be written out in sequence, which is why only the custom ones could move:
          the others were positions in this file rather than entries in a list. `orderedSections` is
          the same resolver the templates use, so what is on screen is what is on the page — a panel
          that reordered itself and left the PDF alone would be worse than no arrows at all.
        */}
        {ordered.map((slot, at) => (
          <Fragment key={tokenFor(slot, resume) ?? `custom-${at}`}>
            {slot.kind === 'custom'
              ? (() => {
                  const section = resume.custom[slot.index]
                  const i = slot.index
                  return isSpacer(section) ? (
                    <SpacerRow
                      key={i}
                      space={section.space}
                      onChange={(space) => setCustomSection(i, { space })}
                      actions={sectionActions(at, 'this space')}
                    />
                  ) : (
                    <Section
                      key={i}
                      title={
                        section.title === ''
                          ? 'Untitled section'
                          : section.title
                      }
                      count={section.items.length}
                      flagged={sectionFlagged(`custom.${i}`)}
                      defaultOpen={false}
                      /*
                                Reorder and remove, reachable without opening the section — Edd's ask, and the reason is
                                the same one behind the count beside the title: a decision about a section should not cost
                                an expand, a scroll to the bottom, and a collapse. The removal here does exactly what the
                                "Remove the … section" row inside does; it is the same action at the place you are already
                                looking when you decide to take it.
                              */
                      actions={sectionActions(
                        at,
                        section.title || 'this section',
                      )}
                    >
                      <Field
                        label="Section heading"
                        value={section.title}
                        onChange={(title) => setCustomSection(i, { title })}
                        provenance={index.get(`custom.${i}.title`)}
                      />
                      {/*
                                The remove control here was a bare "✕" character where every other one in the form is the
                                same drawn bin — two icon families for one action, and the odd one out was the one sitting
                                closest to the text. Same bubble, same button, same place: learned once, true everywhere.
                              */}
                      {section.items.map((item, j) => (
                        <LineBubble
                          key={j}
                          removeLabel={`Remove line ${j + 1} of ${section.title || 'this section'}`}
                          onRemove={() => removeCustomItem(i, j)}
                        >
                          <label className="flex flex-col gap-1.5">
                            <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                              Line {j + 1}
                              <Flag
                                entry={index.get(`custom.${i}.items.${j}`)}
                              />
                            </span>
                            <AutoTextarea
                              value={item}
                              onChange={(next) => setCustomItem(i, j, next)}
                              className={fieldClass(`custom.${i}.items.${j}`)}
                            />
                          </label>
                        </LineBubble>
                      ))}
                      <AddRow
                        label="Add a line"
                        onClick={() => addCustomItem(i)}
                      />
                      <RemoveRow
                        label={`Remove the ${section.title || 'untitled'} section`}
                        onClick={() => removeCustomSection(i)}
                      />
                    </Section>
                  )
                })()
              : blocks[slot.name]?.(at)}
          </Fragment>
        ))}

        {/*
        And a way to add a section that was never in the file at all — the person is the source of
        truth about their own life, and "Volunteering" missing from the upload is not a reason it
        cannot be on the document (docs/06: their own facts are not fabrication).
      */}
        <p className="text-meta text-ink-soft">
          Marked <span className="font-semibold text-caution">check</span> means
          we were under {Math.round(CONFIDENCE_REVIEW_THRESHOLD * 100)}% sure we
          read it correctly. Hover one to see the line it came from.
        </p>
      </div>
    </TooltipProvider>
  )
}
