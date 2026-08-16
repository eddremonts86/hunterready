/**
 * A full page of a design, before choosing it.
 *
 * ## Why the gallery needed this
 *
 * The card specimen shows the voice of a design: the heading treatment, the two faces, the section it
 * opens with. It cannot show the *page* — how much air there is between jobs, whether a fifteen-year
 * history lands on one sheet, what the whole thing weighs. The gallery's own note argues correctly
 * that a 90px A4 thumbnail is a grey rectangle and worse than nothing, and the answer to that is not a
 * bigger grid. It is one page, full size, on request.
 *
 * ## Whose CV it shows, and why that is the honest way round
 *
 * It opens on **the reader's own document**. That is what they will actually download, and a design
 * judged on somebody else's fuller CV is a design judged on a promise we did not make.
 *
 * The sample is a second view, never the first. It exists because a CV with two jobs makes a generous
 * layout look empty, and somebody comparing designs deserves to see what one does with a full page.
 * It is the nurse fixture that already ships in `fixtures/`, the same document the landing offers as
 * "a finished example", and the toggle says in words that it is a sample. That keeps it on the right
 * side of DESIGN.md's No Invented Proof: a labelled illustration of our own output, not a claim.
 *
 * ## Native `<dialog>`
 *
 * `showModal()` gives focus trapping, Escape, an inert background and a backdrop, all of which are
 * easy to hand-roll badly and tedious to hand-roll well.
 */
import { useEffect, useRef, useState } from 'react'
import { Resume } from '@/schema/resume'
import { getTheme } from '@/render/themes'
import { templates } from '@/render/templates/registry'
import type { Design } from '@/render/designs'
import { PaperPreview } from './paper-preview'

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d={direction === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  )
}

export function DesignPreviewDialog({
  design,
  designs,
  resume,
  onClose,
  onChoose,
  onNavigate,
}: {
  /** The design to draw. `undefined` closes the dialog. */
  design?: Design
  /**
   * Every design, in the order the gallery lists them, so the arrows walk the same sequence the eye
   * was walking. Comparing two layouts means seeing them one after another, and closing the dialog
   * between each pair turns a comparison into a memory test.
   */
  designs: ReadonlyArray<Design>
  /** The reader's own document, which is what opens first. */
  resume: Resume
  onClose: () => void
  onChoose: (design: Design) => void
  onNavigate: (design: Design) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [sample, setSample] = useState<Resume | undefined>(undefined)
  const [showingSample, setShowingSample] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (node === null) return
    if (design !== undefined && !node.open) node.showModal()
    if (design === undefined && node.open) node.close()
  }, [design])

  /*
    Escape and the backdrop both fire `close` on the element itself, so the parent's state is synced
    from that one event rather than from three handlers that can disagree.
  */
  useEffect(() => {
    const node = ref.current
    if (node === null) return
    const handler = () => onClose()
    node.addEventListener('close', handler)
    return () => node.removeEventListener('close', handler)
  }, [onClose])

  /** Fetched once, and only if somebody asks for it. Most readers never will. */
  useEffect(() => {
    if (!showingSample || sample !== undefined) return
    let cancelled = false
    void fetch('/api/resume?fixture=nurse-senior')
      .then((response) => response.json())
      .then((data: unknown) => {
        if (cancelled) return
        const parsed = Resume.safeParse(data)
        if (parsed.success) setSample(parsed.data)
      })
      .catch(() => {
        // The reader's own document is already on screen; a failed sample fetch costs the toggle,
        // not the dialog.
      })
    return () => {
      cancelled = true
    }
  }, [showingSample, sample])

  /*
    Arrow keys walk the gallery, because a dialog whose only way forward is the mouse is a dialog
    somebody stops using after three designs. Declared before the early return so the hook order is
    the same on every render.
  */
  useEffect(() => {
    if (design === undefined) return
    const at = designs.findIndex((d) => d.id === design.id)
    if (at === -1) return
    const handler = (event: KeyboardEvent) => {
      // A held arrow should step, not sprint, and a repeat is not a fresh intent.
      if (event.repeat) return
      if (event.key === 'ArrowRight' && at < designs.length - 1) {
        onNavigate(designs[at + 1])
      }
      if (event.key === 'ArrowLeft' && at > 0) onNavigate(designs[at - 1])
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [design, designs, onNavigate])

  if (design === undefined) return null

  const theme = getTheme(design.theme)
  const template = templates[design.structure]
  const shown = showingSample && sample !== undefined ? sample : resume
  const at = designs.findIndex((d) => d.id === design.id)
  const previous = at > 0 ? designs[at - 1] : undefined
  const next = at >= 0 && at < designs.length - 1 ? designs[at + 1] : undefined

  return (
    <dialog
      ref={ref}
      aria-labelledby="design-preview-heading"
      className="m-auto w-[min(96vw,900px)] rounded-card border border-hairline bg-ground p-0 backdrop:bg-ink/40"
    >
      <div className="flex max-h-[92vh] flex-col">
        {/*
          Two rows, because they answer different questions.

          The first says which design this is, and carries the close in the corner a reader's hand
          already goes to. The second splits the two kinds of control apart: what this dialog can *do*
          on the left, where to *go* on the right. Putting them in one run had "Use this design"
          sitting between the arrows and the close, so the destructive-looking end of the row and the
          committing one were neighbours.
        */}
        <div className="relative border-b border-hairline px-5 py-3.5 pr-14">
          <span className="flex flex-col">
            <span id="design-preview-heading" className="text-title text-ink">
              {design.label}
            </span>
            <span className="text-meta text-ink-soft">{design.hint}</span>
          </span>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="btn btn-quiet absolute right-4 top-3.5 px-2.5 py-1.5"
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
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onChoose(design)
                  onClose()
                }}
                className="btn btn-primary px-4 py-1.5 text-[13px]"
              >
                Use this design
              </button>
              <button
                type="button"
                onClick={() => setShowingSample(!showingSample)}
                className="btn btn-quiet px-3 py-1.5 text-[13px]"
              >
                {showingSample ? 'Show my CV' : 'Show a full sample'}
              </button>
            </div>

            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => previous !== undefined && onNavigate(previous)}
                disabled={previous === undefined}
                aria-label="Previous design"
                className="btn btn-quiet px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Chevron direction="left" />
              </button>
              {/* Tabular, so the figure does not shuffle the arrows sideways as it counts. */}
              <span className="tally min-w-[5rem] text-center text-meta text-ink-soft">
                {at + 1} of {designs.length}
              </span>
              <button
                type="button"
                onClick={() => next !== undefined && onNavigate(next)}
                disabled={next === undefined}
                aria-label="Next design"
                className="btn btn-quiet px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Chevron direction="right" />
              </button>
            </span>
          </div>
        </div>

        {showingSample && (
          <p className="border-b border-caution/25 bg-caution-wash px-5 py-2 text-meta leading-relaxed text-ink">
            This is a sample CV, not yours. It is here to show what the layout
            does with a full page.
          </p>
        )}

        <div className="flex min-h-0 flex-1">
          <PaperPreview
            resume={shown}
            theme={theme}
            Template={template.Component}
          />
        </div>
      </div>
    </dialog>
  )
}
