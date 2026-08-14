/**
 * A face never reaches a third party.
 *
 * docs/07 puts a photo and a nationality closer to a special category of personal data than the rest of a
 * CV. `photo-field.tsx` keeps the bytes in the browser, which is the strong protection — but the resume
 * *object* carries the photo from that moment on, and every optimisation path takes a resume. So the
 * question this file answers is narrow and worth answering: can the photo get into anything we send to a
 * model?
 *
 * Today it cannot, and today that is an **accident of construction**: `resumeText` happens to enumerate
 * the fields it wants rather than serialising the object, so the photo is left out by omission. Nobody
 * decided that. A future edit adding `JSON.stringify(resume)` to a prompt would be a one-line change with
 * no test in its way, and the failure would be silent — a 30KB base64 blob inside a prompt, invisible in
 * a log that redacts CV content by design.
 *
 * These assertions turn the accident into a rule.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildGrounding } from '../fabrication'
import type { Resume } from '@/schema/resume'

/** Unmistakable in any haystack: if this string appears, the photo travelled. */
const PHOTO = 'data:image/jpeg;base64,SUSPICIOUSPHOTOBYTES0123456789'

const RESUME: Resume = {
  schemaVersion: '1.0',
  locale: 'en',
  basics: {
    fullName: 'Marta Sørensen',
    headline: 'Registered Nurse',
    photoUrl: PHOTO,
    links: [],
    personalDetails: [],
  },
  work: [
    {
      company: 'Rigshospitalet',
      role: 'Shift Lead Nurse',
      endDate: null,
      highlights: ['Led nursing handover for a 24-bed unit.'],
      tech: [],
    },
  ],
  education: [],
  skills: [],
  projects: [],
  certifications: [],
  languages: [],
  volunteer: [],
  publications: [],
  awards: [],
  custom: [],
} as unknown as Resume

describe('the grounding set, which is built from the CV and shapes every prompt', () => {
  it('does not contain the photo', () => {
    const grounding = buildGrounding(RESUME)
    const haystack = [
      ...grounding.words,
      ...grounding.numbers.keys(),
      ...[...grounding.numbers.values()].flatMap((units) => [...units]),
    ].join(' ')

    expect(haystack).not.toContain('SUSPICIOUSPHOTOBYTES')
    expect(haystack).not.toContain('data:image')
    // Proof the fixture is actually reaching the grounding — otherwise this passes vacuously.
    expect(haystack.toLowerCase()).toContain('rigshospitalet')
  })

  it('does not contain the base64 alphabet in bulk from anywhere else either', () => {
    // A blanket check: nothing in the grounding should be a long run of base64-ish characters.
    const grounding = buildGrounding(RESUME)
    for (const word of grounding.words) {
      expect(
        word.length,
        `suspiciously long token: ${word.slice(0, 30)}`,
      ).toBeLessThan(60)
    }
  })
})

describe('no prompt-facing source serialises the whole resume', () => {
  /**
   * A source-level assertion, and deliberately so.
   *
   * The runtime check above only covers the paths that exist now. This one covers the *shape* of the
   * mistake: `JSON.stringify(resume)` in a file that builds prompts. It is the cheapest possible guard
   * against a change nobody would think to test, and if a future author has a legitimate reason to
   * serialise a resume into a prompt, failing this test is exactly the conversation that should happen.
   */
  const files = [
    'src/optimize/rewrite.ts',
    'src/optimize/summary.ts',
    'src/optimize/cover-letter.ts',
    'src/optimize/advert.ts',
    'src/structure/local-refine.ts',
    'src/structure/extract.ts',
  ]

  it.each(files)(
    '%s never stringifies a whole resume or a data URL',
    (file) => {
      const source = readFileSync(join(process.cwd(), file), 'utf8')
      // Comments are stripped first: this file's own explanations must not trip the check in future.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')

      expect(code).not.toMatch(/JSON\.stringify\(\s*resume\s*\)/)
      expect(code).not.toMatch(/JSON\.stringify\(\s*input\.resume\s*\)/)
      expect(code).not.toMatch(/photoUrl/)
    },
  )
})
