/**
 * One name, both formats.
 *
 * These assertions exist because the two implementations disagreed in production. The `.docx` path
 * transliterated correctly; the PDF path stripped combining marks and stopped, so `Marta Sørensen`
 * downloaded as `Marta-Sorensen-CV.docx` and `Marta-S-rensen-CV.pdf` from two buttons a centimetre
 * apart. Nobody noticed because the filename travelled in a response header the codebase never read —
 * the browser took it straight off the wire.
 *
 * So the load-bearing test here is not any single name. It is the pairing: whatever the rule is, both
 * formats must agree on it.
 */
import { describe, expect, it } from 'vitest'
import { asciiName, documentFilename } from '../filename'

const both = (name: string) => [
  documentFilename(name, 'pdf'),
  documentFilename(name, 'docx'),
]

describe('the two formats never disagree', () => {
  it.each([
    'Marta Sørensen',
    'Björn Ægir Þórsson',
    'Łukasz Nowak',
    'Piña Muñoz',
    'José Álvarez',
    'Mette-Marie Aagaard',
  ])('agrees on the stem for %s', (name) => {
    const [pdf, docx] = both(name)
    expect(pdf.replace(/\.pdf$/, '')).toBe(docx.replace(/\.docx$/, ''))
  })
})

describe('letters NFD cannot decompose', () => {
  it('transliterates ø rather than dropping it', () => {
    // The original defect, in the filename of a document a Danish nurse sends to a Danish hospital.
    expect(documentFilename('Marta Sørensen', 'pdf')).toBe(
      'Marta-Sorensen-CV.pdf',
    )
  })

  it('handles the rest of the set', () => {
    expect(asciiName('Æblegård')).toBe('Aeblegard')
    expect(asciiName('Straße')).toBe('Strasse')
    expect(asciiName('Þór Ðagsson')).toBe('Thor-Dagsson')
    expect(asciiName('Łódź')).toBe('Lodz')
  })

  it('still handles the accents NFD does cover', () => {
    expect(asciiName('José Álvarez')).toBe('Jose-Alvarez')
  })
})

describe('a name that romanises to nothing', () => {
  it('is CV.pdf, not CV-CV.pdf', () => {
    /**
     * The PDF path substituted its fallback and *then* appended the suffix, so a CV whose name is
     * written in a script this cannot romanise downloaded as `CV-CV.pdf`. The `.docx` path did it right.
     */
    expect(documentFilename('', 'pdf')).toBe('CV.pdf')
    expect(documentFilename('你好', 'pdf')).toBe('CV.pdf')
    expect(documentFilename('', 'docx')).toBe('CV.docx')
  })
})

describe('the result is safe to put in a header and on a filesystem', () => {
  it('emits nothing but ASCII letters, digits and hyphens', () => {
    for (const name of ['Marta Sørensen', "Seán O'Brien", 'Ana  María  Ruiz']) {
      expect(asciiName(name)).toMatch(/^[A-Za-z0-9-]*$/)
    }
  })

  it('never leads or trails with a hyphen', () => {
    // A leading hyphen makes a file that command-line tools read as a flag.
    expect(asciiName('  Marta  ')).toBe('Marta')
    expect(asciiName('!!!José!!!')).toBe('Jose')
  })

  it('collapses a run of separators into one hyphen', () => {
    expect(asciiName('Ana  María   Ruiz')).toBe('Ana-Maria-Ruiz')
  })
})
