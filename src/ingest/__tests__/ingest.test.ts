/**
 * Blocks 6–7 verifier: detection and normalization against the real fixture files.
 *
 * The assertions that matter are about *reading order*, not about "did it run". A normalizer
 * that returns text for a two-column CV but interleaves the columns passes every naive check and
 * then produces confidently wrong extractions — the worst failure mode this project has.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detect, MAX_BYTES } from '../detect'
import { ingest } from '../index'
import { normalize } from '../normalize'
import type { RawDocument } from '../types'

const INPUT_DIR = join(process.cwd(), 'fixtures/input')

async function load(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(join(INPUT_DIR, name)))
}

describe('detection reads the bytes, not the extension', () => {
  it('recognises a PDF', async () => {
    const result = detect(
      await load('clean-single-column.pdf'),
      'anything.docx',
    )
    expect(result.ok && result.format).toBe('pdf')
  })

  it('recognises plain text', async () => {
    const result = detect(await load('plain.txt'), 'plain.txt')
    expect(result.ok && result.format).toBe('txt')
  })

  it('treats a .md extension as markdown', () => {
    const bytes = new TextEncoder().encode('# Heading\n\nSome text here.\n')
    const result = detect(bytes, 'cv.md')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.format).toBe('md')
  })

  it('rejects an empty file with something actionable', () => {
    const result = detect(new Uint8Array(0))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('empty')
      expect(result.message.length).toBeGreaterThan(10)
    }
  })

  /**
   * A photo of a CV is accepted now, and it is worth being explicit about why the assertion flipped:
   * this used to reject a PNG with "there is no text in it for us to read". Once scanned PDFs started
   * going through OCR, that was no longer a limitation but an arbitrary line — we read the scan from
   * an office machine and refused the photo from a phone, which is the device most of our audience
   * has. See `src/ingest/adapters/ocr.ts`.
   */
  it('accepts a photo of a CV, whatever the extension claims', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const result = detect(png, 'scan.pdf')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.format).toBe('image')
  })

  it('accepts a JPEG too', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
    const result = detect(jpeg, 'IMG_2481.jpg')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.format).toBe('image')
  })

  it('still rejects a GIF, and offers a way forward', () => {
    const gif = new Uint8Array([...'GIF89a'].map((c) => c.charCodeAt(0)))
    const result = detect(gif, 'cv.gif')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('image_unsupported')
      expect(result.message).toMatch(/JPEG|PNG/i)
      expect(result.message).not.toContain(result.code)
    }
  })

  it('rejects RTF with a way forward', () => {
    const rtf = new TextEncoder().encode('{\\rtf1\\ansi hello}')
    const result = detect(rtf, 'cv.rtf')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/docx|PDF/i)
  })

  it('enforces the size limit and states it in MB', () => {
    const big = new Uint8Array(MAX_BYTES + 1)
    big.set([0x25, 0x50, 0x44, 0x46]) // a valid %PDF header, so only size can reject it
    const result = detect(big, 'huge.pdf')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('too_large')
      expect(result.message).toMatch(/10 MB/)
    }
  })

  it('never leaks a machine code into the user-facing message', () => {
    const result = detect(new Uint8Array([1, 2, 3, 0, 4]))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).not.toContain(result.code)
  })
})

