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
import { useMemo, useState } from 'react'
import { DateField } from '@/components/date-field'
import { PhotoField } from '@/components/photo-field'
import {
  CONFIDENCE_REVIEW_THRESHOLD,
  needsReview,
  shiftProvenance,
} from '@/schema/provenance'
import type { StructuralEdit } from '@/optimize/rewrite-shift'
import type { FieldProvenance } from '@/schema/provenance'
import type { Resume } from '@/schema/resume'
import { formatRange } from '@/render/format'

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
        <textarea
          value={value}
          rows={3}
          onChange={(event) => onChange(event.target.value)}
          className={`${shared} resize-y leading-relaxed`}
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

function Section({
  title,
  count,
  flagged,
  children,
  defaultOpen,
}: {
  title: string
  count?: number
  flagged: boolean
  children: React.ReactNode
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-band"
      >
        <span className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-ink">{title}</span>
          {count !== undefined && (
            <span className="tally rounded-full bg-band px-1.5 py-0.5 text-[12px] font-semibold text-ink-soft">
              {count}
            </span>
          )}
          {flagged && (
            <span className="rounded-full bg-caution-wash px-2 py-0.5 text-[11px] font-semibold text-caution">
              needs a look
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
  const sectionFlagged = (prefix: string) =>
    flaggedPaths.some((path) => path.startsWith(prefix))

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
  const removeCustomSection = (at: number) => {
    onChange({
      ...resume,
      custom: resume.custom.filter((_, i) => i !== at),
    })
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

  return (
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
          unsure
            ? 'border-caution/25 bg-caution-wash'
            : 'border-signal-edge bg-signal-wash',
        ].join(' ')}
      >
        <span
          className={[
            'tally text-[34px] font-extrabold leading-none tracking-[-0.03em]',
            unsure ? 'text-caution' : 'text-signal',
          ].join(' ')}
        >
          {unsure ? '?' : flaggedCount}
        </span>
        <span className="flex flex-col">
          <span className="text-[14px] font-semibold text-ink">
            {unsure ? 'Check everything' : 'To check'}
          </span>
          <span className="text-[13px] leading-snug text-ink-soft">
            {ocr
              ? 'read from a picture'
              : total === 0
                ? 'we could not tell which fields'
                : `of ${total} fields we read`}
          </span>
        </span>
      </div>

      {ocr && (
        <p className="text-[13px] leading-relaxed text-ink-soft">
          We know how sure we were about the words we found, but not about
          whether we read them off the page correctly — so the whole thing needs
          your eyes, not just the parts we flagged.
        </p>
      )}

      {/**
       * An empty provenance list must never read as "nothing to check". It means the extraction
       * did not report which fields it was unsure about, so we know *less* than usual — and
       * saying "0 to check" there would be the opposite of the truth.
       */}
      {!ocr && total === 0 && (
        <p className="text-[13px] leading-relaxed text-ink-soft">
          This time we could not tell which fields to double-check, so please
          read through all of them — especially the dates and job titles.
        </p>
      )}

      {!ocr && flaggedCount === 0 && total > 0 && (
        <p className="text-[13px] leading-relaxed text-ink-soft">
          Nothing looked uncertain. Still worth a glance at your dates and job
          titles — those are the ones that cost you an interview if they are
          wrong.
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

      <Section
        title="Experience"
        count={resume.work.length}
        flagged={sectionFlagged('work')}
        defaultOpen={sectionFlagged('work')}
      >
        {resume.work.length === 0 && (
          <p className="text-[13px] leading-relaxed text-ink-soft">
            We did not find any jobs. That is usually a sign the file was hard
            to read — check the original, or add them here.
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
                onChange={(endDate) => setWork(i, { endDate: endDate || null })}
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
                  Nothing here yet. One line per thing you did — what you were
                  responsible for, and the size of it.
                </p>
              )}
              {item.highlights.map((text, b) => (
                <div key={b} className="flex items-start gap-2">
                  <textarea
                    value={text}
                    rows={2}
                    aria-label={`Bullet ${b + 1} for ${item.role || 'this job'}`}
                    onChange={(event) =>
                      setHighlights(
                        i,
                        item.highlights.map((line, at) =>
                          at === b ? event.target.value : line,
                        ),
                      )
                    }
                    className={`${fieldClass(
                      `work.${i}.highlights.${b}`,
                    )} min-w-0 flex-1 resize-y leading-relaxed`}
                  />
                  <RemoveRow
                    label={`Remove bullet ${b + 1}`}
                    onClick={() => removeBullet(i, b)}
                  />
                </div>
              ))}
              <AddRow label="Add a line" onClick={() => addBullet(i)} />
            </div>

            <RemoveRow
              label={`Remove ${item.role || 'this job'}`}
              onClick={() =>
                removeRow(
                  'work',
                  i,
                  [item.role, item.company].filter(Boolean).join(' — ') ||
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

      <Section
        title="Education"
        count={resume.education.length}
        flagged={sectionFlagged('education')}
        defaultOpen={false}
      >
        {/*
          These were four read-only paragraphs. Somebody whose institution came out of a two-column PDF
          as "Kø benhavns Professionshøjskole" could see the mistake, could see the flag telling them to
          check it, and had nowhere to fix it — which turns the honesty mechanism into a taunt.
        */}
        {resume.education.length === 0 && (
          <p className="text-[13px] leading-relaxed text-ink-soft">
            We did not find any. Add what you have — a course or a certificate
            counts, and so does an apprenticeship.
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
                  [item.degree, item.institution].filter(Boolean).join(' — ') ||
                    'that entry',
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

      <Section
        title="Skills"
        count={resume.skills.reduce((n, g) => n + g.items.length, 0)}
        flagged={sectionFlagged('skills')}
        defaultOpen={false}
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
            We did not find any. Group them however your trade does — the
            headings are yours, not a fixed list.
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
              <textarea
                value={group.items.join(', ')}
                rows={2}
                onChange={(event) =>
                  setSkillGroup(i, {
                    items: event.target.value
                      .split(',')
                      .map((item) => item.trim())
                      .filter((item) => item !== ''),
                  })
                }
                className={`${fieldClass(`skills.${i}.items`)} resize-y leading-relaxed`}
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

      {/*
        The dynamic sections — whatever this CV carries that the fixed groups do not.

        A Danish CV arrives with KURSER and REFERENCER; others bring volunteering, awards, memberships,
        publications, a driving licence, hobbies. `resume.custom` has always caught these and the
        templates have always rendered them — but the Check panel silently skipped them, so the person
        was shown "15 of 17 fields" while whole sections of their document had no place to be corrected
        (Edd's screenshot: a red arrow from REFERENCER in the PDF to an empty spot in this panel).

        One editor for all of them, because their shape is one shape: a title and its lines. No fixed
        list of "allowed" section kinds — the headings are the candidate's, not ours, exactly like the
        skills groups above.
      */}
      {resume.custom.map((section, i) => (
        <Section
          key={i}
          title={section.title === '' ? 'Untitled section' : section.title}
          count={section.items.length}
          flagged={sectionFlagged(`custom.${i}`)}
          defaultOpen={false}
        >
          <Field
            label="Section heading"
            value={section.title}
            onChange={(title) => setCustomSection(i, { title })}
            provenance={index.get(`custom.${i}.title`)}
          />
          {section.items.map((item, j) => (
            <label key={j} className="flex flex-col gap-1.5">
              <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                Line {j + 1}
                <Flag entry={index.get(`custom.${i}.items.${j}`)} />
              </span>
              <div className="flex items-start gap-2">
                <textarea
                  value={item}
                  rows={Math.min(4, Math.max(1, Math.ceil(item.length / 70)))}
                  onChange={(event) => setCustomItem(i, j, event.target.value)}
                  className={`${fieldClass(`custom.${i}.items.${j}`)} flex-1 resize-y leading-relaxed`}
                />
                <button
                  type="button"
                  aria-label={`Remove line ${j + 1} of ${section.title || 'this section'}`}
                  onClick={() => removeCustomItem(i, j)}
                  className="mt-1 rounded-field px-2 py-1 text-[13px] text-ink-soft transition-colors hover:bg-band hover:text-ink"
                >
                  ✕
                </button>
              </div>
            </label>
          ))}
          <AddRow label="Add a line" onClick={() => addCustomItem(i)} />
          <RemoveRow
            label={`Remove the ${section.title || 'untitled'} section`}
            onClick={() => removeCustomSection(i)}
          />
        </Section>
      ))}

      {/*
        And a way to add a section that was never in the file at all — the person is the source of
        truth about their own life, and "Volunteering" missing from the upload is not a reason it
        cannot be on the document (docs/06: their own facts are not fabrication).
      */}
      <button
        type="button"
        onClick={() =>
          onChange({
            ...resume,
            custom: [...resume.custom, { title: '', items: [''] }],
          })
        }
        className="card flex w-full items-center justify-center gap-2 px-4 py-3 text-[14px] font-semibold text-signal transition-colors hover:bg-signal-wash"
      >
        + Add a section
        <span className="text-[12px] font-normal text-ink-soft">
          courses, volunteering, awards, references…
        </span>
      </button>

      <p className="text-meta text-ink-soft">
        Marked <span className="font-semibold text-caution">check</span> means
        we were under {Math.round(CONFIDENCE_REVIEW_THRESHOLD * 100)}% sure we
        read it correctly. Hover one to see the line it came from.
      </p>
    </div>
  )
}
