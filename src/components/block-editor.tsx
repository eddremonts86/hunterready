/**
 * One editor for every kind of block, built from the spec rather than by hand.
 *
 * ## Why generic
 *
 * Twenty-three kinds is how you get three shipped with a renderer and no editor — which is exactly
 * what happened when there were seven and I wrote three of them by hand and forgot the rest. The spec
 * in `render/blocks.ts` lists a block's fields; this draws them. A kind added there is editable here
 * the same afternoon, and `every-block-editable.test.ts` fails if it is not.
 *
 * ## Every block gets the same three controls
 *
 * Collapse, move, delete — Edd's requirement, and the first pass got it wrong: the wordless blocks
 * (space, a rule, a page break) were drawn as bare rows with move and delete but **no collapse**, so
 * the panel had two kinds of header that behaved differently for no reason a reader could see. They
 * all go through `Section` now. A block with nothing to edit simply has an empty body, which is
 * honest — there is nothing under it — and consistent, which matters more here than saving a click.
 *
 * ## The warning
 *
 * A block the round-trip cannot survive carries its reason, in the panel, in the same amber the rest
 * of the product uses for "worth knowing". Not a generic caution: what a parser actually does with the
 * thing. That is the deal that let these be built at all — see `render/blocks.ts`.
 */
import { specFor } from '@/render/blocks'
import type { BlockField } from '@/render/blocks'
import { kindOf } from '@/schema/resume'
import type { Resume } from '@/schema/resume'

type Block = Resume['custom'][number]
type Patch = Partial<Block>

/** The chrome the review form owns, passed in so the two files cannot drift on styling. */
export interface BlockChromeUi {
  Section: (props: {
    title: string
    count?: number
    flagged: number
    defaultOpen: boolean
    children: React.ReactNode
    actions?: React.ReactNode
  }) => React.ReactElement
  Field: (props: {
    label: string
    value: string
    onChange: (next: string) => void
  }) => React.ReactElement
  AddRow: (props: { label: string; onClick: () => void }) => React.ReactElement
  LineBubble: (props: {
    children: React.ReactNode
    removeLabel: string
    onRemove: () => void
  }) => React.ReactElement
  AutoTextarea: (props: {
    value: string
    onChange: (next: string) => void
    className: string
    ariaLabel?: string
    minRows?: number
  }) => React.ReactElement
}

/** Matches the schema's ceiling. A gap taller than this is a blank page nobody meant to send. */
const MAX_SPACE = 240

function Pairs({
  label,
  pairs,
  onChange,
  ui,
}: {
  label: string
  pairs: Array<{ label: string; value: string }>
  onChange: (pairs: Array<{ label: string; value: string }>) => void
  ui: BlockChromeUi
}) {
  const patch = (at: number, part: Partial<{ label: string; value: string }>) =>
    onChange(pairs.map((p, i) => (i === at ? { ...p, ...part } : p)))
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[13px] font-semibold text-ink">{label}</span>
      {pairs.map((pair, i) => (
        <ui.LineBubble
          key={i}
          removeLabel={`Remove ${pair.label === '' ? `row ${i + 1}` : pair.label}`}
          onRemove={() => onChange(pairs.filter((_, k) => k !== i))}
        >
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <input
              type="text"
              value={pair.label}
              aria-label={`Label ${i + 1}`}
              placeholder="Label"
              onChange={(e) => patch(i, { label: e.target.value })}
              className="field"
            />
            <input
              type="text"
              value={pair.value}
              aria-label={`Value ${i + 1}`}
              placeholder="Value"
              onChange={(e) => patch(i, { value: e.target.value })}
              className="field"
            />
          </div>
        </ui.LineBubble>
      ))}
      <ui.AddRow
        label="Add a row"
        onClick={() => onChange([...pairs, { label: '', value: '' }])}
      />
    </div>
  )
}

/**
 * A grid of cells.
 *
 * Columns are added and removed for the whole table at once, because a ragged table is a table whose
 * cells land in the wrong column when it is flattened — which is the failure mode the warning above it
 * describes, arrived at by accident instead of on purpose.
 */
function Rows({
  rows,
  onChange,
  ui,
}: {
  rows: Array<Array<string>>
  onChange: (rows: Array<Array<string>>) => void
  ui: BlockChromeUi
}) {
  const columns = Math.max(1, rows[0]?.length ?? 1)
  const setCell = (r: number, c: number, next: string) =>
    onChange(
      rows.map((row, i) =>
        i === r ? row.map((cell, k) => (k === c ? next : cell)) : row,
      ),
    )
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink">Rows</span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange(rows.map((row) => [...row, '']))}
            className="rounded-full px-2 py-1 text-[12px] font-medium text-signal hover:bg-signal-wash"
          >
            + Column
          </button>
          <button
            type="button"
            disabled={columns <= 1}
            onClick={() => onChange(rows.map((row) => row.slice(0, -1)))}
            className="rounded-full px-2 py-1 text-[12px] font-medium text-ink-soft hover:bg-band disabled:opacity-30"
          >
            − Column
          </button>
        </span>
      </div>
      {rows.map((row, r) => (
        <ui.LineBubble
          key={r}
          removeLabel={`Remove row ${r + 1}`}
          onRemove={() => onChange(rows.filter((_, k) => k !== r))}
        >
          <div className="flex flex-col gap-1.5">
            <span className="text-meta text-ink-soft">
              {r === 0 ? 'Header row' : `Row ${r}`}
            </span>
            <div className="flex flex-wrap gap-2">
              {row.map((cell, c) => (
                <input
                  key={c}
                  type="text"
                  value={cell}
                  aria-label={`Row ${r + 1}, column ${c + 1}`}
                  onChange={(e) => setCell(r, c, e.target.value)}
                  className="field min-w-0 flex-1"
                />
              ))}
            </div>
          </div>
        </ui.LineBubble>
      ))}
      <ui.AddRow
        label="Add a row"
        onClick={() =>
          onChange([...rows, Array.from({ length: columns }, () => '')])
        }
      />
    </div>
  )
}

