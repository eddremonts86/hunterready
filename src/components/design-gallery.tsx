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
import { styleOf } from '@/render/themes/style'
import { templates } from '@/render/templates/registry'
import type { TemplateId } from '@/render/templates/registry'
import type { ThemeId } from '@/render/themes'
import { useEffect, useMemo, useState } from 'react'
import type { Resume } from '@/schema/resume'
import { DesignPreviewDialog } from './design-preview-dialog'
import { Section } from './design-axes'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/** The order a card shows as three words, because it is the structural difference a person can act on. */
const ORDER_WORDS: Record<string, Array<string>> = {
  experience: ['Experience', 'Study', 'Skills'],
  skills: ['Skills', 'Experience', 'Study'],
  education: ['Study', 'Experience', 'Skills'],
}

/**
 * A line of real content for whichever section the design opens with.
 *
 * The specimen used to draw "Experience" and a job line on every card, including the cards whose
 * entire selling point is that they do *not* open with experience. "Skills first, European" showed a
 * heading reading EXPERIENCE directly above its own label promising `Skills → Experience → Study`.
 * The two halves of the card contradicted each other, and the half a person believes is the picture.
 */
const SPECIMEN_LINE: Record<string, string> = {
  Experience: 'Shift Lead Nurse, Rigshospitalet',
  Skills: 'Intensive care · Triage · Ventilator management',
  Study: 'BSc Nursing, Københavns Professionshøjskole',
}

