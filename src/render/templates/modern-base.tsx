/**
 * The shared skeleton behind `modern-intl` and `modern-eu` (ADR-010).
 *
 * One layout, two conventions: the international variant omits the photo and the
 * personal-details block, the European variant includes them. Everything else is identical,
 * because the difference between those two markets is *what you are allowed to state*, not
 * how a CV should be typeset.
 *
 * Bound by the ATS ruleset (docs/05-pdf-rendering.md), which is not negotiable per template:
 * single column, contact details as text, standard section headings, `MMM YYYY` dates, no
 * skill rating bars, and `KeepTogether` around every work entry so a job never splits across
 * a page boundary.
 *
 * Colors come only from the theme, and every theme is restricted to print-side tokens — so
 * DESIGN.md's Amber Never Touches The Print Rule holds structurally rather than by review.
 */
import { Fragment } from 'react'
import { Document, Image, Page } from '@/lib/pdf-primitives'
import { PdfcnThemeProvider } from '@/components/pdf/theme-provider'
import type { PdfcnTheme } from '@/components/pdf/theme-types'
import { Spacer } from './spacer'
import { Ordered, Slot } from '../sections'
import { isSpacer } from '@/schema/resume'
import type { Resume, WorkItem } from '@/schema/resume'
import {
  formatLocation,
  formatRange,
  resolveLocale,
  formatYearMonth,
  joinParts,
} from '../format'
import { strings } from '../locale'
import type { OutputLocale } from '../locale'
import { sectionAccent, styleOf } from '../themes/style'
import type { SectionKind } from '../themes/style'

export type Convention = 'intl' | 'eu'

/**
 * Which section a reader meets first, after the summary.
 *
 * The only axis that produces genuinely different **structures** without leaving the ATS ruleset. One
 * column, standard headings, contact as text and a single reading order are all binding (docs/05), so a
 * template cannot move a block into a sidebar or a table — but which order the blocks appear in is free,
 * and it is the difference between a CV that argues for a career change and one that recites a history.
 *
 *   • `experience` — the default, and right for anybody continuing in their field.
 *   • `skills` — for a career switcher, whose transferable skills are the argument and whose last job
 *     title is the thing they are trying to move away from. Burying the skills under it is the wrong
 *     order for exactly the person who needs the most help.
 *   • `education` — for a recent graduate or someone newly qualified, where the qualification *is* the
 *     credential and the work history is bar shifts.
 *
 * Reading order is asserted by the round-trip test for every one of them, because reordering blocks is
 * precisely the sort of change that looks fine and scrambles a text layer.
 */
export type SectionOrder = 'experience' | 'skills' | 'education'

/**
 * The printed size of the photo, in points, and the only place it is written down.
 *
 * `fit.ts` imports it, because a page-count estimate that does not know how tall the masthead is will
 * confidently print "1 page" over a two-page document. Two copies of this number would drift the first
 * time somebody adjusted one, and the symptom would be a label that lies — which is the one thing this
 * product cannot afford to ship.
 *
 * 78pt ≈ 27.5mm, the size a European CV photo is expected to be. Raising it is a one-line change here,
 * and the estimate follows automatically — but measure the page count first: the nurse fixture fits on one
 * page at 78 and spills onto a second at 120.
 */
export const PHOTO_BOX_PT = 78

interface BodyProps {
  resume: Resume
  theme: PdfcnTheme
  convention: Convention
  order: SectionOrder
}

/**
 * Section heading, drawn the way this theme draws them. Standard wording always — creative heading
 * *text* loses ATS parsers (docs/05) — but everything around the words belongs to the theme: a teal
 * bar, a navy underline, a solid green band, a maroon title between hairlines, a slate box.
 *
 * NO letter-spacing anywhere in here, and it is not a style preference. The Block 5 round-trip test
 * caught `letterSpacing: 1.2` making the renderer position every glyph individually — the extractor
 * read "E x p e r i e n c e" and an ATS searching for the Experience section would find nothing. That
 * is why the style system offers bands and bars in the first place: they are the identity tools that
 * cannot touch the text layer. See rule 13 in docs/05-pdf-rendering.md.
 */
