/**
 * The six sections the document has always printed and the Check panel never showed.
 *
 * ## The bug, in the words of the person who found it
 *
 * Edd, looking at a Danish CV: *"¿por qué veo cosas en el documento que no están en las secciones del
 * sidebar?"* — CERTIFICERINGER and SPROG were laid out in the PDF beside a panel that offered You,
 * Experience, Education, Skills and the custom sections and nothing else.
 *
 * This is not a new failure. It is the *same* one the custom-section editor was written to fix, caught
 * on one of seven lists and left on the other six. `Resume` carries ten lists; the panel edited four.
 * `projects`, `certifications`, `languages`, `awards`, `publications` and `volunteer` all render, all
 * come out of ingestion populated, and all had nowhere to be corrected — so the honesty mechanism this
 * whole product is built on had a hole in it exactly where a person could see the consequence and do
 * nothing about it.
 *
 * ## Why one table instead of six editors
 *
 * Six hand-written sections would be six places for a future fix to be forgotten, which is how this
 * happened in the first place — the four that existed were each written out in full, so nobody
 * noticed the six that were not. A description of each list, in one place, cannot go quietly out of
 * step with the schema: adding a list to `Resume` and forgetting it here leaves a visible gap in one
 * table rather than an absence nobody can see.
 *
 * The shape they share is small: a few text fields, sometimes a couple of dates, sometimes a list of
 * lines. That is every one of the six.
 *
 * ## What it deliberately does not do
 *
 * It does not try to be the Experience editor. `volunteer` holds `WorkItem`s and gets name, role,
 * dates and bullets — not employment type, not the remote flag, not the tech list. Voluntary work on a
 * CV is a line and some dates; the fuller form belongs to the section people actually spend time in,
 * and duplicating it here would be a second copy of the hardest part of `review-form.tsx`.
 */
import { DateField } from '@/components/date-field'
import { needsReview } from '@/schema/provenance'
import type { FieldProvenance } from '@/schema/provenance'
import type { Resume } from '@/schema/resume'

/** Which lists this covers, and nothing else may be passed. */
export type ExtraKey =
  | 'projects'
  | 'certifications'
  | 'languages'
  | 'awards'
  | 'publications'
  | 'volunteer'

interface FieldSpec {
  /** The property on the item. */
  key: string
  label: string
  /** A date is a `YearMonth` string and gets the picker, so a typo cannot fail the schema. */
  kind?: 'text' | 'date'
  /** Only on an end date: offers "Still going", which is what an empty value means. */
  openEnded?: string
}

interface ListSpec {
  key: ExtraKey
  title: string
  /** Singular, for the "Add …" control and the remove labels. */
  one: string
  fields: Array<FieldSpec>
  /** The property holding a list of plain lines, when the item has one. */
  lines?: { key: string; label: string; one: string }
  /** Shown when the list is empty, in the person's own terms rather than the schema's. */
  empty: string
  /** A fresh item. Every required property, or the schema rejects the document on the next render. */
  blank: () => Record<string, unknown>
}

/**
 * The six, described.
 *
 * The labels are the words a person uses, not the field names: "Who issued it", not `issuer`. That is
 * the same rule the rest of the panel follows and it matters more here, because these are the sections
 * somebody meets least often.
 */
