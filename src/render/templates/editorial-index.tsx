/**
 * `editorial-index` and `editorial-index-eu` templates.
 *
 * Direct recreation of the editorial slash-and-numbered index layout (Eduardo Inerarte reference CV).
 * Uses `/ KICKER` headings with trailing periods on section titles, numbered `/01` items,
 * and structured metadata blocks.
 *
 * Bound by the ATS ruleset (docs/05-pdf-rendering.md): single stream DOM reading order,
 * standard section heading names, text-only contact details, and `breakInside: avoid`.
 */
import { Fragment } from 'react'
import { Document, Image, Page } from '@/lib/pdf-primitives'
import { PdfcnThemeProvider } from '@/components/pdf/theme-provider'
import type { PdfcnTheme } from '@/components/pdf/theme-types'
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
import { PHOTO_BOX_PT } from './modern-base'
import type { Convention } from './modern-base'

function EditorialHeading({
  kicker,
  title,
  theme,
  kind = 'other',
}: {
  kicker?: string
  title: string
  theme: PdfcnTheme
  kind?: 'work' | 'education' | 'skills' | 'projects' | 'other'
}) {
  const style = styleOf(theme)
  const accent = sectionAccent(style, kind === 'projects' ? 'other' : kind)
  const periodTitle = title.endsWith('.') ? title : `${title}.`

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        marginTop: theme.spacing.sectionGap * 1.2,
      }}
    >
      {kicker ? (
        <div
          style={{
            fontSize: theme.typography.body.fontSize - 3,
            fontWeight: 700,
            color: accent,
            letterSpacing: 0,
            textTransform: 'uppercase',
          }}
        >
          {kicker.startsWith('/') ? kicker : `/ ${kicker}`}
        </div>
      ) : null}
      <div
        style={{
          fontFamily: theme.typography.heading.fontFamily,
          fontSize: theme.typography.heading.fontSize.h2 * 1.05,
          fontWeight: theme.typography.heading.fontWeight,
          color: style.headingInAccent ? accent : theme.colors.foreground,
        }}
      >
        {periodTitle}
      </div>
    </div>
  )
}

function IndexedJob({
  item,
  index,
  theme,
  locale,
}: {
  item: WorkItem
  index: number
  theme: PdfcnTheme
  locale: OutputLocale
}) {
  const style = styleOf(theme)
  const accent = sectionAccent(style, 'work')
  const indexStr = `/${String(index + 1).padStart(2, '0')}`
  const dateRange = formatRange(item.startDate, item.endDate, locale)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        marginTop: theme.spacing.componentGap * 1.1,
        breakInside: 'avoid',
      }}
    >
      {/* Top row: /01 index, date range, and role title */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: 6,
          }}
        >
          <span
            style={{
              fontSize: theme.typography.body.fontSize - 2,
              fontWeight: 700,
              color: accent,
            }}
          >
            {indexStr}
          </span>
          <span
            style={{
              fontWeight: 700,
              fontSize: theme.typography.body.fontSize + 0.5,
              color: style.roleInAccent ? accent : theme.colors.foreground,
            }}
          >
            {item.role}
          </span>
        </div>
        {dateRange !== '' ? (
          <span
            style={{
              fontSize: theme.typography.body.fontSize - 1.5,
              color: theme.colors.mutedForeground,
            }}
          >
            {dateRange}
          </span>
        ) : null}
      </div>

      {/* Company line */}
      <div
        style={{
          fontSize: theme.typography.body.fontSize - 1,
          fontWeight: 700,
          color: accent,
        }}
      >
        {joinParts(
          [item.company, item.location, item.remote ? 'Remote' : undefined],
          '  ·  ',
        )}
      </div>

      {item.summary ? (
        <div style={{ marginTop: 2, color: theme.colors.mutedForeground }}>
          {item.summary}
        </div>
      ) : null}

      {item.highlights.map((h, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: 6,
            marginTop: 2,
          }}
        >
          <div
            style={{
              color: style.bulletsInAccent
                ? accent
                : theme.colors.mutedForeground,
            }}
          >
            •
          </div>
          <div style={{ flexGrow: 1 }}>{h}</div>
        </div>
      ))}
    </div>
  )
}

