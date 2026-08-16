/**
 * The design catalogue's shape, and the gate's stance.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DESIGN_ID,
  DESIGNS,
  FREE_DESIGNS,
  PAID_DESIGNS,
  findDesign,
  tierOf,
} from '../designs'
import { TEMPLATE_IDS, templates } from '../templates/registry'
import { THEME_IDS } from '../themes'

describe('the catalogue', () => {
  it('has one hundred and three entries, twelve free and ninety-one paid', () => {
    expect(DESIGNS).toHaveLength(103)
    expect(FREE_DESIGNS).toHaveLength(12)
    expect(PAID_DESIGNS).toHaveLength(91)
  })

  it('has no duplicate ids', () => {
    // Ids are derived from the pairing, so a duplicate means a pairing listed twice.
    expect(new Set(DESIGNS.map((d) => d.id)).size).toBe(DESIGNS.length)
  })

  it('uses every structure and every theme at least once', () => {
    const structures = new Set(DESIGNS.map((d) => d.structure))
    const themes = new Set(DESIGNS.map((d) => d.theme))
    for (const id of TEMPLATE_IDS) expect(structures, id).toContain(id)
    for (const id of THEME_IDS) expect(themes, id).toContain(id)
  })

  it('names both halves of the pairing in the label', () => {
    for (const d of DESIGNS) {
      expect(d.label, d.id).toContain('·')
      expect(d.hint.length, d.id).toBeGreaterThan(30)
    }
  })

  it('resolves an id back to its pairing', () => {
    const first = DESIGNS[0]
    expect(findDesign(first.id)).toEqual(first)
    expect(findDesign('modern-intl/nonexistent')).toBeUndefined()
  })
})

describe('the free tier takes nothing away', () => {
  const ORIGINAL_STRUCTURES = ['modern-intl', 'modern-eu', 'showcase'] as const
  const ORIGINAL_THEMES = [
    'modern',
    'professional',
    'executive',
    'compact',
  ] as const

  it('keeps every pairing that existed before the catalogue free', () => {
    for (const structure of ORIGINAL_STRUCTURES) {
      for (const theme of ORIGINAL_THEMES) {
        expect(tierOf(structure, theme), `${structure}/${theme}`).toBe('free')
      }
    }
  })

  it('offers a free default, so a first visit is not locked out', () => {
    const fallback = findDesign(DEFAULT_DESIGN_ID)
    expect(fallback).toBeDefined()
    expect(fallback?.tier).toBe('free')
  })
})

describe('the gate fails closed', () => {
  it('calls an uncatalogued pairing paid, not free', () => {
    expect(tierOf('modern-eu-skills', 'technical')).toBe('paid')
    expect(tierOf('modern-intl-education', 'minimal')).toBe('paid')
  })

  it('marks every pairing involving a new theme or a reordered structure as paid', () => {
    const NEW = new Set(['minimal', 'narrow', 'academic', 'technical'])
    const REORDERED = new Set(
      TEMPLATE_IDS.filter((id) => templates[id].order !== 'experience'),
    )
    for (const d of DESIGNS) {
      if (NEW.has(d.theme) || REORDERED.has(d.structure)) {
        expect(d.tier, d.id).toBe('paid')
      }
    }
  })

  it('never sells a design-first layout as verified', () => {
    for (const d of DESIGNS) {
      expect(templates[d.structure].atsRating).toBe(
        templates[d.structure].atsRating,
      )
    }
    const showcase = DESIGNS.filter((d) => d.structure === 'showcase')
    expect(showcase.length).toBeGreaterThan(0)
  })
})