export const EXTRA_SECTIONS: ReadonlyArray<ListSpec> = [
  {
    key: 'certifications',
    title: 'Certifications',
    one: 'certification',
    fields: [
      { key: 'name', label: 'What it is' },
      { key: 'issuer', label: 'Who issued it' },
      { key: 'date', label: 'Awarded', kind: 'date' },
      { key: 'expires', label: 'Expires', kind: 'date' },
      { key: 'identifier', label: 'Reference number' },
    ],
    empty: 'Licences, authorisations, courses with a certificate.',
    blank: () => ({ name: '' }),
  },
  {
    key: 'languages',
    title: 'Languages',
    one: 'language',
    fields: [
      { key: 'name', label: 'Language' },
      /*
        `raw` and not `level`. The schema has both: an enum (A1…C2, native) and the words the CV
        actually used. A dropdown here would make somebody translate "flydende" into "C1" to correct a
        spelling, and the templates print `raw` when it is there — so this edits what is printed.
      */
      { key: 'raw', label: 'How well, in your words' },
    ],
    empty: 'Danish (native), English (fluent) — however your CV says it.',
    blank: () => ({ name: '' }),
  },
  {
    key: 'projects',
    title: 'Projects',
    one: 'project',
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'role', label: 'What you did on it' },
      { key: 'description', label: 'What it was' },
      { key: 'startDate', label: 'Started', kind: 'date' },
      {
        key: 'endDate',
        label: 'Ended',
        kind: 'date',
        openEnded: 'Still going',
      },
    ],
    lines: { key: 'highlights', label: 'Points', one: 'point' },
    empty: 'Work that is not a job: a build, a study, a side project.',
    blank: () => ({ name: '', highlights: [], tech: [] }),
  },
  {
    key: 'volunteer',
    title: 'Volunteering',
    one: 'role',
    fields: [
      { key: 'company', label: 'Organisation' },
      { key: 'role', label: 'What you did' },
      { key: 'startDate', label: 'Started', kind: 'date' },
      {
        key: 'endDate',
        label: 'Ended',
        kind: 'date',
        openEnded: 'Still there',
      },
    ],
    lines: { key: 'highlights', label: 'Points', one: 'point' },
    empty: 'Unpaid work counts, and on many CVs it is the strongest part.',
    blank: () => ({ company: '', role: '', highlights: [], tech: [] }),
  },
  {
    key: 'awards',
    title: 'Awards',
    one: 'award',
    fields: [{ key: 'title', label: 'Heading' }],
    lines: { key: 'items', label: 'Lines', one: 'line' },
    empty: 'Prizes, honours, scholarships.',
    blank: () => ({ title: '', items: [''] }),
  },
  {
    key: 'publications',
    title: 'Publications',
    one: 'publication',
    fields: [{ key: 'title', label: 'Heading' }],
    lines: { key: 'items', label: 'Lines', one: 'line' },
    empty: 'Papers, articles, talks that were written up.',
    blank: () => ({ title: '', items: [''] }),
  },
]

