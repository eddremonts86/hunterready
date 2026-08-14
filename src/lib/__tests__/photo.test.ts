/**
 * The crop geometry and the gate in front of it.
 *
 * The canvas half needs a browser and is verified there. This is the half that can be wrong in a way a
 * screenshot would not reveal — a crop that is one rounding away from the edge, or an offset that does
 * nothing on a landscape photo — plus the two refusals, which are the only messages a person ever sees
 * from this module.
 */
import { describe, expect, it } from 'vitest'
import { MAX_PHOTO_BYTES, rejectPhoto, squareCrop } from '../photo'

describe('which square comes out of a photo', () => {
  it('centres horizontally on a landscape photo', () => {
    // 4000×3000 → a 3000 square, 500 in from each side.
    expect(squareCrop(4000, 3000)).toEqual({ sx: 500, sy: 0, size: 3000 })
  })

  it('does nothing vertically on a landscape photo, whatever the offset', () => {
    // There is no vertical slack to spend, so the offset must not invent any.
    expect(squareCrop(4000, 3000, 0)).toEqual({ sx: 500, sy: 0, size: 3000 })
    expect(squareCrop(4000, 3000, 1)).toEqual({ sx: 500, sy: 0, size: 3000 })
  })

  it('biases toward the top of a portrait photo by default', () => {
    /**
     * The assertion with a reason behind it. A phone portrait has the head in the upper third, so a true
     * centre crop takes chin and chest. 3000×4000 at the default 0.25 starts 250px down, not 500.
     */
    expect(squareCrop(3000, 4000)).toEqual({ sx: 0, sy: 250, size: 3000 })
    expect(squareCrop(3000, 4000, 0.5).sy).toBe(500)
  })

  it('goes flush to each edge at the extremes', () => {
    expect(squareCrop(3000, 4000, 0).sy).toBe(0)
    expect(squareCrop(3000, 4000, 1).sy).toBe(1000)
  })

  it('clamps an offset outside 0–1 rather than cropping off the image', () => {
    // A slider cannot produce these, but a future caller could, and the failure would be a blank square.
    expect(squareCrop(3000, 4000, -3).sy).toBe(0)
    expect(squareCrop(3000, 4000, 9).sy).toBe(1000)
  })

  it('takes the whole of an already-square photo', () => {
    expect(squareCrop(800, 800)).toEqual({ sx: 0, sy: 0, size: 800 })
  })

  it('never returns a rectangle that leaves the image', () => {
    for (const [w, h] of [
      [4000, 3000],
      [3000, 4000],
      [1001, 999],
      [37, 4000],
      [800, 800],
    ]) {
      const { sx, sy, size } = squareCrop(w, h, 0.25)
      expect(sx, `${w}×${h}`).toBeGreaterThanOrEqual(0)
      expect(sy, `${w}×${h}`).toBeGreaterThanOrEqual(0)
      expect(sx + size, `${w}×${h}`).toBeLessThanOrEqual(w)
      expect(sy + size, `${w}×${h}`).toBeLessThanOrEqual(h)
    }
  })
})

describe('what will not be opened', () => {
  it('accepts the three formats a browser can decode', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(rejectPhoto({ type, size: 500_000 })).toBeUndefined()
    }
  })

  it('refuses a PDF, and says what to do about a HEIC', () => {
    expect(rejectPhoto({ type: 'application/pdf', size: 1000 })).toContain(
      'JPEG',
    )
    // The commonest real case: an iPhone photo. The message names it rather than saying "unsupported".
    expect(rejectPhoto({ type: 'image/heic', size: 1000 })).toContain('HEIC')
  })

  it('refuses a file too large to open in a tab, and names its size', () => {
    const message = rejectPhoto({
      type: 'image/jpeg',
      size: MAX_PHOTO_BYTES + 1,
    })
    expect(message).toContain('12MB')
  })

  it('accepts a file exactly at the limit', () => {
    // Off-by-one on a boundary somebody will hit with a 12MB export.
    expect(
      rejectPhoto({ type: 'image/jpeg', size: MAX_PHOTO_BYTES }),
    ).toBeUndefined()
  })
})
