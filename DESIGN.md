<!-- SEED: established with the user before implementation; re-run $impeccable document once there's code to capture the actual tokens and components. -->

---

name: HunterReady
description: A print room for job applications — the darkroom is the app, the CV is the print.
---

# Design System: HunterReady

## Overview

**Creative North Star: "The Print Room"**

A printing darkroom under amber safelight. The room is where work happens: you
load a file, watch it develop into structured data, adjust, and pull test strips
until it is right. The print is what you carry out of the room — black ink on
fiber paper, no trace of the amber it was made under. That split is not decoration;
it is the product's own thesis rendered as an architectural rule. Our design layer
belongs to the room. The user's CV belongs to them.

The world was chosen by the user over the roll's assigned direction, and it earns
the override on two counts. First, the emergence of an image in the developer tray
is a metaphor anyone understands without explanation — which matters, because the
audience is the whole working population, not a technical one. Second, the darkroom
already contains the answer to this product's hardest constraint: it has two light
states. Amber safelight for working, white light for inspecting a finished print.
The CV preview lives under white light, on enamel, in neutral grays, which is
exactly where a nurse's CV and an engineer's CV both need to live.

The world's own motto is on its reference board: _"Commit to the pull. There is no
undo."_ We refuse that half. PRODUCT.md requires errors to be recoverable and never
destructive, and where the challenger's grammar conflicts with product truth,
product truth wins. The darkroom's own non-destructive instrument is the **test
strip** — a stepped, reversible preview taken before committing the print. That
device carries the whole product: nothing here is irreversible, because the only
irreversible act happens outside the app, when the user sends the file to an employer.

Rejected, explicitly: the friendly SaaS resume builder (soft indigo, rounded cards,
progress stepper, confetti on export) and its predictable opposite, the near-black
developer tool with terminal green. Neither may be reached for as a fallback when a
screen gets difficult.

**Key Characteristics:**

- Amber is the room, never the print. One saturated color carries the working surfaces.
- Two hard-edged light states, each meaning a different kind of work.
- Depth comes from light falloff, not from drop shadows.
- Stations in order, all of them re-enterable.
- Real photographic atmosphere and authored props — never gradients-and-glass standing in for material.
- Every variant is a test strip: stepped, comparable, reversible.

## Colors

A committed strategy: one saturated color owns 30–60% of the working surfaces, and
the entire remaining palette is the neutral grayscale of a black-and-white print.
There is no second accent, and there is no third.

### Primary

