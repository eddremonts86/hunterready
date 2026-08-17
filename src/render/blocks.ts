/**
 * Every block a person can put on their CV, described once.
 *
 * ## Why a table and not twenty-four components
 *
 * Because twenty-four hand-written editors is how three of the first seven shipped without one. The
 * menu, the editor and the renderer all read this file, so a kind cannot exist in one of them and be
 * missing from the others — which is exactly the bug `every-block-editable.test.ts` was written after.
 *
 * Adding a kind is an entry here, an arm in `templates/block.tsx`, and nothing else.
 *
 * ## `safe`, and why the unsafe ones are here at all
 *
 * I argued against shipping tables, headers, footers, watermarks, QR codes and charts: each of them
 * damages the thing this product sells, which is a document a screener can read. docs/05 is explicit —
 * a table is the commonest way a CV loses its employment history, header and footer regions are
 * discarded by many parsers, and a chart or a QR code extracts as nothing at all.
 *
 * Edd's call, twice: build them. So they are here, and the honesty moved to where it belongs — the
 * document says so. A block with `safe: false` is drawn with a warning in the panel, and its presence
 * takes "Parse verified" off the preview, because that badge is a claim about *this* document and not
 * about the template it uses. The person gets the component and the truth about what it costs; what
 * they do not get is a promise that quietly stopped being true.
 *
 * `warning` is that sentence. It is specific — what a parser does with the thing — rather than a
 * general caution, because "may affect ATS compatibility" is what every competitor writes and it tells
 * nobody anything.
 */
import type { BlockKind } from '@/schema/resume'

/** How a field is edited. The generic editor in the panel reads these and nothing else. */
export type FieldKind =
  'title' | 'value' | 'label' | 'lines' | 'pairs' | 'rows' | 'space' | 'variant'

export interface BlockField {
  kind: FieldKind
  label: string
  placeholder?: string
  /** For `variant`: the looks this block offers. */
  options?: ReadonlyArray<{ value: string; label: string }>
  /** For `value`: a long field rather than a single line. */
  multiline?: boolean
}

export interface BlockSpec {
  kind: BlockKind
  /** What it is called in the Add menu and on its own header. */
  label: string
  /** One line in the Add menu, in the person's terms rather than the component's. */
  hint: string
  /** Which of the menu's groups it belongs to. */
  group: 'content' | 'layout' | 'risky'
  /** Whether a screener still reads the document cleanly with this on it. */
  safe: boolean
  /** Present when `safe` is false: what a parser actually does with it. */
  warning?: string
  fields: ReadonlyArray<BlockField>
  /** A fresh one. Every field the renderer reads, so a new block is never half-formed. */
  make: () => Record<string, unknown>
}

const lines = (label: string, placeholder?: string): BlockField => ({
  kind: 'lines',
  label,
  ...(placeholder === undefined ? {} : { placeholder }),
})

const title = (label = 'Heading', placeholder?: string): BlockField => ({
  kind: 'title',
  label,
  ...(placeholder === undefined ? {} : { placeholder }),
})

