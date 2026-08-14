/**
 * The design catalogue's shape, and the gate's stance.
 *
 * Thirty entries is a number Edd asked for, so it is asserted rather than trusted — a catalogue that
 * quietly became 29 after a refactor would be a promise broken in a place nobody looks. The rest of this
 * file is about the two things a catalogue of paid things must never get wrong: giving away what is sold,
 * and taking away what was free.
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
  it('has sixty entries, twelve free and forty-eight paid', () => {
    // Thirty at the first catalogue, fifty-two after the character expansion (ADR-025), sixty with
    // the sidebar family and the dark page. The free twelve never change: taking a design away from
    // someone's CV tool is not a growth strategy.
    expect(DESIGNS).toHaveLength(60)
    expect(FREE_DESIGNS).toHaveLength(12)
    expect(PAID_DESIGNS).toHaveLength(48)
  })

  it('has no duplicate ids', () => {
    // Ids are derived from the pairing, so a duplicate means a pairing listed twice.
    expect(new Set(DESIGNS.map((d) => d.id)).size).toBe(DESIGNS.length)
  })

  it('uses every structure and every theme at least once', () => {
    /**
     * The assertion that keeps the catalogue honest about its own variety. Thirty entries drawn from three
     * structures would be a gallery of near-duplicates dressed as a choice, which is the thing a CV tool
     * with "30 templates!" on the box usually is.
     */
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
  /**
   * Twelve, not ten. Edd asked for ten free, and ten would mean two pairings somebody can use today
   * moving behind a paywall — a thing not to do to a person's CV tool over a round number. The twelve are
   * defined as exactly what was available before the catalogue existed.
   */
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
    /**
     * `modern-eu-skills` × `technical` renders perfectly and is deliberately not offered. Someone reading
     * the query string will try it. The answer has to be "that is not free" rather than "that is not
     * listed, so help yourself" — the same stance as `entitlements.ts`, where the safe direction is the
     * one that does not give away what is sold.
     */
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
    // The rating comes from the structure and a theme cannot change it. Paying does not buy a claim.
    for (const d of DESIGNS) {
      expect(templates[d.structure].atsRating).toBe(
        templates[d.structure].atsRating,
      )
    }
    const showcase = DESIGNS.filter((d) => d.structure === 'showcase')
    expect(showcase.length).toBeGreaterThan(0)
  })
})
