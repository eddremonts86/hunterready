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

/**
 * Seven structures, from two axes and one hand-built layout.
 *
 * The **convention** decides which blocks exist (photo and personal details, ADR-010). The **order**
 * decides which section a reader meets first, and it is the only other structural freedom the ATS ruleset
 * leaves — one column, standard headings, contact as text, one reading order (docs/05). There is no
 * sidebar variant and never will be: docs/05 rule 1 permits a decorative column to hold *redundant*
 * information only, which rules out the layout every competitor sells.
 *
 * Naming: the order suffix is omitted for `experience`, because that is the ordinary case and
 * `modern-intl-experience` would be noise on the commonest id in the product.
 */
export const TEMPLATE_IDS = [
  'modern-intl',
  'modern-intl-skills',
  'modern-intl-education',
  'modern-eu',
  'modern-eu-skills',
  'modern-eu-education',
  'showcase',
  'sidebar',
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
  /**
   * Skills before experience, and it exists for one person in particular.
   *
   * A career switcher's argument is what they can do; their most recent job title is the thing they are
   * trying to move away from. The default order puts that title first and buries the transferable skills
   * under it — the wrong order for exactly the candidate who needs the most help from a CV.
   */
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
  /**
   * Registered as `verified`, and that is a claim the round-trip suite checks on every build —
   * `TEMPLATE_IDS` is iterated there, so this cannot be added without being proven.
   *
   * It is design-first in look only. docs/05 rule 1 allows a decorative sidebar to hold *redundant*
   * information and nothing else, so the conventional showcase layout — skills and contact in a
   * column beside the content — is not available to us at any price. What this does instead is set
   * each section's name in a left gutter beside its content: visually distinct, one unbroken reading
   * order, nothing an extractor sees out of sequence.
   */
  /**
   * The two-column layout every competitor sells, rated honestly. It passes the round-trip suite —
   * reading order included, because the main column comes first in the document's text layer — but a
   * position-sorting parser reads a page line by line across its full width, and no construction can
   * save a two-column page from that. `design-first`, with the warning saying exactly that.
   */
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
}

export function getTemplate(id: TemplateId = DEFAULT_TEMPLATE_ID) {
  return templates[id]
}

export function isTemplateId(value: string): value is TemplateId {
  return (TEMPLATE_IDS as ReadonlyArray<string>).includes(value)
}