- **Safelight Amber** (#FFB100): The working light. Owns chrome, primary buttons,
  active navigation, timer digits, focus rings, labels, and every control the user
  operates. Verified 10.68:1 against Print Black. On amber fill, text is Print Black
  (also 10.68:1) — never white.
- **Amber Shadow** (#B36A00): The pressed and hovered state of anything amber, and
  the hairline rule that separates panels inside the room. Amber past its brightest,
  the way a safelight looks at the edge of its cone.

### Neutral

- **Print Black** (#0D0D0D): The room's ground, and — separately — the ink of the
  print. It is the one token that legitimately appears in both worlds, because
  black ink and a dark room are the same absence.
- **Darkroom Brown** (#2A1B0B): Raised surfaces inside the room — cards, panels,
  input wells, the bench. Amber light on a dark surface, which is why the room's
  "gray" is warm and never neutral.
- **Tray Enamel** (#F3E6C4): The lit inspection surface. Ground for the CV preview
  pane, the download screen, and any region under white light. Enamel, not cream:
  it is a glossy tray, so it takes a specular edge rather than reading as paper.
- **Silver Gray** (#BDBDBD): Print highlights and secondary text on dark grounds
  (10.34:1 on Print Black). In the document, the mid-highlight of a photographic print.
- **Developer Gray** (#6E6E6E): Structural only — rules, borders, dividers,
  disabled states, and large-format labels. **Not a body-text color on enamel**: at
  4.14:1 it fails WCAG AA for normal text and passes only at large sizes. Body text
  on Tray Enamel is Print Black.

### Named Rules

**The Amber Never Touches The Print Rule.** Safelight Amber and Amber Shadow appear
nowhere inside the document preview and nowhere in an exported PDF. Documents are
Print Black, Silver Gray and Developer Gray on Tray Enamel or white. A CV carrying
our accent color carries our brand into someone else's job application, which is not
ours to place there. This rule also happens to satisfy two hard constraints: the PDF
renderer accepts hex only, and the output must read as sector-neutral for every user.

**The Two Lights Rule.** The interface has exactly two light states and they mean
different things. _Safelight_ — Print Black ground, Darkroom Brown surfaces, amber
chrome — is for working: upload, extract, edit, adjust. _White light_ — Tray Enamel
ground, Print Black ink — is for inspecting a finished print: the preview pane, the
download screen. The boundary between them is always a hard edge. Never a gradient,
never a soft fade, never one bleeding into the other.

**The One Cone Rule.** There is no second accent color. If a state needs to be
distinguished and amber is already spoken for, distinguish it with luminance,
position, or the test-strip grammar — not with a new hue. Error states are the one
exception and are resolved during implementation, drawn from the world's own
material (safelight red is a real darkroom light) rather than invented.

## Typography

**Display Font:** [to be resolved during implementation] — a hand-drawn grease-pencil
face, brush-weight caps with a drawn underline stroke.
**Body Font:** [to be resolved during implementation] — a typewriter monospace, the
voice of exposure notes and bottle dilutions.
**Label Font:** [to be resolved during implementation] — a condensed engraved grotesk,
caps only, the face stenciled onto trays and bottle labels.
**Numeral Font:** [to be resolved during implementation] — seven-segment LED digits,
lifted from the safelight timer.

**Character:** Four faces, each with one job, borrowed from four real objects in one
room: the grease pencil, the notebook, the bottle label, the timer. The pairing is
working typography, not editorial typography — nothing here is set to be admired.

Selection constraints, binding at implementation: none of the training-data default
faces (Inter-as-display, Space Grotesk, Space Mono, IBM Plex, DM Sans, Outfit, Plus
Jakarta Sans, Instrument Sans, Fraunces, Playfair, Cormorant). The document body face
is chosen separately and to a different brief — wide language coverage for EN/ES/DA,
sector-neutral, and legible after the renderer embeds a font subset.

### Hierarchy

- **Display** (grease pencil, brush caps, drawn underline): Station names and the one
  statement per screen. Annotation register, never document register.
- **Headline** (condensed grotesk caps, tracked): Section headings in the room.
- **Title** (condensed grotesk caps, small, tracked): Panel and field-group labels.
- **Body** (typewriter mono): Explanatory copy, notes, warnings, extraction messages.
  Max 65–75ch.
- **Label** (condensed grotesk caps, smallest, widest tracking): Control labels,
  navigation, table headers, status words.
- **Numeral** (seven-segment): Elapsed and counted things only.

### Named Rules

**The Grease Pencil Rule.** The hand-drawn face is annotation only. It never sets
body text, never sets a control label, and never appears inside the user's document.
In a real darkroom the grease pencil marks the notebook and the back of a print; it
never sets the print itself. Break this and the world becomes a scrapbook.

**The Seven-Segment Rule.** Seven-segment numerals are reserved for elapsed and
counted things — the render timer, page count, the tally of fields that survived the
parse. Never for dates inside a CV, never for prices, never as ornament.

## Layout

**Stations in order.** The darkroom's topology is a fixed sequence of stations, and
the product's pipeline already is one: _load → develop → inspect → adjust → print_
(upload → extract → review → edit → download). Navigation is the station rail, not a
menu. The current station is amber; completed ones hold a lit mark; unreached ones sit
in Darkroom Brown.

**Every station is re-enterable.** This is the deliberate divergence from the real
darkroom and it is an invariant, not a preference: PRODUCT.md requires recoverable
errors, so moving backwards is always available and never warned about. The rail is a
sequence, not a gate.

**The bench.** Working screens compose as one continuous horizontal bench with
stations bolted along it, rather than as stacked cards on a page. Content sits _on_
the bench surface; the bench itself is Darkroom Brown on a Print Black room.

**The inspection window.** Wherever a finished document is shown, it appears as a
white-light region with a hard edge — a lit surface set into the dark room. It has its
own internal margins and does not inherit the room's spacing rhythm, because it is a
different object under different light.

**Rhythm and responsive behavior:** [to be resolved during implementation]. The
invariant: stations linearize in order on narrow viewports, never collapsing into a
hamburger, and the inspection window becomes full-bleed rather than shrinking — a
print too small to inspect is worse than a print you have to scroll.

## Elevation & Depth

**No drop shadows.** A safelight is a point source in a dark room, so depth is
luminance falloff: surfaces nearer the light are warmer and lighter, surfaces further
away sink toward Print Black. Elevation is expressed by how much amber a surface has
caught, not by a shadow beneath it. This is the world's actual physics and it replaces
the shadow scale entirely.

Two material behaviors carry the rest:

- **Wet sheen.** The active surface — the one currently being worked — takes a faint
  specular highlight along its top edge, the way a wet print catches the safelight.
  Reserved for the single active element; two wet surfaces at once reads as a bug.
- **Enamel gloss.** White-light regions take a hard specular rim on one edge, because
  an enamel tray is glossy and paper is not. This is how the inspection window reads
  as a lit object rather than as a white rectangle.

**The Falloff Rule.** Depth is light, never shadow. No `box-shadow` for elevation
anywhere in this system. If an element needs to sit forward, give it more amber.

## Shapes

**The tray rim.** The signature form is the enamel tray's lip: a 1px inner line set
in from the outer edge, running the full perimeter. It appears on cards, panels, the
inspection window, and secondary buttons. It is the system's most recognizable
geometry with all content removed.

Corners are small and consistent — a 4px radius across controls and containers,
which is a stamped-metal radius rather than a soft one. Nothing in this world is
pill-shaped and nothing is fully square; bottles have square labels, trays have
rounded corners, and the interface takes the tray's.

Borders are hairlines in Amber Shadow inside the room, Developer Gray under white
light. Bottle labels — the pattern for any tagged or named object — are square-cornered
rectangles with the label's caps set inside a rim, and they are the one place the
system permits a fully square corner.

## Do's and Don'ts

### Do:

- **Do** keep amber inside the room. Chrome, controls, timers, labels, navigation,
  focus — all amber. The document, never.
- **Do** put every finished document under white light, on Tray Enamel (#F3E6C4)
  with Print Black (#0D0D0D) ink, separated from the room by a hard edge.
- **Do** express depth as amber falloff, and give the single active surface the wet sheen.
- **Do** show variants as a test strip — stepped, adjacent, comparable, reversible.
  Theme choice, template choice and any rewritten bullet all use this grammar.
- **Do** use Print Black as the text color on Tray Enamel. Body copy on enamel is
  always Print Black.
- **Do** author the room's props at production fidelity: real labeled bottles, real
  tray edges, real timer faces, real test strips. The hero reference sets the bar.
- **Do** keep the station rail linear and always re-enterable, forwards and backwards.

### Don't:

- **Don't** put Safelight Amber, Amber Shadow, or any hue inside a CV preview or an
  exported PDF. This is the system's hardest prohibition.
- **Don't** use Developer Gray (#6E6E6E) for normal-size body text on Tray Enamel —
  4.14:1 fails WCAG AA. Structural and large-format use only.
- **Don't** add a second accent hue. Distinguish states with luminance, position, or
  the test strip.
- **Don't** use `box-shadow` for elevation. Depth is light in this system.
- **Don't** let the grease-pencil face set body text, control labels, or anything
  inside the user's document.
- **Don't** make any action irreversible, or warn that one is. The world says "there
  is no undo"; this product says the opposite, and the test strip is how.
- **Don't** soften the boundary between safelight and white light with a gradient.
- **Don't** reach for gradients, glass, or generic icon tiles where an authored prop
  belongs.
- **Don't** fall back to the category default (soft indigo, rounded cards, progress
  stepper, confetti) when a screen gets hard.
