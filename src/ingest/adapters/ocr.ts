/**
 * Scanned PDF → positioned text items, via Tesseract.
 *
 * A large share of our audience does not have a digital CV at all. They have a printed one, and a
 * phone. `docs/04-ingestion.md` listed the image-only PDF as a graceful *failure* — "upload the
 * original Word file" — which for someone whose only copy is on paper is the same sentence as "you
 * cannot use this product".
 *
 * Both dependencies live in the Docker image and nowhere else, per Edd's instruction and ADR-012:
 *   • `poppler-utils` — `pdftoppm` rasterizes each page
 *   • `tesseract-ocr` + eng/spa/dan language data — reads the pixels
 *
 * On a machine without them this returns `undefined` rather than throwing, and the caller falls back
 * to the original honest error. Nothing here is required for the app to run.
 *
 * Two things make this fit the rest of the pipeline instead of bypassing it:
 *
 *  1. **TSV, not plain text.** Tesseract's `tsv` output carries a bounding box per word, so OCR
 *     produces the same positioned `TextItem`s as a real text layer and inherits column detection,
 *     line clustering and heading inference unchanged. Taking its plain-text output would have meant
 *     a second, worse normalizer.
 *  2. **It says so, loudly.** OCR misreads characters — `Rigshospitalet` becomes `Rlgshospitalet`, a
 *     `5` becomes an `S`. The warning is not a formality: every field needs a human's eye, and
 *     PRODUCT.md's no-fabrication principle means we must never present a guess as a reading.
 *
 * Safety, as with the `.doc` converter: no shell, hard timeouts, a private temp directory, and
 * everything removed in a `finally` because the intermediate PNGs are pictures of someone's CV.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RawDocument, TextItem } from '../types'

/**
 * Overridable so the container can pin paths; both are on PATH in our image.
 *
 * Read per call rather than captured at module load, so a test can point them at a binary that does
 * not exist and verify the graceful path — which is the one every developer machine takes.
 */
const pdftoppmBin = () => process.env.PDFTOPPM_BIN ?? 'pdftoppm'
const tesseractBin = () => process.env.TESSERACT_BIN ?? 'tesseract'

/**
 * 300 dpi. Tesseract's accuracy falls off sharply below ~250 for body text at CV sizes, and above 400
 * the time cost doubles for no measurable gain.
 */
const DPI = 300

/** Rasterizing and reading are both slow; these are per-invocation ceilings, not per page. */
const RASTER_TIMEOUT_MS = 30_000
const OCR_TIMEOUT_MS = 45_000

/**
 * OCR is minutes, not milliseconds, on a long document. A CV is one or two pages; anything past this
 * is a different kind of document and the user is told rather than kept waiting.
 */
const MAX_OCR_PAGES = 4

/**
 * Below this Tesseract confidence a word is noise — scanner speckle read as punctuation. Dropping it
 * is better than passing it on: a stray `|` in a job title is worse than a missing one.
 */
const MIN_WORD_CONFIDENCE = 40

/** Languages we support (PRODUCT.md). Tesseract takes them as one `+`-joined argument. */
const LANGUAGES = 'eng+spa+dan'

interface RunResult {
  code: number | null
  stdout: string
  stderr: string
}

