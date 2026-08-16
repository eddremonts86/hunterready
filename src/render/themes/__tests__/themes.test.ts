/**
 * Block 3 verifier: document themes obey DESIGN.md's print-side rules.
 *
 * The Amber Never Touches The Print Rule is the system's hardest prohibition and the
 * easiest to break by accident — a copied token, a "temporary" highlight, a pdfcn theme
 * imported by mistake. Documentation does not stop that; this does.
 *
 * It checks the source files too, not just the parsed objects, because a hardcoded hex
 * inside a template literal would pass an object-level check.
 */
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THEME_ID,
  THEME_IDS,
  getTheme,
  isThemeId,
  themeLabels,
  themes,
} from '../index'
import {
  ALLOWED_PRINT_COLORS,
  NEUTRALIZED_ALERTS,
  ROOM_COLORS,
} from '../tokens'
import { styleOf } from '../style'

const THEMES_DIR = join(process.cwd(), 'src/render/themes')
const HEX = /^#[0-9a-fA-F]{6}$/

const entries = THEME_IDS.map((id) => [id, themes[id]] as const)

describe('the registry is coherent', () => {
  it('every id resolves to a theme whose name matches', () => {
    for (const [id, theme] of entries) {
      expect(theme.name).toBe(id)
    }
  })

  it('every id has a plain-language label and hint', () => {
    for (const id of THEME_IDS) {
      expect(themeLabels[id].label.length).toBeGreaterThan(0)
      expect(themeLabels[id].hint.length).toBeGreaterThan(0)
      // The audience is not designers — no jargon in the picker.
      expect(themeLabels[id].hint).not.toMatch(/kerning|leading|tracking|ATS/i)
    }
  })

  it('the default is a real id', () => {
    expect(isThemeId(DEFAULT_THEME_ID)).toBe(true)
    expect(getTheme(DEFAULT_THEME_ID)).toBe(themes[DEFAULT_THEME_ID])
  })

  it('rejects an unknown id', () => {
    expect(isThemeId('blueprint')).toBe(false)
  })
})

describe('no two themes are the same design in different clothes', () => {
  /**
   * The test Edd's complaint wrote. The first catalogue's thirty designs were one grey document in
   * thirty spacing configurations — every theme drew the same hairline heading in the same ink, so the
   * only difference a buyer could see was the typeface. Nobody pays for that, and nobody should.
   */
  it('accents are plentiful, and ink-only is a choice at most two themes make', () => {
    /*
      Not strict uniqueness any more: `minimal` and `editorial` both choose plain ink, and that is
      legitimate — restraint is an identity — but only while it stays rare. Three monochrome themes
      would mean the grey catalogue growing back one theme at a time.
    */
    const accents = entries.map(([, theme]) => styleOf(theme).accent)
    expect(new Set(accents).size).toBeGreaterThanOrEqual(entries.length - 1)
    const inkOnly = accents.filter((accent) => accent === '#0D0D0D')
    expect(inkOnly.length).toBeLessThanOrEqual(2)
  })

  it('no two themes are the same look', () => {
    // The whole identity at once: what the heading does, what the masthead does, and in which ink.
    const looks = entries.map(([, theme]) => {
      const style = styleOf(theme)
      return [
        style.heading,
        style.masthead,
        style.accent,
        style.paper ?? 'white',
        style.nameFontFamily ?? 'heading-face',
      ].join('/')
    })
    expect(new Set(looks).size).toBe(entries.length)
  })

  it('at least three genuinely different masthead constructions exist', () => {
    const mastheads = new Set(
      entries.map(([, theme]) => styleOf(theme).masthead),
    )
    expect(mastheads.size).toBeGreaterThanOrEqual(3)
  })
})

