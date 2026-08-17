/**
 * A block the renderer draws and the panel cannot edit is not a feature.
 *
 * ## The failure this is here to stop, which had just happened again
 *
 * CLAUDE.md opens with it: *"Four features shipped as schema plus documentation and nothing else."*
 * The fifth was mine. Seven block kinds went into the schema, into `Block`, into the Add menu and into
 * eighty-five render tests — and three of them (`heading`, `text`, `keyValue`) had no editor. They fell
 * through to the generic section form, so "Label and value" added a block whose pairs **could not be
 * filled in at all**, and the render tests passed the whole time because they build the block in code.
 *
 * I reported it done. Edd found it in one click.
 *
 * The reachability check in CLAUDE.md is a grep somebody has to remember to run. This is the same
 * check, run by the suite, derived from the schema so a kind added tomorrow is covered without anyone
 * thinking about it.
 */
import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { BLOCK_KINDS } from '@/schema/resume'

const panel = await readFile('src/components/review-form.tsx', 'utf8')
const renderer = await readFile('src/render/templates/block.tsx', 'utf8')

/**
 * Where each kind is handled in the panel.
 *
 * `section` is the fall-through — it is what a block is when it says nothing — so it is matched on the
 * default branch rather than on a named test. Every other kind must be named, because falling through
 * is precisely the bug: the generic section editor renders happily for a kind it cannot edit.
 */
function editorFor(kind: string): boolean {
  if (kind === 'section') return panel.includes('const kind = kindOf(section)')
  return new RegExp(`kind === '${kind}'`).test(panel)
}

describe('every block kind can be drawn and edited', () => {
  it('has an editor in the Check panel for each one', () => {
    const missing = BLOCK_KINDS.filter((kind) => !editorFor(kind))
    expect(
      missing,
      `these render on the document and fall through to the section editor: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('has a renderer arm for each one', () => {
    const missing = BLOCK_KINDS.filter(
      (kind) =>
        kind !== 'section' && !new RegExp(`case '${kind}':`).test(renderer),
    )
    expect(
      missing,
      `these can be added and would draw as a plain section: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('offers each one in the Add menu, so it is reachable at all', () => {
    const missing = BLOCK_KINDS.filter(
      (kind) => !new RegExp(`key: '${kind}'`).test(panel),
    )
    expect(
      missing,
      `these exist in the schema and nobody can add one: ${missing.join(', ')}`,
    ).toEqual([])
  })

  /**
   * The keyValue case specifically, because it is the one that shipped broken.
   *
   * Its pairs live in a field of their own — `items` cannot carry them, since a colon inside somebody's
   * value would become a formatting instruction — so an editor that never mentions `pairs` is an
   * editor that cannot fill the block in, however good it looks.
   */
  it('can actually edit the field a keyValue block stores its content in', () => {
    expect(panel).toMatch(/onPairs|pairs=\{/)
    expect(panel).toContain('setCustomSection(i, { pairs })')
  })
})
