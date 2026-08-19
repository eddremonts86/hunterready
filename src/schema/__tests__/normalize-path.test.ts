/**
 * One provenance path format, and the bug that proved it was not one.
 *
 * The rule engine emits `work.0.company`. The model emits `work[0].company`, because it writes these
 * strings itself and reaches for the style it has seen everywhere. Both consumers assume the first:
 * `shiftProvenance` splits on `.` and reads the next segment as an index, and the review form filters
 * a row with `` `${list}.${at}.` ``.
 *
 * So every flag the model produced survived a row deletion still pointing at the old index — a mark
 * on a row the person had just typed, and nothing on the row that needed checking. `provenance.ts`
 * calls that worse than having no flags at all, and it was live for everyone, because ADR-030 puts
 * every visitor on the model path.
 *
 * Found by following `docs/api/README.md` as a stranger would.
 */
import { describe, expect, it } from 'vitest'

import { normalizePath, shiftProvenance } from '../provenance'

describe('normalizePath', () => {
  it.each([
    ['work[0].company', 'work.0.company'],
    ['work[12].highlights[3]', 'work.12.highlights.3'],
    ['skills[1]', 'skills.1'],
    ['education[0].institution', 'education.0.institution'],
  ])('%s → %s', (given, expected) => {
    expect(normalizePath(given)).toBe(expected)
  })

  it.each([
    'work.0.company',
    'basics.fullName',
    'basics.location.city',
    'skills',
  ])('leaves %s alone', (already) => {
    expect(normalizePath(already)).toBe(already)
  })
})

describe('the shift now reaches model-produced paths', () => {
  const entry = (path: string) => ({
    path,
    confidence: 1,
    inferred: false,
  })

  it('renumbers a bracketed path once it has been normalised', () => {
    const provenance = [
      entry(normalizePath('work[0].company')),
      entry(normalizePath('work[1].company')),
    ]
    // Row 0 removed: what was row 1 becomes row 0, and the flag has to follow it.
    const after = shiftProvenance(provenance, 'work', 0, -1)
    expect(after.map((p) => p.path)).toEqual(['work.0.company'])
  })

  it('would not have, before', () => {
    /*
      The regression, stated as the failure rather than as a diff. Un-normalised, the prefix check
      never matches, so the entry passes through untouched and keeps pointing at a row that has
      moved.
    */
    const raw = [entry('work[0].company'), entry('work[1].company')]
    const after = shiftProvenance(raw, 'work', 0, -1)
    expect(after.map((p) => p.path)).toEqual([
      'work[0].company',
      'work[1].company',
    ])
  })
})
