/**
 * PDF → positioned text items.
 *
 * We do not take `unpdf`'s plain-text output. That output is the *text layer in file order*,
 * which for a two-column CV interleaves the columns — a job title from the sidebar lands
 * between a company and its dates, and the extraction model then confidently merges them.
 * Instead we keep each item's coordinates and font, and `src/ingest/normalize.ts` reconstructs
 * reading order from geometry.
 *
 * That preprocessing step is worth more than any amount of prompt tuning
 * (docs/04-ingestion.md).
 */
import { getDocumentProxy } from 'unpdf'
import type { RawDocument, TextItem } from '../types'

/** Below this many characters across the whole document, there is no usable text layer. */
const SCANNED_THRESHOLD = 200

interface PdfJsTextItem {
  str: string
  transform: Array<number>
  width: number
  height: number
  fontName: string
}

export async function extractPdf(bytes: Uint8Array): Promise<RawDocument> {
  // pdf.js mutates the buffer it is given; hand it a copy so callers can reuse theirs.
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  const items: Array<TextItem> = []
  const warnings: Array<string> = []

  const pageCount = pdf.numPages

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = (await page.getTextContent()) as {
      items: Array<PdfJsTextItem | { type: string }>
    }
    const viewport = page.getViewport({ scale: 1 }) as { height: number }

    for (const raw of content.items) {
      if (!('str' in raw)) continue // marked-content markers, not text
      const text = raw.str
      if (text.trim() === '') continue

      // transform is [a, b, c, d, e, f]; e/f are the translation and `a` scales x.
      const [scaleX, , , , x, yFromBottom] = raw.transform

      items.push({
        text,
        page: pageNumber,
        x,
        // PDF's origin is bottom-left. Flip it so "smaller y is higher on the page", which is
        // how every line-clustering heuristic downstream wants to think.
        y: viewport.height - yFromBottom,
        width: raw.width,
        height: raw.height,
        fontSize: Math.abs(scaleX) || raw.height,
        fontName: raw.fontName,
        // pdf.js exposes no weight; the name is the only signal and it is a good one in
        // practice ("...-Bold", "...-Semibold").
        bold: /bold|black|heavy|semib/i.test(raw.fontName),
      })
    }
  }

  const charCount = items.reduce((sum, item) => sum + item.text.length, 0)

  if (charCount < SCANNED_THRESHOLD) {
    warnings.push(
      'This PDF has no text layer — it is almost certainly a scan or a photo. Upload the original Word file, or export a PDF with selectable text.',
    )
  }

  return {
    format: 'pdf',
    items,
    pageCount,
    warnings,
    /** True when there is nothing to extract; the caller stops rather than guessing. */
    unreadable: charCount < SCANNED_THRESHOLD,
  }
}
