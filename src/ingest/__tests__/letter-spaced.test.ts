/**
 * Tracked-out section headings — the defect that lost a whole section, silently.
 *
 * Designed CVs set headings with heavy letter-spacing, and a PDF text layer preserves it as real
 * spaces: `FORMACIÓN` arrives as `F O R M A C I Ó N`. That normalizes to nine "words", the four-word
 * guard threw it away, and every entry under the heading was lost — on exactly the kind of CV somebody
 * paid a designer for. It is what cost the private Spanish CV its education section.
 *
 * The pair of tests that decide the design are the last two: the collapse must find a tracked-out
 * heading, and must still refuse the prose sentence the guard exists to reject.
 */
import { describe, expect, it } from 'vitest'
import { matchSection, normalizeHeading } from '../sections'

describe('a heading tracked out letter by letter is still a heading', () => {
  it('finds it in each of the three languages', () => {
    expect(matchSection('F O R M A C I Ó N')).toBe('education')
    expect(matchSection('E D U C A T I O N')).toBe('education')
    expect(matchSection('U D D A N N E L S E')).toBe('education')
    expect(matchSection('E X P E R I E N C I A')).toBe('experience')
    expect(matchSection('I D I O M A S')).toBe('languages')
  })

  it('finds a multi-word heading whose spacing lost its word boundary', () => {
    // `normalizeHeading` collapses runs of whitespace, so `F O R M A C I Ó N  A C A D É M I C A`
    // cannot be told from one long word. The vocabulary is compared with its spaces removed.
    expect(matchSection('F O R M A C I Ó N   A C A D É M I C A')).toBe(
      'education',
    )
    expect(matchSection('W O R K   E X P E R I E N C E')).toBe('experience')
  })

  it('still matches the ordinary unspaced forms', () => {
    expect(matchSection('FORMACIÓN')).toBe('education')
    expect(matchSection('Formación académica')).toBe('education')
    expect(matchSection('Experience')).toBe('experience')
  })

  it('refuses a sentence, which is what the word guard is for', () => {
    /**
     * The assertion that makes the collapse safe. Prose cannot be all single characters, so widening
     * the matcher for tracked-out headings cannot turn a summary paragraph into a section break — the
     * failure the four-word guard was added to prevent.
     */
    expect(
      matchSection('I have 12 years of experience in intensive care'),
    ).toBeUndefined()
    expect(
      matchSection('Mi formación incluye varios cursos de logística'),
    ).toBeUndefined()
  })

  it('refuses a short run of letters that spells nothing', () => {
    expect(matchSection('A B C D')).toBeUndefined()
    // Fewer than four tokens goes down the ordinary path, where it also matches nothing.
    expect(matchSection('C V')).toBeUndefined()
  })

  it('normalizes a spaced heading to spaced letters, which is the whole cause', () => {
    // Kept as a test so the mechanism is documented by something that runs.
    expect(normalizeHeading('F O R M A C I Ó N')).toBe('f o r m a c i o n')
    expect(normalizeHeading('F O R M A C I Ó N').split(' ')).toHaveLength(9)
  })
})
