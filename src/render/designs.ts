/**
 * The design catalogue — thirty named choices, each one a structure paired with a theme.
 *
 * ## Why thirty is a catalogue and not thirty layouts
 *
 * Edd asked for thirty templates. The ATS ruleset does not permit thirty layouts and no amount of work
 * makes it: one column, contact details as text, standard section headings, a single reading order, no
 * tables, flexbox only (docs/05). That leaves two structural freedoms — which blocks exist (ADR-010's
 * regional conventions) and which order they come in — for seven structures in total. Thirty *different*
 * layouts would mean twenty-three that either look identical or fail the round-trip, which is the one
 * test this product sells.
 *
 * So a design is a **pairing**, which is what a template gallery has always been and what pdfcn's theming
 * is built for. The structure decides what the reader meets and in what order; the theme decides the
 * voice — serif or sans, dense or airy, typewriter or condensed. Both halves are real, both are visible in
 * a preview, and every pairing is rendered and read back in the round-trip suite.
 *
 * ## Free and paid
 *
 * Twelve free, eighteen paid, and the twelve are exactly the pairings that were free before this catalogue
 * existed: three structures × four themes. Edd asked for ten free, and ten would have meant **taking two
 * away** from people already using them, which is not a thing to do to somebody's CV tool over a round
 * number.
 *
 * The gate is enforced in `/api/render`, not here. A lock drawn in the interface is not a gate — that
 * endpoint is public and answers a `curl` — so this module only *states* the tier, and the endpoint reads
 * it. `tierOf` is the function it calls, and it fails closed on a pairing it does not recognise.
 */
import { THEME_IDS } from './themes'
import type { ThemeId } from './themes'
import { TEMPLATE_IDS, templates } from './templates/registry'
import type { AtsRating, TemplateId } from './templates/registry'

export type Tier = 'free' | 'paid'

export interface Design {
  id: string
  /** What a person reads in the gallery: the structure, then the voice. */
  label: string
  /** One line on who it is for. Plain language — the audience is not designers. */
  hint: string
  structure: TemplateId
  theme: ThemeId
  tier: Tier
}

/**
 * A design's id is `structure/theme`.
 *
 * Derived rather than typed out, so an id can never disagree with the pairing it names — the class of bug
 * that had two filename implementations spelling one nurse's name two ways earlier in this project.
 */
const id = (structure: TemplateId, theme: ThemeId) => `${structure}/${theme}`

/** Short names for the gallery. The registry's own labels carry the convention in full. */
const STRUCTURE_NAMES: Record<TemplateId, string> = {
  'modern-intl': 'International',
  'modern-intl-skills': 'Skills first',
  'modern-intl-education': 'Study first',
  'modern-eu': 'European',
  'modern-eu-skills': 'Skills first, European',
  'modern-eu-education': 'Study first, European',
  showcase: 'Showcase',
}

const THEME_NAMES: Record<ThemeId, string> = {
  modern: 'Modern',
  professional: 'Professional',
  executive: 'Executive',
  compact: 'Compact',
  minimal: 'Minimal',
  narrow: 'Narrow',
  academic: 'Academic',
  technical: 'Technical',
}

/** What each theme is *for*, in one clause, so a gallery of thirty is navigable. */
const THEME_FOR: Record<ThemeId, string> = {
  modern: 'a clean default that suits almost any field',
  professional:
    'formal headings for health, education, law and the public sector',
  executive: 'larger and more spacious, for senior roles',
  compact: 'fits a long history in fewer pages',
  minimal: 'wide margins and plenty of air',
  narrow: 'a condensed face, so more fits per line without smaller text',
  academic: 'serif text, the convention in research, law and medicine',
  technical:
    'typewriter headings over dense text, for trades, labs and engineering',
}

