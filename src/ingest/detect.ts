/**
 * File type detection and input limits.
 *
 * **Never trust the extension.** A `.pdf` that is really a renamed `.docx` is common (people
 * rename files to satisfy an upload widget), and this code path parses untrusted input from
 * the open internet — the extension is an attacker-controlled string, the magic bytes are the
 * file.
 *
 * Every rejection carries a message a non-technical person can act on. "Unsupported file
 * type" tells a nurse nothing; "This looks like a scanned image — save it as a PDF with
 * selectable text, or upload the Word file" tells her what to do next.
 */

export const SUPPORTED_FORMATS = [
  'pdf',
  'docx',
  'doc',
  'txt',
  'md',
  'image',
] as const
export type SourceFormat = (typeof SUPPORTED_FORMATS)[number]

/** 10 MB. A CV above this is either image-heavy or not a CV. */
export const MAX_BYTES = 10 * 1024 * 1024

/** 20 pages. A 40-page academic CV is a different product (docs/04-ingestion.md). */
export const MAX_PAGES = 20

export interface DetectionOk {
  ok: true
  format: SourceFormat
  bytes: Uint8Array
}

export interface DetectionError {
  ok: false
  /** Machine-readable, for metrics. Never shown to the user. */
  code:
    | 'empty'
    | 'too_large'
    | 'rtf_unsupported'
    | 'legacy_office_unsupported'
    | 'archive_unsupported'
    | 'image_unsupported'
    | 'unknown_type'
  /** Shown to the user, in plain language, with a way forward. */
  message: string
}

export type Detection = DetectionOk | DetectionError

function startsWith(bytes: Uint8Array, signature: Array<number>): boolean {
  if (bytes.length < signature.length) return false
  return signature.every((byte, i) => bytes[i] === byte)
}

const asciiSignature = (text: string): Array<number> =>
  [...text].map((c) => c.charCodeAt(0))

const PDF = asciiSignature('%PDF')
const ZIP = [0x50, 0x4b, 0x03, 0x04] // also 0x0506 / 0x0708 for odd empty/spanned archives
const ZIP_EMPTY = [0x50, 0x4b, 0x05, 0x06]
const ZIP_SPANNED = [0x50, 0x4b, 0x07, 0x08]
const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] // legacy .doc/.xls/.ppt
const RTF = asciiSignature('{\\rtf')
const PNG = [0x89, 0x50, 0x4e, 0x47]
const JPEG = [0xff, 0xd8, 0xff]
const GIF = asciiSignature('GIF8')

/** A zip is only a .docx if it actually contains a Word document part. */
function looksLikeDocx(bytes: Uint8Array): boolean {
  // The central directory holds the entry names as plain bytes; searching the whole buffer for
  // "word/" is cheap and does not require unzipping to make a routing decision.
  const needle = 'word/'
  const haystack = new TextDecoder('latin1').decode(bytes)
  return haystack.includes(needle)
}

function isProbablyText(bytes: Uint8Array): boolean {
  // A text file has no NUL bytes and decodes as UTF-8. Sample the head: a 10 MB scan of a
  // rejected file is wasted work.
  const sample = bytes.subarray(0, 8192)
  if (sample.includes(0)) return false
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sample)
    return true
  } catch {
    return false
  }
}

export function detect(bytes: Uint8Array, filename = ''): Detection {
  if (bytes.length === 0) {
    return {
      ok: false,
      code: 'empty',
      message: 'That file is empty. Try uploading it again.',
    }
  }

  if (bytes.length > MAX_BYTES) {
    const mb = (bytes.length / 1024 / 1024).toFixed(1)
    return {
      ok: false,
      code: 'too_large',
      message: `That file is ${mb} MB and the limit is 10 MB. If it contains large images, exporting it again as a PDF usually shrinks it a lot.`,
    }
  }

  if (startsWith(bytes, PDF)) return { ok: true, format: 'pdf', bytes }

  if (
    startsWith(bytes, ZIP) ||
    startsWith(bytes, ZIP_EMPTY) ||
    startsWith(bytes, ZIP_SPANNED)
  ) {
    if (looksLikeDocx(bytes)) return { ok: true, format: 'docx', bytes }
    return {
      ok: false,
      code: 'archive_unsupported',
      message:
        'That looks like a zip archive rather than a document. Unzip it and upload the CV file inside.',
    }
  }

  if (startsWith(bytes, OLE2)) {
    // Could be .doc, .xls or .ppt. The extension is the only hint at this level, and here it
    // is a hint rather than a trust decision — a wrong guess only changes the message.
    const isSpreadsheetOrSlides = /\.(xls|ppt)$/i.test(filename)
    if (isSpreadsheetOrSlides) {
      return {
        ok: false,
        code: 'legacy_office_unsupported',
        message:
          'That looks like a spreadsheet or a presentation, not a CV. Upload a Word document or a PDF.',
      }
    }
    return { ok: true, format: 'doc', bytes }
  }

  if (startsWith(bytes, RTF)) {
    return {
      ok: false,
      code: 'rtf_unsupported',
      message:
        'We cannot read .rtf files yet. Open it in Word or Pages and save it as .docx or PDF.',
    }
  }

  /**
   * A photo of a CV is a CV.
   *
   * This used to be a rejection — "there is no text in it for us to read" — and once the scanned-PDF
   * path started going through OCR, that became an arbitrary distinction rather than a limitation: we
   * read a scan someone made on an office machine and refused the photo they took with their phone.
   * The phone is the one most of our audience actually has.
   *
   * GIF stays rejected. It is a screenshot format at best and an animation at worst, and no one
   * photographs a document into one.
   */
  if (startsWith(bytes, PNG) || startsWith(bytes, JPEG)) {
    return { ok: true, format: 'image', bytes }
  }

  if (startsWith(bytes, GIF)) {
    return {
      ok: false,
      code: 'image_unsupported',
      message:
        'We cannot read GIF files. If you have a photo of your CV, upload it as a JPEG or PNG — or upload the Word file or PDF if you have one.',
    }
  }

  if (isProbablyText(bytes)) {
    const format: SourceFormat = /\.md$/i.test(filename) ? 'md' : 'txt'
    return { ok: true, format, bytes }
  }

  return {
    ok: false,
    code: 'unknown_type',
    message:
      'We could not recognise that file. We can read PDF, Word (.doc and .docx), and plain text.',
  }
}
