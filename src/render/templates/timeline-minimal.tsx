/**
 * `timeline-accent`, `minimal-rule`, and `compact-dense` templates.
 *
 * Provides timeline-driven visual storytelling, Scandinavian minimal rule aesthetics,
 * and high-density formatting for senior candidates with long histories.
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

export type TimelineVariant = 'timeline' | 'minimal' | 'compact'

function Heading({
  title,
  theme,
  variant,
  kind = 'other',
}: {
  title: string
  theme: PdfcnTheme
  variant: TimelineVariant
  kind?: 'work' | 'education' | 'skills' | 'projects' | 'other'
}) {
  const style = styleOf(theme)
  const accent = sectionAccent(style, kind === 'projects' ? 'other' : kind)

  if (variant === 'minimal') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          marginTop: theme.spacing.sectionGap * 1.15,
        }}
      >
        <div
          style={{
            fontFamily: theme.typography.heading.fontFamily,
            fontSize: theme.typography.heading.fontSize.h2,
            fontWeight: 400,
            letterSpacing: 0,
            textTransform: 'uppercase',
            color: style.headingInAccent ? accent : theme.colors.foreground,
          }}
        >
          {title}
        </div>
        <div style={{ height: 0.8, backgroundColor: theme.colors.border }} />
      </div>
    )
  }

  if (variant === 'compact') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          marginTop: theme.spacing.sectionGap * 0.75,
        }}
      >
        <div
          style={{
            fontFamily: theme.typography.heading.fontFamily,
            fontSize: theme.typography.heading.fontSize.h2 - 1,
            fontWeight: 800,
            textTransform: 'uppercase',
            color: accent,
          }}
        >
          {title}
        </div>
        <div
          style={{
            flexGrow: 1,
            height: 1,
            backgroundColor: accent,
            opacity: 0.4,
          }}
        />
      </div>
    )
  }

  // Timeline variant
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: theme.spacing.sectionGap,
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: 8,
          backgroundColor: accent,
        }}
      />
      <div
        style={{
          fontFamily: theme.typography.heading.fontFamily,
          fontSize: theme.typography.heading.fontSize.h2,
          fontWeight: theme.typography.heading.fontWeight,
          textTransform: 'uppercase',
          color: style.headingInAccent ? accent : theme.colors.foreground,
        }}
      >
        {title}
      </div>
    </div>
  )
}

function TimelineJob({
  item,
  theme,
  variant,
  locale,
}: {
  item: WorkItem
  theme: PdfcnTheme
  variant: TimelineVariant
  locale: OutputLocale
}) {
  const style = styleOf(theme)
  const accent = sectionAccent(style, 'work')
  const dateRange = formatRange(item.startDate, item.endDate, locale)
  const isCompact = variant === 'compact'

  const jobContent = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: isCompact ? 1 : 2,
        breakInside: 'avoid',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: isCompact
              ? theme.typography.body.fontSize
              : theme.typography.body.fontSize + 0.5,
            color: style.roleInAccent ? accent : theme.colors.foreground,
          }}
        >
          {item.role}
        </span>
        {dateRange !== '' ? (
          <span
            style={{
              fontSize: isCompact
                ? theme.typography.body.fontSize - 2
                : theme.typography.body.fontSize - 1.5,
              color: theme.colors.mutedForeground,
            }}
          >
            {dateRange}
          </span>
        ) : null}
      </div>

      <div
        style={{
          fontSize: isCompact
            ? theme.typography.body.fontSize - 1.5
            : theme.typography.body.fontSize - 1,
          fontWeight: 600,
          color: accent,
        }}
      >
        {joinParts(
          [item.company, item.location, item.remote ? 'Remote' : undefined],
          '  ·  ',
        )}
      </div>

      {item.summary ? (
        <div
          style={{
            marginTop: isCompact ? 1 : 2,
            fontSize: isCompact
              ? theme.typography.body.fontSize - 0.5
              : theme.typography.body.fontSize,
            color: theme.colors.mutedForeground,
          }}
        >
          {item.summary}
        </div>
      ) : null}

      {item.highlights.map((h, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: 5,
            marginTop: isCompact ? 1 : 2,
            fontSize: isCompact
              ? theme.typography.body.fontSize - 0.5
              : theme.typography.body.fontSize,
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

  if (variant === 'timeline') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 12,
          marginTop: theme.spacing.componentGap,
          breakInside: 'avoid',
        }}
      >
        {/* Timeline track on left */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: 8,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: 6,
              backgroundColor: accent,
              marginTop: 4,
            }}
          />
          <div
            style={{
              width: 1.5,
              flexGrow: 1,
              backgroundColor: style.accentWash,
              marginTop: 2,
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            minWidth: 0,
          }}
        >
          {jobContent}
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        marginTop: isCompact
          ? theme.spacing.componentGap * 0.75
          : theme.spacing.componentGap,
        breakInside: 'avoid',
      }}
    >
      {jobContent}
    </div>
  )
}

