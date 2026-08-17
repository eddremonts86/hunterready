/**
 * Blank room between two sections, and nothing else on the page.
 *
 * ## Why the renderer has to know about it
 *
 * People already do this. Faced with a CV whose sections run together, they add a custom section with
 * a blank title, or one titled with a space, or three empty bullets — and every one of those lands in
 * the extracted text as a heading that reads as a parse failure. A recruiter's software sees an empty
 * section; the candidate sees the gap they wanted. Giving the gap a name the renderer understands means
 * it draws room and contributes **no text at all**, which is the only version of this that is safe to
 * put in a document whose whole promise is that it extracts cleanly.
 *
 * ## Margins, not height
 *
 * `marginTop`/`marginBottom` rather than a box of a given height, because that is what was asked for —
 * 25px above and below — and because it is the honest shape: a spacer is not an object on the page with
 * a size, it is the absence of one. It also collapses correctly against a section's own leading gap in
 * a way a fixed-height box would not.
 *
 * ## One component, nine templates
 *
 * Every template that renders `resume.custom` renders this, and none of them decides for itself what a
 * spacer looks like. There is exactly one thing it can look like.
 */
import { View } from '@/lib/pdf-primitives'

export function Spacer({ space }: { space: number }) {
  return (
    <View
      style={{
        marginTop: space,
        marginBottom: space,
        // No height of its own: the margins are the whole element. A `height` here would add a third
        // gap to the two that were asked for.
        height: 0,
      }}
    />
  )
}