function FieldFor({
  field,
  block,
  onPatch,
  ui,
}: {
  field: BlockField
  block: Block
  onPatch: (patch: Patch) => void
  ui: BlockChromeUi
}) {
  switch (field.kind) {
    case 'title':
      return (
        <ui.Field
          label={field.label}
          value={block.title}
          onChange={(title) => onPatch({ title })}
        />
      )

    case 'label':
      return (
        <ui.Field
          label={field.label}
          value={block.label ?? ''}
          onChange={(label) => onPatch({ label })}
        />
      )

    case 'value':
      return field.multiline === true ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-ink">
            {field.label}
          </span>
          <ui.AutoTextarea
            value={block.value ?? ''}
            minRows={3}
            onChange={(value) => onPatch({ value })}
            className="field"
          />
        </label>
      ) : (
        <ui.Field
          label={field.label}
          value={block.value ?? ''}
          onChange={(value) => onPatch({ value })}
        />
      )

    case 'lines':
      return (
        <div className="flex flex-col gap-3">
          <span className="text-[13px] font-semibold text-ink">
            {field.label}
          </span>
          {block.items.map((item, i) => (
            <ui.LineBubble
              key={i}
              removeLabel={`Remove ${field.label.toLowerCase()} ${i + 1}`}
              onRemove={() =>
                onPatch({ items: block.items.filter((_, k) => k !== i) })
              }
            >
              <ui.AutoTextarea
                value={item}
                ariaLabel={`${field.label} ${i + 1}`}
                onChange={(next) =>
                  onPatch({
                    items: block.items.map((old, k) => (k === i ? next : old)),
                  })
                }
                className="field"
              />
            </ui.LineBubble>
          ))}
          <ui.AddRow
            label={`Add to ${field.label.toLowerCase()}`}
            onClick={() => onPatch({ items: [...block.items, ''] })}
          />
        </div>
      )

    case 'pairs':
      return (
        <Pairs
          label={field.label}
          pairs={block.pairs ?? []}
          onChange={(pairs) => onPatch({ pairs })}
          ui={ui}
        />
      )

    case 'rows':
      return (
        <Rows
          rows={block.rows ?? []}
          onChange={(rows) => onPatch({ rows })}
          ui={ui}
        />
      )

    case 'space':
      return (
        <label className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-ink">
            {field.label}
          </span>
          <input
            type="number"
            min={0}
            max={MAX_SPACE}
            step={5}
            value={block.space ?? 0}
            onChange={(event) => {
              const next = Number(event.target.value)
              // A cleared field reads as NaN, and writing that into the document would fail the schema
              // on the next render and lose the block.
              onPatch({
                space: Number.isFinite(next)
                  ? Math.min(MAX_SPACE, Math.max(0, Math.round(next)))
                  : 0,
              })
            }}
            className="field w-[5rem] py-1 text-center text-[13px]"
          />
          <span className="text-[13px] text-ink-soft">px</span>
        </label>
      )

    case 'variant':
      return (
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-ink">
            {field.label}
          </span>
          <select
            value={block.variant ?? field.options?.[0]?.value ?? ''}
            onChange={(event) => onPatch({ variant: event.target.value })}
            className="field"
          >
            {(field.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )
  }
}

export function BlockEditor({
  block,
  flagged,
  onPatch,
  actions,
  ui,
}: {
  block: Block
  flagged: number
  onPatch: (patch: Patch) => void
  actions: React.ReactNode
  ui: BlockChromeUi
}) {
  const spec = specFor(kindOf(block))
  if (spec === undefined) return null

  /* The title if it has one, otherwise what the block is. A row must always say what it is. */
  const heading = block.title !== '' ? block.title : spec.label
  const count =
    spec.fields.some((f) => f.kind === 'lines') && block.items.length > 0
      ? block.items.length
      : spec.fields.some((f) => f.kind === 'pairs') &&
          (block.pairs?.length ?? 0) > 0
        ? block.pairs?.length
        : undefined

  return (
    <ui.Section
      title={heading}
      {...(count === undefined ? {} : { count })}
      flagged={flagged}
      defaultOpen={false}
      actions={actions}
    >
      {spec.warning !== undefined && (
        <p
          role="note"
          className="rounded-field border border-caution/25 bg-caution-wash px-3 py-2 text-[13px] leading-relaxed text-ink"
        >
          <span className="font-semibold text-caution">
            This one costs the parse check.{' '}
          </span>
          {spec.warning}
        </p>
      )}
      {spec.fields.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-ink-soft">
          Nothing to set. Move it where you want it.
        </p>
      ) : (
        spec.fields.map((field, i) => (
          <FieldFor
            key={i}
            field={field}
            block={block}
            onPatch={onPatch}
            ui={ui}
          />
        ))
      )}
    </ui.Section>
  )
}
