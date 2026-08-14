/**
 * The ingestion entry point: bytes in, normalized text out.
 *
 *   detect → adapter → normalize
 *
 * Structuring is a separate step (`src/structure/`) because it costs money and network, while
 * everything here is deterministic, offline and fast. That split is what lets the accuracy suite
 * iterate on normalization without spending a token.
 */
import { detect, MAX_PAGES } from './detect'
import { extractDoc, DocConversionError } from './adapters/doc'
import { extractDocx } from './adapters/docx'
import { extractByOcr } from './adapters/ocr'
import { extractPdf } from './adapters/pdf'
import { extractText } from './adapters/text'
import { normalize } from './normalize'
import type { NormalizedText, RawDocument } from './types'

export type IngestResult =
  | {
      ok: true
      format: RawDocument['format']
      normalized: NormalizedText
      pageCount: number
      warnings: Array<string>
      /** The text was read off an image. Everything downstream must treat it as provisional. */
      ocr: boolean
    }
  | {
      ok: false
      code: string
      message: string
    }

export async function ingest(
  bytes: Uint8Array,
  filename = '',
  /**
   * Live narration (src/lib/progress.ts). Stage labels and counts only — this callback is the one
   * channel to the waiting user's screen, and it must never carry document content.
   */
  onProgress: (label: string, detail?: string) => void = () => {},
): Promise<IngestResult> {
  const detection = detect(bytes, filename)
  if (!detection.ok) {
    return { ok: false, code: detection.code, message: detection.message }
  }

  onProgress('Opening the file')

  let raw: RawDocument
  try {
    switch (detection.format) {
      case 'pdf':
        raw = await extractPdf(detection.bytes)
        break
      case 'docx':
        raw = await extractDocx(detection.bytes)
        break
      case 'doc':
        raw = await extractDoc(detection.bytes)
        break
      case 'txt':
      case 'md':
        raw = extractText(detection.bytes, detection.format)
        break
      case 'image': {
        // A photo of a CV. Nothing to parse, only pixels to read — so this is the one format with
        // no adapter of its own; OCR is the whole path.
        const read = await extractByOcr(detection.bytes, 1, 'image', onProgress)
        if (read === undefined) {
          return {
            ok: false,
            code: 'image_unreadable',
            message:
              'We could not read any text in that picture. A photo taken straight on, in good light, with the whole page in frame usually works — or upload the Word file or PDF if you have one.',
          }
        }
        raw = read
        break
      }
    }
  } catch (error) {
    if (error instanceof DocConversionError) {
      return {
        ok: false,
        code: 'doc_conversion_failed',
        message: error.userMessage,
      }
    }
    // A parser crash on untrusted input is an expected event, not an exception to the rules.
    return {
      ok: false,
      code: 'parse_failed',
      message:
        'We could not read that file. If it opens in Word or a PDF viewer, try saving it again and re-uploading.',
    }
  }

  if (raw.pageCount > MAX_PAGES) {
    return {
      ok: false,
      code: 'too_many_pages',
      message: `That document has ${raw.pageCount} pages and we handle up to ${MAX_PAGES}. If it is a publication list, upload just the CV part.`,
    }
  }

  /**
   * A PDF with no text layer is a scan. Before giving up, try reading the pixels.
   *
   * This used to be the end of the road, and for the person whose only copy of their CV is on paper,
   * "upload a PDF with selectable text" and "you cannot use this product" are the same sentence.
   *
   * OCR needs Tesseract and poppler, which live in the Docker image and deliberately not on a
   * developer's machine (ADR-012). `extractByOcr` returns `undefined` when they are absent or when the
   * scan is genuinely unreadable, and the original message stands — so this can only ever turn a
   * refusal into a result, never the other way round.
   */
  if (raw.unreadable && detection.format === 'pdf') {
    const scanned = await extractByOcr(
      detection.bytes,
      raw.pageCount,
      'pdf',
      onProgress,
    )
    if (scanned !== undefined) raw = scanned
  }

  if (raw.unreadable) {
    return {
      ok: false,
      code: 'no_text_layer',
      message:
        raw.warnings[0] ??
        'There is no readable text in that file. Upload the original Word file, or a PDF with selectable text.',
    }
  }

  const normalized = normalize(raw)

  if (normalized.text.trim().length < 120) {
    return {
      ok: false,
      code: 'too_little_text',
      message:
        'We only found a few words in that file. Please check you uploaded the right one.',
    }
  }

  return {
    ok: true,
    format: raw.format,
    normalized,
    pageCount: raw.pageCount,
    warnings: normalized.warnings,
    ocr: raw.ocr === true,
  }
}

export { detect, MAX_BYTES, MAX_PAGES, SUPPORTED_FORMATS } from './detect'
export type { SourceFormat } from './detect'
export type { NormalizedText, RawDocument } from './types'