function run(
  command: string,
  args: Array<string>,
  timeoutMs: number,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'pipe' })
    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      settled = true
      child.kill('SIGKILL')
      reject(new Error(`${command} timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))

    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })

    child.on('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

/** True when both binaries are present, so callers can skip the whole path on a dev machine. */
export async function ocrAvailable(): Promise<boolean> {
  try {
    const [raster, ocr] = await Promise.all([
      run(pdftoppmBin(), ['-v'], 5_000),
      run(tesseractBin(), ['--version'], 5_000),
    ])
    // `pdftoppm -v` prints to stderr and exits non-zero on some builds; presence is what matters.
    return raster.code !== null && ocr.code === 0
  } catch {
    return false
  }
}

/**
 * Parse Tesseract's TSV into positioned items.
 *
 * Columns are fixed: level, page_num, block_num, par_num, line_num, word_num, left, top, width,
 * height, conf, text. Only word-level rows (level 5) carry text.
 */
function parseTsv(tsv: string, page: number): Array<TextItem> {
  const scale = 72 / DPI // pixels at DPI → PDF points

  interface Word {
    text: string
    left: number
    top: number
    width: number
    height: number
    line: string
  }

  const words: Array<Word> = []

  for (const row of tsv.split('\n')) {
    const columns = row.split('\t')
    if (columns.length < 12) continue
    if (columns[0] !== '5') continue

    const text = columns[11]
    if (text === undefined || text.trim() === '') continue

    const confidence = Number(columns[10])
    if (!Number.isFinite(confidence) || confidence < MIN_WORD_CONFIDENCE)
      continue

    const left = Number(columns[6])
    const top = Number(columns[7])
    const width = Number(columns[8])
    const height = Number(columns[9])
    if (![left, top, width, height].every(Number.isFinite)) continue

    words.push({
      text,
      left,
      top,
      width,
      height,
      // Tesseract's own layout analysis: block, paragraph, line. Better information than we could
      // re-derive, and it is free.
      line: `${columns[2]}-${columns[3]}-${columns[4]}`,
    })
  }

  /**
   * One baseline per Tesseract line, rather than each word's own box top.
   *
   * A word's `top` is the top of its ink, and for a dash that is the *middle* of the line — so an em
   * dash between two dates measured 20 px lower than the words around it, fell outside the line
   * clustering tolerance, and was emitted on its own line. `Jan 2024 — Present` arrived as
   * `Jan 2024 Present` with a stray `—` underneath, the date range stopped matching, and both jobs
   * lost their dates. Punctuation is exactly where this matters most and exactly where the per-word
   * top is least meaningful.
   *
   * The median resists it: a thin dash among five words does not move it.
   */
  const lineTop = new Map<string, number>()
  for (const key of new Set(words.map((word) => word.line))) {
    const tops = words
      .filter((word) => word.line === key)
      .map((word) => word.top)
      .sort((a, b) => a - b)
    lineTop.set(key, tops[Math.floor(tops.length / 2)])
  }

  return words.map((word) => ({
    text: word.text,
    page,
    x: word.left * scale,
    // Tesseract measures from the top of the image, which is already the convention the normalizer
    // wants — no flip, unlike the PDF path.
    y: (lineTop.get(word.line) ?? word.top) * scale,
    width: word.width * scale,
    height: word.height * scale,
    // A word's glyph box is roughly cap height; the em size is a little larger. The factor only has
    // to be consistent, since every heuristic downstream compares sizes to each other.
    fontSize: word.height * scale * 1.25,
    fontName: 'ocr',
    // OCR reports no weight at all. Claiming false is honest here: the normalizer's `emphasized`
    // signal falls back to relative font size, which survives scanning.
    bold: false,
  }))
}

/**
 * Read a scan or a photo. Returns `undefined` when the toolchain is absent, so the caller can report
 * the original "no text layer" message rather than an operator error the user cannot act on.
 *
 * `source` is `'pdf'` for a scanned PDF, which has to be rasterized first, or `'image'` for a file
 * Tesseract can already read — a phone photo needs no conversion at all.
 */
export async function extractByOcr(
  bytes: Uint8Array,
  pageCount: number,
  source: 'pdf' | 'image' = 'pdf',
): Promise<RawDocument | undefined> {
  if (!(await ocrAvailable())) return undefined

  const workDir = await mkdtemp(join(tmpdir(), 'hr-ocr-'))
  const pages = Math.min(pageCount, MAX_OCR_PAGES)

  try {
    let images: Array<string>

    if (source === 'image') {
      // Tesseract reads PNG and JPEG directly through leptonica. No page count, no rasterizing.
      const image = join(workDir, 'input.img')
      await writeFile(image, bytes)
      images = ['input.img']
    } else {
      const input = join(workDir, 'input.pdf')
      await writeFile(input, bytes)

      const raster = await run(
        pdftoppmBin(),
        [
          '-png',
          '-r',
          String(DPI),
          '-f',
          '1',
          '-l',
          String(pages),
          input,
          join(workDir, 'page'),
        ],
        RASTER_TIMEOUT_MS,
      )
      if (raster.code !== 0) return undefined

      images = (await readdir(workDir))
        .filter((name) => name.startsWith('page') && name.endsWith('.png'))
        .sort()
    }

    if (images.length === 0) return undefined

    const items: Array<TextItem> = []
    for (const [index, image] of images.entries()) {
      const result = await run(
        tesseractBin(),
        [join(workDir, image), 'stdout', '-l', LANGUAGES, 'tsv'],
        OCR_TIMEOUT_MS,
      )
      if (result.code !== 0) continue
      items.push(...parseTsv(result.stdout, index + 1))
    }

    const characters = items.reduce((sum, item) => sum + item.text.length, 0)
    // Same bar the PDF adapter uses for "there is nothing here". A scan we cannot read is still a
    // scan we cannot read, and saying so beats handing back forty characters of noise.
    if (characters < 200) return undefined

    const warnings = [
      source === 'image'
        ? 'We read your CV from the picture. Reading a photo makes mistakes with names, numbers and dates in particular — please check every field before you export.'
        : 'This looks like a scan, so we read the text from the image. Scanning makes mistakes with names, numbers and dates in particular — please check every field before you export.',
    ]
    if (source === 'pdf' && pageCount > MAX_OCR_PAGES) {
      warnings.push(
        `We read the first ${MAX_OCR_PAGES} pages. Anything after that is not included.`,
      )
    }

    return {
      format: source === 'image' ? 'image' : 'pdf',
      items,
      pageCount,
      warnings,
      unreadable: false,
      ocr: true,
    }
  } catch {
    // A timeout or a killed process is an expected outcome on untrusted input, not an exception.
    return undefined
  } finally {
    // Always. These PNGs are pictures of somebody's CV (docs/07-privacy.md).
    await rm(workDir, { recursive: true, force: true })
  }
}