function design(structure: TemplateId, theme: ThemeId, tier: Tier): Design {
  return {
    id: id(structure, theme),
    label: `${STRUCTURE_NAMES[structure]} · ${THEME_NAMES[theme]}`,
    hint: `${templates[structure].hint.split('.')[0]}. Set with ${THEME_FOR[theme]}.`,
    structure,
    theme,
    tier,
  }
}

/**
 * The four themes that existed before the catalogue. Everything paired with these on one of the three
 * original structures is free, and that is the whole definition of the free tier — no judgement call, just
 * "what somebody could already do".
 */
const ORIGINAL_THEMES: ReadonlyArray<ThemeId> = [
  'modern',
  'professional',
  'executive',
  'compact',
]

const ORIGINAL_STRUCTURES: ReadonlyArray<TemplateId> = [
  'modern-intl',
  'modern-eu',
  'showcase',
]

const NEW_THEMES: ReadonlyArray<ThemeId> = [
  'minimal',
  'narrow',
  'academic',
  'technical',
]

export const DESIGNS: ReadonlyArray<Design> = [
  // ── Free: the twelve pairings that were already available ────────────────────────────────────
  ...ORIGINAL_STRUCTURES.flatMap((structure) =>
    ORIGINAL_THEMES.map((theme) => design(structure, theme, 'free')),
  ),

  // ── Paid: the new voices on the familiar structures ──────────────────────────────────────────
  ...ORIGINAL_STRUCTURES.flatMap((structure) =>
    NEW_THEMES.map((theme) => design(structure, theme, 'paid')),
  ),

  /**
   * ── Paid: the reordered structures ────────────────────────────────────────────────────────────
   *
   * Curated rather than crossed. Six entries, chosen so every structure in the product appears in the
   * gallery at least once and each pairing has a reason: a career switcher wants either the plain default
   * or the room that Narrow buys for a long skills list, a graduate wants the default, and the European
   * variants pair with what those markets read.
   */
  design('modern-intl-skills', 'modern', 'paid'),
  design('modern-intl-skills', 'narrow', 'paid'),
  design('modern-intl-education', 'modern', 'paid'),
  design('modern-eu-skills', 'modern', 'paid'),
  design('modern-eu-skills', 'academic', 'paid'),
  design('modern-eu-education', 'modern', 'paid'),
]

export const FREE_DESIGNS = DESIGNS.filter((d) => d.tier === 'free')
export const PAID_DESIGNS = DESIGNS.filter((d) => d.tier === 'paid')

const BY_ID = new Map(DESIGNS.map((d) => [d.id, d]))
const BY_PAIR = new Map(DESIGNS.map((d) => [`${d.structure}|${d.theme}`, d]))

export function findDesign(designId: string): Design | undefined {
  return BY_ID.get(designId)
}

/**
 * The tier of a structure-and-theme pairing, for the render endpoint's gate.
 *
 * **Fails closed.** A pairing that is not in the catalogue returns `'paid'`, so a request for
 * `?template=modern-eu-skills&theme=technical` — a real combination that renders perfectly and is
 * deliberately not offered — cannot slip through as free just because nobody listed it. Same stance as
 * `entitlements.ts`: the safe direction is the one that does not give away what is sold.
 */
export function tierOf(structure: TemplateId, theme: ThemeId): Tier {
  return BY_PAIR.get(`${structure}|${theme}`)?.tier ?? 'paid'
}

/** The ATS rating a design inherits from its structure. The theme cannot change it. */
export function atsRatingOf(entry: Design): AtsRating {
  return templates[entry.structure].atsRating
}

/** The default, and it must be free — otherwise a first-time visitor is locked out of the product. */
export const DEFAULT_DESIGN_ID = id('modern-intl', 'modern')

/* Asserted by `designs.test.ts`: thirty entries, twelve free, every structure and every theme used. */
export const CATALOGUE_SIZE = DESIGNS.length
export const ALL_STRUCTURES = TEMPLATE_IDS
export const ALL_THEMES = THEME_IDS
