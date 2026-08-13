/**
 * Generate `fixtures/input/scanned.pdf` — an image-only CV, the way a phone photo or a flatbed scan
 * arrives.
 *
 *   node scripts/make-scanned.mjs
 *
 * It must run inside the container, because it uses the same `poppler-utils` that the OCR adapter
 * uses (ADR-012 — system dependencies live in the image, never on a developer's machine):
 *
 *   docker run --rm -v "$PWD:/app" -w /app --entrypoint node hunterready:local \
 *     scripts/make-scanned.mjs
 *
 * `fixtures/input/README.md` has listed this file as owed for two rounds, with the note that the
 * "no text layer" path was "asserted as a negative test" — asserted in prose, that is, against no
 * file. Rasterizing a page we already have is honest: the pixels are genuinely all there is, so
 * every parser sees exactly what it would see from a scan.
 *
 * **The page is rendered by LibreOffice, not by our own renderer, and that is the whole ballgame.**
 * takumi-pdf positions every glyph individually, which is invisible in the text layer and ruinous once
 * rasterized: at 8pt the gap between `Re` and `g` in "Registered" measures 4.8pt against a 5.2pt
 * character width. No OCR engine can tell that from a space, and none should — so a scan built from our
 * own output reads back as "Re g iste red Nu rse" and makes a fixture that is *harder than reality* in
 * a way reality never is. The same LibreOffice page OCRs almost perfectly.
 *
 * A fixture must not fail for reasons no real document would fail for. That is the second time that
 * rule earned its keep here; the first was a two-column fixture with no bold text in it at all.
 *
 * Still deliberately imperfect: 200 dpi grayscale, the settings a cheap office scanner produces. Easy
 * enough to be fair, not so easy as to flatter.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
/** The Word fixture, laid out by LibreOffice — see the note above on why not one of our own PDFs. */
const SOURCE = join(ROOT, 'fixtures/input/sales-word.docx')
const OUT = join(ROOT, 'fixtures/input/scanned.pdf')

const DPI = 200

function run(command, args) {
  return capture(command, args).then(() => undefined)
}

/** Same, but returns stdout. */
function capture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'pipe' })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk.toString()))
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()))
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error(`${command} exited ${code}: ${stderr}`)),
    )
  })
}

/**
 * Wrap a JPEG in a minimal PDF page. Written by hand rather than with a library because the point is
 * that the file contains *no text objects at all* — a generated PDF that happened to keep a text layer
 * would make this fixture worthless, and hand-assembling it makes that impossible to get wrong.
 */
function imagePdf(jpeg, pixelWidth, pixelHeight, components) {
  const pointWidth = ((pixelWidth * 72) / DPI).toFixed(2)
  const pointHeight = ((pixelHeight * 72) / DPI).toFixed(2)

  /**
   * The colour space must match the JPEG's own component count, and guessing cost an hour.
   *
   * `pdftoppm -gray` writes visually grey pixels but still encodes **three** components, so a
   * hardcoded `/DeviceGray` made every reader treat one row of RGB triples as three rows of grey
   * pixels. The page rendered as its own text sheared and repeated across itself, and Tesseract
   * returned 85 words of noise — "PT", "ma", "HM", "|" — which reads exactly like an OCR quality
   * problem rather than a one-word bug in the fixture generator.
   */
  const colorSpace =
    components === 1
      ? '/DeviceGray'
      : components === 3
        ? '/DeviceRGB'
        : components === 4
          ? '/DeviceCMYK'
          : undefined
  if (colorSpace === undefined) {
    throw new Error(
      `cannot map a ${components}-component JPEG to a PDF colour space`,
    )
  }

  const header = '%PDF-1.4\n'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pointWidth} ${pointHeight}] ` +
      '/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>',
    {
      dict:
        `<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} ` +
        `/ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`,
      binary: jpeg,
    },
    null, // the content stream, filled in below
  ]

  const content = `q\n${pointWidth} 0 0 ${pointHeight} 0 0 cm\n/Im0 Do\nQ\n`
  objects[4] = {
    dict: `<< /Length ${Buffer.byteLength(content, 'latin1')} >>`,
    binary: Buffer.from(content, 'latin1'),
  }

  const chunks = [Buffer.from(header, 'latin1')]
  const offsets = []
  let position = chunks[0].length

  for (const [index, object] of objects.entries()) {
    offsets.push(position)
    const parts =
      typeof object === 'string'
        ? [Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, 'latin1')]
        : [
            Buffer.from(
              `${index + 1} 0 obj\n${object.dict}\nstream\n`,
              'latin1',
            ),
            object.binary,
            Buffer.from('\nendstream\nendobj\n', 'latin1'),
          ]
    for (const part of parts) {
      chunks.push(part)
      position += part.length
    }
  }

  let tail = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    tail += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  tail +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${position}\n%%EOF\n`

  chunks.push(Buffer.from(tail, 'latin1'))
  return Buffer.concat(chunks)
}

/**
 * Width, height and component count from the JPEG's SOF header — no image library needed to read
 * three numbers.
 *
 * The walk is strict rather than "scan for 0xFF": segments are followed by their declared length, fill
 * bytes are skipped, and standalone markers are recognised. A loose scan can match an 0xFF inside a
 * payload and then read dimensions out of arbitrary bytes.
 */
