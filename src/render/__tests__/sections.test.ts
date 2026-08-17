/**
 * The section resolver.
 *
 * The property worth guarding is not that the order comes out right — it is that **nothing can
 * disappear**. A stale token, a deleted section, an id that no longer exists: every one of those has
 * to cost the ordering and never the content. A person's employment history vanishing from their CV
 * because of a leftover string is the failure this file exists to make impossible.
 */
import { describe, expect, it } from 'vitest'
import { Resume } from '@/schema/resume'
import { orderedSections, SECTION_NAMES } from '../sections'
import type { Slotted } from '../sections'

function build(patch: Record<string, unknown> = {}) {
  return Resume.parse({
    schemaVersion: '1.0',
    basics: { fullName: 'A Person' },
    ...patch,
  })
}

const label = (slots: Array<Slotted>) =>
  slots.map((s) => (s.kind === 'named' ? s.name : `custom:${s.index}`))

describe('orderedSections', () => {
  it('gives the design its own order when the document has no opinion', () => {
    expect(label(orderedSections(build(), 'experience')).slice(0, 3)).toEqual([
      'work',
      'education',
      'skills',
    ])
    expect(label(orderedSections(build(), 'skills')).slice(0, 3)).toEqual([
      'skills',
      'work',
      'education',
    ])
    expect(label(orderedSections(build(), 'education')).slice(0, 3)).toEqual([
      'education',
      'work',
      'skills',
    ])
  })

  it('offers every section a design can place, and never basics', () => {
    const slots = label(orderedSections(build()))
    for (const name of SECTION_NAMES) expect(slots).toContain(name)
    expect(slots).not.toContain('basics')
  })

  it('puts a named section where the document asked for it', () => {
    const resume = build({ sectionOrder: ['languages', 'certifications'] })
    expect(label(orderedSections(resume)).slice(0, 2)).toEqual([
      'languages',
      'certifications',
    ])
  })

  it('addresses one custom section by its id, leaving its neighbours alone', () => {
    const resume = build({
      custom: [
        { id: 'a', title: 'Referencer', items: ['x'] },
        { id: 'b', title: 'Privat', items: ['y'] },
      ],
      sectionOrder: ['custom:b', 'work'],
    })
    expect(label(orderedSections(resume)).slice(0, 2)).toEqual([
      'custom:1',
      'work',
    ])
  })

  /* ── The guarantees that matter ────────────────────────────────────────────────────────────── */

  it('never drops a section, whatever the order says', () => {
    const complete = label(orderedSections(build()))
    for (const order of [
      [],
      ['languages'],
      ['custom:gone', 'nonsense', 'work'],
      ['skills', 'skills', 'skills'],
      [...complete].reverse(),
    ]) {
      const slots = label(orderedSections(build({ sectionOrder: order })))
      expect(
        new Set(slots),
        `lost a section with ${JSON.stringify(order)}`,
      ).toEqual(new Set(complete))
      expect(slots.length, 'emitted a section twice').toBe(complete.length)
    }
  })

  it('ignores a token naming a custom section that has been deleted', () => {
    const resume = build({
      custom: [{ id: 'kept', title: 'Kept', items: [] }],
      sectionOrder: ['custom:deleted', 'custom:kept'],
    })
    expect(label(orderedSections(resume))[0]).toBe('custom:0')
  })

  it('places a section the order never mentioned, in the design’s own order', () => {
    // The case that happens on every existing document the moment somebody moves one thing.
    const resume = build({ sectionOrder: ['languages'] })
    const slots = label(orderedSections(resume, 'experience'))
    expect(slots[0]).toBe('languages')
    expect(slots.slice(1, 4)).toEqual(['work', 'education', 'skills'])
  })

  it('leaves a document written before ordering existed exactly as it was', () => {
    const before = label(
      orderedSections(build({ custom: [{ title: 'R', items: [] }] })),
    )
    const after = label(
      orderedSections(
        build({ custom: [{ title: 'R', items: [] }], sectionOrder: [] }),
      ),
    )
    expect(after).toEqual(before)
  })

  it('cannot be addressed by a custom section with no id', () => {
    // Old documents have no ids. They fall to the tail, which is where they already were.
    const resume = build({
      custom: [{ title: 'Nameless', items: [] }],
      sectionOrder: ['custom:undefined'],
    })
    expect(label(orderedSections(resume)).at(-1)).toBe('custom:0')
  })
})
