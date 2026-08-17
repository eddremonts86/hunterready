/**
 * `sidebar` — the two-column CV every reference gallery sells, built the least dishonest way it can be.
 *
 * ## What this is and is not
 *
 * A full-height colored column on the left — photo, contact, skills, languages — beside a white main
 * column with the name, summary and history. It is the layout of Edd's reference sheet: the dark-panel
 * CVs from Zety, Resume Sector and CV Genius, and of his own two-tone CV.
 *
 * It is registered **`design-first`, not `verified`**, and the warning says why in plain language: some
 * screening systems read a page line by line across its full width, which interleaves a sidebar with the
 * main column and scrambles both. That is a real risk this layout carries everywhere it is sold; the
 * difference here is that it is printed on the card rather than hidden under "ATS-friendly!!".
 *
 * ## The construction still fights for the parser
 *
 * Being honest about the risk is not a licence to make it worse, so every choice below minimizes it:
 *
 *   - **DOM order is resume order.** The main column — name, headline, summary, experience, education —
 *     comes FIRST in the tree; the sidebar comes last. `flexDirection: 'row-reverse'` puts the sidebar on
 *     the visual left anyway. A content-order extractor (unpdf, pdftotext without -layout, most modern
 *     parsers) therefore reads the whole career before the first sidebar item, and the round-trip suite
 *     — which this template passes in full, reading order included — proves it on every build.
 *   - Contact details are text, the photo is `objectFit: cover` on a plain box, headings are the
 *     standard words in the document's own language. Every ATS rule that can hold in two columns holds.
 *
 * The full-height column is the same measured construction as the tinted papers (ADR-025): the renderer
 * measures the tree, grows the row to a whole number of pages, and paints the vertical margins with a
 * split band — sidebar-colored on the left, paper on the right — so the column reaches every page edge.
 */
import { Fragment } from 'react'
import { Document, Image, Page } from '@/lib/pdf-primitives'
import { PdfcnThemeProvider } from '@/components/pdf/theme-provider'
import type { PdfcnTheme } from '@/components/pdf/theme-types'
import { Spacer } from './spacer'
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
import type { DocumentStyle } from '../themes/style'

/** The colored column's width in px, including its padding. Wide enough for a phone number, no wider. */
export const SIDEBAR_WIDTH = 176

/** The color the sidebar paints with — one place, because the renderer's margin bands must match it. */
export function sidebarGround(style: DocumentStyle): string {
  return style.mastheadAccent ?? style.accent
}

/** A sidebar heading: small caps in the column's own light ink, with a hairline of the same. */
function SideHeading({ title, theme }: { title: string; theme: PdfcnTheme }) {
  const style = styleOf(theme)
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        marginTop: 14,
      }}
    >
      <div
        style={{
          fontFamily: theme.typography.heading.fontFamily,
          fontSize: theme.typography.heading.fontSize.h2 - 0.5,
          fontWeight: theme.typography.heading.fontWeight,
          color: style.onAccent,
          textTransform: 'uppercase',
        }}
      >
        {title}
      </div>
      <div
        style={{ height: 1, backgroundColor: style.onAccent, opacity: 0.35 }}
      />
    </div>
  )
}

/** A main-column heading. The theme's treatment, driven by the same style axes as modern-base. */
function MainHeading({
  title,
  theme,
  kind = 'other',
}: {
  title: string
  theme: PdfcnTheme
  kind?: 'work' | 'education' | 'skills' | 'other'
}) {
  const style = styleOf(theme)
  const accent = sectionAccent(style, kind)
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        marginTop: theme.spacing.sectionGap,
      }}
    >
      <div
        style={{
          fontFamily: theme.typography.heading.fontFamily,
          fontSize: theme.typography.heading.fontSize.h2,
          fontWeight: theme.typography.heading.fontWeight,
          color: style.headingInAccent ? accent : theme.colors.foreground,
          textTransform: 'uppercase',
        }}
      >
        {title}
      </div>
      <div style={{ height: 2, backgroundColor: accent }} />
    </div>
  )
}