function jpegFrame(buffer) {
  if (buffer.readUInt16BE(0) !== 0xffd8) throw new Error('not a JPEG')

  let offset = 2
  while (offset < buffer.length - 1) {
    if (buffer[offset] !== 0xff) {
      throw new Error(`lost JPEG segment alignment at byte ${offset}`)
    }
    let marker = buffer[offset + 1]
    // Any number of 0xFF fill bytes may precede a marker.
    while (marker === 0xff) {
      offset++
      marker = buffer[offset + 1]
    }
    // Standalone markers: TEM, RSTn, EOI. No length field follows.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2
      continue
    }
    const length = buffer.readUInt16BE(offset + 2)
    // SOFn frame headers, excluding DHT (C4), JPG (C8) and DAC (CC) which share the range.
    const isFrameHeader =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    if (isFrameHeader) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
        components: buffer[offset + 9],
      }
    }
    offset += 2 + length
  }
  throw new Error('no SOF marker: not a JPEG we can measure')
}

const workDir = await mkdtemp(join(tmpdir(), 'hr-scan-'))
try {
  // Word → PDF through the same LibreOffice that converts a user's `.doc` upload.
  await run('soffice', [
    '--headless',
    '--norestore',
    `-env:UserInstallation=file://${join(workDir, 'profile')}`,
    '--convert-to',
    'pdf',
    '--outdir',
    workDir,
    SOURCE,
  ])
  const laidOut = join(workDir, 'sales-word.pdf')

  // Grayscale JPEG at scanner resolution: `pdftoppm` writes `page-1.jpg`.
  await run('pdftoppm', [
    '-jpeg',
    '-gray',
    '-r',
    String(DPI),
    '-f',
    '1',
    '-l',
    '1',
    laidOut,
    join(workDir, 'page'),
  ])

  const written = (await readdir(workDir)).filter((name) =>
    name.endsWith('.jpg'),
  )
  if (written.length === 0) throw new Error('pdftoppm produced no image')

  const jpeg = await readFile(join(workDir, written[0]))
  const { width, height, components } = jpegFrame(jpeg)
  const pdf = imagePdf(jpeg, width, height, components)

  /**
   * Prove the page is legible before writing it.
   *
   * The first version of this script produced a file that *looked* fine by every structural check —
   * valid PDF, no text operators, right dimensions — and rendered as its own content sheared across
   * itself, because the declared colour space did not match the JPEG's component count. Tesseract
   * returned pure noise, which is indistinguishable from "OCR is not good enough yet".
   *
   * A fixture for the OCR path has to be readable by construction, so the generator reads it back.
   */
  const verifyDir = join(workDir, 'verify')
  const candidate = join(workDir, 'candidate.pdf')
  await writeFile(candidate, pdf)
  await run('mkdir', ['-p', verifyDir])

  /**
   * There must be no text layer. Asserted with `pdftotext` rather than by scanning the bytes for `BT`
   * and `Tj`: 160 KB of compressed JPEG contains those two-letter sequences by chance, so the byte
   * scan rejected a perfectly good file. Asking a real extractor what it can read is both correct and
   * the same question the pipeline asks.
   */
  const leaked = await capture('pdftotext', [candidate, '-'])
  if (leaked.trim() !== '') {
    throw new Error(
      `refusing to write a "scanned" fixture with a text layer: pdftotext read ` +
        `${JSON.stringify(leaked.trim().slice(0, 80))}`,
    )
  }

  await run('pdftoppm', [
    '-png',
    '-r',
    '300',
    '-f',
    '1',
    '-l',
    '1',
    candidate,
    join(verifyDir, 'check'),
  ])
  const [rendered] = (await readdir(verifyDir)).filter((name) =>
    name.endsWith('.png'),
  )
  if (rendered === undefined)
    throw new Error('could not render the candidate back')

  const read = await capture('tesseract', [
    join(verifyDir, rendered),
    'stdout',
    '-l',
    'eng',
  ])
  /**
   * Words a reader must be able to see on this page. Not a spot check for its own sake: if these fail,
   * the file is a picture of nothing and every test built on it would be theatre.
   *
   * Matched with the whitespace removed, because Tesseract breaks words at glyph boundaries on a
   * rendered page — it reads this one as "To m Wh itfield" and "No rth g ate Su p p lies". That is real
   * OCR behaviour and reassembling it is the *pipeline's* job (`joinItems` decides spacing from the
   * gap between items). What this fixture has to guarantee is only that the glyphs are there.
   */
  const flatten = (text) => text.toLowerCase().replace(/\s+/g, '')
  const readFlat = flatten(read)
  const required = ['Whitfield', 'Northgate', 'EXPERIENCE', 'Manchester']
  const missing = required.filter((word) => !readFlat.includes(flatten(word)))
  // Set SCAN_DEBUG_DIR to keep the candidate and its render when this fails. Diagnosing an
  // unreadable page without being able to look at it is guesswork.
  const debugDir = process.env.SCAN_DEBUG_DIR
  if (debugDir !== undefined) {
    await writeFile(join(debugDir, 'candidate.pdf'), pdf)
    await writeFile(
      join(debugDir, 'candidate.png'),
      await readFile(join(verifyDir, rendered)),
    )
    await writeFile(join(debugDir, 'candidate-ocr.txt'), read, 'utf8')
  }

  if (missing.length > 0) {
    throw new Error(
      `refusing to write an unreadable "scan": OCR could not find ${missing.join(', ')}. ` +
        `It read ${read.trim().split(/\s+/).length} words.` +
        (debugDir === undefined
          ? ' Set SCAN_DEBUG_DIR to keep the render and the OCR output.'
          : ` Artifacts in ${debugDir}.`),
    )
  }

  await writeFile(OUT, pdf)

  console.log(
    `wrote fixtures/input/scanned.pdf\n` +
      `  ${width}×${height} px, ${components}-component JPEG at ${DPI} dpi\n` +
      `  ${(pdf.length / 1024).toFixed(1)} KB, no text layer\n` +
      `  verified readable: OCR recovered ${required.join(', ')} ` +
      `(${read.trim().split(/\s+/).length} words total)`,
  )
} finally {
  await rm(workDir, { recursive: true, force: true })
}
