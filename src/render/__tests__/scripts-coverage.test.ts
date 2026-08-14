/**
 * Latin, Greek and Cyrillic through the real render path.
 *
 * This exists because the first attempt at non-Latin coverage bundled fonts the renderer could not use
 * and I would not have known: adding fontsource's `cyrillic` subset copies twelve files and changes
 * nothing about the output (ADR-022). So the assertion is not "the files are present" — it is "a name in
 * this script survives being rendered and read back".
 *
 * The renderer throws `MissingGlyphs` rather than drawing tofu, which is what makes this test meaningful:
 * a regression fails loudly here instead of shipping a CV full of boxes.
 */
import { describe, expect, it } from 'vitest'
import { extractText, getDocumentProxy } from 'unpdf'
import { Resume } from '@/schema/resume'
import { renderResume } from '../render'
import { TEMPLATE_IDS } from '../templates/registry'

const named = (fullName: string, headline: string, bullet: string) =>
  Resume.parse({
    schemaVersion: '1.0',
    basics: {
      fullName,
      headline,
      email: 'candidate@example.org',
      links: [],
      personalDetails: [],
    },
    work: [
      {
        company: 'Herlev Hospital',
        role: headline,
        startDate: '2019-03',
        endDate: null,
        highlights: [bullet],
        tech: [],
      },
    ],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    languages: [],
    awards: [],
    publications: [],
    volunteer: [],
    custom: [],
  })

async function textOf(resume: Resume, templateId?: string): Promise<string> {
  const { bytes } = await renderResume(
    resume,
    templateId === undefined ? {} : { templateId: templateId as never },
  )
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  const { text } = await extractText(pdf, { mergePages: true })
  return text.replace(/\s+/g, ' ')
}

const CASES = [
  {
    script: 'Cyrillic',
    name: 'Мария Петрова',
    headline: 'Медицинска сестра',
    bullet: 'Ръководи предаването на смяната.',
  },
  {
    script: 'Greek',
    name: 'Μαρία Παπαδοπούλου',
    headline: 'Νοσηλεύτρια',
    bullet: 'Συντόνισε την παράδοση της βάρδιας.',
  },
  {
    script: 'Latin with Nordic and Spanish marks',
    name: 'Marta Sørensen',
    headline: 'Enfermera — Cuidados intensivos',
    bullet: 'Coordinó el relevo de turno en la unidad.',
  },
]

describe('a candidate’s name survives the render in every script we claim', () => {
  for (const testCase of CASES) {
    it(`renders ${testCase.script}`, async () => {
      const text = await textOf(
        named(testCase.name, testCase.headline, testCase.bullet),
      )
      expect(text).toContain(testCase.name)
      expect(text).toContain(testCase.headline)
      expect(text).toContain(testCase.bullet)
    }, 60000)
  }

  it('renders a CV that mixes scripts in one document', async () => {
    // A real case: a Bulgarian nurse applying in Denmark, whose employer is written in Latin.
    const text = await textOf(
      named(
        'Мария Петрова',
        'Nurse — Intensive Care',
        'Работи в Herlev Hospital.',
      ),
    )
    expect(text).toContain('Мария Петрова')
    expect(text).toContain('Herlev Hospital')
  }, 60000)

  it('renders Cyrillic in every template, not just the default', async () => {
    // The serif face is a different file, and a template that used only it would have failed alone.
    for (const templateId of TEMPLATE_IDS) {
      const text = await textOf(
        named('Мария Петрова', 'Медицинска сестра', 'Смяна.'),
        templateId,
      )
      expect(text, `template ${templateId}`).toContain('Мария Петрова')
    }
  }, 120000)
})
