/**
 * DOCX → text items with real structural hints.
 *
 * `mammoth` converts to semantic HTML rather than plain text, which matters: `<h1>`/`<h2>`,
 * `<ul>/<li>`, `<strong>` and `<table>` are exactly the signals we would otherwise have to
 * guess from font sizes. When the author used Word's heading styles, we get section boundaries
 * for free and the extraction gets measurably easier.
 *
 * Table layout is the case worth caring about: CVs built as a two-column Word table are common
 * in DE/DK/ES. Flattening row-wise (label, then value) keeps the pair together, which is what a
 * human reading the table does.
 */
import { convertToHtml } from 'mammoth'
import type { RawDocument, StructuralHint, TextItem } from '../types'

interface Node {
  tag: string
  text: string
  bold: boolean
  headingLevel?: number
  inList: boolean
  inTable: boolean
}

/**
 * A deliberately small HTML walker. `mammoth`'s output is a known, tiny subset (h1–h6, p, ul,
 * ol, li, strong, em, table, tr, td, br, a) — pulling in a DOM implementation to read it would
 * be more attack surface and more dependency for no gain.
 */
function walk(html: string): Array<Node> {
  const nodes: Array<Node> = []
  const stack: Array<string> = []
  let buffer = ''
  let bold = false

  const flush = () => {
    const text = decodeEntities(buffer).replace(/\s+/g, ' ').trim()
    buffer = ''
    if (text === '') return

    const heading = [...stack].reverse().find((t) => /^h[1-6]$/.test(t))
    nodes.push({
      tag: stack[stack.length - 1] ?? 'p',
      text,
      bold,
      headingLevel: heading === undefined ? undefined : Number(heading[1]),
      inList: stack.includes('li'),
      inTable: stack.includes('td') || stack.includes('th'),
    })
  }

  const tagPattern = /<(\/?)([a-z0-9]+)[^>]*>/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = tagPattern.exec(html)) !== null) {
    buffer += html.slice(lastIndex, match.index)
    lastIndex = tagPattern.lastIndex

    const closing = match[1] === '/'
    const tag = match[2].toLowerCase()

    if (tag === 'br') {
      flush()
      continue
    }

    if (tag === 'strong' || tag === 'b') {
      // A bold run inside a paragraph does not start a new line, but it does mark the line.
      if (!closing) bold = true
      continue
    }

    if (closing) {
      flush()
      const at = stack.lastIndexOf(tag)
      if (at !== -1) stack.splice(at, 1)
      if (stack.length === 0) bold = false
    } else {
      // Block-level tags end the previous line; inline ones do not.
      if (!/^(a|em|i|span|sup|sub)$/.test(tag)) flush()
      stack.push(tag)
    }
  }

  buffer += html.slice(lastIndex)
  flush()

  return nodes
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

export async function extractDocx(bytes: Uint8Array): Promise<RawDocument> {
  const { value: html, messages } = await convertToHtml({
    buffer: Buffer.from(bytes),
  })

  const nodes = walk(html)
  const items: Array<TextItem> = []
  const hints: Array<StructuralHint> = []
  const warnings: Array<string> = []

  // Synthetic geometry: docx has no coordinates, so we hand the normalizer a single column
  // with one line per node. It handles both shapes through the same code path.
  let y = 0
  for (const node of nodes) {
    const index = items.length
    const isHeading = node.headingLevel !== undefined

    items.push({
      text: node.text,
      page: 1,
      x: 0,
      y,
      width: node.text.length,
      height: 12,
      // Font size carries the heading level so the normalizer's size heuristic agrees with the
      // structural hint rather than fighting it.
      fontSize: isHeading ? 24 - (node.headingLevel ?? 1) * 2 : 11,
      fontName: node.bold || isHeading ? 'docx-bold' : 'docx-regular',
      bold: node.bold || isHeading,
    })
    y += 16

    if (isHeading) {
      hints.push({ index, kind: 'heading', level: node.headingLevel })
    } else if (node.inList) {
      hints.push({ index, kind: 'listItem' })
    } else if (node.inTable) {
      hints.push({ index, kind: 'tableCell' })
    }
  }

  if (hints.some((h) => h.kind === 'tableCell')) {
    warnings.push(
      'This CV is laid out as a table. We flattened it row by row — please check the Experience dates especially.',
    )
  }

  if (!hints.some((h) => h.kind === 'heading')) {
    warnings.push(
      'This document does not use Word heading styles, so we detected the sections from the text itself. Worth a closer look.',
    )
  }

  for (const message of messages) {
    // mammoth reports unsupported constructs; they are diagnostics, not user-facing.
    if (message.type === 'error') {
      warnings.push('Part of this document could not be read completely.')
      break
    }
  }

  return {
    format: 'docx',
    items,
    pageCount: 1, // docx has no fixed pagination until it is laid out
    warnings,
    unreadable: items.length === 0,
    structuralHints: hints,
  }
}