function TimelineMinimalBody({
  resume,
  theme,
  convention = 'intl',
  variant,
}: {
  resume: Resume
  theme: PdfcnTheme
  convention?: Convention
  variant: TimelineVariant
}) {
  const { basics } = resume
  const style = styleOf(theme)
  const accent = style.accent
  const locale = resolveLocale(resume.locale)
  const local = strings(locale)
  const isCompact = variant === 'compact'
  const showPhoto = convention === 'eu' && basics.photoUrl !== undefined
  const showPersonalDetails =
    convention === 'eu' && basics.personalDetails.length > 0

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        fontFamily: theme.typography.body.fontFamily,
        fontSize: isCompact
          ? theme.typography.body.fontSize - 0.5
          : theme.typography.body.fontSize,
        lineHeight: isCompact
          ? theme.typography.body.lineHeight * 0.95
          : theme.typography.body.lineHeight,
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
          paddingBottom: isCompact ? 6 : 10,
          borderBottom:
            variant === 'minimal'
              ? `1px solid ${theme.colors.border}`
              : `2px solid ${accent}`,
        }}
      >
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
              fontSize: isCompact
                ? theme.typography.heading.fontSize.h1 * 1.1
                : theme.typography.heading.fontSize.h1 * 1.25,
              fontWeight: 800,
              color: style.nameInAccent ? accent : theme.colors.foreground,
            }}
          >
            {basics.fullName}
          </div>

          {basics.headline ? (
            <div
              style={{
                marginTop: 2,
                fontSize: isCompact
                  ? theme.typography.body.fontSize - 1
                  : theme.typography.body.fontSize,
                fontWeight: 600,
                color: accent,
              }}
            >
              {basics.headline}
            </div>
          ) : null}

          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 10,
              marginTop: isCompact ? 3 : 5,
              fontSize: theme.typography.body.fontSize - 1.5,
              color: theme.colors.mutedForeground,
            }}
          >
            {basics.email ? <span>{basics.email}</span> : null}
            {basics.phone ? <span>{basics.phone}</span> : null}
            {basics.location ? (
              <span>{formatLocation(basics.location)}</span>
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
                marginTop: 3,
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
      </div>

      {/* ── Summary ── */}
      {basics.summary ? (
        <>
          <Heading
            title={local.headings.summary}
            theme={theme}
            variant={variant}
          />
          <div style={{ marginTop: isCompact ? 2 : 4 }}>{basics.summary}</div>
        </>
      ) : null}

      {/* ── Experience ── */}
      {resume.work.length === 0 ? null : (
        <>
          <Heading
            title={local.headings.work}
            theme={theme}
            variant={variant}
            kind="work"
          />
          {resume.work.map((w, i) => (
            <TimelineJob
              key={i}
              item={w}
              theme={theme}
              variant={variant}
              locale={locale}
            />
          ))}
        </>
      )}

      {/* ── Education ── */}
      {resume.education.length === 0 ? null : (
        <>
          <Heading
            title={local.headings.education}
            theme={theme}
            variant={variant}
            kind="education"
          />
          {resume.education.map((e, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                marginTop: isCompact
                  ? theme.spacing.componentGap * 0.75
                  : theme.spacing.componentGap,
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
                    gap: 5,
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

      {/* ── Projects ── */}
      {resume.projects.length === 0 ? null : (
        <>
          <Heading
            title={local.headings.projects}
            theme={theme}
            variant={variant}
            kind="projects"
          />
          {resume.projects.map((p, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                marginTop: isCompact
                  ? theme.spacing.componentGap * 0.75
                  : theme.spacing.componentGap,
                breakInside: 'avoid',
              }}
            >
              <div style={{ fontWeight: 700 }}>
                {joinParts([p.name, p.role], ' — ')}
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
                    gap: 5,
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
          <Heading
            title={local.headings.skills}
            theme={theme}
            variant={variant}
            kind="skills"
          />
          {resume.skills.map((group, i) => (
            <div
              key={i}
              style={{ marginTop: isCompact ? 2 : 4, breakInside: 'avoid' }}
            >
              <span style={{ fontWeight: 700 }}>{group.category}: </span>
              <span>{group.items.join(', ')}</span>
            </div>
          ))}
        </>
      )}

      {resume.certifications.length === 0 ? null : (
        <>
          <Heading
            title={local.headings.certifications}
            theme={theme}
            variant={variant}
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
          <Heading
            title={local.headings.languages}
            theme={theme}
            variant={variant}
          />
          <div style={{ marginTop: isCompact ? 2 : 4 }}>
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
          <Heading title={section.title} theme={theme} variant={variant} />
          {section.items.map((item, j) => (
            <div
              key={j}
              style={{
                display: 'flex',
                flexDirection: 'row',
                gap: 5,
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

export function createTimelineMinimalTemplate(
  variant: TimelineVariant = 'timeline',
  convention: Convention = 'intl',
) {
  return function TimelineMinimalTemplate({
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
            <TimelineMinimalBody
              resume={resume}
              theme={theme}
              convention={convention}
              variant={variant}
            />
          </PdfcnThemeProvider>
        </Page>
      </Document>
    )
  }
}