function Specimen({ design }: { design: Design }) {
  const theme = getTheme(design.theme)
  const style = styleOf(theme)
  const { heading, body } = theme.typography
  const meta = templates[design.structure]
  const opensWith = (ORDER_WORDS[meta.order] ?? ORDER_WORDS.experience)[0]

  /*
    The heading drawn with its real treatment — the accent bar, the navy underline, the solid band, the
    tinted band, the flanking hairlines, the slate box — because that treatment is now what a person is
    choosing between. A specimen that flattens every theme back to grey words re-creates the exact
    failure this catalogue was rebuilt to fix.
  */
  const words = (
    <span
      style={{
        fontFamily: heading.fontFamily,
        fontWeight: heading.fontWeight,
        fontSize: 10,
        textTransform: 'uppercase',
        color:
          style.heading === 'band'
            ? style.onAccent
            : style.headingInAccent
              ? style.accent
              : theme.colors.foreground,
      }}
    >
      {opensWith}
    </span>
  )

  const treated = (() => {
    switch (style.heading) {
      case 'band':
        return (
          <span
            style={{
              display: 'flex',
              backgroundColor: style.accent,
              padding: '2px 6px',
            }}
          >
            {words}
          </span>
        )
      case 'tint':
        return (
          <span
            style={{
              display: 'flex',
              backgroundColor: style.accentWash,
              padding: '2px 6px',
            }}
          >
            {words}
          </span>
        )
      case 'bar':
        return (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span
              style={{ width: 3, height: 10, backgroundColor: style.accent }}
            />
            {words}
          </span>
        )
      case 'underline':
        return (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {words}
            <span style={{ height: 2, backgroundColor: style.accent }} />
          </span>
        )
      case 'shortline':
        return (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {words}
            <span
              style={{ width: 26, height: 2.5, backgroundColor: style.accent }}
            />
          </span>
        )
      case 'flanked':
        return (
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span
              style={{
                flexGrow: 1,
                height: 1,
                backgroundColor: theme.colors.border,
              }}
            />
            {words}
            <span
              style={{
                flexGrow: 1,
                height: 1,
                backgroundColor: theme.colors.border,
              }}
            />
          </span>
        )
      case 'framed':
        return (
          <span
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              border: `1px solid ${style.accent}`,
              padding: '1.5px 6px',
            }}
          >
            {words}
          </span>
        )
      case 'plain':
        return words
      default:
        return (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {words}
            <span style={{ height: 1, backgroundColor: theme.colors.border }} />
          </span>
        )
    }
  })()

  return (
    <div
      className="flex flex-col gap-1.5 rounded-field border border-hairline px-3 py-2.5"
      // The document's own colours, so a card cannot flatter a theme the PDF will not match.
      style={{ backgroundColor: theme.colors.background }}
    >
      {treated}
      <span
        style={{
          fontFamily: body.fontFamily,
          fontSize: 9.5,
          lineHeight: body.lineHeight,
          color: theme.colors.mutedForeground,
        }}
      >
        {SPECIMEN_LINE[opensWith] ?? SPECIMEN_LINE.Experience}
      </span>
    </div>
  )
}

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.7-5.2-2.7-5.2 2.7 1-5.7L3.5 9.7l5.9-.9z" />
    </svg>
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
  resume,
}: {
  templateId: TemplateId
  themeId: ThemeId
  /** Whether this visitor may use the paid half. Advisory — `/api/render` is the gate. */
  entitled: boolean
  onChoose: (design: Design) => void
  /** The reader's own document, so a preview opens on what they will actually download. */
  resume: Resume
}) {
  const [previewing, setPreviewing] = useState<Design | undefined>(undefined)
  /**
   * Designs somebody marked on the way past.
   *
   * A hundred and three cards is more than anyone holds in their head, so "the one I liked twenty
   * cards ago" stops being recoverable by scrolling. Kept in `localStorage` rather than on the
   * account, for the same reason the consent answer is: it is a preference about this browser, not a
   * fact about a person, and it costs nothing to lose.
   */
  const [starred, setStarred] = useState<ReadonlyArray<string>>([])
  useEffect(() => {
    try {
      const raw = localStorage.getItem('hunterready.starred-designs.v1')
      const parsed: unknown = raw === null ? [] : JSON.parse(raw)
      if (Array.isArray(parsed)) {
        setStarred(parsed.filter((id): id is string => typeof id === 'string'))
      }
    } catch {
      /* Private browsing, or a corrupt entry. An empty list is a fine answer. */
    }
  }, [])

  const toggleStar = (id: string) => {
    const next = starred.includes(id)
      ? starred.filter((entry) => entry !== id)
      : [...starred, id]
    setStarred(next)
    try {
      localStorage.setItem(
        'hunterready.starred-designs.v1',
        JSON.stringify(next),
      )
    } catch {
      /* The mark still holds for this visit. */
    }
  }
  const free = DESIGNS.filter((d) => d.tier === 'free')
  const paid = DESIGNS.filter((d) => d.tier === 'paid')
  /*
    One stable array, not a fresh one per render.

    The dialog registers its arrow-key listener keyed on this, so a new identity every render meant
    the listener was torn down and rebuilt constantly — and a single ArrowRight could be seen by more
    than one of them, walking the gallery several steps at a time.
  */
  const ordered = useMemo(() => [...free, ...paid], [free, paid])

  const Card = ({ design }: { design: Design }) => {
    const chosen = design.structure === templateId && design.theme === themeId
    const locked = design.tier === 'paid' && !entitled
    const meta = templates[design.structure]

    return (
      /*
        Two real buttons rather than one, because choosing and looking are different acts and a
        button cannot be nested inside a button. `group` lets the quiet one stay out of the way until
        the card is hovered or something inside it has focus, so 103 cards do not become 206 controls
        competing for attention.
      */
      <div className="group relative">
        <button
          type="button"
          aria-pressed={chosen}
          onClick={() => onChoose(design)}
          className={[
            'flex w-full flex-col gap-2 rounded-choice border p-2.5 text-left transition-colors',
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

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => toggleStar(design.id)}
              aria-label={
                starred.includes(design.id)
                  ? `Remove ${design.label} from your marked designs`
                  : `Mark ${design.label}`
              }
              aria-pressed={starred.includes(design.id)}
              className={[
                'absolute left-3 top-3 rounded-full border px-1.5 py-1 transition-opacity',
                starred.includes(design.id)
                  ? 'border-signal-edge bg-signal-wash text-signal opacity-100'
                  : 'border-hairline-strong bg-ground/95 text-ink-soft opacity-0 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100',
              ].join(' ')}
            >
              <Star filled={starred.includes(design.id)} />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {starred.includes(design.id) ? 'Remove your mark' : 'Mark this one'}
          </TooltipContent>
        </Tooltip>

        <button
          type="button"
          onClick={() => setPreviewing(design)}
          aria-label={`See ${design.label} as a full page`}
          className="absolute right-3 top-3 rounded-full border border-hairline-strong bg-ground/95 px-2 py-1 text-[11px] font-semibold text-ink-soft opacity-0 transition-opacity hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
        >
          Full page
        </button>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex flex-col gap-4">
        <DesignPreviewDialog
          design={previewing}
          /* The gallery's own order: everything included first, then the paid half. */
          designs={ordered}
          resume={resume}
          onClose={() => setPreviewing(undefined)}
          onChoose={onChoose}
          onNavigate={setPreviewing}
          current={DESIGNS.find(
            (d) => d.structure === templateId && d.theme === themeId,
          )}
        />
        {starred.length > 0 && (
          /*
          First, and only when it has something in it. An empty "Marked" header on every visit is a
          promise of a feature rather than a feature, and it would push the catalogue down the page
          for the many people who never mark anything.
        */
          <Section title="Marked" count={starred.length}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ordered
                .filter((design) => starred.includes(design.id))
                .map((design) => (
                  <Card key={design.id} design={design} />
                ))}
            </div>
          </Section>
        )}

        <Section title="Included" count={free.length}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {free.map((design) => (
              <Card key={design.id} design={design} />
            ))}
          </div>
        </Section>

        <Section
          title={entitled ? 'Also yours' : 'Paid plan'}
          count={paid.length}
        >
          <div className="flex flex-col gap-2">
            {!entitled && (
              /*
            Said once, at the top of the locked set, rather than as a sales line on each of eighteen cards.
            And it says what the free ones *are* rather than what they lack: the ATS guarantee is not the
            thing being sold, and implying it is would be the kind of pressure this product does not use.
          */
              <p className="text-meta leading-relaxed text-ink-soft">
                Every design above renders the same document, checked by the
                same parse test. These add different typefaces and a different
                order of sections.
              </p>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {paid.map((design) => (
                <Card key={design.id} design={design} />
              ))}
            </div>
          </div>
        </Section>
      </div>
    </TooltipProvider>
  )
}
