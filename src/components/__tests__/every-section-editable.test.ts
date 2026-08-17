/**
 * Nothing may be printed on the document that cannot be corrected on the screen.
 *
 * This is the honesty mechanism the whole product rests on, stated as a rule a test can check. It was
 * broken for a year and nobody saw it, because the way it broke is invisible from inside the code: the
 * Check panel wrote out four sections by hand, `Resume` grew to ten lists, and the six with no editor
 * simply did not appear. The person's own CV showed them CERTIFICERINGER in the PDF and no way to fix
 * the spelling.
 *
 * The failure mode is *absence*, so no test of the panel's behaviour could catch it — there was
 * nothing to assert about a section nobody had written. Only a comparison against the schema can, and
 * only if it derives both sides rather than restating them.
 */
import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { EXTRA_SECTIONS } from '../extra-sections'

const schemaSource = await readFile('src/schema/resume.ts', 'utf8')
const formSource = await readFile('src/components/review-form.tsx', 'utf8')

/**
 * The list-valued properties of `Resume`, read out of the file rather than out of a type.
 *
 * `z.infer` gives the keys at compile time and they vanish at runtime, and hand-listing them here
 * would recreate exactly the bug: a second list to forget to update. Scoped to the `Resume` object so
 * the arrays inside `WorkItem` and friends do not count as sections.
 */
function schemaLists(): Array<string> {
  const block = /export const Resume = z\.object\(\{([\s\S]*?)^\}\)/m.exec(
    schemaSource,
  )
  expect(block, 'could not find the Resume object in the schema').not.toBeNull()
  return [...(block?.[1] ?? '').matchAll(/^\s{2}(\w+): z\.array\(/gm)].map(
    (match) => match[1],
  )
}

describe('every list in the schema has somewhere to be edited', () => {
  it('leaves nothing on the page that the panel cannot reach', () => {
    const covered = new Set(EXTRA_SECTIONS.map((spec) => spec.key as string))
    const missing = schemaLists().filter((key) => {
      if (covered.has(key)) return false
      // The four written out by hand in the form, matched on the expression that reads them.
      return !formSource.includes(`resume.${key}.map(`)
    })
    expect(
      missing,
      `these render on the document and have no editor: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('finds the schema at all, so a rename cannot make this pass by accident', () => {
    const lists = schemaLists()
    expect(lists.length).toBeGreaterThanOrEqual(9)
    expect(lists).toContain('work')
    expect(lists).toContain('certifications')
  })

  /**
   * A spec whose `blank()` omits a required property writes an invalid item into the document, and the
   * next render fails on a person who pressed "Add a certification". Checked here rather than trusted,
   * because the failure lands one screen away from the mistake.
   */
  it('can add a new entry to each of them without breaking the schema', async () => {
    const { Resume } = await import('@/schema/resume')
    for (const spec of EXTRA_SECTIONS) {
      const candidate = Resume.safeParse({
        schemaVersion: '1.0',
        basics: { fullName: 'A Person' },
        [spec.key]: [spec.blank()],
      })
      expect(
        candidate.success,
        `a fresh ${spec.one} is not a valid ${spec.key}: ${candidate.error?.message}`,
      ).toBe(true)
    }
  })
})
