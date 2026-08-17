/**
 * Choosing what to add, by looking at it.
 *
 * ## What was wrong
 *
 * Twenty-three blocks in one scrolling column inside a dropdown. Edd: *"hay que diseñar mejor este
 * menú, tal vez 2 o 3 columnas con preview incluida."* The column count was the visible half of the
 * problem; the real one is underneath it.
 *
 * **The names do not carry.** "A chip", "A line to pull out", "A tinted note", "Keep together" — every
 * one of those needs its sentence read before it means anything, and a menu where you must read
 * twenty-three sentences to find one item is a menu that has given up. A drawn specimen says it in the
 * time it takes to glance. That is why this is a gallery and not a longer list.
 *
 * **A dropdown was the wrong container.** Twenty-three items with pictures anchored to a 60px button
 * is a popover pretending to be a page. A dialog has the room, and it can be scanned rather than
 * scrolled.
 *
 * ## The specimens are drawings, not renders
 *
 * Each card shows a miniature of the block in the *app's* chrome tokens — Ink, Hairline, Band — never
 * the document's. DESIGN.md's hardest rule is that the print is not ours and ours is not the print: a
 * preview tinted in the CV's accent would be a promise about how it will look in a design the person
 * has not chosen yet. These say *what the block is*, not what it will look like. The document beside
 * the panel says that, accurately, a second after they add it.
 *
 * They are drawn rather than rendered through `Block` for the same reason. `Block` needs a theme and a
 * design's own heading treatment; feeding it one here would either pick a design on the person's
 * behalf or show them a specimen that changes when they change designs.
 *
 * ## Three groups, and the third is named for its cost
 *
 * Content, Page, and "Costs the parse check". Somebody scanning a menu should not have to open an item
 * to discover it will take "Parse verified" off their CV, so the group says so and the cards in it
 * carry the caution border. That is the same bargain `render/blocks.ts` records: these exist because
 * Edd asked for them twice, and the honesty moved to where it belongs.
 */
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { PRO_IN_BETA, ProTag } from '@/components/pro-tag'
import { BLOCK_SPECS } from '@/render/blocks'
import type { BlockSpec } from '@/render/blocks'
import type { BlockKind, Resume } from '@/schema/resume'

/* ────────────────────────────────────────────────────────────────────────────────────────────────
   The specimens
   ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** A line of body text, at specimen scale. Width varies so a stack reads as prose, not as a bar chart. */
function Line({ w = 'w-full', dark = false }: { w?: string; dark?: boolean }) {
  return (
    <span
      className={`block h-[3px] rounded-full ${w} ${dark ? 'bg-ink-soft' : 'bg-hairline-strong'}`}
    />
  )
}

/** A heading, at specimen scale: shorter, heavier, darker. The three things that make one. */
function Head({ w = 'w-1/2' }: { w?: string }) {
  return <span className={`block h-[5px] rounded-full bg-ink ${w}`} />
}

/**
 * Exported because the landing page shows the same twenty-four drawings.
 *
 * Two copies of "what a chart block looks like" would drift the first time one of them was touched,
 * and the one that drifted would be the marketing one, which is the copy a stranger sees before they
 * trust us with anything. One drawing, two places.
 */
