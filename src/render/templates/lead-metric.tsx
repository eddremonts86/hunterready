/**
 * `lead-metric`, `lead-metric-eu`, and `split-panel-profile` templates.
 *
 * Inspired by executive and staff engineering CV layouts with prominent impact metrics,
 * structured contact bars, numbered entries, and clean hierarchical section headings.
 *
 * Bound by the ATS ruleset (docs/05-pdf-rendering.md): single stream DOM reading order,
 * standard section heading names, text-only contact details, and `breakInside: avoid`.
 */
import { Fragment } from 'react'
import { Document, Image, Page } from '@/lib/pdf-primitives'
import { PdfcnThemeProvider } from '@/components/pdf/theme-provider'
import type { PdfcnTheme } from '@/components/pdf/theme-types'
import { Spacer } from './spacer'
import { groupsOf, Ordered, Slot, volunteerGroup } from '../sections'
import type { Group } from '../sections'
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
import { PHOTO_BOX_PT } from './modern-base'
import type { Convention } from './modern-base'

interface MetricCard {
  value: string
  label: string
}

/**
 * Derives up to 4 notable metric cards from resume content or summary.
 * Always produces valid, non-empty metric points when available.
 */
function extractMetricCards(resume: Resume): MetricCard[] {
  const cards: MetricCard[] = []

  // Check custom sections for metrics or awards
  for (const c of resume.custom) {
    if (
      c.title.toLowerCase().includes('metric') ||
      c.title.toLowerCase().includes('impact') ||
      c.title.toLowerCase().includes('kpi')
    ) {
      for (const item of c.items) {
        const match = item.match(
          /^([+0-9%kKmMxX]+(?:\s*[+%]|\b))\s*[-—:]?\s*(.+)$/,
        )
        if (match && cards.length < 4) {
          cards.push({
            value: match[1].trim(),
            label: match[2].slice(0, 30).trim(),
          })
        }
      }
    }
  }

  // If no custom metrics, scan work highlights for numeric achievements
  if (cards.length === 0) {
    for (const job of resume.work) {
      for (const h of job.highlights) {
        const match = h.match(
          /(\d+[%+xXkKmM]|\$\d+[kKmMbB]?|\d+\+?\s*(?:years|anios|años|engineers|users|clients|projects|ms|kb|mb|gb))\b/i,
        )
        if (match && cards.length < 4) {
          const val = match[1].trim()
          const label = h.replace(match[0], '').trim().slice(0, 32)
          cards.push({
            value: val,
            label: label || 'Impact & Delivery',
          })
        }
      }
    }
  }

  return cards
}

function SectionKicker({
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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        marginTop: theme.spacing.sectionGap * 1.1,
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
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          borderBottom: `1.5px solid ${accent}`,
          paddingBottom: 3,
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
      </div>
    </div>
  )
}

