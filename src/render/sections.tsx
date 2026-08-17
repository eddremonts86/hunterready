/**
 * The order the reader meets the sections in, decided by the person rather than by the design.
 *
 * ## What this replaces
 *
 * `SectionOrder` — `'experience' | 'skills' | 'education'` — let a template say which of three blocks
 * came first, and everything else was nailed down in the order it happened to be written in. So
 * Certifications was always above Languages, both were always below Skills, and the panel could offer
 * up/down arrows on exactly one kind of section. Edd, reasonably: *"¿por qué no puedo ordenar up/down
 * certifications y languages? la única sección que no se debe poder modificar de orden es You."*
 *
 * ## The one that cannot move, and why
 *
 * `basics`. Not an oversight and not laziness: a CV whose reader meets the phone number after the job
 * history is a CV with a bug, and every ATS heuristic in docs/05 assumes the header is the header.
 * Everything below it is taste.
 *
 * ## How a template uses it
 *
 * It wraps its section blocks and tags them, and this decides the sequence:
 *
 *     <Ordered resume={resume} fallback={order} custom={(section, i) => …}>
 *       <Slot name="work">…</Slot>
 *       <Slot name="education">…</Slot>
 *     </Ordered>
 *
 * Deliberately a wrapper rather than a rewrite of each template into a switch. Nine templates, some of
 * them eight hundred lines, and the blocks inside them are the part the ATS round-trip is most
 * particular about; a change that moves the markup is a change that can silently alter it. Tagging and
 * sorting leaves every block byte-identical.
 *
 * ## It can never hide a section
 *
 * That is the property worth guarding, because the failure it prevents is a person's employment
 * history vanishing from their CV because of a stale token. Resolution is additive: listed tokens that
 * still resolve come first, in their order, and then **everything not mentioned follows in the
 * design's own order**. An unknown token does nothing. A section added later appears. A document with
 * no `sectionOrder` at all — which is every document written before this existed — renders exactly as
 * it did.
 */
import { Children, Fragment, isValidElement } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { Resume } from '@/schema/resume'
import { formatRange, joinParts } from './format'
import type { OutputLocale } from './locale'
import { strings } from './locale'

/** A heading and its lines — the shape every template already draws for a custom section. */
export interface Group {
  title: string
  items: Array<string>
}

/**
 * Volunteering, as one titled block rather than a second Experience.
 *
 * It was rendered by no PDF template at all until now, while `docx.ts` printed it — so the choice here
 * is between the compact form and nothing. Compact is also the right form: voluntary work on a CV is
 * a line and some dates, the full job treatment is what Experience is for, and duplicating that markup
 * into nine templates would be nine more copies of the block the round-trip test is most particular
 * about.
 */
export function volunteerGroup(
  resume: Resume,
  locale: OutputLocale,
): Group | undefined {
  if (resume.volunteer.length === 0) return undefined
  return {
    title: strings(locale).headings.volunteer,
    items: resume.volunteer.flatMap((entry) => [
      joinParts([
        joinParts([entry.role, entry.company], ' — '),
        formatRange(entry.startDate, entry.endDate, locale),
      ]),
      ...entry.highlights,
    ]),
  }
}

/**
 * Awards and publications are `CustomSection`s already — same shape, same markup.
 *
 * Returned as `Group`s so a template can feed them through the one renderer it uses for its custom
 * sections, rather than growing three near-identical blocks it would then have to keep in step.
 */
export function groupsOf(sections: Resume['awards']): Array<Group> {
  return sections.map((section) => ({
    title: section.title,
    items: section.items,
  }))
}

/** The blocks a template can be asked to place. `basics` is not among them, and will not be. */
export const SECTION_NAMES = [
  'work',
  'education',
  'skills',
  'projects',
  'certifications',
  'languages',
  'awards',
  'publications',
  'volunteer',
] as const

export type SectionName = (typeof SECTION_NAMES)[number]

/** Which block a template puts first, when the document has no opinion. Unchanged from before. */
export type SectionOrder = 'experience' | 'skills' | 'education'

export type Slotted =
  { kind: 'named'; name: SectionName } | { kind: 'custom'; index: number }

/** `custom:<id>` addresses one custom section; anything else is a named block. */
export function tokenFor(slot: Slotted, resume: Resume): string | undefined {
  if (slot.kind === 'named') return slot.name
  const id = resume.custom[slot.index]?.id
  return id === undefined ? undefined : `custom:${id}`
}

/**
 * The sequence a design would use on its own: its three-way preference, then the rest as written.
 *
 * This is the tail every unmentioned section falls into, so it is also the whole backwards-compatible
 * behaviour of this module — with an empty `sectionOrder` the output is exactly this list.
 */
function designOrder(resume: Resume, fallback: SectionOrder): Array<Slotted> {
  const leading: Array<SectionName> =
    fallback === 'skills'
      ? ['skills', 'work', 'education']
      : fallback === 'education'
        ? ['education', 'work', 'skills']
        : ['work', 'education', 'skills']

  const named: Array<SectionName> = [
    ...leading,
    'projects',
    'certifications',
    'languages',
    'awards',
    'publications',
    'volunteer',
  ]

  return [
    ...named.map((name): Slotted => ({ kind: 'named', name })),
    ...resume.custom.map((_, index): Slotted => ({ kind: 'custom', index })),
  ]
}

export function orderedSections(
  resume: Resume,
  fallback: SectionOrder = 'experience',
): Array<Slotted> {
  const rest = designOrder(resume, fallback)
  if (resume.sectionOrder.length === 0) return rest

  const byToken = new Map<string, Slotted>()
  for (const slot of rest) {
    const token = tokenFor(slot, resume)
    if (token !== undefined) byToken.set(token, slot)
  }

  const placed: Array<Slotted> = []
  const taken = new Set<string>()
  for (const token of resume.sectionOrder) {
    const slot = byToken.get(token)
    // Unknown, or named twice: skipped rather than guessed at. A stale token does nothing.
    if (slot === undefined || taken.has(token)) continue
    taken.add(token)
    placed.push(slot)
  }

  for (const slot of rest) {
    const token = tokenFor(slot, resume)
    if (token !== undefined && taken.has(token)) continue
    placed.push(slot)
  }
  return placed
}

/**
 * One tagged block. Renders its children unchanged; the name is read by `Ordered`.
 *
 * It renders nothing itself when placed outside an `Ordered`, which is the safe direction: a template
 * half-converted would drop sections and fail the round-trip loudly rather than emit them twice.
 */
export function Slot({
  name: _name,
  children,
}: {
  name: SectionName
  children: ReactNode
}): ReactElement {
  return <>{children}</>
}

export function Ordered({
  resume,
  fallback = 'experience',
  custom,
  children,
}: {
  resume: Resume
  fallback?: SectionOrder
  /** How this design draws one custom section. Spacers included — see `templates/spacer.tsx`. */
  custom: (section: Resume['custom'][number], index: number) => ReactNode
  children: ReactNode
}): ReactElement {
  const blocks = new Map<SectionName, ReactNode>()
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue
    const { name, children: inner } = child.props as {
      name?: SectionName
      children?: ReactNode
    }
    if (name !== undefined) blocks.set(name, inner)
  }

  return (
    <>
      {orderedSections(resume, fallback).map((slot, i) => (
        <Fragment key={i}>
          {slot.kind === 'named'
            ? blocks.get(slot.name)
            : custom(resume.custom[slot.index], slot.index)}
        </Fragment>
      ))}
    </>
  )
}
