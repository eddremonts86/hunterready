/**
 * The design gallery — thirty pairings, twelve of them free.
 *
 * ## Why there are no page thumbnails
 *
 * The obvious gallery is thirty little A4 pages. It would be worse than this, and not because it is
 * expensive: at the size thirty cards allow, an A4 page is about 90px tall, and at 90px **Modern and
 * Professional are the same grey rectangle**. A thumbnail that cannot show the difference between two
 * choices is decoration standing where information should be, and thirty of them is a wall of it.
 *
 * What actually differs between two designs is the *voice* — which typeface sets the headings, how much air
 * there is, what a section title looks like — and the **order** the reader meets the sections in. So each
 * card shows a real specimen: the section heading set in that theme's own face, at its own weight, and a
 * line of body copy in the body face. Those are the two fonts the document uses, drawn with the same tokens
 * the PDF uses.
 *
 * And the full-size truth is one click away: choosing a card re-renders the document beside it at A4. A
 * postage stamp is not needed when the real thing is right there.
 *
 * ## The padlock is not the gate
 *
 * `/api/render` refuses a paid pairing this caller is not entitled to, and that refusal is the gate — the
 * endpoint is public, so anything drawn here is advisory. This is the *invitation*: it says what a design
 * is, that it is part of the paid plan, and what the free ones give you, which is the same document
 * verified by the same test.
 */
import { DESIGNS } from '@/render/designs'
import type { Design } from '@/render/designs'
import { getTheme } from '@/render/themes'
import { templates } from '@/render/templates/registry'
import type { TemplateId } from '@/render/templates/registry'
import type { ThemeId } from '@/render/themes'

/** The order a card shows as three words, because it is the structural difference a person can act on. */
const ORDER_WORDS: Record<string, Array<string>> = {
  experience: ['Experience', 'Study', 'Skills'],
  skills: ['Skills', 'Experience', 'Study'],
  education: ['Study', 'Experience', 'Skills'],
}

function Specimen({ design }: { design: Design }) {
  const theme = getTheme(design.theme)
  const { heading, body } = theme.typography

  return (
    <div
      className="flex flex-col gap-1 rounded-field border border-hairline bg-ground px-3 py-2.5"
      // The document's own colours, so a card cannot flatter a theme the PDF will not match.
      style={{ backgroundColor: theme.colors.background }}
    >
      {/*
        A real section heading, in the theme's heading face at its real weight and its real transform. This
        is the single most recognisable thing about a CV's look, and it is what the eye uses to tell these
        thirty apart.
      */}
      <span
        style={{
          fontFamily: heading.fontFamily,
          fontWeight: heading.fontWeight,
          fontSize: 11,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: theme.colors.foreground,
        }}
      >
        Experience
      </span>
      <span
        style={{ height: 1, backgroundColor: theme.colors.border }}
        aria-hidden
      />
      <span
        style={{
          fontFamily: body.fontFamily,
          fontSize: 9.5,
          lineHeight: body.lineHeight,
          color: theme.colors.mutedForeground,
        }}
      >
        Shift Lead Nurse — Rigshospitalet
      </span>
    </div>
  )
}

function Lock() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="h-3 w-3"
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

export function DesignGallery({
  templateId,
  themeId,
  entitled,
  onChoose,
}: {
  templateId: TemplateId
  themeId: ThemeId
  /** Whether this visitor may use the paid half. Advisory — `/api/render` is the gate. */
  entitled: boolean
  onChoose: (design: Design) => void
}) {
  const free = DESIGNS.filter((d) => d.tier === 'free')
  const paid = DESIGNS.filter((d) => d.tier === 'paid')

  const Card = ({ design }: { design: Design }) => {
    const chosen = design.structure === templateId && design.theme === themeId
    const locked = design.tier === 'paid' && !entitled
    const meta = templates[design.structure]

    return (
      <button
        type="button"
        aria-pressed={chosen}
        onClick={() => onChoose(design)}
        className={[
          'flex flex-col gap-2 rounded-choice border p-2.5 text-left transition-colors',
          chosen
            ? 'border-signal bg-signal-wash'
            : 'border-hairline hover:border-hairline-strong',
        ].join(' ')}
      >
        <Specimen design={design} />

        <span className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1.5">
            <span className="text-[13px] font-semibold text-ink">
              {design.label}
            </span>
            {chosen && (
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                className="h-3.5 w-3.5 shrink-0 text-signal"
              >
                <path d="m5 12.5 4.5 4.5L19 7" />
              </svg>
            )}
          </span>

          {/*
            The reading order, spelled out. It is the one structural difference between these cards, and
            "Skills first" in the name is easy to skim past — three words in sequence is not.
          */}
          <span className="text-[11px] leading-snug text-ink-soft">
            {(ORDER_WORDS[meta.order] ?? ORDER_WORDS.experience).join(' → ')}
          </span>
        </span>

        <span className="flex flex-wrap items-center gap-1.5">
          {/*
            The ATS rating per card, because it is the claim that matters most and it belongs to the
            structure rather than to the tier. Paying does not buy a better rating — `showcase` is rated
            the same whether it costs money or not.
          */}
          {meta.atsRating === 'verified' ? (
            <span className="inline-flex items-center rounded-full bg-affirm-wash px-1.5 py-0.5 text-[10px] font-semibold text-affirm">
              Parse verified
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-caution-wash px-1.5 py-0.5 text-[10px] font-semibold text-caution">
              Design-first
            </span>
          )}
          {locked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-band px-1.5 py-0.5 text-[10px] font-semibold text-ink-soft">
              <Lock />
              Paid plan
            </span>
          )}
        </span>
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
            Included
          </h3>
          <span className="tally text-[11px] text-ink-faint">
            {free.length}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {free.map((design) => (
            <Card key={design.id} design={design} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-hairline pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
            {entitled ? 'Also yours' : 'Paid plan'}
          </h3>
          <span className="tally text-[11px] text-ink-faint">
            {paid.length}
          </span>
        </div>
        {!entitled && (
          /*
            Said once, at the top of the locked set, rather than as a sales line on each of eighteen cards.
            And it says what the free ones *are* rather than what they lack: the ATS guarantee is not the
            thing being sold, and implying it is would be the kind of pressure this product does not use.
          */
          <p className="text-meta leading-relaxed text-ink-soft">
            Every design above renders the same document, checked by the same
            parse test. These add different typefaces and a different order of
            sections.
          </p>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {paid.map((design) => (
            <Card key={design.id} design={design} />
          ))}
        </div>
      </div>
    </div>
  )
}
