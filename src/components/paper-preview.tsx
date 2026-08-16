/**
 * On-screen preview of a CV: the same template component, rendered as HTML on paper sheets.
 *
 * Why not embed the PDF? Two reasons, one of them a real product constraint:
 *
 * 1. Inline PDF viewing is not universal. Desktop Chrome renders it; plenty of environments
 *    hand the file to a download dialog instead, and mobile Safari is unreliable. A preview
 *    that silently shows nothing is worse than no preview.
 * 2. It costs a server render per change. An HTML preview is instant, which matters because
 *    the review step is a tight edit loop — the user fixes a field and looks straight back.
 *
 * This works because the templates are plain React with inline styles: takumi's `Document`
 * and `Page` are flex divs, and page geometry lives in the theme, not the tree.
 *
 * ## It shows pages now, because one endless sheet was a lie
 *
 * This used to render a single sheet with `minHeight: A4` and reserve exactly one page of scroll height.
 * A two-page CV therefore grew past the paper and out of its own container — content sitting on the grey
 * band below the sheet, overlapping whatever came next, while the header said "2 pages". The preview
 * disagreed with the document about the most basic fact a person checks.
 *
 * Now the content is measured once, broken into pages, and each page drawn on its own sheet.
 *
 * ## Breaks land between entries, never through them
 *
 * The naive version slices every `usable` pixels, which cuts a job in half across the seam. takumi does
 * not do that — every work entry carries `breakInside: 'avoid'` (docs/05) — so a pixel-sliced preview
 * would invent a break the PDF will not have. Instead the top-level blocks are measured and a page ends
 * before the first block that would not fit, which is the same rule the renderer follows.
 *
 * ## What the count is worth
 *
 * The measured page count is reported upward and the header prefers it over `estimateFit`, because it is
 * better evidence: measured against the real PDF, they agreed exactly at one page and at two. At a
 * pathological length — a single 13,000-character paragraph — the browser wrapped it into three pages
 * where takumi produced two.
 *
 * That residual difference is two layout engines disagreeing and it cannot be removed, but note its
 * **direction**: the preview over-counts, so somebody may be shown a page the PDF does not have. Never the
 * reverse. The bug this replaces was the reverse — content that existed and appeared nowhere.
 *
 * ⚠️ HONEST LIMITATION, unchanged: this is a preview, not the artifact. A line can wrap differently and a
 * break can land one block earlier or later. Anything load-bearing is read from the PDF itself.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PdfcnTheme } from '@/components/pdf/theme-types'
import type { Resume } from '@/schema/resume'

/** A4 at 96 dpi, the unit takumi lays out in. */
/**
 * The steps a reader moves through, not a free slider.
 *
 * A slider on a document invites fiddling and lands on 87%, where the type is neither fitted nor a
 * comfortable size. Six stops cover the two real intentions: see the whole page, or read the words.
 */
const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3] as const

const SHEET_WIDTH = 794
const SHEET_HEIGHT = 1123

/** Beyond this, something has gone wrong with measurement and a browser should not be asked to draw it. */
const MAX_PAGES = 12

