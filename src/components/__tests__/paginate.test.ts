/**
 * Where the preview puts its page breaks.
 *
 * This function has been wrong twice, both times invisibly:
 *
 *   • It moved the page start to an over-tall block and carried on, so a two-page paragraph was drawn
 *     from its beginning on one sheet, clipped, and **its middle appeared on no sheet at all**.
 *   • It paginated by measured height alone, so an explicit page break — zero height, all instruction —
 *     was stepped over. The PDF broke the page and the preview did not.
 *
 * The second one shipped, and the reason it shipped is worth writing down: the PDF side had 85 tests
 * across 28 templates and they all passed, because they render a document and read it back. The
 * preview is a *second renderer* — the same components laid out by a browser — and it had none. A
 * guarantee tested on one of two renderers is a guarantee about one of them.
 *
 * The DOM measurement is still untested and cannot easily be: jsdom reports every box as zero. What is
 * tested is every decision made from those measurements, which is where both bugs lived.
 */
import { describe, expect, it } from 'vitest'
import { paginate } from '../paper-preview'
import type { MeasuredBlock } from '../paper-preview'

const PAGE = 1000

/** Blocks laid out end to end, the way a browser would stack them. */
function stack(heights: Array<number | 'break'>): Array<MeasuredBlock> {
  let top = 0
  return heights.map((height) => {
    const block: MeasuredBlock = {
      top,
      height: height === 'break' ? 0 : height,
      pageBreak: height === 'break',
    }
    top += block.height
    return block
  })
}

describe('paginate', () => {
  it('gives an empty document one sheet', () => {
    expect(paginate([], PAGE)).toEqual([0])
  })

  it('keeps everything on one sheet while it fits', () => {
    expect(paginate(stack([200, 300, 400]), PAGE)).toEqual([0])
  })

  it('starts a sheet at the block that would overflow, not mid-block', () => {
    // 600 + 600: the second cannot fit, so page two begins where it begins.
    expect(paginate(stack([600, 600]), PAGE)).toEqual([0, 600])
  })

  /**
   * The first bug. A block taller than a page must be *cut through*, page by page — not skipped past,
   * which silently dropped everything between its top and the next block.
   */
  it('cuts through a block taller than a page instead of losing its middle', () => {
    const breaks = paginate(stack([2500]), PAGE)
    expect(breaks).toEqual([0, 1000, 2000])
  })

  /* ── The explicit break ─────────────────────────────────────────────────────────────────────── */

  it('starts a sheet at an explicit break', () => {
    expect(paginate(stack([300, 'break', 300]), PAGE)).toEqual([0, 300])
  })

  it('ignores a break with nothing after it, because takumi emits no blank sheet', () => {
    expect(paginate(stack([300, 'break']), PAGE)).toEqual([0])
    expect(paginate(stack([300, 'break', 0]), PAGE)).toEqual([0])
  })

  it('ignores a break at the top of a page it would only start again', () => {
    expect(paginate(stack(['break', 300]), PAGE)).toEqual([0])
  })

  it('takes a break even where the content would have fitted', () => {
    // The whole point: 100 + 100 fits twice over, and the person asked for two sheets anyway.
    expect(paginate(stack([100, 'break', 100]), PAGE)).toEqual([0, 100])
  })

  it('handles several breaks, and height overflow between them', () => {
    expect(paginate(stack([100, 'break', 1400, 'break', 100]), PAGE)).toEqual([
      0, 100, 1100, 1500,
    ])
  })

  it('never returns fewer than one sheet, whatever it is given', () => {
    for (const heights of [
      ['break'] as const,
      [0, 0, 0] as const,
      ['break', 'break'] as const,
    ]) {
      expect(paginate(stack([...heights]), PAGE).length).toBeGreaterThanOrEqual(
        1,
      )
    }
  })
})
