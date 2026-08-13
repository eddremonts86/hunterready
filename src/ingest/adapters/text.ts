/**
 * Plain text and Markdown → text items.
 *
 * Markdown already carries the structure we spend effort inferring elsewhere: `#` is a heading,
 * `-`/`*` is a bullet. Plain text carries almost none, so we fall back to the two conventions
 * people actually use in a text CV — an ALL-CAPS line, or a short line followed by a blank one.
 */
import type { RawDocument, StructuralHint, TextItem } from '../types'

const MD_HEADING = /^(#{1,6})\s+(.*)$/
const MD_BULLET = /^\s*([-*+]|\d+[.)])\s+(.*)$/
const SETEXT_UNDERLINE = /^\s*(={3,}|-{3,})\s*$/

/** Short, all-caps, no sentence punctuation: the plain-text convention for a section heading. */
function looksLikeCapsHeading(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed.length === 0 || trimmed.length > 40) return false
  if (!/[A-Z]/.test(trimmed)) return false
  if (/[.:,;]$/.test(trimmed)) return false
  return trimmed === trimmed.toUpperCase()
}

export function extractText(
  bytes: Uint8Array,
  format: 'txt' | 'md',
): RawDocument {
  const raw = new TextDecoder('utf-8').decode(bytes)
  // Normalize newlines; a Windows-authored .txt is the common case.
  const lines = raw.replace(/\r\n?/g, '\n').split('\n')

  const items: Array<TextItem> = []
  const hints: Array<StructuralHint> = []

  let y = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (trimmed === '') {
      y += 8 // preserve the paragraph gap: it is a real signal
      continue
    }

    // A setext underline belongs to the line above, which we already emitted.
    if (SETEXT_UNDERLINE.test(line) && items.length > 0) {
      const previous = items.length - 1
      items[previous].bold = true
      items[previous].fontSize = 18
      if (!hints.some((h) => h.index === previous && h.kind === 'heading')) {
        hints.push({ index: previous, kind: 'heading', level: 2 })
      }
      continue
    }

    const heading = MD_HEADING.exec(trimmed)
    const bullet = MD_BULLET.exec(trimmed)

    let text = trimmed
    let isHeading = false
    let level = 2

    if (format === 'md' && heading !== null) {
      level = heading[1].length
      text = heading[2].trim()
      isHeading = true
    } else if (looksLikeCapsHeading(trimmed)) {
      isHeading = true
    }

    if (bullet !== null && !isHeading) {
      text = bullet[2].trim()
    }

    const index = items.length
    items.push({
      text,
      page: 1,
      x: 0,
      y,
      width: text.length,
      height: 12,
      fontSize: isHeading ? 24 - level * 2 : 11,
      fontName: isHeading ? 'text-bold' : 'text-regular',
      bold: isHeading,
    })
    y += 14

    if (isHeading) {
      hints.push({ index, kind: 'heading', level })
    } else if (bullet !== null) {
      hints.push({ index, kind: 'listItem' })
    }
  }

  const warnings: Array<string> = []
  if (items.length === 0) {
    warnings.push('That file has no text in it.')
  } else if (!hints.some((h) => h.kind === 'heading')) {
    warnings.push(
      'We could not find clear section headings in this file, so please check that Experience and Education came out right.',
    )
  }

  return {
    format,
    items,
    pageCount: 1,
    warnings,
    unreadable: items.length === 0,
    structuralHints: hints,
  }
}