function SectionHeading({
  title,
  theme,
  kind = 'other',
}: {
  title: string
  theme: PdfcnTheme
  /** Which section this opens — themes with `sectionAccents` paint each kind its own hue. */
  kind?: SectionKind
}) {
  const style = styleOf(theme)
  const accent = sectionAccent(style, kind)
  const words = (
    <div
      style={{
        fontFamily: theme.typography.heading.fontFamily,
        fontSize: theme.typography.heading.fontSize.h2,
        fontWeight: theme.typography.heading.fontWeight,
        color:
          style.heading === 'band'
            ? style.onAccent
            : style.headingInAccent
              ? accent
              : theme.colors.foreground,
        textTransform: 'uppercase',
      }}
    >
      {title}
    </div>
  )

  const wrap = (children: React.ReactNode) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        marginTop: theme.spacing.sectionGap,
      }}
    >
      {children}
    </div>
  )

  switch (style.heading) {
    case 'band':
      // Solid accent, heading in onAccent. The band is a painted box; the words inside extract as text.
      return wrap(
        <div
          style={{
            display: 'flex',
            backgroundColor: accent,
            paddingTop: 3,
            paddingBottom: 3,
            paddingLeft: 8,
            paddingRight: 8,
          }}
        >
          {words}
        </div>,
      )
    case 'tint':
      return wrap(
        <div
          style={{
            display: 'flex',
            backgroundColor: style.accentWash,
            paddingTop: 2.5,
            paddingBottom: 2.5,
            paddingLeft: 7,
            paddingRight: 7,
          }}
        >
          {words}
        </div>,
      )
    case 'bar':
      return wrap(
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 7,
          }}
        >
          <div style={{ width: 4, height: 11, backgroundColor: accent }} />
          {words}
        </div>,
      )
    case 'underline':
      return wrap(
        <>
          {words}
          <div style={{ height: 2, backgroundColor: accent }} />
        </>,
      )
    case 'shortline':
      return wrap(
        <>
          {words}
          <div style={{ width: 34, height: 3, backgroundColor: accent }} />
        </>,
      )
    case 'flanked':
      // Centered title with a hairline on each side. The flanking lines are empty flex children.
      return wrap(
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div
            style={{
              flexGrow: 1,
              height: 1,
              backgroundColor: theme.colors.border,
            }}
          />
          {words}
          <div
            style={{
              flexGrow: 1,
              height: 1,
              backgroundColor: theme.colors.border,
            }}
          />
        </div>,
      )
    case 'framed':
      return wrap(
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignSelf: 'flex-start',
            border: `1px solid ${accent}`,
            paddingTop: 2,
            paddingBottom: 2,
            paddingLeft: 7,
            paddingRight: 7,
          }}
        >
          {words}
        </div>,
      )
    case 'plain':
      return wrap(words)
    case 'hairline':
    default:
      return wrap(
        <>
          {words}
          <div style={{ height: 1, backgroundColor: theme.colors.border }} />
        </>,
      )
  }
}

function Bullet({ text, theme }: { text: string; theme: PdfcnTheme }) {
  const style = styleOf(theme)
  return (
    <div
      style={{ display: 'flex', flexDirection: 'row', gap: 5, marginTop: 2 }}
    >
      {/* Always the `•` glyph — parsers key on it. Only its ink is the theme's to choose. */}
      <div
        style={{
          color: style.bulletsInAccent
            ? style.accent
            : theme.colors.mutedForeground,
        }}
      >
        •
      </div>
      <div style={{ flexGrow: 1 }}>{text}</div>
    </div>
  )
}