export function PaperPreview({
  resume,
  theme,
  Template,
  onPagesMeasured,
}: {
  resume: Resume
  theme: PdfcnTheme
  Template: (props: { resume: Resume; theme: PdfcnTheme }) => React.ReactNode
  /**
   * How many pages the laid-out document actually came to.
   *
   * Reported upward because it is **better evidence than `estimateFit`**, which counts characters per line
   * and over-counts on an unusual block: a 9,710-character summary made it claim three pages where the
   * renderer produced two, and the preview — measuring real laid-out boxes — agreed with the renderer.
   * The estimator still earns its place before anything has been measured, which is why it stays.
   */
  onPagesMeasured?: (pages: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  /**
   * A multiplier on the fitted scale, because fitting is not the same as reading.
   *
   * `scale` answers "how much of this sheet can I show in the space I was given", and it is clamped
   * at 1 so a page never draws larger than life by accident. On a laptop half-screen that lands
   * around 0.55, where 10pt body text is about six pixels tall and the document is a picture of a CV
   * rather than a CV. This is the reader's own answer to that, and it multiplies rather than replaces
   * so the fit stays the baseline every step is relative to.
   */
  /**
   * What the scale is *for*, rather than only what it is.
   *
   * `'width'` fills the space with the page, which is the reading posture. `'page'` shows the whole
   * sheet at once, which is the judging posture: it is the only one that answers "does this land on
   * one page and how does the whole thing sit". A number is a size the reader picked, and it stops
   * following the container so a chosen size does not evaporate when the window moves.
   */
  const [mode, setMode] = useState<'width' | 'page' | number>('width')
  const [box, setBox] = useState({ width: 0, height: 0 })
  const [current, setCurrent] = useState(0)
  /**
   * Where each page starts, as an offset into the laid-out content.
   *
   * `[0]` until the first measurement, so the first paint is a single correct-looking sheet rather than a
   * flash of nothing. One page is also the truth for most CVs.
   */
  const [breaks, setBreaks] = useState<Array<number>>([0])

  const { page } = theme.spacing
  const usable = SHEET_HEIGHT - page.marginTop - page.marginBottom
  /*
    One number, derived rather than stored, so the two fit modes cannot drift out of step with the
    container the way a cached scale does.
  */
  const fitWidth =
    box.width === 0 ? 1 : Math.max(0.2, (box.width - 32) / SHEET_WIDTH)
  const fitPage =
    box.height === 0
      ? fitWidth
      : Math.max(0.2, Math.min(fitWidth, (box.height - 32) / SHEET_HEIGHT))
  const effective =
    mode === 'width' ? Math.min(1, fitWidth) : mode === 'page' ? fitPage : mode

  useEffect(() => {
    const element = containerRef.current
    if (element === null) return
    const observer = new ResizeObserver(() => {
      setBox({ width: element.clientWidth, height: element.clientHeight })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  /** The vertical stride of one page at the current size: the sheet plus the gap under it. */
  const stride = (SHEET_HEIGHT + 24) * effective

  const goToPage = (index: number) => {
    const element = containerRef.current
    if (element === null) return
    const clamped = Math.max(0, Math.min(breaks.length - 1, index))
    element.scrollTo({ top: clamped * stride, behavior: 'smooth' })
    setCurrent(clamped)
  }

  /*
    Ctrl-wheel and trackpad pinch, registered by hand.

    React's `onWheel` is attached passively, so its `preventDefault` is ignored and the browser keeps
    the gesture for its own zoom: the whole interface grows and the document does not. The only way to
    claim it is a listener declared `{ passive: false }`, which React's prop cannot express.

    Declared as a ref-following effect rather than inline so the cleanup is real, and `nudge` is read
    from a ref so the listener does not need re-attaching on every size change.
  */
  const nudgeRef = useRef<(direction: 1 | -1) => void>(() => {})
  useEffect(() => {
    const element = containerRef.current
    if (element === null) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      nudgeRef.current(event.deltaY < 0 ? 1 : -1)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  /** Step to the next size up or down from wherever the reader currently is. */
  const nudge = (direction: 1 | -1) => {
    const at = effective
    const next =
      direction === 1
        ? (ZOOM_STEPS.find((z) => z > at + 0.001) ??
          ZOOM_STEPS[ZOOM_STEPS.length - 1])
        : ([...ZOOM_STEPS].reverse().find((z) => z < at - 0.001) ??
          ZOOM_STEPS[0])
    setMode(next)
  }
  nudgeRef.current = nudge

  /**
   * Measure, then decide where the pages break.
   *
   * `useLayoutEffect` rather than `useEffect`: this runs after the hidden copy has been laid out but
   * before the browser paints, so the sheets appear already paginated instead of reflowing once.
   *
   * The dependency is the resume and the theme, which is everything that can change the height. A
   * `ResizeObserver` on the measurer would be tempting and wrong — the measurer is a fixed 794px wide, so
   * it never resizes, and the sheets are *scaled*, not reflowed.
   */
  useLayoutEffect(() => {
    const element = measureRef.current
    if (element === null) return

    /**
     * Find the container whose children are the document's blocks.
     *
     * Not `element.children`, which was the first attempt and produced exactly one child — takumi's
     * `Document` wrapper — so nothing was ever taller than a page *relative to itself* and every CV came
     * out one page long while the header said two. The real blocks are several levels down, behind
     * `Document`, `Page` and the theme provider.
     *
     * Descended rather than hardcoded at a depth: walk down while there is exactly one element child, and
     * stop at the first node that branches. That survives a wrapper being added or removed, which a
     * `children[0].children[0].children[0]` chain would not.
     */
    let container: HTMLElement = element
    while (container.children.length === 1) {
      const only = container.children[0]
      if (!(only instanceof HTMLElement)) break
      container = only
    }

    const blocks = [...container.children] as Array<HTMLElement>
    if (blocks.length === 0) {
      setBreaks([0])
      return
    }

    const next: Array<number> = [0]
    let pageTop = 0

    for (const block of blocks) {
      const top = block.offsetTop
      const bottom = top + block.offsetHeight

      // A block that would not fit on the current page starts the next one.
      if (bottom - pageTop > usable && top > pageTop) {
        pageTop = top
        next.push(top)
        if (next.length >= MAX_PAGES) break
      }

      /**
       * A block taller than a whole page has to be cut through, and this is the part the first version got
       * wrong — badly enough to lose content.
       *
       * It used to move the page start to such a block and then go on to the next block, so a summary two
       * pages tall was shown from its beginning on one sheet, clipped, and its **middle was never drawn on
       * any sheet at all**. Found by pushing a 26-sentence paragraph through the preview and reading the
       * sheets: page two started at the paragraph, page three at the section after it, and the thousand
       * pixels in between existed nowhere.
       *
       * So a page-sized step is added through the overflow. Cutting a paragraph mid-line is not pretty and
       * it is what takumi does too, having no other option; losing a page of somebody's CV silently is not
       * a trade at all.
       */
      while (bottom - pageTop > usable && next.length < MAX_PAGES) {
        pageTop += usable
        next.push(pageTop)
      }
      if (next.length >= MAX_PAGES) break
    }

    setBreaks(next)
    onPagesMeasured?.(next.length)
  }, [resume, theme, usable, onPagesMeasured])

  const sheetStyle = {
    width: SHEET_WIDTH,
    height: SHEET_HEIGHT,
    backgroundColor: theme.colors.background,
    paddingTop: page.marginTop,
    paddingRight: page.marginRight,
    paddingBottom: page.marginBottom,
    paddingLeft: page.marginLeft,
    /*
      A printed sheet has an edge and it sits on something. Hairline plus a wide, low falloff tinted with
      the ink rather than black — the `.lift` recipe from DESIGN.md, at paper scale.
    */
    boxShadow:
      '0 0 0 1px rgb(16 26 51 / 10%), 0 18px 40px -20px rgb(16 26 51 / 28%)',
    // The window each sheet shows into the content. Without this a page would spill over its own edge.
    overflow: 'hidden',
  } as const

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/*
        The control sits above the paper rather than floating over it, because a button on top of the
        document is a button covering the document at exactly the moment somebody zoomed in to see
        what was underneath it.
      */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-hairline bg-ground px-3 py-1.5">
        {/*
          Page navigation on the left, because it is about *where* you are, and the count already
          existed: `breaks.length` was being used to write "2 pages" and for nothing else. Zoomed to
          200%, reaching the second page was a long blind scroll.
        */}
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => goToPage(current - 1)}
            disabled={current <= 0}
            aria-label="Previous page"
            className="btn btn-quiet px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
          >
            &lsaquo;
          </button>
          <span className="tally min-w-[4.5rem] text-center text-meta text-ink-soft">
            {breaks.length === 1
              ? '1 page'
              : `${current + 1} of ${breaks.length}`}
          </span>
          <button
            type="button"
            onClick={() => goToPage(current + 1)}
            disabled={current >= breaks.length - 1}
            aria-label="Next page"
            className="btn btn-quiet px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
          >
            &rsaquo;
          </button>
        </span>

        <span className="flex items-center gap-1">
          {/*
            The two postures, named. "Width" fills the space to read the words; "Page" shows the whole
            sheet to judge whether it lands on one. Both are pressed states rather than plain buttons,
            because which one you are in changes what the percentage beside them means.
          */}
          <button
            type="button"
            onClick={() => setMode('width')}
            aria-pressed={mode === 'width'}
            className={`btn px-2.5 py-1 text-[12px] ${mode === 'width' ? 'btn-primary' : 'btn-quiet'}`}
          >
            Width
          </button>
          <button
            type="button"
            onClick={() => setMode('page')}
            aria-pressed={mode === 'page'}
            className={`btn px-2.5 py-1 text-[12px] ${mode === 'page' ? 'btn-primary' : 'btn-quiet'}`}
          >
            Page
          </button>

          <span className="mx-1 h-4 w-px bg-hairline" />

          <button
            type="button"
            onClick={() => nudge(-1)}
            disabled={effective <= ZOOM_STEPS[0] + 0.001}
            aria-label="Zoom out"
            className="btn btn-quiet px-2 py-1 text-[13px] disabled:cursor-not-allowed disabled:opacity-40"
          >
            &minus;
          </button>
          {/*
            The size against a real page, not a percentage of the fit. "100%" then means life-size,
            which is the number somebody wants when they ask how big this is.
          */}
          <span className="tally min-w-[3.5rem] text-center text-meta text-ink-soft">
            {Math.round(effective * 100)}%
          </span>
          <button
            type="button"
            onClick={() => nudge(1)}
            disabled={effective >= ZOOM_STEPS[ZOOM_STEPS.length - 1] - 0.001}
            aria-label="Zoom in"
            className="btn btn-quiet px-2 py-1 text-[13px] disabled:cursor-not-allowed disabled:opacity-40"
          >
            +
          </button>
        </span>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-band p-4"
        onScroll={(event) => {
          // Which page is under the top of the viewport. Cheap, and it keeps the counter honest when
          // somebody scrolls by hand rather than using the arrows.
          const at = Math.round(event.currentTarget.scrollTop / stride)
          if (at !== current)
            setCurrent(Math.max(0, Math.min(breaks.length - 1, at)))
        }}
      >
        {/*
        The measurer: one off-screen copy at full width, laid out but never seen.

        `position: absolute` with `visibility: hidden` rather than `display: none` — a display-none subtree
        has no layout at all, so every offsetHeight would read zero and every CV would be one page.
        `aria-hidden` and `inert` so the duplicate is not announced twice or reachable by keyboard.
      */}
        <div
          ref={measureRef}
          aria-hidden
          inert
          style={{
            position: 'absolute',
            top: 0,
            left: -99999,
            width: SHEET_WIDTH - page.marginLeft - page.marginRight,
            visibility: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <Template resume={resume} theme={theme} />
        </div>

        {/*
        A box the exact size of the scaled document, with the sheets drawn from its top-left corner.

        The transform origin used to be `top center`, which is invisible while the page is being shrunk
        to fit and wrong the moment it is magnified: the sheet grows past both edges at once, and a
        scroll container cannot scroll left of zero, so the left margin of the document became
        unreachable. Anchoring at the corner and reserving the real footprint means both axes scroll.
      */}
        <div
          style={{
            width: SHEET_WIDTH * effective,
            height:
              (SHEET_HEIGHT * breaks.length + 24 * (breaks.length - 1)) *
              effective,
            margin: '0 auto',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 24,
              transform: `scale(${effective})`,
              transformOrigin: 'top left',
            }}
          >
            {breaks.map((offset, index) => (
              <div key={index} style={sheetStyle}>
                {/*
                Each sheet shows content from its own break up to the **next** break — not a fixed page
                height — and that distinction is the fix for content appearing twice.

                A page can end early. When the next block will not fit, the break lands at that block's
                top, which may be well short of a full page: the first version still drew a full page's
                worth from each offset, so everything between the break and the page height was painted at
                the bottom of one sheet and again at the top of the next. Edd's screenshot caught it —
                three sentences and an EXPERIENCE heading repeated across the seam.

                Real pages behave the way this now does: a page that ends early leaves white space below,
                which is exactly what takumi produces when `breakInside: 'avoid'` pushes an entry over.
              */}
                <div
                  style={{
                    height: Math.min(
                      usable,
                      (breaks[index + 1] ?? Infinity) - offset,
                    ),
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      transform: `translateY(-${offset}px)`,
                      // Rendered at the content width, so a wrap here matches the measurer exactly.
                      width: SHEET_WIDTH - page.marginLeft - page.marginRight,
                    }}
                  >
                    <Template resume={resume} theme={theme} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