export function Specimen({ kind }: { kind: BlockKind }) {
  const frame = 'flex h-[52px] w-full flex-col justify-center gap-[5px] px-3'

  switch (kind) {
    case 'section':
      return (
        <div className={frame}>
          <Head w="w-2/5" />
          <Line w="w-full" />
          <Line w="w-4/5" />
        </div>
      )
    case 'heading':
      return (
        <div className={frame}>
          <Head w="w-1/2" />
        </div>
      )
    case 'text':
      return (
        <div className={frame}>
          <Line w="w-full" />
          <Line w="w-full" />
          <Line w="w-3/5" />
        </div>
      )
    case 'list':
      return (
        <div className={`${frame} gap-[6px]`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className="h-[3px] w-[3px] shrink-0 rounded-full bg-ink-soft" />
              <Line w={i === 2 ? 'w-1/2' : 'w-full'} />
            </span>
          ))}
        </div>
      )
    case 'keyValue':
    case 'form':
      return (
        <div className={`${frame} gap-[7px]`}>
          {[0, 1].map((i) => (
            <span key={i} className="flex items-center gap-2">
              <span className="h-[4px] w-[26%] shrink-0 rounded-full bg-ink" />
              <Line w={i === 0 ? 'w-1/2' : 'w-2/5'} />
            </span>
          ))}
        </div>
      )
    case 'card':
      return (
        <div className="flex h-[52px] items-center px-3">
          <span className="flex w-full flex-col gap-[5px] rounded-[3px] border border-hairline-strong p-2">
            <Head w="w-1/3" />
            <Line w="w-4/5" />
          </span>
        </div>
      )
    case 'alert':
      return (
        <div className="flex h-[52px] items-center px-3">
          <span className="flex w-full flex-col gap-[5px] rounded-[3px] border-l-[3px] border-hairline-strong bg-band py-2 pl-2 pr-2">
            <Head w="w-1/3" />
            <Line w="w-3/5" />
          </span>
        </div>
      )
    case 'callout':
      return (
        <div className="flex h-[52px] items-center px-3">
          <span className="flex w-full flex-col gap-[5px] border-l-[3px] border-ink pl-2.5">
            <Line w="w-full" dark />
            <Line w="w-2/3" dark />
          </span>
        </div>
      )
    case 'quote':
      return (
        <div className={`${frame} gap-[6px]`}>
          <Line w="w-full" dark />
          <Line w="w-3/4" dark />
          <Line w="w-1/4" />
        </div>
      )
    case 'signature':
      return (
        <div className={`${frame} justify-end gap-[6px] pb-2`}>
          <span className="block h-px w-3/5 bg-ink-soft" />
          <Line w="w-1/3" dark />
        </div>
      )
    case 'link':
      return (
        <div className={frame}>
          <span className="flex items-center gap-2">
            <span className="h-[4px] w-[22%] shrink-0 rounded-full bg-ink" />
            <span className="block h-[3px] w-1/2 rounded-full bg-signal" />
          </span>
        </div>
      )
    case 'badge':
      return (
        <div className="flex h-[52px] items-center px-3">
          <span className="rounded-full bg-band px-2.5 py-1">
            <span className="block h-[4px] w-9 rounded-full bg-ink-soft" />
          </span>
        </div>
      )
    case 'divider':
      return (
        <div className="flex h-[52px] flex-col justify-center gap-[7px] px-3">
          <Line w="w-3/4" />
          <span className="block h-px w-full bg-ink-soft" />
          <Line w="w-2/3" />
        </div>
      )
    case 'space':
      return (
        <div className="flex h-[52px] flex-col justify-center gap-[7px] px-3">
          <Line w="w-3/4" />
          <span className="block h-[10px] w-full rounded-[2px] border border-dashed border-hairline-strong" />
          <Line w="w-2/3" />
        </div>
      )
    case 'pageBreak':
      return (
        <div className="flex h-[52px] items-center gap-2 px-3">
          <span className="flex h-[34px] flex-1 flex-col justify-center gap-[4px] rounded-[2px] border border-hairline-strong px-1.5">
            <Line w="w-full" />
            <Line w="w-2/3" />
          </span>
          <span className="flex h-[34px] flex-1 flex-col justify-center gap-[4px] rounded-[2px] border border-dashed border-hairline-strong px-1.5">
            <Line w="w-3/4" />
          </span>
        </div>
      )
    case 'keepTogether':
      return (
        <div className="flex h-[52px] items-center px-3">
          <span className="flex w-full flex-col gap-[5px] rounded-[3px] border border-dashed border-ink-soft p-2">
            <Line w="w-full" />
            <Line w="w-3/4" />
          </span>
        </div>
      )
    case 'table':
      return (
        <div className="flex h-[52px] flex-col justify-center px-3">
          {[0, 1, 2].map((r) => (
            <span
              key={r}
              className="flex gap-2 border-b border-hairline-strong py-[5px] last:border-b-0"
            >
              <Line w="w-1/3" dark={r === 0} />
              <Line w="w-1/3" dark={r === 0} />
              <Line w="w-1/4" dark={r === 0} />
            </span>
          ))}
        </div>
      )
    case 'graph':
      return (
        <div className="flex h-[52px] items-end gap-1.5 px-3 pb-3">
          {[16, 26, 11, 21].map((h, i) => (
            <span
              key={i}
              style={{ height: h }}
              className="w-3 rounded-t-[1px] bg-hairline-strong"
            />
          ))}
        </div>
      )
    case 'image':
      return (
        <div className="flex h-[52px] items-center px-3">
          <span className="flex h-[34px] w-full items-center justify-center rounded-[3px] bg-band">
            <span className="h-3.5 w-5 rounded-[1px] border border-ink-faint" />
          </span>
        </div>
      )
    case 'qrCode':
      return (
        <div className="flex h-[52px] items-center px-3">
          <span className="grid grid-cols-3 gap-[2px]">
            {[1, 1, 0, 1, 0, 1, 0, 1, 1].map((on, i) => (
              <span
                key={i}
                className={`h-2 w-2 rounded-[1px] ${on ? 'bg-ink-soft' : 'bg-hairline'}`}
              />
            ))}
          </span>
        </div>
      )
    case 'pageHeader':
    case 'pageFooter':
      return (
        <div
          className={`flex h-[52px] flex-col px-3 py-2 ${kind === 'pageFooter' ? 'justify-end' : 'justify-start'}`}
        >
          <span
            className={`flex w-full flex-col gap-[5px] ${
              kind === 'pageFooter'
                ? 'border-t border-hairline-strong pt-1.5'
                : 'border-b border-hairline-strong pb-1.5'
            }`}
          >
            <Line w="w-2/5" />
          </span>
        </div>
      )
    case 'watermark':
      return (
        <div className="relative flex h-[52px] flex-col justify-center gap-[5px] px-3">
          <Line w="w-full" />
          <Line w="w-4/5" />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-[13px] font-bold tracking-[0.22em] text-ink-faint/45">
              DRAFT
            </span>
          </span>
        </div>
      )
    default:
      return <div className={frame} />
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
   The gallery
   ──────────────────────────────────────────────────────────────────────────────────────────────── */

