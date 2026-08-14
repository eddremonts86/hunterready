---
name: HunterReady
description: Plain sight — the interface is so plainly legible it disappears, so the document is the only thing on screen that belongs to anyone.
---

# Design System: HunterReady

## Overview

**Creative North Star: "Plain Sight"**

Nothing about how your CV will be read should be hidden from you. That is the
product's promise, and this is that promise built as an interface: a white ground,
one blue, deep navy ink, and no visual density anywhere except in the user's own
document. The chrome is not minimal because minimal is fashionable. It is minimal
because every gram of styling we add to the frame is a gram of attention taken from
the only object on screen the user is actually deciding about.

This world **replaces "The Print Room"** — a darkroom under amber safelight, where
depth was light falloff, corners were 4px stamped metal, and four typefaces each did
one job. That world was internally coherent and had a real thesis, and it is gone on
purpose. Three reasons, in order of weight:

1. **The user pinned a reference.** A guided, light, blue-accented product was
   supplied as the target with a dozen screens of evidence. A pinned brief outranks
   the incumbent world, and re-arguing it would be substituting our taste for theirs.
2. **The audience.** PRODUCT.md's user is a nurse, an electrician, a teacher, a
   sales director. A darkroom metaphor asks them to know what a test strip is before
   the interface makes sense. This one asks nothing.
3. **The old world's own rejection list was wrong.** It explicitly ruled out "the
   friendly SaaS resume builder (soft indigo, rounded cards, progress stepper)" as
   the predictable default. But the reason that pattern is everywhere is that it
   works for exactly this task: a stranger, on a phone, doing one unfamiliar thing.
   Refusing it was a preference dressed as a principle.

What carried over, because it was never about the darkroom: **the accent never
touches the print**, every station stays re-enterable, nothing is destructive, and
the honest counter never overstates what is left.

**Key Characteristics:**

