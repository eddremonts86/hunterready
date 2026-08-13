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
import { Document, Page } from '@/lib/pdf-primitives'
import { PdfcnThemeProvider } from '@/components/pdf/theme-provider'
import type { PdfcnTheme } from '@/components/pdf/theme-types'
import type { Resume, WorkItem } from '@/schema/resume'
import {
  formatLocation,
  formatRange,
  formatYearMonth,
  joinParts,
} from '../format'

export type Convention = 'intl' | 'eu'

interface BodyProps {
  resume: Resume
  theme: PdfcnTheme
  convention: Convention
}

/** Section heading + hairline. Standard wording; creative headings lose ATS parsers. */
function SectionHeading({
  title,
  theme,
}: {
  title: string
  theme: PdfcnTheme
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        marginTop: theme.spacing.sectionGap,
      }}
    >
      {/**
       * NO letter-spacing here, and it is not a style preference.
       *
       * The Block 5 round-trip test caught this on its first run: `letterSpacing: 1.2` made
       * the renderer position every glyph individually, and the text extractor read the
       * heading back as "E x p e r i e n c e". The heading looks perfect on screen while an
       * ATS searching for the Experience section finds nothing — a CV-killing defect that is
       * invisible to the eye. Tracked headings are a nice-to-have; being parseable is the
       * product. See rule 13 in docs/05-pdf-rendering.md.
       */}
      <div
        style={{
          fontFamily: theme.typography.heading.fontFamily,
          fontSize: theme.typography.heading.fontSize.h2,
          fontWeight: theme.typography.heading.fontWeight,
          color: theme.colors.foreground,
          textTransform: 'uppercase',
        }}
      >
        {title}
      </div>
      <div style={{ height: 1, backgroundColor: theme.colors.border }} />
    </div>
  )
}

function Bullet({ text, theme }: { text: string; theme: PdfcnTheme }) {
  return (
    <div
      style={{ display: 'flex', flexDirection: 'row', gap: 5, marginTop: 2 }}
    >
      <div style={{ color: theme.colors.mutedForeground }}>•</div>
      <div style={{ flexGrow: 1 }}>{text}</div>
    </div>
  )
}

function Job({ item, theme }: { item: WorkItem; theme: PdfcnTheme }) {
  const meta = joinParts([
    formatRange(item.startDate, item.endDate),
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
      <div style={{ fontWeight: 700 }}>
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

function Body({ resume, theme, convention }: BodyProps) {
  const { basics } = resume
  const showPersonalDetails =
    convention === 'eu' && basics.personalDetails.length > 0

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
      }}
    >
      {/* Name and contact are text, never an image — an ATS drops image headers whole. */}
      <div
        style={{
          fontFamily: theme.typography.heading.fontFamily,
          fontSize: theme.typography.heading.fontSize.h1,
          fontWeight: theme.typography.heading.fontWeight,
          lineHeight: theme.typography.heading.lineHeight,
        }}
      >
        {basics.fullName}
      </div>

      {basics.headline === undefined ? null : (
        <div style={{ marginTop: 3, color: theme.colors.mutedForeground }}>
          {basics.headline}
        </div>
      )}

      {contact === '' ? null : (
        <div
          style={{
            marginTop: 5,
            fontSize: theme.typography.body.fontSize - 1,
            color: theme.colors.mutedForeground,
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
            color: theme.colors.mutedForeground,
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
            color: theme.colors.mutedForeground,
          }}
        >
          {joinParts(
            basics.personalDetails.map((d) => `${d.label}: ${d.value}`),
          )}
        </div>
      ) : null}

      {basics.summary === undefined ? null : (
        <div style={{ marginTop: theme.spacing.paragraphGap + 4 }}>
          {basics.summary}
        </div>
      )}

      {resume.work.length === 0 ? null : (
        <>
          <SectionHeading title="Experience" theme={theme} />
          {resume.work.map((w, i) => (
            <Job key={i} item={w} theme={theme} />
          ))}
        </>
      )}

      {resume.education.length === 0 ? null : (
        <>
          <SectionHeading title="Education" theme={theme} />
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
                  formatRange(e.startDate, e.endDate),
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

      {resume.skills.length === 0 ? null : (
        <>
          <SectionHeading title="Skills" theme={theme} />
          {resume.skills.map((group, i) => (
            // Comma-separated text, never bars or dots: rating graphics extract as noise.
            <div key={i} style={{ marginTop: 4, breakInside: 'avoid' }}>
              <span style={{ fontWeight: 700 }}>{group.category}: </span>
              <span>{group.items.join(', ')}</span>
            </div>
          ))}
        </>
      )}

      {resume.projects.length === 0 ? null : (
        <>
          <SectionHeading title="Projects" theme={theme} />
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
              {p.description === undefined ? null : <div>{p.description}</div>}
              {p.highlights.map((h, j) => (
                <Bullet key={j} text={h} theme={theme} />
              ))}
            </div>
          ))}
        </>
      )}

      {resume.certifications.length === 0 ? null : (
        <>
          <SectionHeading title="Certifications" theme={theme} />
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

      {resume.languages.length === 0 ? null : (
        <>
          <SectionHeading title="Languages" theme={theme} />
          <div style={{ marginTop: 4 }}>
            {joinParts(
              resume.languages.map((l) => {
                const level = l.level ?? l.raw
                return level === undefined ? l.name : `${l.name} (${level})`
              }),
            )}
          </div>
        </>
      )}

      {resume.custom.map((section, i) => (
        <Fragment key={i}>
          <SectionHeading title={section.title} theme={theme} />
          {section.items.map((item, j) => (
            <Bullet key={j} text={item} theme={theme} />
          ))}
        </Fragment>
      ))}
    </div>
  )
}

/** `(resume, theme) => JSX`. Page geometry comes from the render options, not from here. */
export function createModernTemplate(convention: Convention) {
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
            <Body resume={resume} theme={theme} convention={convention} />
          </PdfcnThemeProvider>
        </Page>
      </Document>
    )
  }
}
