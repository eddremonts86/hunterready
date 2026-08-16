/**
 * Template registry.
 *
 * `atsRating` is surfaced in the UI on purpose. Being honest that a design-first layout may
 * not survive an older parser is a feature — every competitor labels everything
 * "ATS-friendly", which tells the user nothing.
 */
import { createModernTemplate } from './modern-base'
import type { Convention, SectionOrder } from './modern-base'
import { ShowcaseTemplate } from './showcase'
import { SidebarTemplate } from './sidebar'
import { createLeadMetricTemplate } from './lead-metric'
import { createEditorialIndexTemplate } from './editorial-index'
import { createTechChipsTemplate } from './tech-chips'
import { createTimelineMinimalTemplate } from './timeline-minimal'
import { createProCreativeTemplate } from './pro-creative'
import { createProMinimalTemplate } from './pro-minimal'

export const TEMPLATE_IDS = [
  'modern-intl',
  'modern-intl-skills',
  'modern-intl-education',
  'modern-eu',
  'modern-eu-skills',
  'modern-eu-education',
  'showcase',
  'sidebar',
  'lead-metric',
  'lead-metric-eu',
  'editorial-index',
  'editorial-index-eu',
  'tech-chips',
  'split-grid',
  'timeline-accent',
  'minimal-rule',
  'compact-dense',
  'split-panel-profile',
  'brutalist-studio',
  'linear-modern',
  'swiss-grid',
  'creative-director',
  'quantum-card',
  'monolith-executive',
  'nordic-frost',
  'command-line',
  'metro-compact',
  'monograph-serif',
] as const
export type TemplateId = (typeof TEMPLATE_IDS)[number]

export const DEFAULT_TEMPLATE_ID: TemplateId = 'modern-intl'

export type AtsRating = 'verified' | 'design-first'

export interface TemplateMeta {
  id: TemplateId
  label: string
  convention: Convention
  /**
   * How the page is constructed. `flow` is one column through the ordinary render path; `sidebar` is the
   * two-column construction, which the renderer must know about because the full-height colored column
   * is built with measured heights and split margin bands (see render.tsx).
   */
  layout?: 'flow' | 'sidebar'
  /** Which section follows the summary. `experience` for anything that does not say otherwise. */
  order: SectionOrder
  /** Plain language — read by job seekers, not designers. */
  hint: string
  atsRating: AtsRating
  /** Shown next to a `design-first` rating. Empty when verified. */
  warning: string
}

export const templates: Record<
  TemplateId,
  TemplateMeta & {
    Component: ReturnType<typeof createModernTemplate>
  }
