/**
 * Positioned text items → one normalized text form, in reading order.
 *
 * This is the highest-leverage code in the ingestion pipeline (docs/04-ingestion.md). The
 * extraction model sees only what comes out of here, so a column detected correctly is worth
 * more than any amount of prompt tuning — and a column missed produces confidently wrong data
 * that looks plausible, which is the worst failure mode we have.
 *
 * **Order of operations matters and the obvious order is wrong.** Clustering lines by `y` first
 * and then looking for a column boundary cannot work: in a sidebar layout a sidebar item and a
 * body item share a baseline, so every clustered "line" straddles the channel and no split is
 * ever found. Columns must be separated on the *items*, before any line exists. Getting this
 * backwards produced output where a skill sat between a job title and its dates.
 *
 * So:
 *   1. split each page's items into columns, using a vertical channel no item crosses
 *   2. cluster each column's items into lines by baseline
 *   3. read column 0 fully, then column 1
 *   4. mark headings and bullets, and emit `## HEADING` / `- bullet`
 */
import { isKnownSectionHeading, matchSection } from './sections'
import type {
  NormalizedLine,
  NormalizedText,
  RawDocument,
  TextItem,
} from './types'

/** Two items belong to the same line when their baselines are within this × font size. */
const LINE_TOLERANCE = 0.5

/** A channel this wide (× body font size) with no item in it is a column boundary. */
const COLUMN_GAP_FACTOR = 2.5

/** A heading candidate must be at most this long. Prose is not a heading. */
const MAX_HEADING_CHARS = 48

const BULLET_PREFIX = /^\s*([•·▪◦‣∙*+—–-]|\d+[.)])\s+/

/**
 * A bullet as OCR reads one.
 *
 * Tesseract has no glyph for `•` in most fonts and substitutes whatever is closest: on one scanned
 * page the same bullet came back as `¢`, `«`, `»`, `"` and a bare `e` on different lines. Left
 * unrecognised, every achievement on a scanned CV stops being a bullet and is absorbed into the job
 * above it as prose.
 *
 * Applied **only** to documents that came from OCR. `"` and `«` open genuine quotations, and a line
 * beginning with one in a real text layer means what it says.
 */
