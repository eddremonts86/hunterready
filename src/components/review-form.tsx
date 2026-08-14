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
import { CONFIDENCE_REVIEW_THRESHOLD, needsReview } from '@/schema/provenance'
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

export function ReviewForm({
  resume,
  provenance,
  onChange,
  ocr = false,
}: {
  resume: Resume
  provenance: Array<FieldProvenance>
  onChange: (next: Resume) => void
  /** The text was read off an image, which changes the honest answer to "how much of this?" */
  ocr?: boolean
}) {
  const index = useProvenanceIndex(provenance)

  const flaggedPaths = useMemo(
    () => provenance.filter(needsReview).map((p) => p.path),
    [provenance],
  )
  const sectionFlagged = (prefix: string) =>
    flaggedPaths.some((path) => path.startsWith(prefix))

  const setBasics = (patch: Partial<Resume['basics']>) => {
    onChange({ ...resume, basics: { ...resume.basics, ...patch } })
  }

  const setWork = (i: number, patch: Partial<Resume['work'][number]>) => {
    const work = resume.work.map((item, at) =>
      at === i ? { ...item, ...patch } : item,
    )
    onChange({ ...resume, work })
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
              <Field
                label="Started (YYYY-MM)"
                value={item.startDate ?? ''}
                onChange={(startDate) =>
                  setWork(i, { startDate: startDate || undefined })
                }
                provenance={index.get(`work.${i}.startDate`)}
              />
              <Field
                label="Ended (blank = still there)"
                value={item.endDate ?? ''}
                onChange={(endDate) => setWork(i, { endDate: endDate || null })}
                provenance={index.get(`work.${i}.endDate`)}
              />
            </div>
            <p className="text-meta text-ink-soft">
              Reads as: {formatRange(item.startDate, item.endDate) || '—'} ·{' '}
              {item.highlights.length} bullet
              {item.highlights.length === 1 ? '' : 's'}
            </p>
          </div>
        ))}
      </Section>

      <Section
        title="Education"
        count={resume.education.length}
        flagged={sectionFlagged('education')}
        defaultOpen={false}
      >
        {resume.education.map((item, i) => (
          <p key={i} className="text-[14px] leading-relaxed text-ink">
            {[item.degree, item.field].filter(Boolean).join(' ')} —{' '}
            {item.institution}{' '}
            <span className="text-ink-soft">
              ({formatRange(item.startDate, item.endDate) || '—'})
            </span>
          </p>
        ))}
      </Section>

      <Section
        title="Skills"
        count={resume.skills.reduce((n, g) => n + g.items.length, 0)}
        flagged={sectionFlagged('skills')}
        defaultOpen={false}
      >
        {resume.skills.map((group, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-ink">
              {group.category}
            </span>
            <span className="text-[14px] leading-relaxed text-ink-soft">
              {group.items.join(', ')}
            </span>
          </div>
        ))}
      </Section>

      <p className="text-meta text-ink-soft">
        Marked <span className="font-semibold text-caution">check</span> means
        we were under {Math.round(CONFIDENCE_REVIEW_THRESHOLD * 100)}% sure we
        read it correctly. Hover one to see the line it came from.
      </p>
    </div>
  )
}
