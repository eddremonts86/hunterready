/**
 * The axes of a design, opened up: type, ink and paper.
 *
 * ## Why this is not "a template editor"
 *
 * A design in the catalogue is a catalogued pairing that carries a tier and a parse rating. This does
 * not replace one, it adjusts one, and the adjustments survive picking a different design — somebody
 * who found their colour wants to see it on the next layout too.
 *
 * ## What the guarantee actually constrains
 *
 * Nothing here can weaken "Parse verified". `ats-roundtrip.test.ts` iterates templates and never
 * varies the theme, because text extraction cannot see colour, and every one of the sixty families is
 * proved to render in `font-catalogue.test.ts`. What a colour *can* destroy is legibility, so that is
 * the only thing checked, and it is checked out loud: the ratio is on screen, and a pairing below the
 * floor is refused rather than quietly darkened.
 *
 * That refusal is the point rather than a nuisance. `optimize/` shows a rejected suggestion for the
 * same reason: the only place somebody watches the product protect them is where it says no.
 *
 * ## shadcn, wearing this project's clothes
 *
 * `Select` and `Collapsible` come from `components/ui`, which is vendored and never hand-edited. The
 * project's own tokens are applied at the call site instead, so the control behaves like the rest of
 * the app rather than like a default install: `rounded-field`, Hairline Strong, and the Signal focus
 * ring DESIGN.md specifies for every field.
 */
import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { REGISTERED_FAMILIES } from '@/render/fonts/families'
import { ACCENT_FLOOR, judgeAccent, normalizeHex } from '@/render/themes/custom'

export interface Axes {
  fonts: { body?: string; heading?: string }
  colours: { accent?: string; paper?: string }
}

/** The field styling DESIGN.md specifies, applied to a vendored trigger rather than edited into it. */
const TRIGGER =
  'w-full rounded-field border border-hairline-strong bg-ground px-3 py-2 text-[15px] text-ink focus:border-signal focus:ring-[3px] focus:ring-signal-wash'

/**
 * A section that can be folded away.
 *
 * Three of them, because this panel had grown to a picker, twelve included designs and ninety-one
 * paid ones in one column: whichever you came for, you scrolled past the other two.
 */
