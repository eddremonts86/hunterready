/**
 * The rule that decides which colours a reader may have.
 *
 * The interesting assertions are the refusals. Anyone can prove a picker accepts navy; the question
 * is whether it stops somebody handing a recruiter pale grey on cream, and whether it says so rather
 * than quietly darkening what they picked.
 */
import { describe, expect, it } from 'vitest'
import { renderResume } from '@/render/render'
import { Resume } from '@/schema/resume'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  ACCENT_FLOOR,
  contrastRatio,
  deriveAccentWash,
  deriveOnAccent,
  judgeAccent,
  normalizeHex,
} from '../custom'

describe('the legibility rule', () => {
  it('accepts a dark ink on light paper', () => {
    expect(judgeAccent('#1f3d5c', '#ffffff').ok).toBe(true)
  })

  it('refuses a pale ink on light paper, and reports the ratio', () => {
    const verdict = judgeAccent('#c9c9c9', '#ffffff')
    expect(verdict.ok).toBe(false)
    expect(verdict.ratio).toBeLessThan(ACCENT_FLOOR)
  })

  it('judges against the chosen paper, not against white', () => {
    // Passes on white, fails on a dark paper: the pairing is the thing, never the colour alone.
    expect(judgeAccent('#20573d', '#ffffff').ok).toBe(true)
    expect(judgeAccent('#20573d', '#232a33').ok).toBe(false)
  })

  it('reads short and long hex the same', () => {
    expect(normalizeHex('#abc')).toBe(normalizeHex('#AABBCC'))
    expect(normalizeHex('nonsense')).toBeUndefined()
  })
})

describe('what is derived rather than asked for', () => {
  it('puts legible text on a solid accent band, whichever way round', () => {
    expect(deriveOnAccent('#1f3d5c')).toBe('#ffffff')
    expect(deriveOnAccent('#f2f5f8')).toBe('#0d0d0d')
    for (const accent of ['#1f3d5c', '#f2f5f8', '#c75b12', '#20573d']) {
      expect(contrastRatio(deriveOnAccent(accent), accent)).toBeGreaterThan(4.5)
    }
  })

  it('keeps the wash pale enough to sit under text', () => {
    const wash = deriveAccentWash('#1f3d5c', '#ffffff')
    expect(contrastRatio('#0d0d0d', wash)).toBeGreaterThan(7)
  })
})

describe('the renderer honours it', () => {
  const load = async () =>
    Resume.parse(
      JSON.parse(
        await readFile(
          join(process.cwd(), 'fixtures/expected/nurse-senior.json'),
          'utf8',
        ),
      ),
    )

  it('renders a document in a chosen accent', async () => {
    const { bytes } = await renderResume(await load(), {
      colours: { accent: '#6b2e2e' },
    })
    expect(bytes.byteLength).toBeGreaterThan(1000)
  })

  it('refuses an illegible pairing instead of quietly fixing it', async () => {
    await expect(
      renderResume(await load(), {
        colours: { accent: '#dddddd', paper: '#ffffff' },
      }),
    ).rejects.toThrow(/below the 4.5:1/)
  })
})
