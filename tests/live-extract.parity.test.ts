/**
 * Live extraction against the configured provider (Block 8).
 *
 * Asserts `method === 'llm'` on purpose. The rules fallback exists so a provider outage never
 * costs the user their upload — but that makes it capable of hiding an outage from us, and the
 * first version of this test was fooled by exactly that: it passed while every call 401'd.
 * A test that cannot tell the difference between "the model worked" and "the model was down"
 * is not testing the model.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ingest } from '@/ingest'
import { extractResume } from '@/structure/extract'
import { resolveProvider } from '@/structure/provider'

const configured = resolveProvider() !== undefined

describe.skipIf(!configured)('live extraction', () => {
  it('extracts the two-column CV through the model', async () => {
    const bytes = new Uint8Array(
      await readFile(
        join(process.cwd(), 'fixtures/input/two-column-designed.pdf'),
      ),
    )
    const ing = await ingest(bytes, 'cv.pdf')
    expect(ing.ok).toBe(true)
    if (!ing.ok) return

    const result = await extractResume(ing.normalized.text)
    await writeFile('/tmp/hr-extract.json', JSON.stringify(result, null, 2))

    expect(result.ok).toBe(true)
    if (!result.ok) return

    // The whole point of this test.
    expect(
      result.method,
      'fell back to rules — the provider call failed, which this test exists to catch',
    ).toBe('llm')

    const { resume } = result
    expect(resume.basics.fullName).toContain('Delgado')
    expect(resume.work.length).toBeGreaterThanOrEqual(3)
    // Every employer named, and none of them invented.
    const companies = resume.work.map((w) => w.company).join(' | ')
    expect(companies).toContain('Ebro')
    expect(companies).toContain('Aragón')
    // Dates normalized by the heuristics pass, current role open-ended.
    expect(resume.work[0].endDate).toBeNull()
    expect(resume.work[0].startDate).toMatch(/^\d{4}(-\d{2})?$/)
    // Sidebar skills recovered despite the two-column layout.
    expect(resume.skills.flatMap((g) => g.items).length).toBeGreaterThanOrEqual(
      5,
    )
    // Provenance is real, not a stub.
    expect(result.provenance.length).toBeGreaterThan(3)
  }, 240_000)
})