const GROUPS = [
  {
    id: 'content' as const,
    heading: 'Content',
    note: 'Words on the page.',
  },
  {
    id: 'layout' as const,
    heading: 'Page',
    note: 'Room, rules and where a sheet ends.',
  },
  {
    id: 'risky' as const,
    heading: 'Costs the parse check',
    note: 'These work, and screening software reads them badly. Each says how.',
  },
]

function Card({ spec, onPick }: { spec: BlockSpec; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={[
        'group flex flex-col overflow-hidden rounded-card border text-left transition-colors',
        // One radius, one accent. The caution border is the only variation, and it carries meaning.
        spec.safe
          ? 'border-hairline bg-ground hover:border-signal-edge hover:bg-signal-wash'
          : 'border-caution/30 bg-ground hover:border-caution/60 hover:bg-caution-wash',
      ].join(' ')}
    >
      <span className="border-b border-hairline bg-band/60">
        <Specimen kind={spec.kind} />
      </span>
      <span className="flex flex-col gap-1 p-3">
        <span className="text-[14px] font-semibold leading-snug text-ink">
          {spec.label}
        </span>
        <span className="text-[12px] leading-snug text-ink-soft">
          {spec.hint}
        </span>
      </span>
    </button>
  )
}

export function BlockGallery({
  onAdd,
  trigger,
}: {
  onAdd: (block: Resume['custom'][number]) => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {/*
        Sized to the viewport rather than to its contents, so it does not resize as the groups render —
        the same fault the design preview had, and for the same reason it was worth fixing: a panel that
        moves while you read it is a panel you have to re-find.
      */}
      <DialogContent /*
          `sm:max-w-none` and not `max-w-none`: the vendored dialog carries `sm:max-w-lg`, and Tailwind
          resolves same-specificity utilities by source order, where the media-query variant comes last
          and wins. An unprefixed override loses silently — the dialog rendered at 510px wide with a
          three-column grid crushed inside it, which looked like a grid bug and was a cascade one.
        */
        className="flex h-[86vh] max-h-[86vh] w-[92vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[68rem]"
      >
        <DialogHeader className="shrink-0 border-b border-hairline px-6 py-4">
          <DialogTitle className="text-[17px] font-semibold text-ink">
            Add to your CV
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed text-ink-soft">
            Everything here can be moved, edited and removed once it is on the
            page.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-8 overflow-y-auto px-6 py-5">
          {GROUPS.map((group) => {
            const specs = BLOCK_SPECS.filter((s) => s.group === group.id)
            if (specs.length === 0) return null
            return (
              <section key={group.id} className="flex flex-col gap-3">
                <div className="flex flex-col gap-0.5">
                  <h3
                    className={`flex items-center gap-2 text-[13px] font-semibold ${
                      group.id === 'risky' ? 'text-caution' : 'text-ink'
                    }`}
                  >
                    {group.heading}
                    {/*
                      Pro on this group and only this group. The free tier is a CV that parses; the
                      eight here are the document features that go beyond one, which makes them the
                      natural paid half and leaves the guarantee on the free side rather than behind
                      the till.

                      The tag sits after a heading in Caution and that pairing is deliberate but odd,
                      so it is worth naming: this group is a warning *and* a tier, and the two facts
                      are independent. Caution says what it costs your document. Pro says what it
                      will cost you. Nobody is being sold the warning.
                    */}
                    {group.id === 'risky' && <ProTag />}
                  </h3>
                  <p className="text-[12px] leading-relaxed text-ink-soft">
                    {group.note}
                    {group.id === 'risky' ? ` ${PRO_IN_BETA}` : ''}
                  </p>
                </div>
                {/*
                  Two columns from `sm`, three from `lg`. Not four: at four the specimen is narrower
                  than the shapes it is drawing and every card starts to look like the same grey bars.
                */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {specs.map((spec) => (
                    <Card
                      key={spec.kind}
                      spec={spec}
                      onPick={() => {
                        onAdd({
                          kind: spec.kind,
                          ...spec.make(),
                        } as Resume['custom'][number])
                        setOpen(false)
                      }}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
