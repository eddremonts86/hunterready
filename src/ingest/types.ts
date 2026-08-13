/**
 * The shapes the ingestion pipeline passes between its stages.
 *
 *   file → detect → adapter → RawDocument → normalize → NormalizedText → extract → Resume
 *
 * Each stage is a pure function over serializable data, which is what makes them independently
 * testable and lets any one of them be replaced without touching the others.
 */
import type { SourceFormat } from './detect'

/** One run of text with its position on the page. Coordinates are top-left origin. */
export interface TextItem {
  text: string
  page: number
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  fontName: string
  bold: boolean
}

/**
 * What an adapter produces. PDFs give real geometry; docx and text give synthetic positions
 * (`x: 0`, incrementing `y`) so one normalizer handles every format.
 */
export interface RawDocument {
  format: SourceFormat
  items: Array<TextItem>
  pageCount: number
  /** User-facing, plain language. */
  warnings: Array<string>
  /** No usable text — the caller must stop and explain, not guess. */
  unreadable: boolean
  /**
   * Set by adapters that know their own structure (docx headings, markdown `#`). When present,
   * the normalizer trusts it instead of inferring headings from font size.
   */
  structuralHints?: Array<StructuralHint>
  /**
   * The text was read off an image, not out of a text layer.
   *
   * It propagates all the way to the review step because it changes what the user has to do: OCR
   * misreads characters that a text layer cannot get wrong, so every field needs checking rather
   * than the low-confidence ones. Anything derived from this document is a reading, not a fact.
   */
  ocr?: boolean
}

export interface StructuralHint {
  /** Index into `items`. */
  index: number
  kind: 'heading' | 'listItem' | 'tableCell'
  /** 1–6 for headings. */
  level?: number
}

/**
 * The single format the extraction prompt sees, whatever the input was: `## HEADING` markers,
 * `- ` bullets, and one line per line. Column order is already resolved.
 */
export interface NormalizedText {
  text: string
  /** Detected column count per page, for diagnostics and confidence. */
  columnsPerPage: Array<number>
  /** Lines in final reading order, for provenance lookups. */
  lines: Array<NormalizedLine>
  warnings: Array<string>
}

export interface NormalizedLine {
  /** 0-based index, matching the line's position in `text`. */
  index: number
  text: string
  page: number
  column: number
  isHeading: boolean
  isBullet: boolean
}