describe('The Amber Never Touches The Print Rule', () => {
  it.each(entries)('%s uses only hex colors', (_id, theme) => {
    for (const [key, value] of Object.entries(theme.colors)) {
      expect(HEX.test(value), `${key} = ${value}`).toBe(true)
    }
  })

  it.each(entries)('%s contains no room color', (_id, theme) => {
    const banned = Object.values(ROOM_COLORS).map((c) => c.toLowerCase())
    for (const [key, value] of Object.entries(theme.colors)) {
      expect(banned, `${key} carries a room color`).not.toContain(
        value.toLowerCase(),
      )
    }
  })

  it.each(entries)(
    '%s draws only from the allowed print palette',
    (_id, theme) => {
      const allowed = ALLOWED_PRINT_COLORS.map((c) => c.toLowerCase())
      for (const [key, value] of Object.entries(theme.colors)) {
        expect(allowed, `${key} = ${value} is not a print token`).toContain(
          value.toLowerCase(),
        )
      }
    },
  )

  it.each(entries)('%s neutralizes the alert semantics', (_id, theme) => {
    // `accent` is a real color per theme now; the alerts stay ink — a CV has no error states.
    for (const [key, expected] of Object.entries(NEUTRALIZED_ALERTS)) {
      expect(theme.colors[key as keyof typeof theme.colors]).toBe(expected)
    }
  })

  it.each(entries)(
    '%s draws its style block only from the allowed palette',
    (_id, theme) => {
      const allowed = ALLOWED_PRINT_COLORS.map((c) => c.toLowerCase())
      const style = styleOf(theme)
      for (const key of ['accent', 'accentWash', 'onAccent'] as const) {
        expect(allowed, `style.${key} = ${style[key]}`).toContain(
          style[key].toLowerCase(),
        )
      }
    },
  )

  it('no theme source file hardcodes a room color', async () => {
    const files = (await readdir(THEMES_DIR)).filter((f) => f.endsWith('.ts'))
    const banned = Object.entries(ROOM_COLORS)

    for (const file of files) {
      const source = await readFile(join(THEMES_DIR, file), 'utf8')
      for (const [name, hex] of banned) {
        // tokens.ts declares them by design, to name what is forbidden.
        if (file === 'tokens.ts') continue
        expect(
          source.toLowerCase().includes(hex.toLowerCase()),
          `${file} hardcodes ${name} (${hex})`,
        ).toBe(false)
      }
    }
  })

  it('no theme uses a color space the renderer rejects', async () => {
    const files = (await readdir(THEMES_DIR)).filter((f) => f.endsWith('.ts'))
    for (const file of files) {
      const source = await readFile(join(THEMES_DIR, file), 'utf8')
      // ADR-003: the renderer takes hex, rgb() and hsl() — never oklch.
      expect(source, `${file} uses oklch`).not.toMatch(/oklch\(/)
    }
  })
})

describe('the themes are actually different', () => {
  it('no two themes share a typography + spacing signature', () => {
    const signatures = entries.map(([, t]) =>
      [
        t.typography.body.fontFamily,
        t.typography.body.fontSize,
        t.typography.heading.fontFamily,
        t.typography.heading.fontSize.h1,
        t.spacing.page.marginTop,
        t.spacing.sectionGap,
      ].join('|'),
    )
    expect(new Set(signatures).size).toBe(entries.length)
  })

  it('executive is more spacious than modern, which is the point of it', () => {
    expect(themes.executive.spacing.page.marginTop).toBeGreaterThan(
      themes.modern.spacing.page.marginTop,
    )
    expect(themes.executive.spacing.sectionGap).toBeGreaterThan(
      themes.modern.spacing.sectionGap,
    )
  })

  it('professional and executive use a serif for headings, modern does not', () => {
    expect(themes.professional.typography.heading.fontFamily).toMatch(
      /times|serif/i,
    )
    expect(themes.executive.typography.heading.fontFamily).toMatch(
      /times|serif/i,
    )
    expect(themes.modern.typography.heading.fontFamily).not.toMatch(
      /times|serif/i,
    )
  })
})

describe('document typography stays readable in print', () => {
  it.each(entries)('%s body text is between 10 and 12pt', (_id, theme) => {
    expect(theme.typography.body.fontSize).toBeGreaterThanOrEqual(10)
    expect(theme.typography.body.fontSize).toBeLessThanOrEqual(12)
  })

  it.each(entries)(
    '%s page margins leave a printable safe area',
    (_id, theme) => {
      const { marginTop, marginRight, marginBottom, marginLeft } =
        theme.spacing.page
      for (const [side, value] of Object.entries({
        marginTop,
        marginRight,
        marginBottom,
        marginLeft,
      })) {
        // Below ~28pt (1cm) consumer printers clip; above ~72pt we waste a CV's page.
        expect(value, side).toBeGreaterThanOrEqual(28)
        expect(value, side).toBeLessThanOrEqual(72)
      }
    },
  )

  it.each(entries)('%s is A4 portrait', (_id, theme) => {
    expect(theme.page.size).toBe('A4')
    expect(theme.page.orientation).toBe('portrait')
  })
})

/**
 * The floor the document palette never had.
 *
 * `tokens.ts` records a contrast ratio beside every chrome token and this file asserted none of
 * them: it enforced hex-only, banned chrome colors, and proved the themes look different from each
 * other, all of which can hold while a theme prints grey on grey. The product's whole promise is a
 * document a machine and a person can both read, and the inks that go on it were the untested half.
 *
 * The floors below are per role, because the roles do different jobs, and each is set just under
 * what the seventeen themes actually achieve today rather than at a round number:
 *
 *   foreground       13.23 today (onyx)     body text, and it should never be close
 *   mutedForeground   4.10 today (glacier)  secondary lines, dates, the second half of a metadata row
 *   primary / accent  4.75 today (brush)    headings and section rules, larger than body
 *
 * A blanket 3:1 was the first proposal, taken from a cruder measurement of raw tokens against white
 * paper. Measuring each role against its own theme's ground gave better numbers, and a floor of 3
 * would have licensed a slide from 4.10 to 3.01 without anyone noticing. Raise these when a change
 * earns it; never lower one to make a red suite green.
 */
describe('every theme stays readable', () => {
  const channel = (hex: string, at: number) =>
    parseInt(hex.slice(at, at + 2), 16)
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((at) => {
      const v = channel(hex, at) / 255
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const contrast = (a: string, b: string) => {
    const [x, y] = [luminance(a), luminance(b)]
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
  }

  const FLOORS = {
    foreground: 7,
    mutedForeground: 4,
    primary: 4.5,
    accent: 4.5,
  } as const

  for (const [role, floor] of Object.entries(FLOORS)) {
    it(`${role} clears ${floor}:1 against its own ground in every theme`, () => {
      const failures: Array<string> = []
      for (const id of THEME_IDS) {
        const colors = themes[id].colors as unknown as Record<string, string>
        const ink = colors[role]
        const ground = colors.background
        if (ink === undefined || ground === undefined) continue
        const ratio = contrast(ink, ground)
        if (ratio < floor) {
          failures.push(
            `${id}: ${role} ${ink} on ${ground} = ${ratio.toFixed(2)}:1`,
          )
        }
      }
      expect(failures).toEqual([])
    })
  }
})