function NumberedJob({
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
        marginTop: theme.spacing.componentGap,
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
              fontWeight: 500,
            }}
          >
            {dateRange}
          </span>
        ) : null}
      </div>

      <div
        style={{
          fontSize: theme.typography.body.fontSize - 1,
          color: accent,
          fontWeight: 600,
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

function LeadMetricBody({
  resume,
  theme,
  convention,
  isSplitProfile = false,
}: {
  resume: Resume
  theme: PdfcnTheme
  convention: Convention
  isSplitProfile?: boolean
}) {
  const { basics } = resume
  const style = styleOf(theme)
  const accent = style.accent
  const locale = resolveLocale(resume.locale)
  const local = strings(locale)
  const metrics = extractMetricCards(resume)
  const showPhoto = convention === 'eu' && basics.photoUrl !== undefined
  const showPersonalDetails =
    convention === 'eu' && basics.personalDetails.length > 0

  /* One renderer for a titled block of lines: custom sections, awards, publications, volunteering. */
  const group = (section: Group, i: number) => (
    <Fragment key={i}>
      <SectionKicker title={section.title} theme={theme} />
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
  )
  const volunteering = volunteerGroup(resume, locale)

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
          borderBottom: `2px solid ${accent}`,
          paddingBottom: 12,
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
              fontSize: theme.typography.heading.fontSize.h1 * 1.15,
              fontWeight: theme.typography.heading.fontWeight,
              lineHeight: 1.05,
              color: style.nameInAccent ? accent : theme.colors.foreground,
            }}
          >
            {basics.fullName}
          </div>

          {basics.headline ? (
            <div
              style={{
                marginTop: 3,
                fontSize: theme.typography.body.fontSize,
                fontWeight: 600,
                color: accent,
              }}
            >
              {basics.headline}
            </div>
          ) : null}

          {/* Contact Bar Grid */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 10,
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

      {/* ── KPI Metric Highlights Row (if present) ── */}
      {metrics.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: 8,
            marginTop: 10,
            paddingBottom: 10,
            borderBottom: `1px solid ${theme.colors.border}`,
          }}
        >
          {metrics.map((card, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                flexDirection: 'column',
                flexGrow: 1,
                flexBasis: 0,
                backgroundColor: style.accentWash,
                padding: '6px 8px',
                borderRadius: 4,
                borderLeft: `3px solid ${accent}`,
              }}
            >
              <div
                style={{
                  fontFamily: theme.typography.heading.fontFamily,
                  fontSize: theme.typography.heading.fontSize.h2,
                  fontWeight: 800,
                  color: accent,
                }}
              >
                {card.value}
              </div>
              <div
                style={{
                  fontSize: theme.typography.body.fontSize - 2,
                  fontWeight: 700,
                  color: theme.colors.foreground,
                  marginTop: 1,
                }}
              >
                {card.label}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* ── Summary / Profile ── */}
      {basics.summary ? (
        <div style={{ marginTop: theme.spacing.sectionGap }}>
          <SectionKicker
            kicker={local.kickers.summary}
            title={local.headings.summary}
            theme={theme}
          />
          <div
            style={{
              marginTop: 4,
              padding: isSplitProfile ? '6px 10px' : 0,
              backgroundColor: isSplitProfile ? style.accentWash : undefined,
              borderRadius: isSplitProfile ? 4 : undefined,
            }}
          >
            {basics.summary}
          </div>
        </div>
      ) : null}

      {/* ── Experience ── */}
      <Ordered
        resume={resume}
        /* This design has no order axis of its own; Experience first is what it always drew. */
        fallback="experience"
        custom={(section, i) =>
          /* A spacer draws room and no words at all — see templates/spacer.tsx. */
          isSpacer(section) ? (
            <Spacer key={i} space={section.space} />
          ) : (
            <Fragment key={i}>
              <SectionKicker title={section.title} theme={theme} />
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
          )
        }
      >
        <Slot name="work">
          {resume.work.length === 0 ? null : (
            <>
              <SectionKicker
                kicker={local.kickers.work}
                title={local.headings.work}
                theme={theme}
                kind="work"
              />
              {resume.work.map((w, i) => (
                <NumberedJob
                  key={i}
                  item={w}
                  index={i}
                  theme={theme}
                  locale={locale}
                />
              ))}
            </>
          )}
        </Slot>
        <Slot name="education">
          {resume.education.length === 0 ? null : (
            <>
              <SectionKicker
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
        </Slot>
        <Slot name="skills">
          {resume.skills.length === 0 ? null : (
            <>
              <SectionKicker
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
        </Slot>
        <Slot name="projects">
          {resume.projects.length === 0 ? null : (
            <>
              <SectionKicker
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
        </Slot>
        <Slot name="certifications">
          {resume.certifications.length === 0 ? null : (
            <>
              <SectionKicker
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
        </Slot>
        <Slot name="languages">
          {resume.languages.length === 0 ? null : (
            <>
              <SectionKicker
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
        </Slot>
        {/*
          Three sections that were in the schema, filled by extraction and printed by the `.docx`
          export — and rendered by no PDF template at all. Drawn through the same renderer this
          design uses for a custom section, which is the shape all three already have.
        */}
        <Slot name="awards">
          {groupsOf(resume.awards).map((g, i) => group(g, i))}
        </Slot>
        <Slot name="publications">
          {groupsOf(resume.publications).map((g, i) => group(g, i))}
        </Slot>
        <Slot name="volunteer">
          {volunteering === undefined ? null : group(volunteering, 0)}
        </Slot>
      </Ordered>
    </div>
  )
}

export function createLeadMetricTemplate(
  convention: Convention = 'intl',
  isSplitProfile = false,
) {
  return function LeadMetricTemplate({
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
            <LeadMetricBody
              resume={resume}
              theme={theme}
              convention={convention}
              isSplitProfile={isSplitProfile}
            />
          </PdfcnThemeProvider>
        </Page>
      </Document>
    )
  }
}