/** Everything the editor needs from `ReviewForm`, so the two cannot drift on styling or provenance. */
export interface ExtraChrome {
  index: Map<string, FieldProvenance>
  fieldClass: (path: string) => string
  sectionFlagged: (prefix: string) => number
  Section: (props: {
    title: string
    count?: number
    flagged: number
    defaultOpen: boolean
    children: React.ReactNode
    actions?: React.ReactNode
  }) => React.ReactElement
  Field: (props: {
    label: string
    value: string
    onChange: (next: string) => void
    provenance?: FieldProvenance
  }) => React.ReactElement
  AddRow: (props: { label: string; onClick: () => void }) => React.ReactElement
  RemoveRow: (props: {
    label: string
    onClick: () => void
  }) => React.ReactElement
  LineBubble: (props: {
    children: React.ReactNode
    removeLabel: string
    onRemove: () => void
  }) => React.ReactElement
  AutoTextarea: (props: {
    value: string
    onChange: (next: string) => void
    className: string
    ariaLabel?: string
  }) => React.ReactElement
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function lines(value: unknown): Array<string> {
  return Array.isArray(value) ? (value as Array<string>) : []
}

export function ExtraSections({
  resume,
  onChange,
  authoring,
  chrome,
}: {
  resume: Resume
  onChange: (next: Resume) => void
  authoring: boolean
  chrome: ExtraChrome
}) {
  const {
    index,
    fieldClass,
    sectionFlagged,
    Section,
    Field,
    AddRow,
    RemoveRow,
    LineBubble,
    AutoTextarea,
  } = chrome

  return (
    <>
      {EXTRA_SECTIONS.map((spec) => {
        const items = resume[spec.key] as Array<Record<string, unknown>>

        /*
          Hidden when empty, unless the CV is being written from nothing.

          Six always-visible headings would treble the length of a panel whose job is to be scanned,
          for a CV that has none of them — which is most CVs. They appear the moment the document has
          one, which is the only moment they mean anything. In `authoring` there is no document to
          have read, so every section shows and the empty lines are the instructions.
        */
        if (items.length === 0 && !authoring) return null

        const write = (next: Array<Record<string, unknown>>) =>
          onChange({ ...resume, [spec.key]: next })
        const patch = (at: number, values: Record<string, unknown>) =>
          write(
            items.map((item, i) => (i === at ? { ...item, ...values } : item)),
          )

        return (
          <Section
            key={spec.key}
            title={spec.title}
            count={items.length}
            flagged={sectionFlagged(spec.key)}
            defaultOpen={authoring || sectionFlagged(spec.key) > 0}
          >
            {items.length === 0 && (
              <p className="text-[13px] leading-relaxed text-ink-soft">
                {spec.empty}
              </p>
            )}

            {items.map((item, i) => (
              <div
                key={i}
                className="flex flex-col gap-3 border-l-2 border-l-hairline pl-3.5"
              >
                {spec.fields.map((field) => {
                  const path = `${spec.key}.${i}.${field.key}`
                  const value = text(item[field.key])
                  if (field.kind === 'date') {
                    return (
                      <DateField
                        key={field.key}
                        label={field.label}
                        value={value}
                        onChange={(next) =>
                          patch(i, {
                            [field.key]: next === '' ? undefined : next,
                          })
                        }
                        provenance={index.get(path)}
                        {...(field.openEnded === undefined
                          ? {}
                          : { openEndedLabel: field.openEnded })}
                      />
                    )
                  }
                  return (
                    <Field
                      key={field.key}
                      label={field.label}
                      value={value}
                      onChange={(next) =>
                        /*
                          Empty means absent, not empty-string. Every one of these but the first is
                          `.optional()`, and writing `''` into one puts a blank issuer on the page
                          where the template checks for `undefined` before drawing the separator.
                        */
                        patch(i, {
                          [field.key]: next === '' ? undefined : next,
                        })
                      }
                      provenance={index.get(path)}
                    />
                  )
                })}

                {spec.lines !== undefined && (
                  <>
                    {lines(item[spec.lines.key]).map((line, j) => (
                      <LineBubble
                        key={j}
                        removeLabel={`Remove ${spec.lines?.one} ${j + 1}`}
                        onRemove={() =>
                          patch(i, {
                            [spec.lines!.key]: lines(
                              item[spec.lines!.key],
                            ).filter((_, k) => k !== j),
                          })
                        }
                      >
                        <label className="flex flex-col gap-1.5">
                          <span className="text-[13px] font-semibold text-ink">
                            {spec.lines?.label} {j + 1}
                          </span>
                          <AutoTextarea
                            value={line}
                            onChange={(next) =>
                              patch(i, {
                                [spec.lines!.key]: lines(
                                  item[spec.lines!.key],
                                ).map((old, k) => (k === j ? next : old)),
                              })
                            }
                            className={fieldClass(
                              `${spec.key}.${i}.${spec.lines?.key}.${j}`,
                            )}
                          />
                        </label>
                      </LineBubble>
                    ))}
                    <AddRow
                      label={`Add a ${spec.lines.one}`}
                      onClick={() =>
                        patch(i, {
                          [spec.lines!.key]: [
                            ...lines(item[spec.lines!.key]),
                            '',
                          ],
                        })
                      }
                    />
                  </>
                )}

                <RemoveRow
                  label={`Remove this ${spec.one}`}
                  onClick={() => write(items.filter((_, k) => k !== i))}
                />
              </div>
            ))}

            <AddRow
              label={`Add a ${spec.one}`}
              onClick={() => write([...items, spec.blank()])}
            />
          </Section>
        )
      })}
    </>
  )
}

/** Exported for the test that asserts no schema list is left without an editor. */
export { needsReview }
