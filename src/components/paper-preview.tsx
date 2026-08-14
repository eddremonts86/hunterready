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
  const [scale, setScale] = useState(1)
  /**
   * Where each page starts, as an offset into the laid-out content.
   *
   * `[0]` until the first measurement, so the first paint is a single correct-looking sheet rather than a
   * flash of nothing. One page is also the truth for most CVs.
   */
  const [breaks, setBreaks] = useState<Array<number>>([0])

  const { page } = theme.spacing
  const usable = SHEET_HEIGHT - page.marginTop - page.marginBottom

  useEffect(() => {
    const element = containerRef.current
    if (element === null) return

    const observer = new ResizeObserver(() => {
      // Leave a little air so the sheet reads as an object on a surface, not a full bleed.
      const next = (element.clientWidth - 32) / SHEET_WIDTH
      setScale(Math.min(1, Math.max(0.2, next)))
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

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
    <div ref={containerRef} className="flex-1 overflow-auto bg-band p-4">
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

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          // Real reserved height: pages, their gaps, and the scale they are drawn at. The old version
          // reserved one page whatever the content, which is why a second page escaped the scroll area.
          height:
            (SHEET_HEIGHT * breaks.length + 24 * (breaks.length - 1)) * scale,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
          }}
        >
          {breaks.map((offset, index) => (
            <div key={index} style={sheetStyle}>
              {/*
                The same content on every sheet, shifted up so this page's slice is the part on view. One
                tree per sheet rather than one tree cloned: the templates are pure and cheap, and cloning
                a laid-out DOM subtree is how a preview starts disagreeing with itself.
              */}
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
          ))}
        </div>
      </div>
    </div>
  )
}
