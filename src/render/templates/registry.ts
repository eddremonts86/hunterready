/**
 * Template registry.
 *
 * `atsRating` is surfaced in the UI on purpose. Being honest that a design-first layout may
 * not survive an older parser is a feature — every competitor labels everything
 * "ATS-friendly", which tells the user nothing.
 */
import { createModernTemplate } from './modern-base'
import type { Convention } from './modern-base'

export const TEMPLATE_IDS = ['modern-intl', 'modern-eu'] as const
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
}

export function getTemplate(id: TemplateId = DEFAULT_TEMPLATE_ID) {
  return templates[id]
}

export function isTemplateId(value: string): value is TemplateId {
  return (TEMPLATE_IDS as ReadonlyArray<string>).includes(value)
}
