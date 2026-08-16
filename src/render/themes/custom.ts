/**
 * Colour a reader chose, and the rule that decides whether they may.
 *
 * ## Why free colour does not cost the guarantee
 *
 * "Parse verified" is backed by `ats-roundtrip.test.ts`, which iterates templates against fixtures
 * and never varies the theme. That is not an oversight: parsing turns glyphs back into text, and text
 * extraction cannot see colour. So a chosen accent cannot make a document less parseable, and the
 * badge stays true.
 *
 * What colour *can* destroy is legibility, and that is computable rather than a matter of taste. So
 * the offer is not a fixed palette: it is any colour that clears the floor against the paper it will
 * sit on. The reader picks, the rule answers, and the refusal says why. That is the same shape as the
 * fabrication guard in `optimize/` — the one place a person watches the product protect them.
 *
 * ## The floors
 *
 * `themes.test.ts` holds the seventeen built-in themes to 4.5:1 for accent and primary. A chosen
 * colour is held to the same number, because a document somebody assembled themselves is still a
 * document a recruiter has to read, and printing it in grey on grey is not a preference we should
 * honour silently.
 */
import type { PdfcnTheme } from '@/components/pdf/theme-types'

/** WCAG AA for normal text, and the floor the built-in themes already clear. */
export const ACCENT_FLOOR = 4.5

/** Body text is the load-bearing one, so it is held higher, as the built-ins are. */
export const TEXT_FLOOR = 7

const channel = (hex: string, at: number) => parseInt(hex.slice(at, at + 2), 16)

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const v = channel(hex, at) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** `#abc` and `#AABBCC` both arrive from colour inputs; the maths wants one shape. */
export function normalizeHex(value: string): string | undefined {
  const raw = value.trim().replace(/^#/, '')
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw
  return /^[0-9a-fA-F]{6}$/.test(full) ? `#${full.toLowerCase()}` : undefined
}

export interface ColourVerdict {
  ok: boolean
  ratio: number
  floor: number
}

export function judgeAccent(accent: string, paper: string): ColourVerdict {
  const ratio = contrastRatio(accent, paper)
  return { ok: ratio >= ACCENT_FLOOR, ratio, floor: ACCENT_FLOOR }
}

export function judgeText(ink: string, paper: string): ColourVerdict {
  const ratio = contrastRatio(ink, paper)
  return { ok: ratio >= TEXT_FLOOR, ratio, floor: TEXT_FLOOR }
}

/** Mix two colours in sRGB. Good enough for a wash, and it has no dependencies. */
function mix(a: string, b: string, amount: number): string {
  const parts = [1, 3, 5].map((at) => {
    const value = Math.round(
      channel(a, at) * amount + channel(b, at) * (1 - amount),
    )
    return value.toString(16).padStart(2, '0')
  })
  return `#${parts.join('')}`
}

/**
 * The pale ground behind a tinted band, derived rather than chosen.
 *
 * A reader picking two colours is picking a relationship, not a palette, and asking them for the
 * wash as well would be asking them to do the part that has a right answer. 12% of the accent over
 * the paper matches how the built-in washes sit against their own inks.
 */
export function deriveAccentWash(accent: string, paper: string): string {
  return mix(accent, paper, 0.12)
}

/**
 * What text on a solid accent band has to be.
 *
 * Whichever of near-white or near-black reads better on it, which is the only question, and it is
 * decided rather than offered because there is no third answer.
 */
export function deriveOnAccent(accent: string): string {
  return contrastRatio('#ffffff', accent) >= contrastRatio('#0d0d0d', accent)
    ? '#ffffff'
    : '#0d0d0d'
}

export interface ColourChoice {
  accent?: string
  paper?: string
}

/**
 * A theme with the reader's colours in it.
 *
 * Throws on a pairing below the floor rather than clamping it quietly. The caller is either the
 * renderer, where a silent downgrade would hand somebody a document they did not choose, or the
 * picker, which asks first and never submits a refused pair.
 */
export function withColours(
  theme: PdfcnTheme,
  choice: ColourChoice,
): PdfcnTheme {
  if (choice.accent === undefined && choice.paper === undefined) return theme

  const withStyle = theme as PdfcnTheme & {
    style?: Record<string, unknown>
  }
  const paper = choice.paper ?? theme.colors.background
  const accent =
    choice.accent ??
    (withStyle.style?.accent as string | undefined) ??
    theme.colors.primary

  const verdict = judgeAccent(accent, paper)
  if (!verdict.ok) {
    throw new Error(
      `Accent ${accent} on ${paper} is ${verdict.ratio.toFixed(2)}:1, below the ${ACCENT_FLOOR}:1 a reader needs.`,
    )
  }
  const text = judgeText(theme.colors.foreground, paper)
  if (!text.ok) {
    throw new Error(
      `Body text ${theme.colors.foreground} on ${paper} is ${text.ratio.toFixed(2)}:1, below ${TEXT_FLOOR}:1.`,
    )
  }

  return {
    ...theme,
    colors: {
      ...theme.colors,
      background: paper,
      primary: accent,
      accent,
      primaryForeground: deriveOnAccent(accent),
    },
    ...(withStyle.style === undefined
      ? {}
      : {
          style: {
            ...withStyle.style,
            accent,
            accentWash: deriveAccentWash(accent, paper),
            onAccent: deriveOnAccent(accent),
          },
        }),
  } as PdfcnTheme
}
