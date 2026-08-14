/**
 * The boundary between a CV's date strings and the calendar's `Date`.
 *
 * Worth testing precisely because it is small: every one of these functions can be wrong in a way that
 * looks fine on the screen of whoever wrote it. The timezone case is the one that would have shipped —
 * a `Date` at midnight is the previous day in UTC for anybody west of Greenwich, so a picker rendering
 * `2019-03` would highlight February for a user in Copenhagen and be correct for one in London.
 */
import { describe, expect, it } from 'vitest'
import {
  formatYearMonth,
  fromDisplayDate,
  parseYearMonth,
  toDisplayDate,
} from '../year-month'

describe('reading what a CV wrote', () => {
  it('reads a year and month', () => {
    expect(parseYearMonth('2019-03')).toEqual({ year: 2019, month: 3 })
  })

  it('reads a year on its own, which is not an error', () => {
    // A degree is a year. Education entries carry this shape more often than not.
    expect(parseYearMonth('2010')).toEqual({ year: 2010 })
  })

  it('tolerates surrounding space', () => {
    expect(parseYearMonth('  2019-03 ')).toEqual({ year: 2019, month: 3 })
  })

  it('refuses a month that is not one', () => {
    expect(parseYearMonth('2019-13')).toBeUndefined()
    expect(parseYearMonth('2019-00')).toBeUndefined()
  })

  it('refuses a partial value rather than guessing', () => {
    // Somebody mid-keystroke. The caller reads `undefined` as "not yet", never as "invalid".
    expect(parseYearMonth('20')).toBeUndefined()
    expect(parseYearMonth('2019-')).toBeUndefined()
    expect(parseYearMonth('')).toBeUndefined()
  })

  it('refuses a year no working life reaches', () => {
    expect(parseYearMonth('1066')).toBeUndefined()
  })

  it('refuses a full ISO date, because that day was never in the CV', () => {
    expect(parseYearMonth('2019-03-14')).toBeUndefined()
  })
})

describe('writing it back', () => {
  it('pads the month to two digits', () => {
    expect(formatYearMonth({ year: 2019, month: 3 })).toBe('2019-03')
  })

  it('writes a year alone when there is no month', () => {
    expect(formatYearMonth({ year: 2010 })).toBe('2010')
  })

  it('round-trips every shape it can parse', () => {
    for (const value of ['2019-03', '2010', '1999-12', '2026-01']) {
      const parts = parseYearMonth(value)
      expect(parts, value).toBeDefined()
      expect(formatYearMonth(parts as never)).toBe(value)
    }
  })
})

describe('the Date the calendar renders, and never stores', () => {
  it('lands on the month it was given, not the one before', () => {
    const date = toDisplayDate({ year: 2019, month: 3 })
    expect(date.getFullYear()).toBe(2019)
    expect(date.getMonth()).toBe(2) // March, zero-indexed
    expect(date.getDate()).toBe(1)
  })

  it('sits at midday so no timezone can shift the month', () => {
    /**
     * The assertion that earns its place. At midnight, `getUTCDate()` is the last day of the *previous*
     * month for any user behind UTC, and calendars that compare in UTC then highlight the wrong month.
     */
    const date = toDisplayDate({ year: 2019, month: 3 })
    expect(date.getHours()).toBe(12)
    expect(date.getUTCMonth()).toBe(2)
    expect(date.getUTCFullYear()).toBe(2019)
  })

  it('shows January for a year with no month, without claiming January', () => {
    // The calendar has to open somewhere. What it must not do is write the month back — that is the
    // caller's job, and `fromDisplayDate` is only called when the user actually picks one.
    expect(toDisplayDate({ year: 2010 }).getMonth()).toBe(0)
  })

  it('drops the day when reading a picked date back', () => {
    expect(fromDisplayDate(new Date(2019, 2, 14, 12))).toEqual({
      year: 2019,
      month: 3,
    })
  })
})
