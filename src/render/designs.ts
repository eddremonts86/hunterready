/**
 * The design catalogue — named choices, each one a structure paired with a theme.
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
 * Twelve free, one hundred and three total in the expanded catalogue. The twelve are exactly the pairings
 * that were free before this catalogue existed: three structures × four themes.
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
 * Derived rather than typed out, so an id can never disagree with the pairing it names.
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
  sidebar: 'Sidebar',
  'lead-metric': 'Lead Metric',
  'lead-metric-eu': 'Lead Metric, European',
  'editorial-index': 'Editorial Index',
  'editorial-index-eu': 'Editorial Index, European',
  'tech-chips': 'Tech Architect',
  'split-grid': 'Split Grid',
  'timeline-accent': 'Timeline Accent',
  'minimal-rule': 'Minimal Rule',
  'compact-dense': 'Compact Dense',
  'split-panel-profile': 'Split Profile',
  'brutalist-studio': 'Brutalist Studio',
  'linear-modern': 'Linear Modern',
  'swiss-grid': 'Swiss Grid',
  'creative-director': 'Creative Director',
  'quantum-card': 'Quantum Card',
  'monolith-executive': 'Monolith Executive',
  'nordic-frost': 'Nordic Frost',
  'command-line': 'Command Line',
  'metro-compact': 'Metro Compact',
  'monograph-serif': 'Monograph Serif',
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
  glacier: 'Glacier',
  parchment: 'Parchment',
  blossom: 'Blossom',
  carnival: 'Carnival',
  editorial: 'Editorial',
  grotesk: 'Grotesk',
  heritage: 'Heritage',
  brush: 'Brush',
  onyx: 'Onyx',
}

/** What each theme is *for*, in one clause, so a gallery of choices is navigable. */
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
  glacier: 'a pale blue page with light geometric headings',
  parchment: 'a cream page in a classical book face',
  blossom: 'a rose masthead band and pale pink section bands',
  carnival: 'a different colour per section, under a rose masthead',
  editorial: 'a magazine-scale name, centred, black on white',
  grotesk: 'contemporary type with plum accents',
  heritage: 'classical serifs and bronze, centred',
  brush: 'a hand-written name at poster size with coral accents',
  onyx: 'light type on a dark page, for reading on screens',
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
 * original structures is free, and that is the whole definition of the free tier.
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
   */
  design('modern-intl-skills', 'modern', 'paid'),
  design('modern-intl-skills', 'narrow', 'paid'),
  design('modern-intl-education', 'modern', 'paid'),
  design('modern-eu-skills', 'modern', 'paid'),
  design('modern-eu-skills', 'academic', 'paid'),
  design('modern-eu-education', 'modern', 'paid'),

  /**
   * ── Paid: the character themes (ADR-025) ──────────────────────────────────────────────────────
   */
  ...(
    [
      'glacier',
      'parchment',
      'blossom',
      'carnival',
      'editorial',
      'grotesk',
      'heritage',
      'brush',
    ] as const
  ).flatMap((theme) => [
    design('modern-intl', theme, 'paid'),
    design('modern-eu', theme, 'paid'),
  ]),
  design('modern-intl-skills', 'carnival', 'paid'),
  design('modern-intl-skills', 'grotesk', 'paid'),
  design('modern-intl-education', 'glacier', 'paid'),
  design('showcase', 'editorial', 'paid'),
  design('showcase', 'brush', 'paid'),
  design('showcase', 'heritage', 'paid'),

  /**
   * ── Paid: the sidebar family and the dark page ────────────────────────────────────────────────
   */
  design('sidebar', 'executive', 'paid'),
  design('sidebar', 'professional', 'paid'),
  design('sidebar', 'narrow', 'paid'),
  design('sidebar', 'grotesk', 'paid'),
  design('sidebar', 'blossom', 'paid'),
  design('sidebar', 'onyx', 'paid'),
  design('modern-intl', 'onyx', 'paid'),
  design('modern-eu', 'onyx', 'paid'),

  /**
   * ── Paid: the 10 specialized structures ──────────────────────────────────────────────────
   */
  design('lead-metric', 'modern', 'paid'),
  design('lead-metric', 'technical', 'paid'),
  design('lead-metric', 'grotesk', 'paid'),
  design('lead-metric-eu', 'modern', 'paid'),
  design('lead-metric-eu', 'executive', 'paid'),
  design('editorial-index', 'editorial', 'paid'),
  design('editorial-index', 'grotesk', 'paid'),
  design('editorial-index', 'modern', 'paid'),
  design('editorial-index-eu', 'editorial', 'paid'),
  design('editorial-index-eu', 'heritage', 'paid'),
  design('tech-chips', 'technical', 'paid'),
  design('tech-chips', 'modern', 'paid'),
  design('tech-chips', 'narrow', 'paid'),
  design('split-grid', 'modern', 'paid'),
  design('split-grid', 'technical', 'paid'),
  design('timeline-accent', 'modern', 'paid'),
  design('timeline-accent', 'grotesk', 'paid'),
  design('minimal-rule', 'minimal', 'paid'),
  design('minimal-rule', 'academic', 'paid'),
  design('compact-dense', 'compact', 'paid'),
  design('compact-dense', 'narrow', 'paid'),
  design('split-panel-profile', 'modern', 'paid'),
  design('split-panel-profile', 'executive', 'paid'),

  /**
   * ── Paid: the 10 PRO Creative & Distinctive structures ──────────────────────────────────────
   */
  design('brutalist-studio', 'grotesk', 'paid'),
  design('brutalist-studio', 'technical', 'paid'),
  design('linear-modern', 'modern', 'paid'),
  design('linear-modern', 'grotesk', 'paid'),
  design('swiss-grid', 'modern', 'paid'),
  design('swiss-grid', 'grotesk', 'paid'),
  design('creative-director', 'editorial', 'paid'),
  design('creative-director', 'brush', 'paid'),
  design('quantum-card', 'modern', 'paid'),
  design('quantum-card', 'glacier', 'paid'),
  design('monolith-executive', 'executive', 'paid'),
  design('monolith-executive', 'heritage', 'paid'),
  design('nordic-frost', 'glacier', 'paid'),
  design('nordic-frost', 'minimal', 'paid'),
  design('command-line', 'technical', 'paid'),
  design('command-line', 'onyx', 'paid'),
  design('metro-compact', 'compact', 'paid'),
  design('metro-compact', 'narrow', 'paid'),
  design('monograph-serif', 'academic', 'paid'),
  design('monograph-serif', 'parchment', 'paid'),
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
 * Fails closed.
 */
export function tierOf(structure: TemplateId, theme: ThemeId): Tier {
  return BY_PAIR.get(`${structure}|${theme}`)?.tier ?? 'paid'
}

/** The ATS rating a design inherits from its structure. The theme cannot change it. */
export function atsRatingOf(entry: Design): AtsRating {
  return templates[entry.structure].atsRating
}

/** The default, and it must be free. */
export const DEFAULT_DESIGN_ID = id('modern-intl', 'modern')

export const CATALOGUE_SIZE = DESIGNS.length
export const ALL_STRUCTURES = TEMPLATE_IDS
export const ALL_THEMES = THEME_IDS
