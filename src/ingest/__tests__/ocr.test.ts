/**
 * The scanned-PDF path, both halves of it.
 *
 * OCR needs Tesseract and poppler, which live in the Docker image and deliberately not on a
 * developer's machine (ADR-012). So this file has two jobs, and the second one matters more day to
 * day:
 *
 *  1. **With the toolchain** — text comes off the image and the result carries the OCR warning. Skipped
 *     when the binaries are absent, exactly like the `.doc` case: asserting an environment we chose not
 *     to have would be a test lying about the code.
 *  2. **Without it** — the request fails with the original, actionable message and nothing crashes.
 *     That is the path every local run and every CI run takes, so it is the one that must never rot.
 *     It is forced here by pointing the binaries at a name that cannot exist, which is why
 *     `src/ingest/adapters/ocr.ts` resolves them per call rather than at import.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ingest } from '../index'
import { ocrAvailable } from '../adapters/ocr'

const INPUT_DIR = join(process.cwd(), 'fixtures/input')

async function scanned(): Promise<Uint8Array> {
  return new Uint8Array(await readFile(join(INPUT_DIR, 'scanned.pdf')))
}

const HAS_OCR = await ocrAvailable()

describe('a scan with no OCR toolchain fails gracefully', () => {
  afterEach(() => {
    delete process.env.PDFTOPPM_BIN
    delete process.env.TESSERACT_BIN
  })

  it('returns the actionable message instead of throwing', async () => {
    process.env.PDFTOPPM_BIN = 'hunterready-no-such-binary'
    process.env.TESSERACT_BIN = 'hunterready-no-such-binary'

    const result = await ingest(await scanned(), 'scanned.pdf')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('no_text_layer')
      // The person is told what to do next, and never sees the machine code.
      expect(result.message).toMatch(/scan|text/i)
      expect(result.message).not.toContain(result.code)
    }
  })
})

describe.skipIf(!HAS_OCR)('a scan is read through OCR', () => {
  it('recovers the identity fields from an image-only PDF', async () => {
    const result = await ingest(await scanned(), 'scanned.pdf')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.ocr).toBe(true)

    // Whitespace-insensitive: Tesseract breaks words at glyph boundaries on a rendered page, and
    // reassembling them is `joinItems`' job. What must survive is the content.
    const flat = result.normalized.text.toLowerCase().replace(/\s+/g, '')
    expect(flat).toContain('whitfield')
    expect(flat).toContain('northgate')
    expect(flat).toContain('experience')
  })

  it('says the text came off an image, in plain language', async () => {
    const result = await ingest(await scanned(), 'scanned.pdf')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warning = result.warnings.find((text) => /scan/i.test(text))
    expect(warning).toBeDefined()
    // The instruction has to be "check everything", not "check the uncertain bits": OCR gets wrong
    // precisely the things a text layer cannot — a name's spelling, a digit in a date.
    expect(warning).toMatch(/check every field/i)
    expect(warning).not.toMatch(/tesseract|ocr|dpi|pixel/i)
  })
})
