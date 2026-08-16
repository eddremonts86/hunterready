/**
 * The CV you uploaded, beside the CV you are about to send.
 *
 * Edd: *"necesitamos un side by side de lo nuevo y lo viejo para mejor impacto visual y dar sensación de
 * logro inmediato."* The per-bullet diff in the rewrite review already shows one sentence against its
 * replacement, which is the right tool for *deciding*. It is the wrong tool for seeing what you have
 * done: nobody adds up twelve accepted suggestions in their head and pictures the document.
 *
 * ## The marks are not on the documents
 *
 * The obvious build is two sheets with the changed lines highlighted. DESIGN.md forbids it, in its
 * hardest rule: Signal Blue and every other chrome colour appear nowhere inside a CV preview or an
 * exported PDF, because a CV carrying our accent carries our brand into somebody else's job
 * application. A highlight is chrome, and a preview that does not match the file is a preview that
 * lies about the file.
 *
 * So the sheets are shown exactly as they will print, and the account of what changed sits beside them
 * as chrome — which turns out to be the better arrangement anyway. A wall of highlighting says "many
 * things are different"; a list says *which*, in the candidate's own words, and it is readable at a size
 * where the body text of a scaled-down A4 sheet is not.
 *
 * ## It only appears once something has changed
 *
 * DESIGN.md: *"Don't show a progress indicator for progress that has not happened."* An empty
 * before-and-after — two identical sheets and a heading promising an achievement — is the interface
 * equivalent of the invented statistic this whole product is built to refuse. The parent does not render
 * this at all until `diffResumes` returns something.
 */
import type { Resume } from '@/schema/resume'
import type { PdfcnTheme } from '@/components/pdf/theme-types'
import type { Change, ChangeKind } from '@/optimize/variant-diff'
import { changeBreakdown } from '@/optimize/variant-diff'
import { PaperPreview } from '@/components/paper-preview'

/**
 * Plain words for each kind, from the candidate's side.
 *
 * "Reworded" rather than "modified", and **"You corrected"** for the things they typed themselves: the
 * distinction matters because this view exists to show somebody what they achieved, and filing their own
 * corrections under the same verb as a machine's suggestion quietly takes the credit for them.
 */
const KIND_LABELS: Record<ChangeKind, string> = {
  changed: 'Reworded',
  reordered: 'Moved up',
  added: 'Added',
  removed: 'Removed',
}

/** Semantic colour by meaning, never decoratively — Affirm for a gain, Caution for a removal. */
const KIND_STYLES: Record<ChangeKind, string> = {
  changed: 'bg-affirm-wash text-affirm',
  reordered: 'bg-signal-wash text-signal',
  added: 'bg-affirm-wash text-affirm',
  removed: 'bg-caution-wash text-caution',
}

function Sheet({
  label,
  caption,
  resume,
  theme,
  Template,
}: {
  label: string
  caption: string
  resume: Resume
  theme: PdfcnTheme
  Template: (props: { resume: Resume; theme: PdfcnTheme }) => React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex flex-col gap-0.5 px-1">
        <span className="text-[13px] font-semibold text-ink">{label}</span>
        <span className="text-meta leading-snug text-ink-soft">{caption}</span>
      </div>
      {/*
        `PaperPreview` scales the sheet to its container, so two of them side by side each get half the
        width and shrink to fit. Nothing here fixes a scale: a hardcoded one would overflow on a laptop
        and waste the pane on a wide screen.
      */}
      <PaperPreview resume={resume} theme={theme} Template={Template} />
    </div>
  )
}

export function BeforeAfter({
  original,
  current,
  changes,
  theme,
  Template,
  since = 'upload',
}: {
  original: Resume
  current: Resume
  /** Computed by the parent, which also decides whether to render this at all. */
  changes: Array<Change>
  theme: PdfcnTheme
  Template: (props: { resume: Resume; theme: PdfcnTheme }) => React.ReactNode
  /**
   * What the left-hand page **is**, which is not always the file somebody uploaded.
   *
   * A CV written here has no upload, so "as you uploaded it" would name a document that never
   * existed — and the comparison after fitting one to a job is against the version from a moment
   * before, not against the empty page it started as. The two cases need different words for the
   * same picture.
   */
  since?: 'upload' | 'fit'
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/*
        The tally, in the accent, at display size — the same treatment as the "to check" figure on the
        review form, and for the same reason: it is the one number on this screen worth reading from
        across a desk. Unlike that one, this figure counts things that went right.
      */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline bg-signal-wash px-4 py-3">
        <span className="tally text-[30px] font-extrabold leading-none tracking-[-0.03em] text-signal">
          {changes.length}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-[14px] font-semibold text-ink">
            {changes.length === 1
              ? since === 'fit'
                ? 'change fitting this job made'
                : 'change since you uploaded it'
              : since === 'fit'
                ? 'changes fitting this job made'
                : 'changes since you uploaded it'}
          </span>
          <span className="text-[13px] leading-snug text-ink-soft">
            {changeBreakdown(changes)}. Every one of them was your decision. and
            nothing was invented.
          </span>
        </span>
      </div>

      <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start">
        <Sheet
          label={since === 'fit' ? 'Before this job' : 'As you uploaded it'}
          caption={
            since === 'fit'
              ? 'Your CV a moment ago, before it was aimed at this advert.'
              : 'The file you already had.'
          }
          resume={original}
          theme={theme}
          Template={Template}
        />
        <Sheet
          label="As you will send it"
          caption="Same facts, read back correctly and typeset for a screener."
          resume={current}
          theme={theme}
          Template={Template}
        />
      </div>

      {/*
        The account of what changed. Below the sheets rather than between them: two documents to compare
        want to be adjacent, and a column of text down the middle is a wall between the two things the
        eye is trying to put together.
      */}
      <div className="flex flex-col gap-2 border-t border-hairline px-4 py-4">
        <h3 className="text-[13px] font-semibold text-ink">
          What is different
        </h3>
        <ul className="flex flex-col">
          {changes.map((change, i) => (
            <li
              key={`${change.where}-${i}`}
              className="flex flex-col gap-1 border-b border-hairline py-2.5 last:border-b-0"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${KIND_STYLES[change.kind]}`}
                >
                  {KIND_LABELS[change.kind]}
                </span>
                <span className="text-[13px] font-medium text-ink">
                  {change.where}
                </span>
              </span>
              {/*
                The old text struck through and the new one plain, when both exist. `line-through` in Ink
                Faint is the one sanctioned use of that colour — DESIGN.md lists strike decoration
                explicitly, because it fails AA for normal text and this is not text anybody has to read.
              */}
              {change.before !== undefined && change.after !== undefined && (
                <span className="flex flex-col gap-0.5 pl-1">
                  <span className="text-[13px] leading-relaxed text-ink-faint line-through decoration-ink-faint">
                    {change.before}
                  </span>
                  <span className="text-[13px] leading-relaxed text-ink">
                    {change.after}
                  </span>
                </span>
              )}
              {change.before === undefined && change.after !== undefined && (
                <span className="pl-1 text-[13px] leading-relaxed text-ink">
                  {change.after}
                </span>
              )}
              {change.after === undefined && change.before !== undefined && (
                <span className="pl-1 text-[13px] leading-relaxed text-ink-faint line-through decoration-ink-faint">
                  {change.before}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
