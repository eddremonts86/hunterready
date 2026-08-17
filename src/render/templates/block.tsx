/**
 * One block of a CV that the person placed themselves, drawn in the design's own idiom.
 *
 * ## Why this exists rather than a switch in nine files
 *
 * `custom` began as "a section this CV has that our schema does not name". Then it gained a spacer,
 * and a spacer is not a section — at that moment it stopped being a list of sections and became a list
 * of *blocks*, which is the thing pdfcn's component catalogue is a catalogue of. Every template
 * already hands `Ordered` a function that draws one entry; this is that function, written once.
 *
 * A design supplies the two primitives it draws with — a heading and a line — and gets every kind for
 * free. That is what keeps a new block type to one arm here instead of nine near-identical edits, and
 * it is why the nine ways this project's templates draw a section heading survive untouched.
 *
 * ## What is here, and what will not be
 *
 * pdfcn publishes twenty-four components. These are the ones a CV can carry without breaking the one
 * promise this product makes:
 *
 *   • **section** — a heading and its lines. What `custom` always was.
 *   • **heading** — a heading with nothing under it, for grouping the sections below it.
 *   • **text** — paragraphs belonging to no heading.
 *   • **keyValue** — a definition list: "Driving licence — B, clean".
 *   • **divider** — a rule between two things. No text.
 *   • **space** — room. No text.
 *   • **pageBreak** — start the next page here. No text.
 *
 * **Tables, page headers and footers, watermarks, QR codes, charts and form fields are deliberately
 * absent, and are not a roadmap item.** docs/05: a table is the commonest way a CV loses its
 * employment history in a screener; header and footer regions are discarded by many parsers, so
 * anything only there is gone; a chart or a QR code extracts as *nothing*, which makes it a claim the
 * reader can see and the software cannot. The round-trip test would fail every one of them, and it
 * would be right to.
 *
 * ## The rule every block obeys
 *
 * Whatever it draws, the extracted text must be the words the person wrote and nothing else. The three
 * blocks that draw no words contribute none — asserted across all 28 templates in
 * `ats-roundtrip.test.ts`, because a stray glyph in somebody's document is invisible from here and
 * obvious to a recruiter's parser.
 */
import { Fragment } from 'react'
import { View } from '@/lib/pdf-primitives'
import type { PdfcnTheme } from '@/components/pdf/theme-types'
import { kindOf } from '@/schema/resume'
import type { Resume } from '@/schema/resume'

/** How this design draws a section heading and a line of body text. Nothing else is needed. */
export interface BlockChrome {
  heading: (title: string) => React.ReactNode
  line: (text: string, key: number) => React.ReactNode
  /**
   * Designs that draw a section as a *container* rather than a heading with siblings after it.
   *
   * `showcase` is one: its `<Section title>` wraps its content, so a heading returned on its own would
   * be an opening tag with nothing in it. One optional hook rather than forcing eight templates that
   * do it the other way to grow a wrapper they do not need.
   */
  group?: (title: string, children: React.ReactNode) => React.ReactNode
}

/** 25px above and below, which is what a spacer defaults to. Kept here for the blocks that share it. */
const DEFAULT_GAP = 25

export function Block({
  block,
  theme,
  chrome,
}: {
  block: Resume['custom'][number]
  theme: PdfcnTheme
  chrome: BlockChrome
}) {
  switch (kindOf(block)) {
    /**
     * Margins, not height. A spacer is not an object on the page with a size, it is the absence of
     * one — and margins collapse against a section's own leading gap in a way a box would not.
     */
    case 'space':
      return (
        <View
          style={{
            marginTop: block.space ?? DEFAULT_GAP,
            marginBottom: block.space ?? DEFAULT_GAP,
            height: 0,
          }}
        />
      )

    /**
     * A rule, in the document's own border colour — never the accent.
     *
     * A divider is punctuation, not emphasis. Drawing it in the accent would make the loudest thing on
     * a page of text a line that says nothing, and DESIGN.md's rule about the print not being ours
     * points the same way: a theme's accent is for the things that carry meaning.
     */
    case 'divider':
      return (
        <View
          style={{
            marginTop: block.space ?? DEFAULT_GAP / 2,
            marginBottom: block.space ?? DEFAULT_GAP / 2,
            height: 0,
            borderBottomWidth: 1,
            borderBottomStyle: 'solid',
            borderBottomColor: theme.colors.border,
          }}
        />
      )

    /**
     * `breakBefore`, the same property `keep-together` and the page counter rely on.
     *
     * Not a tall spacer, which is how people fake this in a word processor and why their CV grows a
     * blank half-page whenever a line above it reflows.
     */
    case 'pageBreak':
      return <View style={{ breakBefore: 'page' }} />

    /** A heading with nothing under it — the thing above it names what follows. */
    case 'heading':
      return <>{block.title === '' ? null : chrome.heading(block.title)}</>

    /**
     * Paragraphs with no heading. Drawn as lines rather than bullets, because a paragraph that a
     * design turns into a bullet is a paragraph the design has editorialised.
     */
    case 'text':
      return (
        <>
          {block.items
            .filter((item) => item.trim() !== '')
            .map((item, i) => (
              <View key={i} style={{ marginTop: i === 0 ? 4 : 3 }}>
                {item}
              </View>
            ))}
        </>
      )

    /**
     * A definition list, drawn as "Label: value" on one line each.
     *
     * Not two columns. Two columns is a table by another name, and a parser reading them in the wrong
     * order turns "Nationality: Danish" and "Licence: B" into "Nationality Licence" and "Danish B".
     * One line per pair extracts as what it says.
     */
    case 'keyValue':
      return (
        <>
          {block.title === '' ? null : chrome.heading(block.title)}
          {(block.pairs ?? [])
            .filter(
              (pair) => pair.label.trim() !== '' || pair.value.trim() !== '',
            )
            .map((pair, i) => (
              <View key={i} style={{ marginTop: 3, flexDirection: 'row' }}>
                <View style={{ fontWeight: 700 }}>
                  {pair.label === '' ? '' : `${pair.label}: `}
                </View>
                <View>{pair.value}</View>
              </View>
            ))}
        </>
      )

    default: {
      const lines = block.items.map((item, i) => chrome.line(item, i))
      if (chrome.group !== undefined)
        return <>{chrome.group(block.title, lines)}</>
      return (
        <Fragment>
          {block.title === '' ? null : chrome.heading(block.title)}
          {lines}
        </Fragment>
      )
    }
  }
}
