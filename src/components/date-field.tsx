/**
 * A CV date, picked rather than typed as an ISO string.
 *
 * Edd: *"Utiliza el Calendar componente de shadcn ui siempre que intentemos agregar una fecha."* This is
 * that component, driven at the precision a CV actually has — which is the whole design problem, so it is
 * worth being explicit about.
 *
 * ## A calendar picks a day; these fields have no day
 *
 * The field this replaces was labelled "Started (YYYY-MM)", which asks a person to know a date format.
 * A picker is plainly better. But a day grid asks *"which day in March 2019 did you start?"* — a question
 * the CV never answered, most people cannot answer, and no screener asks. Storing the answer would mean
 * inventing precision (CLAUDE.md: dates are `YYYY` or `YYYY-MM`, never a `Date`), and showing a selected
 * day while storing only the month would mean the picker disagreeing with the field beside it.
 *
 * So the day grid is removed — `MonthGrid` and `Weekdays` are replaceable slots in React DayPicker, so
 * this is an extension point rather than a hack, and the vendored `ui/calendar.tsx` stays untouched and
 * diffable against upstream (CLAUDE.md). What is left of the calendar is exactly what a CV date is: a
 * month dropdown, a year dropdown, and the nav arrows.
 *
 * ## A year with no month is a real answer
 *
 * `2010` is what a degree usually says, and no ordinary date picker can express it. "Just 2010" is one
 * click here, and it is offered rather than hidden, because otherwise everybody's education acquires a
 * January it never had.
 *
 * ## Typing still works
 *
 * The text input stays, and it is not a fallback for the picker's benefit — it is faster for somebody who
 * knows the value, it is the only thing that works with a screen reader without a lot of ceremony, and it
 * is how a paste from an old CV gets in. The picker is the way in for people who do not want to think
 * about format; the field is the way in for people who already have.
 */
import { useState } from 'react'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { FieldProvenance } from '@/schema/provenance'
import { needsReview } from '@/schema/provenance'
import {
  EARLIEST_YEAR,
  formatYearMonth,
  fromDisplayDate,
  parseYearMonth,
  toDisplayDate,
} from '@/schema/year-month'

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/**
 * "Mar 2019", "2010", or the raw text when it does not parse.
 *
 * Whatever is in the field is echoed rather than replaced when it is unparseable: a CV extracted from a
 * scan can hold `Marts 2019`, and blanking it because we cannot read it would delete the only record of
 * what the document said. The person can see it and fix it.
 */
function describe(value: string): string {
  const parts = parseYearMonth(value)
  if (parts === undefined) return value.trim()
  return parts.month === undefined
    ? String(parts.year)
    : `${MONTHS[parts.month - 1]} ${parts.year}`
}

