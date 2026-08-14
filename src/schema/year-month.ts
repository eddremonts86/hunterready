/**
 * Reading and writing the `YYYY` / `YYYY-MM` strings a CV actually contains.
 *
 * ## Why a date picker cannot just hand us a `Date`
 *
 * CLAUDE.md: *"Dates in data: `YYYY` or `YYYY-MM` strings. Never `Date`."* That is not fussiness about
 * types — it is about what a CV knows. "Started March 2019" is the truth on the page; the day is not
 * written down, most people do not remember it, and no screener asks. A `Date` has a day whether or not
 * anybody supplied one, so storing one means either inventing a value or carrying a lie in the third
 * position.
 *
 * `2010` with no month is just as real, and commoner in education than anywhere else — a degree is a
 * year. So the picker has to be able to produce a year *without* a month, which is the part an ordinary
 * calendar cannot express at all.
 *
 * This module is the whole boundary between those strings and the `Date` the calendar needs to render.
 * Nothing else converts, and nothing that converts leaves this file.
 */

/** A CV date, as much of it as the document actually stated. */
export interface YearMonthParts {
  year: number
  /** 1–12, or undefined when the source only gave a year. */
  month?: number
}

/** Plausible for a working life, and the bounds of the picker's year list. 1900 is not a CV date. */
export const EARLIEST_YEAR = 1940

/**
 * `"2019-03"` → `{ year: 2019, month: 3 }`, `"2010"` → `{ year: 2010 }`.
 *
 * Returns `undefined` for anything else, including the empty string and a half-typed `"20"`. The caller
 * treats that as "no date yet" rather than as an error: this parses a field somebody is still typing in,
 * and rejecting a value mid-keystroke is how an input starts fighting the person using it.
 */
export function parseYearMonth(value: string): YearMonthParts | undefined {
  const match = /^(\d{4})(?:-(\d{2}))?$/.exec(value.trim())
  if (match === null) return undefined

  const year = Number(match[1])
  if (year < EARLIEST_YEAR) return undefined

  if (match[2] === undefined) return { year }

  const month = Number(match[2])
  // `2019-13` parses as digits and is not a month. Also rejects `2019-00`.
  if (month < 1 || month > 12) return undefined
  return { year, month }
}

/** `{ year: 2019, month: 3 }` → `"2019-03"`. A missing month yields the year alone, deliberately. */
export function formatYearMonth(parts: YearMonthParts): string {
  return parts.month === undefined
    ? String(parts.year)
    : `${parts.year}-${String(parts.month).padStart(2, '0')}`
}

/**
 * The `Date` the calendar renders, built from parts and never stored.
 *
 * Noon on the first of the month, not midnight. A `Date` at midnight in a timezone behind UTC is the
 * previous day in UTC, so a calendar rendering `2019-03` could highlight February — the classic
 * off-by-one that makes a date picker look broken to exactly the users east or west of you. Noon has
 * twelve hours of slack in both directions.
 */
export function toDisplayDate(parts: YearMonthParts): Date {
  return new Date(parts.year, (parts.month ?? 1) - 1, 1, 12)
}

/**
 * The parts a calendar's `Date` stands for, dropping the day it invented.
 *
 * The month is required in the return type, not optional like `YearMonthParts` — a `Date` always has
 * one. Widening it here would push a `?.` onto every caller for a case that cannot happen, and the
 * callers then have to invent a fallback month, which is the exact mistake this module exists to stop.
 */
export function fromDisplayDate(date: Date): Required<YearMonthParts> {
  return { year: date.getFullYear(), month: date.getMonth() + 1 }
}