export const BLOCK_SPECS: ReadonlyArray<BlockSpec> = [
  /* ── Content ──────────────────────────────────────────────────────────────────────────────── */
  {
    kind: 'section',
    label: 'A section',
    hint: 'A heading and its lines — courses, volunteering, awards, references.',
    group: 'content',
    safe: true,
    fields: [title('Section heading'), lines('Lines')],
    make: () => ({ title: '', items: [''] }),
  },
  {
    kind: 'heading',
    label: 'A heading on its own',
    hint: 'Names the sections under it. No lines of its own.',
    group: 'content',
    safe: true,
    fields: [title('Heading', 'What the sections below it are')],
    make: () => ({ title: '', items: [] }),
  },
  {
    kind: 'text',
    label: 'A paragraph',
    hint: 'Prose belonging to no heading — a note, a statement, a closing line.',
    group: 'content',
    safe: true,
    fields: [lines('Paragraphs')],
    make: () => ({ title: '', items: [''] }),
  },
  {
    kind: 'list',
    label: 'A list',
    hint: 'Bulleted or numbered, with no heading above it.',
    group: 'content',
    safe: true,
    fields: [
      {
        kind: 'variant',
        label: 'Marker',
        options: [
          { value: 'bullet', label: 'Bullets' },
          { value: 'number', label: 'Numbers' },
          { value: 'none', label: 'No marker' },
        ],
      },
      lines('Items'),
    ],
    make: () => ({ title: '', items: [''], variant: 'bullet' }),
  },
  {
    kind: 'keyValue',
    label: 'Label and value',
    hint: 'A short list of pairs: driving licence, notice period, right to work.',
    group: 'content',
    safe: true,
    fields: [title('Heading (optional)'), { kind: 'pairs', label: 'Pairs' }],
    make: () => ({ title: '', items: [], pairs: [{ label: '', value: '' }] }),
  },
  {
    kind: 'card',
    label: 'A boxed note',
    hint: 'A heading and lines inside a bordered box.',
    group: 'content',
    safe: true,
    fields: [title('Heading'), lines('Lines')],
    make: () => ({ title: '', items: [''] }),
  },
  {
    kind: 'alert',
    label: 'A tinted note',
    hint: 'A short remark on a tinted ground — availability, a visa status.',
    group: 'content',
    safe: true,
    fields: [
      {
        kind: 'variant',
        label: 'Tone',
        options: [
          { value: 'info', label: 'Neutral' },
          { value: 'success', label: 'Positive' },
          { value: 'warning', label: 'Caution' },
        ],
      },
      title('Heading (optional)'),
      lines('Lines'),
    ],
    make: () => ({ title: '', items: [''], variant: 'info' }),
  },
  {
    kind: 'callout',
    label: 'A line to pull out',
    hint: 'One sentence set apart, with a rule beside it.',
    group: 'content',
    safe: true,
    fields: [{ kind: 'value', label: 'The line', multiline: true }],
    make: () => ({ title: '', items: [], value: '' }),
  },
  {
    kind: 'quote',
    label: 'A quotation',
    hint: 'Something somebody said about your work, and who said it.',
    group: 'content',
    safe: true,
    fields: [
      { kind: 'value', label: 'What was said', multiline: true },
      { kind: 'label', label: 'Who said it', placeholder: 'Name, role' },
    ],
    make: () => ({ title: '', items: [], value: '', label: '' }),
  },
  {
    kind: 'signature',
    label: 'A signature block',
    hint: 'A rule to sign above, with a name under it. Expected on a CV in some countries.',
    group: 'content',
    safe: true,
    fields: [
      { kind: 'label', label: 'Name', placeholder: 'Your name' },
      { kind: 'value', label: 'Under the name', placeholder: 'Place and date' },
    ],
    make: () => ({ title: '', items: [], label: '', value: '' }),
  },
  {
    kind: 'link',
    label: 'A link',
    hint: 'An address on its own line, written out so it survives being printed.',
    group: 'content',
    safe: true,
    fields: [
      { kind: 'label', label: 'What it is', placeholder: 'Portfolio' },
      { kind: 'value', label: 'Address', placeholder: 'example.com/work' },
    ],
    make: () => ({ title: '', items: [], label: '', value: '' }),
  },
  {
    kind: 'badge',
    label: 'A chip',
    hint: 'A short word on a tinted pill — "Available now", "Remote".',
    group: 'content',
    safe: true,
    fields: [
      { kind: 'value', label: 'The word', placeholder: 'Available now' },
    ],
    make: () => ({ title: '', items: [], value: '' }),
  },

  /* ── Layout ───────────────────────────────────────────────────────────────────────────────── */
  {
    kind: 'divider',
    label: 'A line',
    hint: 'A rule across the page, to separate one part from the next.',
    group: 'layout',
    safe: true,
    fields: [
      {
        kind: 'variant',
        label: 'Stroke',
        options: [
          { value: 'solid', label: 'Solid' },
          { value: 'dashed', label: 'Dashed' },
          { value: 'dotted', label: 'Dotted' },
        ],
      },
      { kind: 'space', label: 'Room above and below' },
    ],
    make: () => ({ title: '', items: [], space: 12, variant: 'solid' }),
  },
  {
    kind: 'space',
    label: 'Space',
    hint: 'Room between two sections. 25px above and below, adjustable.',
    group: 'layout',
    safe: true,
    fields: [{ kind: 'space', label: 'Room above and below' }],
    make: () => ({ title: '', items: [], space: 25 }),
  },
  {
    kind: 'pageBreak',
    label: 'A new page',
    hint: 'Everything after it starts on the next sheet.',
    group: 'layout',
    safe: true,
    fields: [],
    make: () => ({ title: '', items: [] }),
  },
  {
    kind: 'keepTogether',
    label: 'Keep together',
    hint: 'Lines that must not be split across two pages.',
    group: 'layout',
    safe: true,
    fields: [title('Heading (optional)'), lines('Lines')],
    make: () => ({ title: '', items: [''] }),
  },

  /* ── The ones that cost the guarantee ─────────────────────────────────────────────────────── */
  {
    kind: 'table',
    label: 'A table',
    hint: 'Rows and columns. The first row is the header.',
    group: 'risky',
    safe: false,
    warning:
      'Screening software reads a table by flattening it, and the order it picks is rarely the one you see — a two-column table of dates and roles commonly comes back as every date, then every role. It is the single most common way a CV loses its employment history.',
    fields: [title('Heading (optional)'), { kind: 'rows', label: 'Rows' }],
    make: () => ({
      title: '',
      items: [],
      rows: [
        ['', ''],
        ['', ''],
      ],
    }),
  },
  {
    kind: 'graph',
    label: 'A chart',
    hint: 'Bars from a label and a number each.',
    group: 'risky',
    safe: false,
    warning:
      'A chart is drawn, not written: a parser extracts nothing from it at all. Whatever it shows is invisible to the software that decides whether a person reads your CV, so anything it says needs saying in words as well.',
    fields: [title('Heading (optional)'), { kind: 'pairs', label: 'Bars' }],
    make: () => ({
      title: '',
      items: [],
      pairs: [{ label: '', value: '' }],
      variant: 'bar',
    }),
  },
  {
    kind: 'form',
    label: 'Fields to fill in',
    hint: 'Labelled blanks, for a document somebody completes by hand.',
    group: 'risky',
    safe: false,
    warning:
      'Blank fields extract as their labels with nothing after them, which reads to a screener as a CV with missing answers. Useful on a form you are printing; costly on one you are uploading.',
    fields: [title('Heading (optional)'), { kind: 'pairs', label: 'Fields' }],
    make: () => ({ title: '', items: [], pairs: [{ label: '', value: '' }] }),
  },
  {
    kind: 'image',
    label: 'A picture',
    hint: 'An image from a web address, at the width you choose.',
    group: 'risky',
    safe: false,
    warning:
      'An image extracts as nothing. If it carries information — a logo, a scanned certificate, text in a picture — that information does not reach the software at all.',
    fields: [
      { kind: 'value', label: 'Address', placeholder: 'https://…' },
      { kind: 'space', label: 'Width' },
    ],
    make: () => ({ title: '', items: [], value: '', space: 120 }),
  },
  {
    kind: 'qrCode',
    label: 'A QR code',
    hint: 'A square somebody can scan, from a link or some text.',
    group: 'risky',
    safe: false,
    warning:
      'A QR code is a picture: a parser reads nothing from it, and a recruiter reading on screen cannot scan it. Print the address next to it or the link exists only for whoever holds the paper.',
    fields: [
      { kind: 'value', label: 'What it points at', placeholder: 'https://…' },
      { kind: 'space', label: 'Size' },
    ],
    make: () => ({ title: '', items: [], value: '', space: 90 }),
  },
  {
    kind: 'pageHeader',
    label: 'A running header',
    hint: 'Repeats at the top of every page.',
    group: 'risky',
    safe: false,
    warning:
      'Many parsers discard the header region entirely, so anything that lives only there is gone — which is why your name and contact details are never put in one.',
    fields: [{ kind: 'value', label: 'Text' }],
    make: () => ({ title: '', items: [], value: '' }),
  },
  {
    kind: 'pageFooter',
    label: 'A running footer',
    hint: 'Repeats at the bottom of every page.',
    group: 'risky',
    safe: false,
    warning:
      'Same as the header: many parsers drop the footer region, so anything only there does not reach them.',
    fields: [{ kind: 'value', label: 'Text' }],
    make: () => ({ title: '', items: [], value: '' }),
  },
  {
    kind: 'watermark',
    label: 'A watermark',
    hint: 'Large faint text behind the page — "Draft", "Confidential".',
    group: 'risky',
    safe: false,
    warning:
      'A watermark sits across the text, and extraction can interleave its words with the document’s — "DRAFT" arriving in the middle of a job title. It also prints on every page of a file you may not want marked.',
    fields: [{ kind: 'value', label: 'The word', placeholder: 'DRAFT' }],
    make: () => ({ title: '', items: [], value: '' }),
  },
]

const BY_KIND = new Map(BLOCK_SPECS.map((spec) => [spec.kind, spec]))

export function specFor(kind: BlockKind): BlockSpec | undefined {
  return BY_KIND.get(kind)
}

/**
 * Whether this document still parses cleanly — the claim behind "Parse verified".
 *
 * The badge used to be a fact about the *template*, which was true while a template was all a person
 * could choose. It is a claim about the document now, and a document carrying a table is one the
 * round-trip test would not pass. Saying so is the whole reason the risky blocks could be built at all.
 */
export function unsafeBlocks(
  custom: ReadonlyArray<{ kind?: BlockKind; space?: number }>,
  kindOf: (block: { kind?: BlockKind; space?: number }) => BlockKind,
): Array<BlockSpec> {
  const seen = new Set<BlockKind>()
  const out: Array<BlockSpec> = []
  for (const block of custom) {
    const spec = BY_KIND.get(kindOf(block))
    if (spec === undefined || spec.safe || seen.has(spec.kind)) continue
    seen.add(spec.kind)
    out.push(spec)
  }
  return out
}