export function DateField({
  label,
  value,
  onChange,
  provenance,
  /** For an end date: offers "Still here", which is what an empty value means (schema: `null`). */
  openEndedLabel,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  provenance?: FieldProvenance
  openEndedLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const parts = parseYearMonth(value)
  const flagged = provenance !== undefined && needsReview(provenance)

  /**
   * The year the picker opens on when there is no value yet.
   *
   * `new Date()` is read here and nowhere near the stored value — this decides which page of a calendar
   * to show, not what the CV says.
   */
  const thisYear = new Date().getFullYear()

  /**
   * Where the calendar is currently *looking*, which is not what the field says.
   *
   * The first version of this wrote the value straight from `onMonthChange`, and that was wrong in a way
   * only the browser showed: **navigating is not choosing.** DayPicker fires that callback for the
   * dropdowns, for the arrows, and on mount — so simply reopening the picker on a field holding `2021`
   * silently rewrote it to `2021-10`. A month nobody picked, on a value that was already correct, which
   * is precisely the invented precision this component exists to avoid.
   *
   * So navigation moves this draft and nothing else, and the value is written only by an explicit press.
   * `undefined` until the popover opens, so the draft cannot go stale against an edit typed in the field.
   */
  const [draft, setDraft] = useState<Date | undefined>()
  const shown = draft ?? toDisplayDate(parts ?? { year: thisYear })
  const drafted = fromDisplayDate(shown)

  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
        {label}
      </span>
      <div className="flex items-stretch gap-1.5">
        <input
          type="text"
          value={value}
          inputMode="numeric"
          placeholder="2019-03"
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
          className={`${flagged ? 'field field-flagged' : 'field'} min-w-0 flex-1`}
        />
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            // Opening starts from what the field says; closing forgets, so a later edit is not overridden.
            setDraft(
              next ? toDisplayDate(parts ?? { year: thisYear }) : undefined,
            )
          }}
        >
          <PopoverTrigger
            type="button"
            aria-label={`Pick ${label.toLowerCase()}`}
            className="flex w-10 shrink-0 items-center justify-center rounded-field border border-hairline-strong text-ink-soft transition-colors hover:border-signal hover:text-signal"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              className="h-4 w-4"
            >
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M8 3v4m8-4v4M3 11h18" />
            </svg>
          </PopoverTrigger>
          {/*
            A width, because removing the day grid removed the thing that gave the popover one.

            The vendored calendar sizes itself from `--cell-size` times seven columns. With the grid gone
            the caption row had nothing to stretch against and collapsed to its narrowest possible box,
            clipping the month dropdown to "ne" — measured in the browser, not guessed. 17rem fits
            "September 2019" and the two footer buttons at their longest.
          */}
          <PopoverContent
            align="start"
            /*
              Radix flips the panel above the trigger on its own, and that was not quite enough: with a
              date field scrolled to the very bottom of the sidebar it still hung 15px past the viewport
              edge, measured. `collisionPadding` keeps a margin from every edge, so the footer buttons —
              the only way to commit a value — can never be the part that falls off the screen.
            */
            collisionPadding={12}
            className="w-[17rem] p-0"
          >
            <Calendar
              /*
                `dropdown` puts month and year in select menus, which is the only sane way through forty
                years of history — clicking the previous-month arrow from 2026 back to 1998 is 336 clicks.
              */
              captionLayout="dropdown"
              /*
                Our own month names, not `toLocaleString`.

                Upstream's formatter asks the runtime for a short month, and the runtime answers with
                whatever its ICU build thinks — the container returned lowercase "mar", beside a button
                reading "Use Mar 2019". `render/locale.ts` already settled this argument for the document:
                hand-written tables, because `Intl` output varies between builds of the same Node. The
                same reasoning applies to a control, and a `formatters` prop is a supported override, so
                the vendored file stays untouched.
              */
              formatters={{
                formatMonthDropdown: (date) => MONTHS[date.getMonth()] ?? '',
              }}
              month={shown}
              startMonth={new Date(EARLIEST_YEAR, 0)}
              endMonth={new Date(thisYear + 1, 11)}
              /* Navigation only — see `draft`. Nothing reaches the CV until a button is pressed. */
              onMonthChange={setDraft}
              /*
                The day grid and the weekday header, removed. Supported component slots, so upstream's
                file is untouched — see the note at the top of this file for why the grid must go.
              */
              components={{
                MonthGrid: () => <></>,
                Weekdays: () => <></>,
              }}
              className="p-2"
            />
            {/*
              Three ways out, and each one names what it writes.

              "Done" was here before and did nothing but close, which was survivable while navigation
              wrote the value and is a trap now that it does not: a button called Done that discards the
              month you just navigated to is the worst possible label. The primary action says the month.
            */}
            <div className="flex flex-wrap items-center gap-1.5 border-t border-hairline p-2">
              <button
                type="button"
                onClick={() => {
                  onChange(String(drafted.year))
                  setOpen(false)
                }}
                className="btn btn-quiet px-3 py-1.5 text-[12px]"
              >
                Just {drafted.year}
              </button>
              {openEndedLabel !== undefined && (
                <button
                  type="button"
                  onClick={() => {
                    onChange('')
                    setOpen(false)
                  }}
                  className="btn btn-quiet px-3 py-1.5 text-[12px]"
                >
                  {openEndedLabel}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onChange(formatYearMonth(drafted))
                  setOpen(false)
                }}
                className="btn btn-primary ml-auto px-3 py-1.5 text-[12px]"
              >
                Use {MONTHS[drafted.month - 1]} {drafted.year}
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {/*
        A note under the field, only when it says something the row does not.

        Each entry already prints "Reads as: Mar 2019 – Present" for the pair, so echoing "Reads as Mar
        2019" here as well put three near-identical sentences under two inputs. What the row cannot say is
        that an *empty* end date means "still here" rather than "forgotten", or that a value we could not
        parse is sitting there unread — a scan can leave `Marts 2019` in the field, and it is kept rather
        than blanked, because deleting the only record of what the document said is worse than showing it.
      */}
      {value.trim() === '' ? (
        <span className="text-meta text-ink-soft">
          {openEndedLabel ?? 'Not set'}
        </span>
      ) : (
        parts === undefined && (
          <span className="text-meta text-caution">
            We cannot read “{describe(value)}” as a date. A year, or a year and
            month.
          </span>
        )
      )}
    </div>
  )
}
