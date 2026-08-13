/**
 * Template registry.
 *
 * `atsRating` is surfaced in the UI on purpose. Being honest that a design-first layout may
 * not survive an older parser is a feature — every competitor labels everything
 * "ATS-friendly", which tells the user nothing.
 */
import { createModernTemplate } from './modern-base'
import type { Convention } from './modern-base'
import { ShowcaseTemplate } from './showcase'

export const TEMPLATE_IDS = ['modern-intl', 'modern-eu', 'showcase'] as const
export type TemplateId = (typeof TEMPLATE_IDS)[number]

export const DEFAULT_TEMPLATE_ID: TemplateId = 'modern-intl'

export type AtsRating = 'verified' | 'design-first'

export interface TemplateMeta {
  id: TemplateId
  label: string
  convention: Convention
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
    hint: 'No photo, no personal details. Standard for the US, UK, Ireland and most international applications.',
    atsRating: 'verified',
    warning: '',
    Component: createModernTemplate('intl'),
  },
  'modern-eu': {
    id: 'modern-eu',
    label: 'Modern — European',
    convention: 'eu',
    hint: 'Includes personal details such as nationality or date of birth. Common in Denmark, Germany and Spain.',
    atsRating: 'verified',
    warning: '',
    Component: createModernTemplate('eu'),
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
  showcase: {
    id: 'showcase',
    label: 'Showcase',
    convention: 'intl',
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
