/**
 * `tech-chips` and `split-grid` templates.
 *
 * Designed for engineers, technical leads, and builders. Renders skills as rounded badge chips/pills,
 * with options for bottom split grids (Skills on the left, Languages/Certifications on the right).
 *
 * Bound by the ATS ruleset (docs/05-pdf-rendering.md): single stream DOM reading order,
 * standard section heading names, text-only contact details, and `breakInside: avoid`.
 */
import { Fragment } from 'react'
import { Document, Image, Page } from '@/lib/pdf-primitives'
import { PdfcnThemeProvider } from '@/components/pdf/theme-provider'
import type { PdfcnTheme } from '@/components/pdf/theme-types'
import { Block } from './block'
import { groupsOf, Ordered, Slot, volunteerGroup } from '../sections'
import type { Group } from '../sections'
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

function TechHeading({
  title,
  theme,
  kind = 'other',
}: {
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
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: theme.spacing.sectionGap * 1.1,
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
      <div
        style={{
          flexGrow: 1,
          height: 1.5,
          backgroundColor: accent,
          opacity: 0.8,
        }}
      />
    </div>
  )
}

function TechJob({
  item,
  theme,
  locale,
}: {
  item: WorkItem
  theme: PdfcnTheme
  locale: OutputLocale
}) {
  const style = styleOf(theme)
  const accent = sectionAccent(style, 'work')
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
        <span
          style={{
            fontWeight: 700,
            fontSize: theme.typography.body.fontSize + 0.5,
            color: style.roleInAccent ? accent : theme.colors.foreground,
          }}
        >
          {item.role}
        </span>
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

      <div
        style={{
          fontSize: theme.typography.body.fontSize - 1,
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

      {item.tech && item.tech.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 4,
            marginTop: 4,
          }}
        >
          {item.tech.map((t, idx) => (
            <span
              key={idx}
              style={{
                fontSize: theme.typography.body.fontSize - 2.5,
                fontWeight: 600,
                backgroundColor: style.accentWash,
                color: accent,
                padding: '1.5px 5px',
                borderRadius: 3,
              }}
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function TechChipsBody({
  resume,
  theme,
  convention = 'intl',
  isSplitGrid = false,
}: {
  resume: Resume
  theme: PdfcnTheme
  convention?: Convention
  isSplitGrid?: boolean
}) {
  const { basics } = resume
  const style = styleOf(theme)
  const accent = style.accent
  const locale = resolveLocale(resume.locale)
  const local = strings(locale)
  const showPhoto = convention === 'eu' && basics.photoUrl !== undefined
  const showPersonalDetails =
    convention === 'eu' && basics.personalDetails.length > 0

  /* One renderer for a titled block of lines: custom sections, awards, publications, volunteering. */
  const group = (section: Group, i: number) => (
    <Fragment key={i}>
      <TechHeading title={section.title} theme={theme} />
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
      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
          paddingBottom: 10,
          borderBottom: `2px solid ${accent}`,
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
              fontSize: theme.typography.heading.fontSize.h1 * 1.2,
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
                fontSize: theme.typography.body.fontSize,
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
              marginTop: 5,
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
              borderRadius: 6,
            }}
          />
        ) : null}
      </div>

      {/* ── Summary ── */}
      {basics.summary ? (
        <>
          <TechHeading title={local.headings.summary} theme={theme} />
          <div style={{ marginTop: 4 }}>{basics.summary}</div>
        </>
      ) : null}

      {/* ── Work ── */}
      <Ordered
        resume={resume}
        fallback={'experience'}
        custom={(section, i) => (
          <Block
            key={i}
            block={section}
            theme={theme}
            chrome={{
              heading: (title) => <TechHeading title={title} theme={theme} />,
              line: (text, k) => (
                <div
                  key={k}
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
                  <div style={{ flexGrow: 1 }}>{text}</div>
                </div>
              ),
            }}
          />
        )}
      >
        <Slot name="work">
          {resume.work.length === 0 ? null : (
            <>
              <TechHeading
                title={local.headings.work}
                theme={theme}
                kind="work"
              />
              {resume.work.map((w, i) => (
                <TechJob key={i} item={w} theme={theme} locale={locale} />
              ))}
            </>
          )}
        </Slot>
        <Slot name="education">
          {resume.education.length === 0 ? null : (
            <>
              <TechHeading
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
        <Slot name="projects">
          {resume.projects.length === 0 ? null : (
            <>
              <TechHeading
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

      {/*
        The skills / languages / certifications band, below the ordered flow rather than inside it.

        It is a two-column arrangement of three sections, and a single sequence cannot place a thing
        that is two things side by side. It used to sit between Projects and the custom sections, which
        put half the document above it and half below with no way to move anything across — so the band
        anchors the bottom of the flow now and everything above it is the person's to arrange. The band's
        own contents keep the order the design gives them.
      */}
      {isSplitGrid ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: 20,
            marginTop: theme.spacing.sectionGap,
            breakInside: 'avoid',
          }}
        >
          {/* Left Split Column: Skills */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flexGrow: 3,
              flexBasis: 0,
            }}
          >
            {resume.skills.length === 0 ? null : (
              <>
                <TechHeading
                  title={local.headings.skills}
                  theme={theme}
                  kind="skills"
                />
                {resume.skills.map((group, i) => (
                  <div key={i} style={{ marginTop: 4 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: theme.typography.body.fontSize - 1,
                        marginBottom: 2,
                      }}
                    >
                      {group.category}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 3,
                      }}
                    >
                      {group.items.map((item, j) => (
                        <span
                          key={j}
                          style={{
                            fontSize: theme.typography.body.fontSize - 2,
                            backgroundColor: style.accentWash,
                            color: theme.colors.foreground,
                            padding: '1.5px 6px',
                            borderRadius: 3,
                            border: `1px solid ${theme.colors.border}`,
                          }}
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Right Split Column: Languages & Certifications */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flexGrow: 2,
              flexBasis: 0,
            }}
          >
            {resume.languages.length === 0 ? null : (
              <>
                <TechHeading title={local.headings.languages} theme={theme} />
                <div style={{ marginTop: 4 }}>
                  {resume.languages.map((l, i) => (
                    <div key={i} style={{ marginTop: 2 }}>
                      <span style={{ fontWeight: 600 }}>{l.name}</span>
                      <span style={{ color: theme.colors.mutedForeground }}>
                        {' '}
                        – {l.level ?? l.raw ?? 'Fluent'}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {resume.certifications.length === 0 ? null : (
              <>
                <TechHeading
                  title={local.headings.certifications}
                  theme={theme}
                />
                <div style={{ marginTop: 4 }}>
                  {resume.certifications.map((c, i) => (
                    <div key={i} style={{ marginTop: 2 }}>
                      <span style={{ fontWeight: 600 }}>{c.name}</span>
                      {c.issuer ? (
                        <span style={{ color: theme.colors.mutedForeground }}>
                          {' '}
                          · {c.issuer}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Standard Tech Chips flow */}
          {resume.skills.length === 0 ? null : (
            <>
              <TechHeading
                title={local.headings.skills}
                theme={theme}
                kind="skills"
              />
              {resume.skills.map((group, i) => (
                <div key={i} style={{ marginTop: 4, breakInside: 'avoid' }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: theme.typography.body.fontSize - 0.5,
                      marginBottom: 2,
                    }}
                  >
                    {group.category}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: 4,
                    }}
                  >
                    {group.items.map((item, j) => (
                      <span
                        key={j}
                        style={{
                          fontSize: theme.typography.body.fontSize - 1.5,
                          fontWeight: 500,
                          backgroundColor: style.accentWash,
                          color: theme.colors.foreground,
                          padding: '2px 7px',
                          borderRadius: 4,
                          border: `1px solid ${theme.colors.border}`,
                        }}
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}

          {resume.certifications.length === 0 ? null : (
            <>
              <TechHeading
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
              <TechHeading title={local.headings.languages} theme={theme} />
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
        </>
      )}
    </div>
  )
}

export function createTechChipsTemplate(
  convention: Convention = 'intl',
  isSplitGrid = false,
) {
  return function TechChipsTemplate({
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
            <TechChipsBody
              resume={resume}
              theme={theme}
              convention={convention}
              isSplitGrid={isSplitGrid}
            />
          </PdfcnThemeProvider>
        </Page>
      </Document>
    )
  }
}