function EditorialIndexBody({
  resume,
  theme,
  convention,
}: {
  resume: Resume
  theme: PdfcnTheme
  convention: Convention
}) {
  const { basics } = resume
  const style = styleOf(theme)
  const accent = style.accent
  const locale = resolveLocale(resume.locale)
  const local = strings(locale)
  const showPhoto = convention === 'eu' && basics.photoUrl !== undefined
  const showPersonalDetails =
    convention === 'eu' && basics.personalDetails.length > 0

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
      {/* ── Masthead ── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 16,
          paddingBottom: 10,
        }}
      >
        {showPhoto ? (
          <Image
            src={basics.photoUrl as string}
            style={{
              width: PHOTO_BOX_PT,
              height: PHOTO_BOX_PT,
              objectFit: 'cover',
              borderRadius: 4,
            }}
          />
        ) : null}

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontFamily:
                style.nameFontFamily ?? theme.typography.heading.fontFamily,
              fontSize: theme.typography.heading.fontSize.h1 * 1.25,
              fontWeight: 800,
              lineHeight: 1.05,
              color: style.nameInAccent ? accent : theme.colors.foreground,
            }}
          >
            {basics.fullName}
          </div>

          {basics.headline ? (
            <div
              style={{
                marginTop: 4,
                fontSize: theme.typography.body.fontSize - 0.5,
                fontWeight: 700,
                color: accent,
              }}
            >
              {basics.headline}
            </div>
          ) : null}

          {/* Contact Bar */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 12,
              marginTop: 6,
              fontSize: theme.typography.body.fontSize - 1.5,
              color: theme.colors.mutedForeground,
            }}
          >
            {basics.email ? <span>MAIL: {basics.email}</span> : null}
            {basics.phone ? <span>TEL: {basics.phone}</span> : null}
            {basics.location ? (
              <span>LOC: {formatLocation(basics.location)}</span>
            ) : null}
            {basics.links.map((link, i) => (
              <span key={i}>
                {link.label}: {link.url}
              </span>
            ))}
          </div>

          {showPersonalDetails ? (
            <div
              style={{
                marginTop: 4,
                fontSize: theme.typography.body.fontSize - 1.5,
                color: theme.colors.mutedForeground,
              }}
            >
              {joinParts(
                basics.personalDetails.map((d) => `${d.label}: ${d.value}`),
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ height: 1, backgroundColor: theme.colors.border }} />

      {/* ── Summary / Sobre mí ── */}
      {basics.summary ? (
        <>
          <EditorialHeading
            kicker={local.kickers.summary}
            title={local.headings.summary}
            theme={theme}
          />
          <div style={{ marginTop: 4 }}>{basics.summary}</div>
        </>
      ) : null}

      {/* ── Experience / Experiencia Profesional ── */}
      {resume.work.length === 0 ? null : (
        <>
          <EditorialHeading
            kicker={local.kickers.work}
            title={local.headings.work}
            theme={theme}
            kind="work"
          />
          {resume.work.map((w, i) => (
            <IndexedJob
              key={i}
              item={w}
              index={i}
              theme={theme}
              locale={locale}
            />
          ))}
        </>
      )}

      {/* ── Education / Formación ── */}
      {resume.education.length === 0 ? null : (
        <>
          <EditorialHeading
            kicker={local.kickers.education}
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
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ fontWeight: 700 }}>
                  {joinParts([e.degree, e.field], ' ')}
                  {e.degree === undefined && e.field === undefined
                    ? e.institution
                    : ` — ${e.institution}`}
                </span>
                <span
                  style={{
                    fontSize: theme.typography.body.fontSize - 1.5,
                    color: theme.colors.mutedForeground,
                  }}
                >
                  {formatRange(e.startDate, e.endDate, locale)}
                </span>
              </div>
              {e.location || e.grade ? (
                <div
                  style={{
                    fontSize: theme.typography.body.fontSize - 1.5,
                    color: theme.colors.mutedForeground,
                  }}
                >
                  {joinParts([e.location, e.grade])}
                </div>
              ) : null}
              {e.highlights.map((h, j) => (
                <div
                  key={j}
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    gap: 6,
                    marginTop: 2,
                  }}
                >
                  <div
                    style={{
                      color: style.bulletsInAccent
                        ? accent
                        : theme.colors.mutedForeground,
                    }}
                  >
                    •
                  </div>
                  <div style={{ flexGrow: 1 }}>{h}</div>
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      {/* ── Projects / Proyectos propios ── */}
      {resume.projects.length === 0 ? null : (
        <>
          <EditorialHeading
            kicker={local.kickers.projects}
            title={local.headings.projects}
            theme={theme}
            kind="projects"
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
                {joinParts(
                  [`/${String(i + 1).padStart(2, '0')} ${p.name}`, p.role],
                  ' — ',
                )}
                {p.url ? (
                  <span
                    style={{
                      fontWeight: 400,
                      fontSize: theme.typography.body.fontSize - 1.5,
                      color: accent,
                      marginLeft: 6,
                    }}
                  >
                    {p.url}
                  </span>
                ) : null}
              </div>
              {p.description ? <div>{p.description}</div> : null}
              {p.highlights.map((h, j) => (
                <div
                  key={j}
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    gap: 6,
                    marginTop: 2,
                  }}
                >
                  <div
                    style={{
                      color: style.bulletsInAccent
                        ? accent
                        : theme.colors.mutedForeground,
                    }}
                  >
                    •
                  </div>
                  <div style={{ flexGrow: 1 }}>{h}</div>
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      {/* ── Skills & Languages ── */}
      {resume.skills.length === 0 ? null : (
        <>
          <EditorialHeading
            kicker={local.kickers.skills}
            title={local.headings.skills}
            theme={theme}
            kind="skills"
          />
          {resume.skills.map((group, i) => (
            <div key={i} style={{ marginTop: 4, breakInside: 'avoid' }}>
              <span style={{ fontWeight: 700 }}>{group.category}: </span>
              <span>{group.items.join(', ')}</span>
            </div>
          ))}
        </>
      )}

      {resume.certifications.length === 0 ? null : (
        <>
          <EditorialHeading
            title={local.headings.certifications}
            theme={theme}
          />
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
          <EditorialHeading
            kicker={local.kickers.languages}
            title={local.headings.languages}
            theme={theme}
          />
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
          <EditorialHeading title={section.title} theme={theme} />
          {section.items.map((item, j) => (
            <div
              key={j}
              style={{
                display: 'flex',
                flexDirection: 'row',
                gap: 6,
                marginTop: 2,
              }}
            >
              <div
                style={{
                  color: style.bulletsInAccent
                    ? accent
                    : theme.colors.mutedForeground,
                }}
              >
                •
              </div>
              <div style={{ flexGrow: 1 }}>{item}</div>
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  )
}

export function createEditorialIndexTemplate(convention: Convention = 'intl') {
  return function EditorialIndexTemplate({
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
            <EditorialIndexBody
              resume={resume}
              theme={theme}
              convention={convention}
            />
          </PdfcnThemeProvider>
        </Page>
      </Document>
    )
  }
}