function Job({
  item,
  theme,
  locale,
}: {
  item: WorkItem
  theme: PdfcnTheme
  locale: OutputLocale
}) {
  const meta = joinParts([
    formatRange(item.startDate, item.endDate, locale),
    item.location,
    item.remote === true ? 'Remote' : undefined,
  ])

  return (
    // The single most-noticed layout bug in a CV is a job entry split by a page break.
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        marginTop: theme.spacing.componentGap,
        breakInside: 'avoid',
      }}
    >
      <div
        style={{
          fontWeight: 700,
          color: styleOf(theme).roleInAccent
            ? styleOf(theme).accent
            : theme.colors.foreground,
        }}
      >
        {item.role} — {item.company}
      </div>
      {meta === '' ? null : (
        <div
          style={{
            fontSize: theme.typography.body.fontSize - 1.5,
            color: theme.colors.mutedForeground,
          }}
        >
          {meta}
        </div>
      )}
      {item.summary === undefined ? null : (
        <div style={{ marginTop: 3, color: theme.colors.mutedForeground }}>
          {item.summary}
        </div>
      )}
      {item.highlights.map((h, i) => (
        <Bullet key={i} text={h} theme={theme} />
      ))}
    </div>
  )
}

function Body({ resume, theme, convention, order }: BodyProps) {
  const { basics } = resume
  const showPersonalDetails =
    convention === 'eu' && basics.personalDetails.length > 0
  /**
   * The photo, and the only image this system will ever draw (docs/05).
   *
   * European convention only. `modern-intl` ignores it even when one is set, which is the entire reason
   * two templates exist: US and UK guidance is to leave a photo off, and several screeners drop a
   * document with an image in the header region. Somebody who has uploaded a photo and then chooses the
   * international layout has not made a mistake to be corrected — they have chosen a convention.
   */
  const showPhoto = convention === 'eu' && basics.photoUrl !== undefined

  /**
   * The document's language, from the CV's own `locale` — v0.8.
   *
   * Section headings and dates only. The candidate's words are never translated: a mistranslated job
   * title is a wrong claim about their career, and no guard here could catch it. Rendering a Danish CV
   * with an English `Experience` heading was the defect — docs/05 clause 6 wants the heading the local
   * screener has seen a thousand times, which in Denmark is `Erfaring`.
   */
  const locale = resolveLocale(resume.locale)
  const local = strings(locale)

  const style = styleOf(theme)
  const mastheadStyle = style.masthead
  /**
   * Secondary text inside the masthead. On paper it is the muted grey; inside a dark accent band that
   * grey would sit at 2:1 and disappear, so the band swaps it for the band's own foreground.
   */
  const mastheadMuted =
    mastheadStyle === 'band' ? style.onAccent : theme.colors.mutedForeground

  const contact = joinParts([
    basics.email,
    basics.phone,
    formatLocation(basics.location),
  ])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        fontFamily: theme.typography.body.fontFamily,
        fontSize: theme.typography.body.fontSize,
        lineHeight: theme.typography.body.lineHeight,
        color: theme.colors.foreground,
        // The anchor for the watermark geometry below; harmless when there is none.
        position: 'relative',
      }}
    >
      {/*
        The watermark, first in the tree so every glyph paints over it. Geometry only: takumi draws no
        SVG images, and a text watermark would dump giant letters into the extraction. It appears once,
        behind the masthead region, like a letterhead — not tiled per page.
      */}
      {style.watermark === 'disc' ? (
        <div
          style={{
            position: 'absolute',
            top: -30,
            right: -20,
            width: 230,
            height: 230,
            borderRadius: 230,
            backgroundColor: style.accent,
            opacity: 0.07,
          }}
        />
      ) : null}
      {style.watermark === 'rings' ? (
        <>
          <div
            style={{
              position: 'absolute',
              top: -20,
              right: -10,
              width: 190,
              height: 190,
              borderRadius: 190,
              border: `10px solid ${style.accent}`,
              opacity: 0.09,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 40,
              right: 60,
              width: 90,
              height: 90,
              borderRadius: 90,
              border: `7px solid ${style.accent}`,
              opacity: 0.12,
            }}
          />
        </>
      ) : null}
      {/*
        The masthead becomes a row when there is a photo, and the photo is the **last** child.

        Reading order is the reason, not aesthetics. docs/05 clause: one reading order, and a parser walks
        the document in DOM order — so the name, the contact line and the links must all be extracted
        before anything image-shaped is reached. Putting the photo first would place an unparseable object
        at the very top of the region every screener looks at for a name.

        `flexDirection: row` with the text column growing: flexbox only, no grid (Satori lineage).
      */}
      {/*
        The masthead's construction is the theme's single loudest choice, so it is the theme's to make:

          plain     — the classic left-set name.
          centered  — the formal page; contact centered under the name.
          band      — the whole masthead painted in the accent, text in onAccent. Executive's signature.
          sideline  — a thick accent bar down the masthead's left edge.

        Whatever the paint, the DOM order never moves: name, headline, contact, links, details, then the
        photo LAST — a parser walks this in DOM order and must meet the name before anything image-shaped
        (docs/05). The band and sideline are painted boxes around the same text in the same order.
      */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: mastheadStyle === 'band' ? 'center' : 'flex-start',
          gap: showPhoto ? 14 : 0,
          ...(mastheadStyle === 'band'
            ? {
                backgroundColor: style.mastheadAccent ?? style.accent,
                paddingTop: 14,
                paddingBottom: 14,
                paddingLeft: 16,
                paddingRight: 16,
              }
            : {}),
          ...(mastheadStyle === 'sideline'
            ? { borderLeft: `4px solid ${style.accent}`, paddingLeft: 12 }
            : {}),
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            // `minWidth: 0` so a long headline wraps instead of pushing the photo off the page.
            minWidth: 0,
            ...(mastheadStyle === 'centered' && !showPhoto
              ? { alignItems: 'center', textAlign: 'center' }
              : {}),
          }}
        >
          {/* Name and contact are text, never an image — an ATS drops image headers whole. */}
          <div
            style={{
              // A display or script face for the name only, when the theme sets one (style axis 3).
              fontFamily:
                style.nameFontFamily ?? theme.typography.heading.fontFamily,
              fontSize: theme.typography.heading.fontSize.h1,
              fontWeight:
                style.nameFontFamily === undefined
                  ? theme.typography.heading.fontWeight
                  : 400,
              lineHeight: theme.typography.heading.lineHeight,
              color:
                mastheadStyle === 'band'
                  ? style.onAccent
                  : style.nameInAccent
                    ? style.accent
                    : theme.colors.foreground,
            }}
          >
            {basics.fullName}
          </div>

          {basics.headline === undefined ? null : (
            <div style={{ marginTop: 3, color: mastheadMuted }}>
              {basics.headline}
            </div>
          )}

          {contact === '' ? null : (
            <div
              style={{
                marginTop: 5,
                fontSize: theme.typography.body.fontSize - 1,
                color: mastheadMuted,
              }}
            >
              {contact}
            </div>
          )}

          {basics.links.length === 0 ? null : (
            <div
              style={{
                marginTop: 2,
                fontSize: theme.typography.body.fontSize - 1,
                color: mastheadMuted,
              }}
            >
              {/* The URL is spelled out: a bare "LinkedIn" label extracts as nothing useful. */}
              {joinParts(basics.links.map((l) => `${l.label}: ${l.url}`))}
            </div>
          )}

          {showPersonalDetails ? (
            <div
              style={{
                marginTop: 5,
                fontSize: theme.typography.body.fontSize - 1,
                color: mastheadMuted,
              }}
            >
              {joinParts(
                basics.personalDetails.map((d) => `${d.label}: ${d.value}`),
              )}
            </div>
          ) : null}
        </div>

        {showPhoto ? (
          <Image
            src={basics.photoUrl as string}
            style={{
              /*
                A fixed square, in points. 78pt is about 27mm — the size a European CV photo is expected
                to be, and small enough that it cannot push the name's column narrow enough to wrap badly.

                No border radius: a circular crop is a design flourish on a document that must survive a
                parser, and the renderer's clipping is one more thing that can differ between the preview
                and the PDF. The crop itself already happened in the browser, so this is a plain square.
              */
              width: PHOTO_BOX_PT,
              height: PHOTO_BOX_PT,
              // Preserves the subject when the source was not perfectly square after all.
              objectFit: 'cover',
            }}
          />
        ) : null}
      </div>

      {basics.summary === undefined ? null : (
        <div style={{ marginTop: theme.spacing.paragraphGap + 4 }}>
          {basics.summary}
        </div>
      )}

      {/*
        Every section below the header, in the order the *document* asks for.

        Held as variables and then placed, rather than duplicated per order: three copies of the work
        section is three places for a future date-format fix to be forgotten, and this is the block the
        round-trip test is most particular about. `Ordered` reads the tags and emits them in sequence;
        the blocks themselves are untouched by it (src/render/sections.tsx).
      */}
      {(() => {
        const work = (
          <>
            {resume.work.length === 0 ? null : (
              <>
                <SectionHeading
                  title={local.headings.work}
                  theme={theme}
                  kind="work"
                />
                {resume.work.map((w, i) => (
                  <Job key={i} item={w} theme={theme} locale={locale} />
                ))}
              </>
            )}
          </>
        )
        const education = (
          <>
            {resume.education.length === 0 ? null : (
              <>
                <SectionHeading
                  title={local.headings.education}
                  theme={theme}
                  kind="education"
                />
                {resume.education.map((e, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1,
                      marginTop: theme.spacing.componentGap,
                      breakInside: 'avoid',
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>
                      {joinParts([e.degree, e.field], ' ')}
                      {e.degree === undefined && e.field === undefined
                        ? e.institution
                        : ` — ${e.institution}`}
                    </div>
                    <div
                      style={{
                        fontSize: theme.typography.body.fontSize - 1.5,
                        color: theme.colors.mutedForeground,
                      }}
                    >
                      {joinParts([
                        formatRange(e.startDate, e.endDate, locale),
                        e.location,
                        e.grade,
                      ])}
                    </div>
                    {e.highlights.map((h, j) => (
                      <Bullet key={j} text={h} theme={theme} />
                    ))}
                  </div>
                ))}
              </>
            )}
          </>
        )
        const skills = (
          <>
            {resume.skills.length === 0 ? null : (
              <>
                <SectionHeading
                  title={local.headings.skills}
                  theme={theme}
                  kind="skills"
                />
                {resume.skills.map((group, i) => (
                  // Comma-separated text, never bars or dots: rating graphics extract as noise.
                  <div key={i} style={{ marginTop: 4, breakInside: 'avoid' }}>
                    <span style={{ fontWeight: 700 }}>{group.category}: </span>
                    <span>{group.items.join(', ')}</span>
                  </div>
                ))}
              </>
            )}
          </>
        )
        /* Awards and publications are `{ title, items }`, exactly like a custom section. */
        const grouped = (title: string, sections: Resume['awards']) =>
          sections.length === 0 ? null : (
            <>
              {sections.map((section, i) => (
                <Fragment key={i}>
                  <SectionHeading
                    title={section.title || title}
                    theme={theme}
                  />
                  {section.items.map((item, j) => (
                    <Bullet key={j} text={item} theme={theme} />
                  ))}
                </Fragment>
              ))}
            </>
          )

        return (
          <Ordered
            resume={resume}
            fallback={order}
            custom={(section, i) =>
              /* A spacer draws room and no words at all — see templates/spacer.tsx. */
              isSpacer(section) ? (
                <Spacer key={i} space={section.space} />
              ) : (
                <Fragment key={i}>
                  <SectionHeading title={section.title} theme={theme} />
                  {section.items.map((item, j) => (
                    <Bullet key={j} text={item} theme={theme} />
                  ))}
                </Fragment>
              )
            }
          >
            <Slot name="work">{work}</Slot>
            <Slot name="education">{education}</Slot>
            <Slot name="skills">{skills}</Slot>
            <Slot name="projects">
              {resume.projects.length === 0 ? null : (
                <>
                  <SectionHeading
                    title={local.headings.projects}
                    theme={theme}
                  />
                  {resume.projects.map((p, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                        marginTop: theme.spacing.componentGap,
                        breakInside: 'avoid',
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>
                        {joinParts([p.name, p.role], ' — ')}
                      </div>
                      {p.description === undefined ? null : (
                        <div>{p.description}</div>
                      )}
                      {p.highlights.map((h, j) => (
                        <Bullet key={j} text={h} theme={theme} />
                      ))}
                    </div>
                  ))}
                </>
              )}
            </Slot>
            <Slot name="certifications">
              {resume.certifications.length === 0 ? null : (
                <>
                  <SectionHeading
                    title={local.headings.certifications}
                    theme={theme}
                  />
                  {resume.certifications.map((c, i) => (
                    <div key={i} style={{ marginTop: 3, breakInside: 'avoid' }}>
                      {joinParts([c.name, c.issuer], ' — ')}
                      <span style={{ color: theme.colors.mutedForeground }}>
                        {c.date === undefined
                          ? ''
                          : `  ${formatYearMonth(c.date)}`}
                        {c.identifier === undefined
                          ? ''
                          : `  (${c.identifier})`}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </Slot>
            <Slot name="languages">
              {resume.languages.length === 0 ? null : (
                <>
                  <SectionHeading
                    title={local.headings.languages}
                    theme={theme}
                  />
                  <div style={{ marginTop: 4 }}>
                    {joinParts(
                      resume.languages.map((l) => {
                        const level = l.level ?? l.raw
                        return level === undefined
                          ? l.name
                          : `${l.name} (${level})`
                      }),
                    )}
                  </div>
                </>
              )}
            </Slot>
            {/*
              Three sections that until now were in the schema, filled by extraction, printed by the
              `.docx` export — and rendered by no PDF template at all. A candidate's awards reached
              their Word file and silently did not reach their PDF.
            */}
            <Slot name="awards">
              {grouped(local.headings.awards, resume.awards)}
            </Slot>
            <Slot name="publications">
              {grouped(local.headings.publications, resume.publications)}
            </Slot>
            <Slot name="volunteer">
              {resume.volunteer.length === 0 ? null : (
                <>
                  <SectionHeading
                    title={local.headings.volunteer}
                    theme={theme}
                  />
                  {resume.volunteer.map((v, i) => (
                    <Job key={i} item={v} theme={theme} locale={locale} />
                  ))}
                </>
              )}
            </Slot>
          </Ordered>
        )
      })()}
    </div>
  )
}

/**
 * `(resume, theme) => JSX`. Page geometry comes from the theme, not from here.
 *
 * Two axes, and both are structural rather than cosmetic: the **convention** decides which blocks exist at
 * all (the photo and the personal details, ADR-010), and the **order** decides which the reader meets
 * first. Colour, type and spacing are the theme's business, which is what lets one factory produce every
 * structure in the catalogue without a file per entry.
 */
export function createModernTemplate(
  convention: Convention,
  order: SectionOrder = 'experience',
) {
  return function ModernTemplate({
    resume,
    theme,
  }: {
    resume: Resume
    theme: PdfcnTheme
  }) {
    return (
      <Document
        title={`${resume.basics.fullName} — ${resume.basics.headline ?? 'CV'}`}
      >
        <Page>
          <PdfcnThemeProvider theme={theme}>
            <Body
              resume={resume}
              theme={theme}
              convention={convention}
              order={order}
            />
          </PdfcnThemeProvider>
        </Page>
      </Document>
    )
  }
}