export function Section({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string
  count?: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="rounded-card border border-hairline"
    >
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
        <span className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold text-ink">{title}</span>
          {count !== undefined && (
            <span className="tally text-[11px] text-ink-soft">{count}</span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-soft transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-hairline p-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * Sixty families, searchable.
 *
 * A plain `Select` was the first version and it does not scale to sixty: finding Merriweather meant
 * scrolling a list whose order nobody knows, and a reader who half-remembers "something like Bodoni"
 * had no way to ask. A combobox turns that into typing three letters.
 *
 * Each name is still set in its own face, which is the part that matters: a font list rendered in one
 * typeface is a list of words, and the choice is being made by eye.
 */
function FontPicker({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string
  value?: string
  fallback: string
  onChange: (family?: string) => void
}) {
  const [open, setOpen] = useState(false)
  const shown = value ?? `${fallback} (design)`

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-ink">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={`${TRIGGER} flex items-center justify-between gap-2 text-left`}
          aria-label={`${label} typeface`}
        >
          <span
            className="truncate"
            style={
              value === undefined ? undefined : { fontFamily: `"${value}"` }
            }
          >
            {shown}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-ink-soft" />
        </PopoverTrigger>
        <PopoverContent className="w-[min(22rem,90vw)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search sixty typefaces…" />
            <CommandList>
              <CommandEmpty>No typeface by that name.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value={`${fallback} design default`}
                  onSelect={() => {
                    onChange(undefined)
                    setOpen(false)
                  }}
                >
                  {fallback} (design)
                </CommandItem>
                {REGISTERED_FAMILIES.map((family) => (
                  <CommandItem
                    key={family}
                    value={family}
                    onSelect={() => {
                      onChange(family)
                      setOpen(false)
                    }}
                    style={{ fontFamily: `"${family}"` }}
                  >
                    {family}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function ColourPicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (hex: string) => void
}) {
  const [draft, setDraft] = useState(value)
  /* Follow the value when it changes from outside: a swatch pick, or a reset back to the design. */
  useEffect(() => setDraft(value), [value])

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-ink">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-field border border-hairline-strong bg-ground p-1"
          aria-label={`${label} colour`}
        />
        <input
          type="text"
          value={draft}
          onChange={(event) => {
            const typed = event.target.value
            setDraft(typed)
            /*
              Six digits only. Accepting the three-digit form here is what caused the rewrite, and a
              reader typing a brand colour is typing six of them anyway.
            */
            if (/^#?[0-9a-fA-F]{6}$/.test(typed.trim())) {
              const hex = normalizeHex(typed)
              if (hex !== undefined) onChange(hex)
            }
          }}
          onBlur={() => setDraft(value)}
          spellCheck={false}
          className="field tally"
          aria-label={`${label} colour as hex`}
        />
      </span>
    </label>
  )
}

export function DesignAxes({
  axes,
  defaults,
  onChange,
}: {
  axes: Axes
  /** What the chosen design uses, so the fallback option is an honest label rather than a blank. */
  defaults: { body: string; heading: string; accent: string; paper: string }
  onChange: (next: Axes) => void
}) {
  const accent = axes.colours.accent ?? defaults.accent
  const paper = axes.colours.paper ?? defaults.paper
  const verdict = judgeAccent(accent, paper)
  const touched =
    axes.fonts.body !== undefined ||
    axes.fonts.heading !== undefined ||
    axes.colours.accent !== undefined ||
    axes.colours.paper !== undefined

  const setColour = (key: 'accent' | 'paper', value: string) => {
    const hex = normalizeHex(value)
    if (hex === undefined) return
    onChange({ ...axes, colours: { ...axes.colours, [key]: hex } })
  }

  return (
    <Section title="Make it yours">
      <div className="flex flex-col gap-4">
        {touched && (
          <button
            type="button"
            onClick={() => onChange({ fonts: {}, colours: {} })}
            className="self-start text-meta font-medium text-signal underline decoration-signal/30 underline-offset-4 hover:decoration-signal"
          >
            Back to the design
          </button>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <FontPicker
            label="Headings"
            value={axes.fonts.heading}
            fallback={defaults.heading}
            onChange={(heading) =>
              onChange({ ...axes, fonts: { ...axes.fonts, heading } })
            }
          />
          <FontPicker
            label="Body"
            value={axes.fonts.body}
            fallback={defaults.body}
            onChange={(body) =>
              onChange({ ...axes, fonts: { ...axes.fonts, body } })
            }
          />
        </div>

        {/*
          A real colour input rather than swatches, because the ask was any colour and the rule below
          is what makes that safe. The hex sits beside it so a brand colour can be typed rather than
          hunted for in a gradient.
        */}
        <div className="grid gap-3 sm:grid-cols-2">
          <ColourPicker
            label="Accent"
            value={accent}
            onChange={(hex) => setColour('accent', hex)}
          />
          <ColourPicker
            label="Paper"
            value={paper}
            onChange={(hex) => setColour('paper', hex)}
          />
        </div>

        {/*
          The rule, said out loud whichever way it lands. The pass is worth as much as the refusal: it
          tells somebody the number is being watched, so a refusal reads as a rule rather than as a
          malfunction when it arrives.
        */}
        <p
          role="status"
          className={[
            'rounded-field px-3 py-2 text-[13px] leading-relaxed',
            verdict.ok
              ? 'bg-affirm-wash text-affirm'
              : 'bg-alert-wash text-alert',
          ].join(' ')}
        >
          {verdict.ok ? (
            <>
              This ink reads at{' '}
              <strong className="tally font-semibold">
                {verdict.ratio.toFixed(1)}:1
              </strong>{' '}
              on that paper, clear of the {ACCENT_FLOOR}:1 a recruiter needs.
            </>
          ) : (
            <>
              This pairing reads at{' '}
              <strong className="tally font-semibold">
                {verdict.ratio.toFixed(1)}:1
              </strong>
              , under the {ACCENT_FLOOR}:1 a document needs to stay legible.
              Pick a darker ink or a lighter paper. Your CV keeps the
              design&rsquo;s own colours until then.
            </>
          )}
        </p>
      </div>
    </Section>
  )
}
