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
import { View, Image, Link } from '@/lib/pdf-primitives'
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
  const kind = kindOf(block)
  const muted = theme.colors.mutedForeground
  const border = theme.colors.border
  const body = theme.typography.body.fontSize
  const heading = (t: string) => (t === '' ? null : chrome.heading(t))
  const lines = () => block.items.map((item, i) => chrome.line(item, i))
  const value = block.value ?? ''

  switch (kind) {
    /* ── Room and rules: everything here draws no words at all ──────────────────────────────── */

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
     * a page of text a line that says nothing.
     */
    case 'divider':
      return (
        <View
          style={{
            marginTop: block.space ?? DEFAULT_GAP / 2,
            marginBottom: block.space ?? DEFAULT_GAP / 2,
            height: 0,
            borderBottomWidth: 1,
            borderBottomStyle: block.variant ?? 'solid',
            borderBottomColor: border,
          }}
        />
      )

    /**
     * `breakBefore`, plus a marker the preview can see.
     *
     * The preview is a second renderer that paginates by measured height, and an instruction with no
     * height is invisible to it — so for a while the PDF broke the page and the preview did not. See
     * `paper-preview.tsx`.
     */
    case 'pageBreak':
      return <View style={{ breakBefore: 'page' }} data-page-break="" />

    /* ── Text ───────────────────────────────────────────────────────────────────────────────── */

    case 'heading':
      return <>{heading(block.title)}</>

    /**
     * Paragraphs with no heading. Drawn as lines rather than bullets, because a paragraph a design
     * turns into a bullet is a paragraph the design has editorialised.
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
     * A list with its own marker.
     *
     * Numbers are written into the text rather than drawn beside it: a marker a parser cannot see is a
     * list that extracts as a run-on paragraph, and "1." costs three characters.
     */
    case 'list':
      return (
        <>
          {block.items
            .filter((item) => item.trim() !== '')
            .map((item, i) => {
              const marker =
                block.variant === 'number'
                  ? `${i + 1}. `
                  : block.variant === 'none'
                    ? ''
                    : '• '
              return (
                <View key={i} style={{ marginTop: 3, flexDirection: 'row' }}>
                  {marker === '' ? null : (
                    <View style={{ color: muted }}>{marker}</View>
                  )}
                  <View style={{ flexGrow: 1 }}>{item}</View>
                </View>
              )
            })}
        </>
      )

    /**
     * A definition list, one line per pair.
     *
     * Not two columns. Two columns is a table by another name, and a parser reading them in the wrong
     * order turns "Nationality: Danish" and "Licence: B" into "Nationality Licence" and "Danish B".
     */
    case 'keyValue':
    case 'form':
      return (
        <>
          {heading(block.title)}
          {(block.pairs ?? [])
            .filter((p) => p.label.trim() !== '' || p.value.trim() !== '')
            .map((pair, i) => (
              <View key={i} style={{ marginTop: 3, flexDirection: 'row' }}>
                <View style={{ fontWeight: 700 }}>
                  {pair.label === '' ? '' : `${pair.label}: `}
                </View>
                {/* A form's blank still prints its rule, so there is something to write on. */}
                <View
                  style={
                    kind === 'form' && pair.value === ''
                      ? {
                          flexGrow: 1,
                          borderBottomWidth: 1,
                          borderBottomStyle: 'solid',
                          borderBottomColor: border,
                        }
                      : {}
                  }
                >
                  {pair.value}
                </View>
              </View>
            ))}
        </>
      )

    /** A bordered box. Its content is ordinary text, so it extracts exactly as it reads. */
    case 'card':
      return (
        <View
          style={{
            marginTop: 6,
            padding: 8,
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: border,
            breakInside: 'avoid',
          }}
        >
          {heading(block.title)}
          {lines()}
        </View>
      )

    /**
     * A tinted remark. The tint comes from the theme's own semantic inks, never from the app's —
     * DESIGN.md's hardest rule is that the print is not ours.
     */
    case 'alert': {
      const tone =
        block.variant === 'success'
          ? theme.colors.foreground
          : block.variant === 'warning'
            ? theme.colors.foreground
            : theme.colors.foreground
      return (
        <View
          style={{
            marginTop: 6,
            padding: 8,
            backgroundColor: theme.colors.muted,
            borderLeftWidth: 3,
            borderLeftStyle: 'solid',
            borderLeftColor: border,
            color: tone,
            breakInside: 'avoid',
          }}
        >
          {heading(block.title)}
          {lines()}
        </View>
      )
    }

    /** One line set apart by a rule beside it. */
    case 'callout':
      return value === '' ? null : (
        <View
          style={{
            marginTop: 8,
            paddingLeft: 10,
            borderLeftWidth: 3,
            borderLeftStyle: 'solid',
            borderLeftColor: border,
            breakInside: 'avoid',
          }}
        >
          {value}
        </View>
      )

    case 'quote':
      return value === '' ? null : (
        <View style={{ marginTop: 8, breakInside: 'avoid' }}>
          <View style={{ fontStyle: 'italic' }}>{`“${value}”`}</View>
          {block.label === undefined || block.label === '' ? null : (
            <View style={{ marginTop: 2, color: muted, fontSize: body - 1 }}>
              {`— ${block.label}`}
            </View>
          )}
        </View>
      )

    /**
     * A rule to sign above. The name is written under it as text, so the block says who signs even
     * when nobody has.
     */
    case 'signature':
      return (
        <View style={{ marginTop: 18, breakInside: 'avoid' }}>
          <View
            style={{
              width: 200,
              height: 0,
              marginBottom: 4,
              borderBottomWidth: 1,
              borderBottomStyle: 'solid',
              borderBottomColor: border,
            }}
          />
          {block.label === undefined || block.label === '' ? null : (
            <View>{block.label}</View>
          )}
          {value === '' ? null : (
            <View style={{ color: muted, fontSize: body - 1 }}>{value}</View>
          )}
        </View>
      )

    /**
     * A link whose address is written out.
     *
     * Both the label and the target, because a PDF hyperlink whose text reads "Portfolio" is a dead
     * end on paper and extracts as one word — and a CV gets printed more often than anyone expects.
     */
    case 'link':
      return value === '' ? null : (
        <View style={{ marginTop: 3, flexDirection: 'row' }}>
          {block.label === undefined || block.label === '' ? null : (
            <View style={{ fontWeight: 700 }}>{`${block.label}: `}</View>
          )}
          <Link src={value} style={{ color: theme.colors.primary }}>
            {value}
          </Link>
        </View>
      )

    /** A short word on a tinted pill. It is text, so it extracts as text. */
    case 'badge':
      return value === '' ? null : (
        <View style={{ marginTop: 4, flexDirection: 'row' }}>
          <View
            style={{
              paddingTop: 1,
              paddingBottom: 1,
              paddingLeft: 6,
              paddingRight: 6,
              backgroundColor: theme.colors.muted,
              fontSize: body - 1.5,
              fontWeight: 700,
            }}
          >
            {value}
          </View>
        </View>
      )

    /** Lines that must not split across a page. The one pdfcn component this project already used. */
    case 'keepTogether':
      return (
        <View style={{ breakInside: 'avoid' }}>
          {heading(block.title)}
          {lines()}
        </View>
      )

    /* ── The ones that cost the guarantee. See `render/blocks.ts` for why they exist. ───────── */

    /**
     * A table, drawn as flex rows because the renderer has no grid (Satori-lineage subset).
     *
     * Its cells extract in DOM order, which is row by row — better than a real table element would do
     * and still not what the person sees, which is what the warning beside it says.
     */
    case 'table': {
      const rows = block.rows ?? []
      return (
        <View style={{ marginTop: 6, breakInside: 'avoid' }}>
          {heading(block.title)}
          {rows.map((row, r) => (
            <View
              key={r}
              style={{
                flexDirection: 'row',
                borderBottomWidth: 1,
                borderBottomStyle: 'solid',
                borderBottomColor: border,
                paddingTop: 3,
                paddingBottom: 3,
              }}
            >
              {row.map((cell, c) => (
                <View
                  key={c}
                  style={{
                    flexGrow: 1,
                    flexBasis: 0,
                    paddingRight: 6,
                    fontWeight: r === 0 ? 700 : 400,
                  }}
                >
                  {cell}
                </View>
              ))}
            </View>
          ))}
        </View>
      )
    }

    /**
     * Bars, with the label and the number printed beside each.
     *
     * The printed pair is not decoration: a chart extracts as nothing, so without it the whole block
     * is invisible to a screener. Drawing it this way makes the warning survivable rather than fatal.
     */
    case 'graph': {
      const bars = (block.pairs ?? []).filter((p) => p.label.trim() !== '')
      const peak = Math.max(
        1,
        ...bars.map((p) => Math.abs(Number(p.value)) || 0),
      )
      return (
        <View style={{ marginTop: 6, breakInside: 'avoid' }}>
          {heading(block.title)}
          {bars.map((bar, i) => (
            <View key={i} style={{ marginTop: 4 }}>
              <View style={{ flexDirection: 'row' }}>
                <View style={{ flexGrow: 1 }}>{bar.label}</View>
                <View style={{ color: muted }}>{bar.value}</View>
              </View>
              <View
                style={{
                  marginTop: 2,
                  height: 4,
                  width: `${Math.round(((Number(bar.value) || 0) / peak) * 100)}%`,
                  backgroundColor: border,
                }}
              />
            </View>
          ))}
        </View>
      )
    }

    case 'image':
      return value === '' ? null : (
        <View style={{ marginTop: 6, breakInside: 'avoid' }}>
          <Image src={value} style={{ width: block.space ?? 120 }} />
        </View>
      )

    /**
     * A QR code, drawn by the same public renderer the rest of the world uses.
     *
     * And the address printed under it, for the same reason the chart prints its numbers: the square
     * itself extracts as nothing, and a recruiter reading on screen cannot scan it.
     */
    case 'qrCode': {
      const size = block.space ?? 90
      return value === '' ? null : (
        <View style={{ marginTop: 6, breakInside: 'avoid' }}>
          <Image
            src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`}
            style={{ width: size, height: size }}
          />
          <View style={{ marginTop: 2, color: muted, fontSize: body - 2 }}>
            {value}
          </View>
        </View>
      )
    }

    /**
     * A running header or footer, drawn inline where it was placed.
     *
     * Deliberately *not* in the page margin. takumi's margin bands are built by the renderer for the
     * page counter and the tinted papers, and putting user text there would land it in exactly the
     * region parsers discard — the warning would become the whole story rather than a caveat. Inline,
     * it is a line of text that reads where the person put it and survives extraction.
     */
    case 'pageHeader':
    case 'pageFooter':
      return value === '' ? null : (
        <View
          style={{
            marginTop: kind === 'pageFooter' ? 10 : 0,
            marginBottom: kind === 'pageHeader' ? 6 : 0,
            paddingTop: kind === 'pageFooter' ? 4 : 0,
            paddingBottom: kind === 'pageHeader' ? 4 : 0,
            borderTopWidth: kind === 'pageFooter' ? 1 : 0,
            borderBottomWidth: kind === 'pageHeader' ? 1 : 0,
            borderStyle: 'solid',
            borderColor: border,
            color: muted,
            fontSize: body - 1.5,
          }}
        >
          {value}
        </View>
      )

    /**
     * A watermark, as a faint band rather than an overlay.
     *
     * The renderer has no absolute positioning across a page (docs/05: flexbox only), and rotating
     * text behind the content is what makes extraction interleave "DRAFT" into a job title. A band
     * says the same thing where a parser can read it cleanly, which is the version worth having.
     */
    case 'watermark':
      return value === '' ? null : (
        <View
          style={{
            marginTop: 8,
            marginBottom: 8,
            paddingTop: 6,
            paddingBottom: 6,
            color: muted,
            fontSize: body + 8,
            fontWeight: 700,
            letterSpacing: 6,
            textAlign: 'center',
            opacity: 0.25,
          }}
        >
          {value.toUpperCase()}
        </View>
      )

    default: {
      const rows = lines()
      if (chrome.group !== undefined)
        return <>{chrome.group(block.title, rows)}</>
      return (
        <Fragment>
          {heading(block.title)}
          {rows}
        </Fragment>
      )
    }
  }
}