> = {
  'modern-intl': {
    id: 'modern-intl',
    label: 'Modern — International',
    convention: 'intl',
    order: 'experience',
    hint: 'No photo, no personal details. Standard for the US, UK, Ireland and most international applications.',
    atsRating: 'verified',
    warning: '',
    Component: createModernTemplate('intl'),
  },
  'modern-intl-skills': {
    id: 'modern-intl-skills',
    label: 'Skills first — International',
    convention: 'intl',
    order: 'skills',
    hint: 'Leads with what you can do rather than where you worked. For changing field or coming back after a break.',
    atsRating: 'verified',
    warning: '',
    Component: createModernTemplate('intl', 'skills'),
  },
  'modern-intl-education': {
    id: 'modern-intl-education',
    label: 'Study first — International',
    convention: 'intl',
    order: 'education',
    hint: 'Leads with your qualification. For a recent graduate or someone newly certified.',
    atsRating: 'verified',
    warning: '',
    Component: createModernTemplate('intl', 'education'),
  },
  'modern-eu': {
    id: 'modern-eu',
    label: 'Modern — European',
    convention: 'eu',
    order: 'experience',
    hint: 'Includes personal details such as nationality or date of birth. Common in Denmark, Germany and Spain.',
    atsRating: 'verified',
    warning: '',
    Component: createModernTemplate('eu'),
  },
  'modern-eu-skills': {
    id: 'modern-eu-skills',
    label: 'Skills first — European',
    convention: 'eu',
    order: 'skills',
    hint: 'Leads with what you can do, and keeps the photo and personal details a European CV expects.',
    atsRating: 'verified',
    warning: '',
    Component: createModernTemplate('eu', 'skills'),
  },
  'modern-eu-education': {
    id: 'modern-eu-education',
    label: 'Study first — European',
    convention: 'eu',
    order: 'education',
    hint: 'Leads with your qualification, with the photo and personal details a European CV expects.',
    atsRating: 'verified',
    warning: '',
    Component: createModernTemplate('eu', 'education'),
  },
  sidebar: {
    id: 'sidebar',
    label: 'Sidebar',
    convention: 'eu',
    order: 'experience',
    layout: 'sidebar',
    hint: 'A full-height colored column for your photo, contact and skills, beside the main story.',
    atsRating: 'design-first',
    warning:
      'Some screening systems read a page line by line across both columns, which can scramble the order. Send this version to people, and a single-column one to portals.',
    Component: SidebarTemplate,
  },
  showcase: {
    id: 'showcase',
    label: 'Showcase',
    convention: 'intl',
    order: 'experience',
    hint: 'More space and a stronger name block. The section names sit beside the content rather than above it.',
    atsRating: 'verified',
    warning: '',
    Component: ShowcaseTemplate,
  },
  'lead-metric': {
    id: 'lead-metric',
    label: 'Lead Metric',
    convention: 'intl',
    order: 'experience',
    hint: 'Prominent 4-card metric impact row, structured contact bar, and numbered entries for staff and lead profiles.',
    atsRating: 'verified',
    warning: '',
    Component: createLeadMetricTemplate('intl'),
  },
  'lead-metric-eu': {
    id: 'lead-metric-eu',
    label: 'Lead Metric — European',
    convention: 'eu',
    order: 'experience',
    hint: 'Prominent metric cards and numbered entries, tailored with European photo slot and personal details.',
    atsRating: 'verified',
    warning: '',
    Component: createLeadMetricTemplate('eu'),
  },
  'editorial-index': {
    id: 'editorial-index',
    label: 'Editorial Index',
    convention: 'intl',
    order: 'experience',
    hint: 'Slash kickers (/ SECTION) with period titles and numbered /01 items inspired by modern technical portfolios.',
    atsRating: 'verified',
    warning: '',
    Component: createEditorialIndexTemplate('intl'),
  },
  'editorial-index-eu': {
    id: 'editorial-index-eu',
    label: 'Editorial Index — European',
    convention: 'eu',
    order: 'experience',
    hint: 'Editorial slash headers and numbered items, with European photo and personal details block.',
    atsRating: 'verified',
    warning: '',
    Component: createEditorialIndexTemplate('eu'),
  },
  'tech-chips': {
    id: 'tech-chips',
    label: 'Tech Architect (Chips)',
    convention: 'intl',
    order: 'experience',
    hint: 'Skills and technologies highlighted as clean rounded badges/chips, ideal for developers and engineers.',
    atsRating: 'verified',
    warning: '',
    Component: createTechChipsTemplate('intl'),
  },
  'split-grid': {
    id: 'split-grid',
    label: 'Split Grid',
    convention: 'intl',
    order: 'experience',
    hint: 'Single-column story ending in a parallel split section for skills and languages/certifications.',
    atsRating: 'verified',
    warning: '',
    Component: createTechChipsTemplate('intl', true),
  },
  'timeline-accent': {
    id: 'timeline-accent',
    label: 'Timeline Accent',
    convention: 'intl',
    order: 'experience',
    hint: 'Vertical timeline accent connecting career stages chronologically with subtle connected nodes.',
    atsRating: 'verified',
    warning: '',
    Component: createTimelineMinimalTemplate('timeline', 'intl'),
  },
  'minimal-rule': {
    id: 'minimal-rule',
    label: 'Minimal Rule',
    convention: 'intl',
    order: 'experience',
    hint: 'Scandinavian refined minimalism with delicate divider lines and balanced whitespace.',
    atsRating: 'verified',
    warning: '',
    Component: createTimelineMinimalTemplate('minimal', 'intl'),
  },
  'compact-dense': {
    id: 'compact-dense',
    label: 'Compact Dense',
    convention: 'intl',
    order: 'experience',
    hint: 'High information density for long histories (10+ years), maximizing content per page without clutter.',
    atsRating: 'verified',
    warning: '',
    Component: createTimelineMinimalTemplate('compact', 'intl'),
  },
  'split-panel-profile': {
    id: 'split-panel-profile',
    label: 'Split Panel Profile',
    convention: 'intl',
    order: 'experience',
    hint: 'Featured top profile card for summary and key strengths, followed by linear career chronology.',
    atsRating: 'verified',
    warning: '',
    Component: createLeadMetricTemplate('intl', true),
  },
  'brutalist-studio': {
    id: 'brutalist-studio',
    label: 'Brutalist Studio',
    convention: 'intl',
    order: 'experience',
    hint: 'High contrast framing with boxed section badges and architectural lines for creative tech and design studios.',
    atsRating: 'verified',
    warning: '',
    Component: createProCreativeTemplate('brutalist', 'intl'),
  },
  'linear-modern': {
    id: 'linear-modern',
    label: 'Linear Modern',
    convention: 'intl',
    order: 'experience',
    hint: 'Inspired by Linear and modern dev tools: subtle wash accents, micro-badges and sleek tech stacks.',
    atsRating: 'verified',
    warning: '',
    Component: createProCreativeTemplate('linear', 'intl'),
  },
  'swiss-grid': {
    id: 'swiss-grid',
    label: 'Swiss Grid',
    convention: 'intl',
    order: 'experience',
    hint: 'International Typographic Style: structured geometric hierarchy, precise baseline rhythm and stark contrast.',
    atsRating: 'verified',
    warning: '',
    Component: createProCreativeTemplate('swiss', 'intl'),
  },
  'creative-director': {
    id: 'creative-director',
    label: 'Creative Director',
    convention: 'intl',
    order: 'experience',
    hint: 'Portfolio-forward layout with prominent project highlights and capability descriptors for design and product leads.',
    atsRating: 'verified',
    warning: '',
    Component: createProCreativeTemplate('creative', 'intl'),
  },
  'quantum-card': {
    id: 'quantum-card',
    label: 'Quantum Card',
    convention: 'intl',
    order: 'experience',
    hint: 'Modern SaaS card deck styling with delicate bordered containers for distinct role achievements.',
    atsRating: 'verified',
    warning: '',
    Component: createProCreativeTemplate('quantum', 'intl'),
  },
  'monolith-executive': {
    id: 'monolith-executive',
    label: 'Monolith Executive',
    convention: 'intl',
    order: 'experience',
    hint: 'Centered prestigious masthead with double hairline framing for C-suite and executive leadership.',
    atsRating: 'verified',
    warning: '',
    Component: createProMinimalTemplate('monolith', 'intl'),
  },
  'nordic-frost': {
    id: 'nordic-frost',
    label: 'Nordic Frost',
    convention: 'intl',
    order: 'experience',
    hint: 'Pure Scandinavian air with delicate dot markers, cool-wash accents and serene typography.',
    atsRating: 'verified',
    warning: '',
    Component: createProMinimalTemplate('nordic', 'intl'),
  },
  'command-line': {
    id: 'command-line',
    label: 'Command Line',
    convention: 'intl',
    order: 'experience',
    hint: 'Developer terminal aesthetic with prompt syntax markers, maintaining 100% clean plain-text ATS parseability.',
    atsRating: 'verified',
    warning: '',
    Component: createProMinimalTemplate('cli', 'intl'),
  },
  'metro-compact': {
    id: 'metro-compact',
    label: 'Metro Compact',
    convention: 'intl',
    order: 'experience',
    hint: 'Transit-inspired vertical color indicators per section with condensed high-efficiency readability.',
    atsRating: 'verified',
    warning: '',
    Component: createProMinimalTemplate('metro', 'intl'),
  },
  'monograph-serif': {
    id: 'monograph-serif',
    label: 'Monograph Serif',
    convention: 'intl',
    order: 'experience',
    hint: 'Academic monograph and literary journal aesthetic with section drop-rules for research and formal fields.',
    atsRating: 'verified',
    warning: '',
    Component: createProMinimalTemplate('monograph', 'intl'),
  },
}

export function getTemplate(id: TemplateId = DEFAULT_TEMPLATE_ID) {
  return templates[id]
}

export function isTemplateId(value: string): value is TemplateId {
  return (TEMPLATE_IDS as ReadonlyArray<string>).includes(value)
}
