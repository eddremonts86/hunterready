/**
 * Print-side color tokens — the ink, not the room.
 *
 * DESIGN.md's hardest rule (The Amber Never Touches The Print Rule): Safelight Amber
 * (#FFB100) and Amber Shadow (#B36A00) belong to the app chrome and appear NOWHERE in a
 * document. A CV carrying our accent color carries our brand into someone else's job
 * application, which is not ours to place there.
 *
 * Hex only. The renderer rejects `oklch`, so these are a hand-maintained mirror of the
 * app tokens rather than a shared source (ADR-003).
 */

/** Ink. Body text, headings — the darkest value a document may use. */
export const PRINT_BLACK = '#0D0D0D'

/** Print highlight. Secondary text on light grounds, hairline rules. */
export const SILVER_GRAY = '#BDBDBD'

/**
 * Mid-tone. Rules, borders, dates and locations.
 *
 * Contrast note: 4.14:1 on Tray Enamel — fails WCAG AA for normal-size text. It is a
 * *print* token, where WCAG does not apply, but keep it off small body copy anyway:
 * a recruiter reading a printout has the same eyes.
 */
export const DEVELOPER_GRAY = '#6E6E6E'

/** The lit inspection surface. An off-white page ground, warmer than paper white. */
export const TRAY_ENAMEL = '#F3E6C4'

/** Plain white. The default document ground — most CVs get printed or PDF-viewed. */
export const PAPER_WHITE = '#FFFFFF'

/** A near-white wash for muted blocks. Neutral on purpose. */
export const PAPER_MUTED = '#F4F4F4'

/** Every color a document theme is allowed to use. Enforced by a test. */
export const ALLOWED_PRINT_COLORS = [
  PRINT_BLACK,
  SILVER_GRAY,
  DEVELOPER_GRAY,
  TRAY_ENAMEL,
  PAPER_WHITE,
  PAPER_MUTED,
] as const

/** Banned in documents. The room's colors. */
export const ROOM_COLORS = {
  safelightAmber: '#FFB100',
  amberShadow: '#B36A00',
  darkroomBrown: '#2A1B0B',
} as const

/**
 * `ColorTokens` requires destructive/success/warning/info/accent. A CV has no alerts, no
 * success states and no badges, so these are neutralized: if a pdfcn component ever
 * references one, it renders as ink rather than putting a colored chip in someone's CV.
 */
export const NEUTRALIZED_SEMANTICS = {
  accent: PRINT_BLACK,
  destructive: PRINT_BLACK,
  success: PRINT_BLACK,
  warning: PRINT_BLACK,
  info: PRINT_BLACK,
} as const

/**
 * Font families. These are *names* the renderer resolves against fonts registered at render
 * time — takumi has no built-in base-14, so an unregistered family draws nothing at all.
 * `src/render/fonts/` owns the actual bytes, bundled into the repo (never the host's fonts:
 * a render must be byte-identical on a Mac and in a Linux container).
 *
 * Both faces are open-licensed (OFL) and chosen to a different brief from the app chrome
 * (DESIGN.md): wide language coverage for EN/ES/DA, sector-neutral, and legible after the
 * renderer embeds a subset. Nothing here needs a point of view — the document is the
 * candidate's, not ours.
 */
/**
 * Quoted on purpose. These strings are consumed as CSS `font-family` values, and a family
 * name ending in a digit is not a valid unquoted CSS identifier — the renderer rejects
 * `Source Sans 3` outright ("expected a value of <family-name>"). `src/render/fonts` strips
 * the quotes before looking up the bytes.
 */
export const FONT_SANS = '"Source Sans 3"'
export const FONT_SERIF = '"Source Serif 4"'

/** The bare family name, for font registration and lookups. */
export function bareFamily(cssValue: string): string {
  return cssValue.replace(/^["']|["']$/g, '')
}