const OCR_BULLET_PREFIX = /^\s*([¢«»"„”“∙]|\d+[.)])\s+/

/**
 * The single letters OCR substitutes for a bullet — `e`, `o`, `c`.
 *
 * Far too dangerous on its own: "o" opens a clause in Spanish, and any wrapped line can begin with a
 * letter. It is enabled only by repetition, which is the thing no natural document does — see
 * `AMBIGUOUS_BULLET_MIN` below.
 */
const OCR_BULLET_PREFIX_AMBIGUOUS = /^\s*([eoc])\s+(?=[A-ZÀ-Þ])/

/**
 * How many lines must open with the *same* stray letter before it is read as a misread bullet.
 *
 * Three. A document where three lines each begin with "e " followed by a capital has a bullet glyph
 * Tesseract could not name — no CV writes that by accident. Requiring the same letter each time is
 * what makes it safe: one Spanish clause opening with "o " never reaches the bar.
 *
 * The gate this replaces asked for two *unambiguous* bullets first, and was useless in practice: on
 * the scanned fixture every single `•` came back as `e`, so the count was zero and every achievement
 * on the page stayed prose.
 */
const AMBIGUOUS_BULLET_MIN = 3

/** An email, a URL, or a run of digits long enough to be a phone number. */
const CONTACT = /@|https?:\/\/|\d[\d\s().-]{6,}\d/

interface Line {
  items: Array<TextItem>
  page: number
  column: number
  y: number
  fontSize: number
  bold: boolean
  /**
   * Set in a different face from the document's body text.
   *
   * This exists because `bold` cannot be trusted. It is derived from the PDF's font *name*, and a
   * renderer that subsets its fonts emits opaque names — `g_d0_f1`, `g_d0_f3` — so every glyph in a
   * perfectly ordinary two-weight document reports `bold: false`. A designed CV's sidebar labels then
   * look identical to their own list items, and five of ten real skills are unrecoverable.
   *
   * Which face is *heavier* is unknowable without weight metadata. Which face is *different from the
   * body* is directly observable, and for finding headings that is the question that matters. It also
   * holds for a document that sets its body bold and its headings light.
   */
  emphasized: boolean
  x: number
  text: string
}

function median(values: Array<number>): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

/**
 * Undo letter-spacing **within one text item**: `"S T A F F"` → `"STAFF"`.
 *
 * Designed CVs track their headings and labels, and a tracked word reaches the text layer with the
 * spacing inside the item's own string. The key fact is that the *item boundary is the word
 * boundary*: pdf.js emits `"S T A F F"` and `"F R O N T E N D"` as two items 7.6pt apart. So
 * collapsing per item preserves word boundaries that a line-level collapse destroys.
 *
 * That is not hypothetical. A line-level version of this rule ("mostly tiny tokens → strip all
 * whitespace") turned a real CV's headline into `STAFFFRONTENDENGINEER&LÍDERTÉCNICO` and its
 * contact row into `MAILeddremonts86@gmail.comTEL(+45)61436173`. It fixed one spaced-out heading
 * by breaking every line that was already correct.
 */
function collapseTrackedItem(text: string): string {
  const trimmed = text.trim()
  // Two or more tokens, every one a single character: "S T A F F", "M A I L", and the two-letter
  // labels real CVs use for social links — "I N", "G H", "D E". Two is low enough to also catch a
  // person's spaced initials ("J R" → "JR"); that trade is worth it, because leaving "I N" in place
  // breaks the label of a link the recruiter is meant to click.
  if (/^(?:\S\s+)+\S$/.test(trimmed)) {
    const tokens = trimmed.split(/\s+/)
    if (tokens.every((token) => token.length === 1)) return tokens.join('')
  }
  return text
}

/**
 * Last-resort collapse at line level, kept deliberately narrow: only when stripping the spaces
 * turns the line into a heading we recognise. Surgical enough to have no effect on prose, and it
 * still catches a tracked heading whose glyphs arrived as several items with sub-threshold gaps.
 */
function collapseIfKnownHeading(text: string): string {
  if (!text.includes(' ')) return text
  const stripped = text.replace(/\s+/g, '')
  if (
    matchSection(text) === undefined &&
    matchSection(stripped) !== undefined
  ) {
    return stripped
  }
  return text
}

/**
 * PDF text layers split words arbitrarily. A space goes in only where the geometry says there was
 * one — joining blindly gives "SeniorNurse", spacing blindly gives "S e n i o r".
 *
 * The threshold comes from the item's own average character width rather than a fraction of the
 * font size. On a real CV at 7.6pt with heavy tracking those two numbers disagree by roughly 5×,
 * and a fixed fraction of font size then gets it wrong in both directions at once.
 */
function joinItems(items: Array<TextItem>): string {
  let out = ''
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const text = collapseTrackedItem(item.text)

    if (i > 0) {
      const previous = items[i - 1]
      const gap = item.x - (previous.x + previous.width)
      const charWidth = previous.width / Math.max(previous.text.length, 1)
      const threshold = Math.max(charWidth * 0.3, previous.fontSize * 0.08)
      if (gap > threshold && !/\s$/.test(out) && !/^\s/.test(text)) {
        out += ' '
      }
    }
    out += text
  }
  return collapseIfKnownHeading(out.replace(/\s+/g, ' ').trim())
}

/**
 * Step 1 — find a column boundary among a page's items.
 *
 * Probes candidate x positions and keeps the widest channel that **no item crosses** and that has
 * a real population on both sides. A single-column page has no such channel, and inventing one
 * there would scramble the document far worse than leaving two columns interleaved — so the bar
 * is deliberately high and `undefined` is the safe answer.
 */
function findColumnSplit(
  items: Array<TextItem>,
  bodyFontSize: number,
): number | undefined {
  if (items.length < 12) return undefined

  const spans = items.map((item) => ({
    start: item.x,
    end: item.x + item.width,
  }))

  const left = Math.min(...spans.map((s) => s.start))
  const right = Math.max(...spans.map((s) => s.end))
  const width = right - left
  if (width <= 0) return undefined

  const minChannel = bodyFontSize * COLUMN_GAP_FACTOR
  const steps = 80
  let best: { x: number; channel: number } | undefined

  for (let step = 1; step < steps; step++) {
    const probe = left + (width * step) / steps

    // A sidebar sits away from both edges; a boundary near the margin is noise.
    if (probe - left < width * 0.12) continue
    if (right - probe < width * 0.2) continue

    let leftCount = 0
    let rightCount = 0
    let nearestLeftEdge = left
    let nearestRightEdge = right
    let straddled = false

    for (const span of spans) {
      if (span.end <= probe) {
        leftCount++
        if (span.end > nearestLeftEdge) nearestLeftEdge = span.end
      } else if (span.start >= probe) {
        rightCount++
        if (span.start < nearestRightEdge) nearestRightEdge = span.start
      } else {
        straddled = true
        break
      }
    }

    if (straddled) continue
    // Both sides must look like real columns, not a stray page number.
    if (leftCount < 5 || rightCount < 8) continue

    const channel = nearestRightEdge - nearestLeftEdge
    if (channel < minChannel) continue

    if (best === undefined || channel > best.channel) {
      best = { x: probe, channel }
    }
  }

  return best?.x
}

/**
 * The face most of the document's characters are set in — its body text.
 *
 * Weighted by characters rather than items, because a PDF splits a paragraph into many small items
 * and a heading into few: counting items would let six tracked heading glyphs outvote a paragraph.
 */
function dominantFont(items: Array<TextItem>): string | undefined {
  const chars = new Map<string, number>()
  for (const item of items) {
    const name = item.fontName
    if (name === undefined) continue
    chars.set(name, (chars.get(name) ?? 0) + item.text.trim().length)
  }
  let best: { name: string; count: number } | undefined
  for (const [name, count] of chars) {
    if (best === undefined || count > best.count) best = { name, count }
  }
  return best?.name
}

/** Step 2 — group a single column's items into lines by baseline. */
function toLines(
  items: Array<TextItem>,
  page: number,
  column: number,
  bodyFont: string | undefined,
): Array<Line> {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: Array<Line> = []
  let current: Array<TextItem> = []

  const flush = () => {
    if (current.length === 0) return
    const ordered = [...current].sort((a, b) => a.x - b.x)
    const boldChars = ordered
      .filter((i) => i.bold)
      .reduce((n, i) => n + i.text.length, 0)
    const offFaceChars = ordered
      .filter((i) => i.fontName !== undefined && i.fontName !== bodyFont)
      .reduce((n, i) => n + i.text.length, 0)
    const allChars = ordered.reduce((n, i) => n + i.text.length, 0)

    lines.push({
      items: ordered,
      page,
      column,
      y: median(ordered.map((i) => i.y)),
      fontSize: median(ordered.map((i) => i.fontSize)),
      // Majority in each case, so one emphasized word inside a sentence cannot promote it.
      bold: boldChars > allChars / 2,
      emphasized:
        boldChars > allChars / 2 ||
        (bodyFont !== undefined && offFaceChars > allChars / 2),
      x: ordered[0].x,
      text: joinItems(ordered),
    })
    current = []
  }

  for (const item of sorted) {
    if (current.length === 0) {
      current.push(item)
      continue
    }
    const reference = current[current.length - 1]
    const tolerance =
      Math.max(reference.fontSize, item.fontSize) * LINE_TOLERANCE
    if (Math.abs(item.y - reference.y) <= tolerance) current.push(item)
    else {
      flush()
      current.push(item)
    }
  }
  flush()

  return lines.filter((line) => line.text !== '')
}

/**
 * Step 4 — is this line a section heading?
 *
 * The vocabulary is the primary signal (see `sections.ts` for why typography is not). Everything
 * below it is a conservative fallback for headings we do not know, because a false positive here
 * splits a job entry in half and a false negative merely leaves a section unlabelled — the model
 * recovers from the second and not from the first.
 */
function isHeading(
  line: Line,
  bodyFontSize: number,
  structural: boolean,
  inNameBlock: boolean,
  previous: Line | undefined,
  typographyVaries: boolean,
): boolean {
  const text = line.text.trim()
  if (text === '') return false

  // The candidate's name opens every CV, and it is the largest, boldest text on the page. Without
  // this it becomes the document's first "section" — and a wrapped name becomes three of them.
  if (inNameBlock) return false

  const caps = text === text.toUpperCase() && /[A-Z]/.test(text)
  const bigger = line.fontSize > bodyFontSize * 1.15

  /**
   * A word from the vocabulary is normally decisive — but not when the document *does* mark its
   * headings typographically and this line is set exactly like the line above it.
   *
   * In a sidebar, `Training` is one item in the LEADERSHIP list, at the same size and weight as
   * `Shift supervision` directly above it. Promoting it to a section cut that list in two and lost
   * five of ten real skills. Nothing typographic says "heading" here, so the layout has to.
   *
   * The `typographyVaries` guard is what keeps this safe for plain text, where every line is set
   * identically and the vocabulary is the only signal there is.
   */
  if (isKnownSectionHeading(text)) {
    if (structural || caps || line.emphasized || bigger) return true
    const setLikeTheLineAbove =
      typographyVaries &&
      previous !== undefined &&
      previous.page === line.page &&
      previous.column === line.column &&
      Math.abs(previous.fontSize - line.fontSize) < 0.2 &&
      previous.emphasized === line.emphasized
    return !setLikeTheLineAbove
  }
  if (structural) return true

  if (text.length > MAX_HEADING_CHARS) return false
  if (BULLET_PREFIX.test(text)) return false
  // Contact lines are short and look heading-ish. They are not headings.
  if (/@|https?:\/\//.test(text)) return false
  if (/[.,;]$/.test(text)) return false
  // A date range is never a heading, however it is styled.
  if (/\b(19|20)\d{2}\b/.test(text)) return false
  // "Role — Employer" is the most common line in a CV and must never become a section.
  if (/[—–|]/.test(text)) return false

  const short = text.split(/\s+/).length <= 3

  /**
   * A heading we do not know by name must be in caps, and must also be set apart.
   *
   * "Two of three axes" was enough while emphasis detection was broken. Once it started working, a
   * bold job title cleared the bar — `Warehouse Supervisor` is emphasized, larger than body, and
   * short, so every entry title in the experience section became its own section and the section
   * itself held nothing.
   *
   * Caps is the axis that actually separates the two: a designed CV labels its sidebar `LOGISTICS`
   * and titles its jobs `Warehouse Supervisor`. Requiring it costs us a title-case heading we do not
   * have in the vocabulary — that section's content merges upward, which the model recovers from.
   * Splitting the experience section into twelve fragments, it does not.
   */
  return caps && (line.emphasized || bigger) && short
}

export function normalize(document: RawDocument): NormalizedText {
  const warnings = [...document.warnings]

  if (document.items.length === 0) {
    return { text: '', columnsPerPage: [], lines: [], warnings }
  }

  // Body size from prose items only: headings would drag the median up and then nothing would
  // clear the "bigger than body" bar.
  const proseSizes = document.items
    .filter((i) => i.text.trim().length > 20)
    .map((i) => i.fontSize)
  const bodyFontSize =
    median(
      proseSizes.length > 0
        ? proseSizes
        : document.items.map((i) => i.fontSize),
    ) || 11

  /**
   * Not every Word heading is a *section* heading. CVs routinely use h2 for "Experience" and h3 for
   * each job title — so honouring every level turned twelve job titles into twelve sections, and the
   * entry grouper then found no entries at all inside them (44% accuracy on a real .docx).
   *
   * A structural heading counts as a section when it is a top-level heading, or when its text is a
   * section word we know. An h3 that says "Account Manager — Northgate Supplies" is an entry title.
   */
  const structuralHeadings = new Set(
    (document.structuralHints ?? [])
      .filter((hint) => {
        if (hint.kind !== 'heading') return false
        const item = document.items[hint.index]
        if (item === undefined) return false
        return (hint.level ?? 1) <= 2 || isKnownSectionHeading(item.text)
      })
      .map((hint) => document.items[hint.index]),
  )
  const structuralBullets = new Set(
    (document.structuralHints ?? [])
      .filter((h) => h.kind === 'listItem')
      .map((h) => document.items[h.index]),
  )

  // Document-wide, not per page: a heading face is the same face on page 3 as on page 1.
  const bodyFont = dominantFont(document.items)

  const pages = [...new Set(document.items.map((i) => i.page))].sort(
    (a, b) => a - b,
  )
  const columnsPerPage: Array<number> = []
  const ordered: Array<Line> = []

  for (const page of pages) {
    const pageItems = document.items.filter((i) => i.page === page)
    const split = findColumnSplit(pageItems, bodyFontSize)

    if (split === undefined) {
      columnsPerPage.push(1)
      ordered.push(...toLines(pageItems, page, 0, bodyFont))
      continue
    }

    columnsPerPage.push(2)
    const leftItems = pageItems.filter((i) => i.x + i.width <= split)
    const rightItems = pageItems.filter((i) => i.x >= split)

    // Left column entirely, then right — the way a person reads a sidebar layout.
    ordered.push(...toLines(leftItems, page, 0, bodyFont))
    ordered.push(...toLines(rightItems, page, 1, bodyFont))
  }

  if (columnsPerPage.some((count) => count > 1)) {
    warnings.push(
      'This CV has a side column. We read it as one block after the other — worth checking that nothing ended up under the wrong job.',
    )
  }

  /**
   * A second, structural pass for headings typography cannot find.
   *
   * A sidebar labels its own categories — "LOGISTICS", "SYSTEMS", "Kernekompetencer" — in caps at the
   * *same* size and weight as the list beneath them. Nothing typographic separates them, so ten real
   * skills were being read as loose lines and scored 0/10 by the accuracy suite.
   *
   * The signal that does work is structural: a short line in caps immediately followed by two or more
   * short, non-caps lines is a label over a list. Requiring the followers to be short is what keeps a
   * capitalised sentence in a summary from opening a section.
   */
  const structuralCapsHeading = new Set<number>()
  ordered.forEach((line, index) => {
    const text = line.text.trim()
    if (text === '' || text.length > 28) return
    if (text.split(/\s+/).length > 4) return
    if (text !== text.toUpperCase() || !/[A-ZÀ-Þ]/.test(text)) return
    if (/[.,;:]$/.test(text) || /\b(19|20)\d{2}\b/.test(text)) return

    let followers = 0
    for (let ahead = 1; ahead <= 3; ahead++) {
      const next = ordered[index + ahead]
      if (next === undefined) break
      const nextText = next.text.trim()
      if (nextText.length === 0 || nextText.length > 44) break
      if (nextText === nextText.toUpperCase() && /[A-ZÀ-Þ]/.test(nextText))
        break
      followers++
    }
    if (followers >= 2) structuralCapsHeading.add(index)
  })

  const normalizedLines: Array<NormalizedLine> = []
  const out: Array<string> = []

  /**
   * Does this document distinguish anything typographically at all?
   *
   * A `.txt` cannot: every line is the same size and nothing is bold, so the section vocabulary has
   * to be trusted outright. A designed PDF can, which is what makes "set exactly like the line above"
   * usable evidence that a vocabulary word is really a list item.
   */
  const typographyVaries =
    new Set(document.items.map((item) => item.fontSize)).size > 1 ||
    new Set(document.items.map((item) => item.fontName)).size > 1 ||
    document.items.some((item) => item.bold)

  /**
   * How many leading lines belong to the candidate's identity block.
   *
   * Guarding only line 0 was never enough: a sidebar wraps a long name across three lines, and once
   * emphasis detection started working each fragment was large and off-face, so `Delgado` and
   * `Fuentes` both became sections and the name shrank to `Rocío`.
   *
   * The block ends where a CV's identity block always ends — the first line carrying contact
   * details — and also stops at a known section word, so a CV that opens straight into EXPERIENCE
   * cannot have that heading swallowed. Capped, because a document with no contact details at all
   * must not lose its first section either.
   */
  const NAME_BLOCK_MAX = 4
  let nameBlockLines = 1
  for (let i = 1; i < Math.min(ordered.length, NAME_BLOCK_MAX); i++) {
    const text = ordered[i].text.trim()
    if (CONTACT.test(text)) break
    if (isKnownSectionHeading(text)) break
    if (text.split(/\s+/).length > 4) break
    nameBlockLines = i + 1
  }

  /**
   * Which bullet patterns this document has earned.
   *
   * OCR substitutes a different character for `•` on almost every line, so a scanned document needs a
   * wider set — and the widest patterns, the bare letters, are only safe once the document has proved
   * it is bulleted at all. Two unambiguous bullets is that proof.
   */
  const fromOcr = document.ocr === true

  /** Stray leading letters, counted per letter: repetition of one letter is the evidence. */
  const strayLeaders = new Map<string, number>()
  if (fromOcr) {
    for (const line of ordered) {
      const match = OCR_BULLET_PREFIX_AMBIGUOUS.exec(line.text)
      if (match === null) continue
      strayLeaders.set(match[1], (strayLeaders.get(match[1]) ?? 0) + 1)
    }
  }
  const repeatedStrayLeader = [...strayLeaders.values()].some(
    (count) => count >= AMBIGUOUS_BULLET_MIN,
  )

  const bulletPatterns = fromOcr
    ? repeatedStrayLeader
      ? [BULLET_PREFIX, OCR_BULLET_PREFIX, OCR_BULLET_PREFIX_AMBIGUOUS]
      : [BULLET_PREFIX, OCR_BULLET_PREFIX]
    : [BULLET_PREFIX]

  for (const [lineIndex, line] of ordered.entries()) {
    const structural =
      line.items.some((i) => structuralHeadings.has(i)) ||
      structuralCapsHeading.has(lineIndex)
    const heading = isHeading(
      line,
      bodyFontSize,
      structural,
      lineIndex < nameBlockLines,
      ordered[lineIndex - 1],
      typographyVaries,
    )
    const matchedBullet = bulletPatterns.find((pattern) =>
      pattern.test(line.text),
    )
    const bulletByPrefix = matchedBullet !== undefined
    const bullet =
      !heading &&
      (bulletByPrefix || line.items.some((i) => structuralBullets.has(i)))

    const text =
      matchedBullet !== undefined
        ? line.text.replace(matchedBullet, '').trim()
        : line.text.trim()

    normalizedLines.push({
      index: normalizedLines.length,
      text,
      page: line.page,
      column: line.column,
      isHeading: heading,
      isBullet: bullet,
    })

    // One stable shape for every input format, so a single prompt handles all of them.
    if (heading) out.push(`\n## ${text}`)
    else if (bullet) out.push(`- ${text}`)
    else out.push(text)
  }

  return {
    text: out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    columnsPerPage,
    lines: normalizedLines,
    warnings,
  }
}
