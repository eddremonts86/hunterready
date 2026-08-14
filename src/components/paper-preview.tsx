/**
 * On-screen preview of a CV: the same template component, rendered as HTML on a paper sheet.
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
 * and `Page` are flex divs, and page geometry lives in the render options, not the tree.
 *
 * ⚠️ HONEST LIMITATION: this is a preview, not the artifact. The browser's layout engine and
 * takumi's are different implementations, so line breaks and pagination can differ by a line.
 * The PDF is what the user sends, and the ATS round-trip test guards *that*. Anything
 * load-bearing — page count, "does this fit on one page" — must be read from the PDF.
 */
import { useEffect, useRef, useState } from 'react'
import type { PdfcnTheme } from '@/components/pdf/theme-types'
import type { Resume } from '@/schema/resume'

/** A4 at 96 dpi, the unit takumi lays out in. */
const SHEET_WIDTH = 794
const SHEET_HEIGHT = 1123

export function PaperPreview({
  resume,
  theme,
  Template,
}: {
  resume: Resume
  theme: PdfcnTheme
  Template: (props: { resume: Resume; theme: PdfcnTheme }) => React.ReactNode
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const element = containerRef.current
    if (element === null) return

    // Reads the observed element directly rather than the entry list: we observe exactly one
    // element, and `entries[0]` is typed as always-present, so guarding it is dead code to TS.
    const observer = new ResizeObserver(() => {
      // Leave a little air so the sheet reads as an object on a surface, not a full bleed.
      const next = (element.clientWidth - 32) / SHEET_WIDTH
      setScale(Math.min(1, Math.max(0.2, next)))
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const { page } = theme.spacing

  return (
    <div ref={containerRef} className="flex-1 overflow-auto bg-band p-4">
      <div
        // The scaled sheet still needs to reserve its real height, or the scroll area lies.
        style={{
          height: SHEET_HEIGHT * scale,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: SHEET_WIDTH,
            minHeight: SHEET_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
            backgroundColor: theme.colors.background,
            paddingTop: page.marginTop,
            paddingRight: page.marginRight,
            paddingBottom: page.marginBottom,
            paddingLeft: page.marginLeft,
            // A printed sheet has an edge and it sits on something. On the previous dark ground a
            // 1px hairline was enough; on a light band the sheet disappears into it without a real
            // contact shadow, so this now matches the `.lift` recipe — hairline plus a wide, low
            // falloff, tinted with the ink rather than black.
            boxShadow:
              '0 0 0 1px rgb(16 26 51 / 10%), 0 18px 40px -20px rgb(16 26 51 / 28%)',
          }}
        >
          <Template resume={resume} theme={theme} />
        </div>
      </div>
    </div>
  )
}
