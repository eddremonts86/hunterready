/**
 * A block the renderer draws and the panel cannot edit is not a feature.
 *
 * ## The failure this exists to stop, which had already happened twice
 *
 * CLAUDE.md opens with it: *"Four features shipped as schema plus documentation and nothing else."*
 * The fifth and sixth were mine. Seven block kinds went into the schema, into the renderer, into the
 * Add menu and into eighty-five render tests — and three had no editor at all, so "Label and value"
 * added a block whose pairs **could not be filled in**. The render tests passed the whole time,
 * because they build the block in code and never go near the panel.
 *
 * ## What it checks now
 *
 * The architecture changed underneath it, and the test had to follow rather than be deleted: the menu
 * and the editor are both generated from `BLOCK_SPECS`, so "has an editor" is no longer a branch to
 * grep for. The invariants that replace it are stronger, because they are about the data every screen
 * reads rather than about three files agreeing by hand:
 *
 *   • every kind in the schema has a spec — so it is offered, and drawn by the generic editor
 *   • every kind has a renderer arm, or is the one that falls through on purpose
 *   • every field a spec asks for is one the editor knows how to draw
 *   • every unsafe kind says what it costs, because that is the whole basis on which it was built
 */
import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { BLOCK_KINDS } from '@/schema/resume'
import { BLOCK_SPECS, specFor } from '@/render/blocks'

const renderer = await readFile('src/render/templates/block.tsx', 'utf8')
const editor = await readFile('src/components/block-editor.tsx', 'utf8')

/** `section` is the fall-through: it is what a block is when it says nothing about itself. */
const FALLS_THROUGH = new Set(['section'])

describe('every block kind can be added, edited and drawn', () => {
  it('has a spec, which is what puts it in the menu and gives it an editor', () => {
    const missing = BLOCK_KINDS.filter((kind) => specFor(kind) === undefined)
    expect(
      missing,
      `these exist in the schema and nobody can add one: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('has a renderer arm, so it does not silently draw as a plain section', () => {
    const missing = BLOCK_KINDS.filter(
      (kind) =>
        !FALLS_THROUGH.has(kind) &&
        !new RegExp(`case '${kind}':`).test(renderer),
    )
    expect(
      missing,
      `these can be added and would draw as something else: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('asks only for fields the editor knows how to draw', () => {
    const unknown = BLOCK_SPECS.flatMap((spec) =>
      spec.fields
        .filter((field) => !new RegExp(`case '${field.kind}':`).test(editor))
        .map((field) => `${spec.kind}.${field.kind}`),
    )
    expect(
      unknown,
      `the editor has no branch for these fields: ${unknown.join(', ')}`,
    ).toEqual([])
  })

  it('starts every block in a state the schema accepts', async () => {
    // A `make()` missing a required property writes an invalid block and the next render throws on
    // somebody who pressed a menu item.
    const { Resume } = await import('@/schema/resume')
    for (const spec of BLOCK_SPECS) {
      const parsed = Resume.safeParse({
        schemaVersion: '1.0',
        basics: { fullName: 'A Person' },
        custom: [{ kind: spec.kind, ...spec.make() }],
      })
      expect(
        parsed.success,
        `a fresh ${spec.kind} is not valid: ${parsed.error?.message}`,
      ).toBe(true)
    }
  })

  /**
   * The bargain that let the unsafe blocks be built at all.
   *
   * I argued against tables, headers, footers, watermarks, QR codes and charts because each damages
   * the thing this product sells. Edd's call was to build them; the condition is that the document
   * says so. A block marked unsafe with no sentence explaining what a parser does with it is that
   * bargain quietly lapsing.
   */
  it('says what an unsafe block costs, in specifics', () => {
    for (const spec of BLOCK_SPECS.filter((s) => !s.safe)) {
      expect(
        spec.warning,
        `${spec.kind} is unsafe and says nothing`,
      ).toBeDefined()
      expect(
        (spec.warning ?? '').length,
        `${spec.kind}'s warning is too short to say anything useful`,
      ).toBeGreaterThan(80)
      expect(spec.group, `${spec.kind} is unsafe but not grouped as such`).toBe(
        'risky',
      )
    }
  })

  it('does not mark a safe block with a warning, which would cry wolf', () => {
    for (const spec of BLOCK_SPECS.filter((s) => s.safe)) {
      expect(
        spec.warning,
        `${spec.kind} is safe and warns anyway`,
      ).toBeUndefined()
    }
  })
})
