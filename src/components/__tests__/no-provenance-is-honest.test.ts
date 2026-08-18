/**
 * When we know nothing about where a field came from, the screen has to say so.
 *
 * Measured on 2026-08-18 (`provenance-report.txt`): **DeepSeek returned zero provenance on all three
 * passes of the larger fixture.** Not "sometimes" — never, for that document. MiniMax ranged 34% to
 * 100% on the same code and the same inputs.
 *
 * The danger is not the absence itself, it is what the absence looks like. The review screen counts
 * flagged fields, and `flaggedPaths` is `provenance.filter(needsReview)`. With no provenance the
 * filter returns nothing, the counter reads zero, and a screen whose whole job is "here is what to
 * double-check" says there is nothing to double-check — about a document it could not trace a single
 * field of.
 *
 * `review-form.tsx` already handles this: `unsure = ocr || total === 0` swaps the count for `?` and
 * the label for "Check everything / we could not tell which fields". This test exists so that stays
 * true, because it is one boolean between an honest screen and a confident lie, and nothing was
 * holding it.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { needsReview } from '@/schema/provenance'

const SOURCE = readFileSync(
  join(process.cwd(), 'src/components/review-form.tsx'),
  'utf8',
)

describe('an empty provenance list is not the same as a clean document', () => {
  it('flags nothing when there is nothing to flag, which is the trap', () => {
    // The mechanism, stated plainly: no entries in, no flags out.
    expect([].filter(needsReview)).toHaveLength(0)
  })

  it('so the form switches to the unsure state on an empty list', () => {
    expect(SOURCE).toContain('const unsure = ocr || total === 0')
  })

  it('and shows a question mark rather than a zero', () => {
    // `0 to check` and `? Check everything` are opposite claims about the same document.
    expect(SOURCE).toContain("unsure ? '?' : flaggedCount")
  })

  it('and says why, rather than leaving the count unexplained', () => {
    expect(SOURCE).toContain("'we could not tell which fields'")
    expect(SOURCE).toContain("'Check everything'")
  })
})
