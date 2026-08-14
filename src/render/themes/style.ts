/**
 * The document style block — what makes one theme *look* like itself.
 *
 * ## Why this exists
 *
 * The first catalogue shipped thirty designs that differed in typeface, spacing and section order, and
 * Edd's verdict was correct: at arm's length they were the same grey document thirty times. Typeface and
 * leading are where a document's character lives *for a typographer*; a job seeker choosing between
 * designs sees color, bands, bars and rules or sees nothing.
 *
 * `PdfcnTheme` is vendored (never edit `src/components/pdf/` by hand), so the style block rides along as
 * an extra field on our own `DocTheme` type — structural typing lets a `DocTheme` pass anywhere a
 * `PdfcnTheme` is expected, and the vendored provider simply never reads the extra key.
 *
 * ## The hard boundary: decoration may never touch the text layer
 *
 * Every axis here is drawing, not typesetting. Color does not change what an extractor reads; a band, a
 * bar, a rule or a border is a shape with no glyphs in it. The one tool this file conspicuously does not
 * offer is `letterSpacing`, because the round-trip suite already caught it once positioning every glyph
 * individually — the extractor read "E x p e r i e n c e" and an ATS looking for the Experience section
 * would have found nothing (docs/05 rule 13). A style axis that could fail the round-trip is not a style
 * axis, it is a bug with a color picker.
 *
 * Every color named here must come from `ALLOWED_PRINT_COLORS` — the themes test walks the style block
 * exactly as it walks `colors`.
 */
import type { PdfcnTheme } from '@/components/pdf/theme-types'

/**
 * How the name block is set.
 *
 * - `plain`     — left-aligned, ink. The classic.
 * - `centered`  — name and contact centered. Reads as formal and traditional.
 * - `band`      — a full-width block of the accent color behind the whole masthead, text in `onAccent`.
 *                 The strongest single signal a design can send; one theme gets it.
 * - `sideline`  — a thick accent bar down the masthead's left edge.
 */
export type MastheadStyle = 'plain' | 'centered' | 'band' | 'sideline'

/**
 * How a section heading is drawn. The wording never changes — standard headings are an ATS rule
 * (docs/05) — but everything around the words is free.
 *
 * - `hairline`  — the original: heading, thin neutral line under it.
 * - `underline` — a heavier accent-colored line under the heading, full width.
 * - `shortline` — a short thick accent stroke under the heading text. Editorial.
 * - `bar`       — a thick accent bar to the left of the heading text.
 * - `band`      — the heading sits in a solid accent band, text in `onAccent`.
 * - `tint`      — the heading sits in a pale wash band, text in the accent.
 * - `flanked`   — centered heading with a hairline on each side. Classical.
 * - `framed`    — a 1px box around the heading. Reads as technical documentation.
 * - `plain`     — nothing but the words. Minimalism has to be available as a choice.
 */
export type HeadingStyle =
  | 'hairline'
  | 'underline'
  | 'shortline'
  | 'bar'
  | 'band'
  | 'tint'
  | 'flanked'
  | 'framed'
  | 'plain'

export interface DocumentStyle {
  /** The theme's own ink accent. From ALLOWED_PRINT_COLORS, and never a chrome color. */
  accent: string
  /** A pale wash of the accent, for `tint` bands and grounds. */
  accentWash: string
  /** Text color on top of a solid accent (bands). White for every dark accent. */
  onAccent: string
  masthead: MastheadStyle
  heading: HeadingStyle
  /** Whether the name is set in the accent or in ink. */
  nameInAccent: boolean
  /** Whether section headings are set in the accent or in ink (bands override with `onAccent`). */
  headingInAccent: boolean
  /** Whether bullet markers take the accent. The glyph itself never changes — parsers expect `•`. */
  bulletsInAccent: boolean
  /** Whether the role line ("Role — Company") is set in the accent. */
  roleInAccent: boolean
  /**
   * The masthead band's own color, when it differs from `accent`.
   *
   * Exists for the multi-color construction: carnival's page is a rose masthead over orange, brick
   * and forest section chips — four hues with jobs, not decoration. Ignored unless `masthead: 'band'`.
   */
  mastheadAccent?: string
  /**
   * A tinted page ground — the paper itself is a color, the way a stationer sells tinted stock.
   *
   * When set, `colors.background` must carry the same value (the on-screen preview paints its sheet
   * from `colors.background`), and the renderer switches to the bleed construction: zero side margins,
   * tinted header and footer bands filling the vertical margins, and the content box grown to a whole
   * number of pages so the tint reaches the bottom edge of the last page (ADR-025 records the probe).
   * Omitted for white paper, which stays the ordinary path through the renderer.
   */
  paper?: string
  /**
   * Per-section heading accents — the "colored chips" construction, one hue per section kind.
   *
   * The strongest multi-color statement available inside the ATS rules: the heading *words* never
   * change, only the paint behind them, so EXPERIENCE in white on an orange band extracts exactly as
   * EXPERIENCE. A missing kind falls back to `accent`.
   */
  sectionAccents?: {
    work?: string
    education?: string
    skills?: string
  }
  /**
   * Watermark-style page decoration: large pale geometry behind the content.
   *
   * Pure drawing — takumi renders no SVG images (the probe returned nothing), so a "marca de agua" here
   * is built from what it does render: absolutely positioned circles and rings in the accent at single-
   * digit opacity, painted before the text so everything readable sits on top. Nothing enters the text
   * layer, which is what separates this from the monogram watermarks Word produces.
   *
   *   - `disc`  — one large filled circle bleeding off the top-right corner.
   *   - `rings` — two concentric ring outlines, top-right.
   */
  watermark?: 'disc' | 'rings'
  /**
   * A third face for the candidate's name only.
   *
   * The one place a display or script face earns its risk: the name is short, set large, and scored by
   * the round-trip suite, so a face whose glyphs extracted badly would fail the build rather than ship.
   * The font loader registers it alongside body and heading.
   */
  nameFontFamily?: string
}

/** Which section a heading opens — the key into `sectionAccents`. */
export type SectionKind = 'work' | 'education' | 'skills' | 'other'

/** The accent a given section's heading should use under this style. */
export function sectionAccent(style: DocumentStyle, kind: SectionKind): string {
  if (kind === 'other') return style.accent
  return style.sectionAccents?.[kind] ?? style.accent
}

/** A theme that carries its style. Passes anywhere a `PdfcnTheme` is expected. */
export type DocTheme = PdfcnTheme & { style: DocumentStyle }

/**
 * The look of the original catalogue, used when a theme carries no style block — pdfcn's shipped themes,
 * or a stored render request from before styles existed. Monochrome hairlines: exactly what every theme
 * rendered before this file was written, so nothing old changes shape.
 */
export const FALLBACK_STYLE: DocumentStyle = {
  accent: '#0D0D0D',
  accentWash: '#F4F4F4',
  onAccent: '#FFFFFF',
  masthead: 'plain',
  heading: 'hairline',
  nameInAccent: false,
  headingInAccent: false,
  bulletsInAccent: false,
  roleInAccent: false,
}

export function styleOf(theme: PdfcnTheme): DocumentStyle {
  const candidate = (theme as Partial<DocTheme>).style
  return candidate ?? FALLBACK_STYLE
}
