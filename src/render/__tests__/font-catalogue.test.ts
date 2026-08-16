/**
 * Every offered family is proved to reach takumi, one render each.
 *
 * ADR-022 is the reason this exists and it is worth restating, because the failure is silent: a font
 * the renderer was never given usable bytes for draws **nothing at all**. Bundling a file is not the
 * same as the renderer being able to use it, and the first attempt at Cyrillic bundled twelve files
 * that changed nothing. A catalogue offered to readers without this check is a catalogue where some
 * unknown subset produces a blank CV.
 *
 * One render per family rather than per family × template: what is being tested is whether the glyphs
 * embed and extract, which is a property of the font and the renderer, not of the layout.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractText, getDocumentProxy } from 'unpdf'
import { Resume } from '@/schema/resume'
import { renderResume } from '../render'
import { REGISTERED_FAMILIES } from '../fonts'

const resume = Resume.parse(
  JSON.parse(
    await readFile(
      join(process.cwd(), 'fixtures/expected/nurse-senior.json'),
      'utf8',
    ),
  ),
)

describe.each(REGISTERED_FAMILIES)('%s', (family) => {
  it('renders a document whose text survives a parse-back', async () => {
    const { bytes } = await renderResume(resume, {
      fonts: { body: family, heading: family },
    })
    const pdf = await getDocumentProxy(new Uint8Array(bytes))
    const { text } = await extractText(pdf, { mergePages: true })
    // The name and an employer: enough that a blank or glyphless page cannot pass.
    expect(text).toContain('Marta')
    expect(text).toContain('Rigshospitalet')
  })
})