describe('ingesting the fixtures', () => {
  it('reads the clean single-column PDF in order', async () => {
    const result = await ingest(await load('clean-single-column.pdf'), 'cv.pdf')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const { text } = result.normalized
    expect(text).toContain('Tom Whitfield')
    expect(text).toContain('Northgate Supplies')
    // Headings survive as markers, which is what the extraction prompt keys on.
    expect(text).toMatch(/## EXPERIENCE/i)
    expect(text).toMatch(/## EDUCATION/i)
    // Bullets survive as bullets.
    expect(text).toMatch(/^- Manage a book of 40/m)
    // Reading order: the current role precedes the earlier one.
    expect(text.indexOf('Account Manager')).toBeLessThan(
      text.indexOf('Sales Development Representative'),
    )
    expect(result.normalized.columnsPerPage).toEqual([1])
  })

  it('reads the senior nurse PDF, accents intact', async () => {
    const result = await ingest(await load('nurse-senior.pdf'), 'cv.pdf')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const { text } = result.normalized
    expect(text).toContain('Marta Sørensen')
    expect(text).toContain('Rigshospitalet')
    expect(text).toContain('Københavns Professionshøjskole')
    // Every employer present, in order.
    const first = text.indexOf('Rigshospitalet')
    const later = text.indexOf('Plejecenter Sølund')
    expect(first).toBeGreaterThan(-1)
    expect(later).toBeGreaterThan(first)
  })

  it('keeps the two-column CV unscrambled', async () => {
    const result = await ingest(await load('two-column-designed.pdf'), 'cv.pdf')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const { text } = result.normalized

    // The name genuinely wraps across three lines in this sidebar, so assert the parts. A
    // wrapped name is normal in designed CVs and the extraction step rejoins it.
    for (const part of ['Rocío', 'Delgado', 'Fuentes']) {
      expect(text).toContain(part)
    }
    expect(text).toContain('Grupo Logístico Ebro')

    // The real test: sidebar content must not land inside the experience section. If the
    // columns were interleaved, a skill would appear between a role and its dates.
    const roleAt = text.indexOf('Warehouse Supervisor')
    const datesAt = text.indexOf('Jun 2021')
    expect(roleAt).toBeGreaterThan(-1)
    expect(datesAt).toBeGreaterThan(roleAt)

    const between = text.slice(roleAt, datesAt)
    for (const sidebarOnly of ['IDIOMAS', 'Cycle counting', 'Load planning']) {
      expect(
        between,
        `sidebar text leaked between role and dates`,
      ).not.toContain(sidebarOnly)
    }
  })

  it('reads a structureless plain-text CV and finds its caps headings', async () => {
    const result = await ingest(await load('plain.txt'), 'cv.txt')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const { text } = result.normalized
    expect(text).toMatch(/## EXPERIENCE/i)
    expect(text).toMatch(/## SKILLS/i)
    expect(text).toContain('Northgate Supplies')
  })

  it('reads markdown headings and bullets', async () => {
    const md = new TextEncoder().encode(
      [
        '# Jane Cooper',
        'Warehouse Operative — jane@example.com',
        '',
        '## Experience',
        '',
        '- Picked and packed orders on a rotating shift for three years running.',
        '- Trained four new starters on the goods-in process and the scanners.',
        '',
        '## Education',
        '',
        'Vocational diploma in Logistics, 2019',
        '',
        '## Skills',
        '',
        'Forklift, RF scanners, stock counting, goods-in',
      ].join('\n'),
    )
    const result = await ingest(md, 'cv.md')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.normalized.text).toMatch(/## Experience/i)
    expect(result.normalized.text).toMatch(/^- Picked and packed/m)
  })

  it('refuses a file with almost no text instead of guessing', async () => {
    const result = await ingest(
      new TextEncoder().encode('CV\n\nJohn\n'),
      'cv.txt',
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('too_little_text')
  })
})

describe('the normalizer does not invent columns', () => {
  /** Synthetic single-column page: many lines, all starting at the same x. */
  function singleColumn(): RawDocument {
    return {
      format: 'txt',
      pageCount: 1,
      warnings: [],
      unreadable: false,
      items: Array.from({ length: 12 }, (_, i) => ({
        text: `This is body line number ${i} with enough text to count as prose.`,
        page: 1,
        x: 40,
        y: 40 + i * 14,
        width: 400,
        height: 11,
        fontSize: 11,
        fontName: 'regular',
        bold: false,
      })),
    }
  }

  it('reports one column for a single-column page', () => {
    expect(normalize(singleColumn()).columnsPerPage).toEqual([1])
  })

  it('splitting a single column would scramble it, so it must not happen', () => {
    const result = normalize(singleColumn())
    const lines = result.text.split('\n').filter((l) => l.trim() !== '')
    // Order preserved exactly: line 0 … line 11.
    lines.forEach((line, i) => {
      expect(line).toContain(`line number ${i}`)
    })
  })
})

describe('reading order comes from geometry, not from the order of the text layer', () => {
  /**
   * This is the property the whole two-column effort rests on, and it deserves to be asserted rather
   * than assumed.
   *
   * A real Canva or Word export emits its text layer in visual-row order, so a sidebar skill lands
   * between a job title and its dates. `fixtures/input/README.md` treated that as an untested risk for
   * two rounds. It is not a risk if the normalizer never reads item order at all — which it must not,
   * because file order is the one thing about a PDF that carries no meaning.
   *
   * Shuffling the items and requiring byte-identical output is the strongest available statement of
   * that. It is not the *only* thing a real export would test — a table-based sidebar can also overlap
   * its column spans, which shuffling cannot reproduce — so `two-column-interleaved.pdf` covers the
   * end-to-end path through a real file as well.
   */
  it('produces identical text however the items are ordered', async () => {
    const bytes = await load('two-column-interleaved.pdf')
    const { extractPdf } = await import('../adapters/pdf')
    const document = await extractPdf(bytes)

    const inOrder = normalize(document).text

    // A fixed shuffle, not a random one: a test that fails one run in twenty is not a test.
    const shuffled = [...document.items]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = (i * 7919) % (i + 1)
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    expect(shuffled.map((item) => item.text)).not.toEqual(
      document.items.map((item) => item.text),
    )

    expect(normalize({ ...document, items: shuffled }).text).toBe(inOrder)
  })
})