function Bullet({ text, theme }: { text: string; theme: PdfcnTheme }) {
  const style = styleOf(theme)
  return (
    <div
      style={{ display: 'flex', flexDirection: 'row', gap: 5, marginTop: 2 }}
    >
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
  const style = styleOf(theme)
  const meta = joinParts([
    formatRange(item.startDate, item.endDate, locale),
    item.location,
    item.remote === true ? 'Remote' : undefined,
  ])
  return (
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
          color: style.roleInAccent ? style.accent : theme.colors.foreground,
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

export function SidebarBody({
  resume,
  theme,
  /**
   * Grow the row to this many px, set by the renderer after measuring so the colored column reaches the
   * bottom of the last page. The preview never passes it: there the column stretches to the content,
   * which is the truthful height of what has been laid out.
   */
  fillHeight,
}: {
  resume: Resume
  theme: PdfcnTheme
  fillHeight?: number
}) {
  const { basics } = resume
  const style = styleOf(theme)
  const ground = sidebarGround(style)
  const locale = resolveLocale(resume.locale)
  const local = strings(locale)

  const sideText = {
    color: style.onAccent,
    fontSize: theme.typography.body.fontSize - 1,
  }

  return (
    <div
      style={{
        display: 'flex',
        /*
          The honesty trick, recorded at length in the file comment: the MAIN column is the first child,
          so a content-order extractor reads the career before the sidebar. `row-reverse` puts the
          sidebar on the visual left regardless. Probed and then locked in by the round-trip suite's
          reading-order assertion.
        */
        flexDirection: 'row-reverse',
        alignItems: 'stretch',
        fontFamily: theme.typography.body.fontFamily,
        fontSize: theme.typography.body.fontSize,
        lineHeight: theme.typography.body.lineHeight,
        color: theme.colors.foreground,
        backgroundColor: theme.colors.background,
        ...(fillHeight === undefined ? {} : { height: fillHeight }),
      }}
    >
      {/* ── Main column: everything a screener must read, in resume order ── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          minWidth: 0,
          paddingTop: 6,
          paddingLeft: 22,
          paddingRight: 6,
        }}
      >
        <div
          style={{
            fontFamily:
              style.nameFontFamily ?? theme.typography.heading.fontFamily,
            fontSize: theme.typography.heading.fontSize.h1,
            fontWeight:
              style.nameFontFamily === undefined
                ? theme.typography.heading.fontWeight
                : 400,
            lineHeight: theme.typography.heading.lineHeight,
            color: style.nameInAccent ? style.accent : theme.colors.foreground,
          }}
        >
          {basics.fullName}
        </div>
        {basics.headline === undefined ? null : (
          <div style={{ marginTop: 3, color: theme.colors.mutedForeground }}>
            {basics.headline}
          </div>
        )}

        {basics.summary === undefined ? null : (
          <div style={{ marginTop: theme.spacing.paragraphGap + 4 }}>
            {basics.summary}
          </div>
        )}

        {resume.work.length === 0 ? null : (
          <>
            <MainHeading
              title={local.headings.work}
              theme={theme}
              kind="work"
            />
            {resume.work.map((w, i) => (
              <Job key={i} item={w} theme={theme} locale={locale} />
            ))}
          </>
        )}

        {resume.education.length === 0 ? null : (
          <>
            <MainHeading
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

        {resume.projects.length === 0 ? null : (
          <>
            <MainHeading title={local.headings.projects} theme={theme} />
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

        {resume.certifications.length === 0 ? null : (
          <>
            <MainHeading title={local.headings.certifications} theme={theme} />
            {resume.certifications.map((c, i) => (
              <div key={i} style={{ marginTop: 3, breakInside: 'avoid' }}>
                {joinParts([c.name, c.issuer], ' — ')}
                <span style={{ color: theme.colors.mutedForeground }}>
                  {c.date === undefined ? '' : `  ${formatYearMonth(c.date)}`}
                  {c.identifier === undefined ? '' : `  (${c.identifier})`}
                </span>
              </div>
            ))}
          </>
        )}

        {resume.custom.map((section, i) =>
          /* A spacer draws room and no words at all — see templates/spacer.tsx. */
          isSpacer(section) ? (
            <Spacer key={i} space={section.space} />
          ) : (
            <Fragment key={i}>
              <MainHeading title={section.title} theme={theme} />
              {section.items.map((item, j) => (
                <Bullet key={j} text={item} theme={theme} />
              ))}
            </Fragment>
          ),
        )}
      </div>

      {/* ── The colored column: identity and scannables. Last in DOM, left on the page ── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          backgroundColor: ground,
          paddingTop: 6,
          paddingBottom: 20,
          paddingLeft: 16,
          paddingRight: 16,
        }}
      >
        {basics.photoUrl === undefined ? null : (
          <Image
            src={basics.photoUrl}
            style={{
              width: SIDEBAR_WIDTH - 32,
              height: SIDEBAR_WIDTH - 32,
              objectFit: 'cover',
              marginBottom: 4,
            }}
          />
        )}

        <SideHeading title={local.headings.contact} theme={theme} />
        {[basics.email, basics.phone, formatLocation(basics.location)]
          .filter((line): line is string => line !== undefined && line !== '')
          .map((line, i) => (
            <div key={i} style={{ ...sideText, marginTop: 4 }}>
              {line}
            </div>
          ))}
        {basics.links.map((link, i) => (
          <div key={i} style={{ ...sideText, marginTop: 4 }}>
            {link.label}: {link.url}
          </div>
        ))}

        {basics.personalDetails.length === 0 ? null : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {basics.personalDetails.map((d, i) => (
              <div key={i} style={{ ...sideText, marginTop: 4 }}>
                {d.label}: {d.value}
              </div>
            ))}
          </div>
        )}

        {resume.skills.length === 0 ? null : (
          <>
            <SideHeading title={local.headings.skills} theme={theme} />
            {resume.skills.map((group, i) => (
              <div key={i} style={{ ...sideText, marginTop: 5 }}>
                <span style={{ fontWeight: 700 }}>{group.category}: </span>
                <span>{group.items.join(', ')}</span>
              </div>
            ))}
          </>
        )}

        {resume.languages.length === 0 ? null : (
          <>
            <SideHeading title={local.headings.languages} theme={theme} />
            <div style={{ ...sideText, marginTop: 4 }}>
              {joinParts(
                resume.languages.map((l) => {
                  const level = l.level ?? l.raw
                  return level === undefined ? l.name : `${l.name} (${level})`
                }),
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function SidebarTemplate({
  resume,
  theme,
  fillHeight,
}: {
  resume: Resume
  theme: PdfcnTheme
  fillHeight?: number
}) {
  return (
    <Document
      title={`${resume.basics.fullName} — ${resume.basics.headline ?? 'CV'}`}
    >
      <Page>
        <PdfcnThemeProvider theme={theme}>
          <SidebarBody resume={resume} theme={theme} fillHeight={fillHeight} />
        </PdfcnThemeProvider>
      </Page>
    </Document>
  )
}