- One accent (#1B3BD8) carries every control, link, and chosen state. There is no second.
- White ground, cool band, hairline borders. Depth is a hairline plus a wide low shadow.
- One typeface, four weights. Hierarchy comes from weight and size, never from a second face.
- Fully-rounded pills for actions; a stacked choice card for every decision.
- The document is the only element permitted real density.
- One decision per screen wherever the flow genuinely has one decision.

## Colors

One saturated blue owns every interactive surface. Everything else is a cool
grayscale plus three semantic colors that each earn their place. Every value below
was contrast-checked against the ground it is used on, and the ratio is recorded in
`src/styles.css` next to the token — a color whose contrast nobody measured is a
color that fails an audit later.

### Primary

- **Signal** (#1B3BD8): The one accent. Primary buttons, links, the progress rail,
  the chosen state, the wordmark's full stop, the "to check" figure. **7.84:1 on
  white**, and 7.84:1 for white text on the fill — legal as both a link color and a
  filled button, which is what lets it carry the interface alone.
- **Signal Deep** (#142EA8): Hover and pressed. 10.6:1.
- **Signal Wash** (#EEF2FF) / **Signal Edge** (#C3D0FB): The chosen surface and its
  border. A chosen choice card changes surface, border, and text color at once, plus
  gains a check mark — four signals, because a border alone is invisible on a phone
  in daylight and a color alone fails for a color-blind user.

### Neutral

- **Ground** (#FFFFFF): The page, and cards on it.
- **Band** (#F4F6FA): Section bands, the paper's surround, the segmented track.
  Cool, never warm: a warm gray behind a white sheet makes the sheet look blue.
- **Hairline** (#E2E7F0) / **Hairline Strong** (#CFD6E4): Borders, and the hover border.
- **Ink** (#101A33): Headings _and_ body. 17.3:1. There is deliberately no lighter
  "body gray" in this system — body text set in a mid gray is the single most common
  way a clean layout becomes unreadable.
- **Ink Soft** (#5A6478): Secondary copy, hints, captions. 5.96:1 — passes AA at any size.
- **Ink Faint** (#8A93A6): 3.07:1. **Structural and large-format only** — rules,
  disabled labels, strike decoration. Never normal-size text.

### Semantic

- **Affirm** (#0C7A52) on **Affirm Wash** (#E8F6EF), 5.42:1. "Parse verified", and
  the panel where the fabrication guard threw a suggestion away — from the
  candidate's side that is the system protecting them, so it looks like something
  that went right.
- **Caution** (#9A5B12) on **Caution Wash** (#FDF4E6), 5.34:1. "We were not sure we
  read this correctly" and "worth knowing". Never red: it is a question, not an
  accusation, and red would make it read as an error the user caused.
- **Alert** (#C02424) on **Alert Wash** (#FDEDED), 5.96:1. Failed uploads, and the
  delete-everything confirmation — the only destructive action in the product and
  the only place a button may be red.

### Named Rules

**The Print Is Not Ours.** Signal Blue appears nowhere inside a CV preview and
nowhere in an exported PDF. Documents are set in the renderer's own neutral themes,
in their own faces (Source Sans 3, Source Serif 4 — deliberately not the chrome's).
A CV carrying our accent carries our brand into someone else's job application,
which is not ours to place there. This rule survived the world change unaltered
because it was never about amber; it is about whose document it is. It also satisfies
two hard constraints: the PDF renderer accepts hex only, and the output must read as
sector-neutral for every user.

**One Accent.** There is no second accent hue. If a state needs distinguishing and
Signal is spoken for, distinguish it with weight, luminance, position, or a
semantic color — never with a new brand hue. The three semantic colors are not
accents; each one is a fixed meaning and may not be used decoratively.

**No Invented Proof.** The landing page carries no rating, no user count, no
testimonial, and no logo wall unless every one of them is true and attributable. The
pinned reference has all four; we have none of them, and inventing them would be the
same act `src/optimize/fabrication.ts` exists to prevent — putting a number in front
of someone that nothing backs. Until there is real proof, the page carries the three
mechanisms a reader can verify in the repo.

## Typography

**All roles:** Figtree Variable (OFL, bundled, Latin Extended for EN/ES/DA).

One family, weights 400/500/600/800. The previous world used four faces, each with
one job; this one gets its hierarchy from weight and size, which is what the pinned
reference does and what leaves less to keep in sync. Latin-ext is required rather
than optional: Spanish and Danish are planned output languages, so æ ø å ñ í é have
to render in the chrome too.

The document faces are chosen separately and to a different brief — wide language
coverage, sector-neutral, legible after the renderer embeds a subset. They are never
Figtree (see The Print Is Not Ours).

### Hierarchy

- **Hero** — `clamp(2.25rem, 4.2vw, 3.5rem)`, 800, -0.032em, 1.06. The one statement
  per page. Capped at 3.5rem after measurement: at 68px the hero sentence broke into
  four lines in its column and orphaned two of them. A headline that big is only big
  in a screenshot.
- **Display** — `clamp(1.75rem, 3.4vw, 2.375rem)`, 800, -0.024em. Step questions and
  section headings.
- **Title** — 1.1875rem, 700. Card and panel headings.
- **Lead** — 1.0625rem, 400, 1.6. The paragraph under a hero.
- **Body** — 1rem / 0.9375rem, 400, 1.6. On Ink, never on Ink Soft.
- **Meta** — 0.8125rem. Captions, hints, tallies.

### Named Rules

**No Hard Breaks In Display Type.** A `<br />` in a headline is a guess about one
viewport width. Use `text-wrap: balance` and let the browser even out the rag at
every width. This rule exists because the first cut of the hero had a hard break
that fought the natural wrap and produced a four-line headline with two orphans.

**Tabular Figures For Anything That Changes.** Counters, tallies, step numbers. A
number that shifts the layout when it decrements reads as a glitch.

## Layout

**One decision per screen, where there is one decision.** The consent gate gets the
whole viewport, centred, max-width 36rem, with nothing competing for the answer.
That is the reference's central pattern and it is used where the flow genuinely has a
single question — not imposed on the review step, which needs the form and the
document visible together and would be actively worse as twenty screens.

**Three stations, and the chrome says so.** Upload → Check → Download. A 2px rail
and an `n/3` counter, and both appear **only once the person has started** — a
filled 1/3 on a landing page is progress nobody has made, which is the same
overstatement the counter exists to avoid.

**The landing hero is a 2×2 grid, ordered for the phone.** Headline top-left, the
upload control spanning the right, the reasons bottom-left. On a phone the same three
children stack as headline → upload → reasons, so the primary action is the second
thing on screen rather than buried under a bullet list. One set of markup, no
`hidden`/`lg:block` pair — that pattern always drifts.

**The document keeps its own surround.** Wherever a CV is shown it sits on the Band
with a contact shadow, as a sheet on a desk. It has its own internal margins and does
not inherit the page's spacing rhythm, because it is a different object.

**Every station is re-enterable**, forwards and backwards, always available and never
warned about — PRODUCT.md requires recoverable errors. The back arrow is chrome, not
a dialog.

## Waiting

**Nothing happens silently.** Every action that leaves the browser says so, in words,
on the control that started it. `Spinner`, `Working` and `ButtonLabel` in
`components/working.tsx` are the only three shapes this takes; a fourth one invented
locally is how six screens ended up with six answers, four of them being "nothing".

**Words, not just a ring.** The label carries the message and the ring carries the
motion, in that order of importance. A greyed-out button whose text has not changed
reads as a click that was swallowed.

**Motion is essential here, so it survives reduced motion.** The stylesheet's
`prefers-reduced-motion` rule stops everything except `data-motion="essential"`,
which is slowed to 2.4s rather than frozen. A spinner that has stopped turning does
not read as respect for a preference; it reads as a hung application, to the one
person who has no other cue.

**Name the shape of the wait, never a duration.** "One pass over every bullet — the
longer your history, the longer this takes" is true for everybody. "About ten
seconds" is wrong for most, and a promise that has already expired is how a working
request starts looking broken.

**Never a percentage we were not given.** None of these operations reports progress,
so an indeterminate bar or a ring is the honest shape. See the Don't below — this is
the same rule as the step rail's.

**A loading state is not an empty state.** They look alike and mean opposite things:
one is "we have not asked yet", the other is "you have nothing". The library showed
ten saved CVs as "nothing saved yet" for the first moment of every visit.

**Guard the button, do not merely dim it.** Two clicks on a silent Share minted two
public links to somebody's employment history, and nobody closes a link they do not
know exists.

## Elevation & Depth

A card sits forward the way paper on a desk does: a **1px hairline for the edge**,
and a **wide, very low-opacity shadow for the contact**. Two layers, both tinted with
Ink rather than black, because a neutral-black shadow on a cool white reads as dirt.

```
box-shadow: 0 1px 2px rgb(16 26 51 / 4%), 0 10px 28px -14px rgb(16 26 51 / 12%);
```

This is the deliberate reversal of the previous world's hardest layout rule, which
forbade `box-shadow` outright and expressed depth as amber falloff. That was correct
for a dark room lit by one lamp and is meaningless on a white ground, where there is
no lamp.

**The Falloff Rule is repealed.** Shadows are the elevation mechanism in this system.
They are always the two-layer recipe above, always Ink-tinted, and never used to make
something look important — only to say "this is a surface above another surface".

## Shapes

**The pill is the signature form.** Every action is fully rounded (`999px`). A
full-width pill reads as one decisive action in a way a rectangle of the same size
does not. This inverts the previous world, which used a 4px stamped-metal radius and
stated that "nothing here is pill-shaped".

- **Cards:** 1rem radius, hairline border.
- **Choice cards:** 0.875rem. Title over hint, full-width, chosen state as described above.
- **Fields:** 0.75rem, Hairline Strong border, focus = Signal border + 3px Signal Wash
  ring. A ring rather than a heavier border, so focus never shifts layout.
- **Chips and badges:** pill.

## Do's and Don'ts

### Do:

- **Do** let Signal carry every control, link and chosen state, and keep it to one hue.
- **Do** set body copy on Ink. Ink Soft is for secondary copy; Ink Faint is structural.
- **Do** give a chosen state four simultaneous signals: surface, border, text, check.
- **Do** use `text-wrap: balance` on display type instead of a hard break.
- **Do** show the rail and counter only after the person has actually started.
- **Do** order the hero's children for the phone, so the action is never buried.
- **Do** state semantic color by meaning: Affirm = verified, Caution = please look,
  Alert = this failed or this deletes.
- **Do** keep the document dense and the chrome quiet. If a screen feels flat, the
  document is probably not on it yet.

### Don't:

- **Don't** put Signal Blue, or any chrome color or chrome typeface, inside a CV
  preview or an exported PDF. This is the system's hardest prohibition.
- **Don't** use Ink Faint (#8A93A6) for normal-size text — 3.07:1 fails AA. It is for
  rules, disabled labels and strike decoration.
- **Don't** add a second accent hue, and don't use a semantic color decoratively.
- **Don't** invent social proof: no ratings, counts, testimonials or logo walls that
  are not true and attributable.
- **Don't** style one side of a consent decision as the obvious answer. Both options
  are the same choice card, in the same order, neither pre-selected.
- **Don't** put a hard break in a headline.
- **Don't** use a shadow to signal importance — only to signal a surface.
- **Don't** show a progress indicator for progress that has not happened.
- **Don't** make any action irreversible, or warn that one is, except account deletion —
  which names exactly what disappears rather than asking "are you sure?".
- **Don't** reach back for the darkroom: amber, safelight, test strips, stencilled
  caps, seven-segment numerals and the 4px stamped radius are all retired. Reviving
  one piece of a replaced world produces a screen belonging to neither.
