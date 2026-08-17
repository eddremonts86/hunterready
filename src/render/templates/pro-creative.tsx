/**
 * Pro Creative Templates:
 * - `brutalist-studio`: High-contrast borders, boxed section badges, bold industrial aesthetic.
 * - `linear-modern`: Linear/Raycast inspired, micro-badges, subtle wash cards, tech-first tags.
 * - `swiss-grid`: Josef Müller-Brockmann inspired international typographic style.
 * - `creative-director`: Asymmetric header, portfolio project cards, curated capability tags.
 * - `quantum-card`: Modern SaaS rounded card deck layout for experience and achievements.
 *
 * All strictly ATS-verified: single stream DOM order, standard heading names, text-only contact.
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

export type ProCreativeVariant =
  'brutalist' | 'linear' | 'swiss' | 'creative' | 'quantum'

function ProHeading({
  title,
  theme,
  variant,
  kind = 'other',
}: {
  title: string
  theme: PdfcnTheme
  variant: ProCreativeVariant
  kind?: 'work' | 'education' | 'skills' | 'projects' | 'other'
}) {
  const style = styleOf(theme)
  const accent = sectionAccent(style, kind === 'projects' ? 'other' : kind)

  switch (variant) {
    case 'brutalist':
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            marginTop: theme.spacing.sectionGap * 1.1,
          }}
        >
          <div
            style={{
              backgroundColor: accent,
              color: style.onAccent,
              padding: '3px 8px',
              fontFamily: theme.typography.heading.fontFamily,
              fontSize: theme.typography.heading.fontSize.h2 - 1,
              fontWeight: 800,
              textTransform: 'uppercase',
            }}
          >
            {title}
          </div>
          <div
            style={{
              flexGrow: 1,
              height: 2,
              backgroundColor: theme.colors.foreground,
            }}
          />
        </div>
      )

    case 'linear':
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
              width: 5,
              height: 12,
              backgroundColor: accent,
              borderRadius: 2,
            }}
          />
          <div
            style={{
              fontFamily: theme.typography.heading.fontFamily,
              fontSize: theme.typography.heading.fontSize.h2,
              fontWeight: 700,
              color: style.headingInAccent ? accent : theme.colors.foreground,
              textTransform: 'uppercase',
            }}
          >
            {title}
          </div>
          <div
            style={{
              flexGrow: 1,
              height: 1,
              backgroundColor: style.accentWash,
            }}
          />
        </div>
      )

    case 'swiss':
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            marginTop: theme.spacing.sectionGap * 1.2,
          }}
        >
          <div
            style={{
              fontFamily: theme.typography.heading.fontFamily,
              fontSize: theme.typography.heading.fontSize.h2 * 1.1,
              fontWeight: 800,
              textTransform: 'uppercase',
              color: style.headingInAccent ? accent : theme.colors.foreground,
            }}
          >
            {title}
          </div>
          <div
            style={{
              height: 2,
              backgroundColor: accent,
            }}
          />
        </div>
      )

    case 'creative':
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${accent}`,
            paddingBottom: 2,
            marginTop: theme.spacing.sectionGap * 1.15,
          }}
        >
          <div
            style={{
              fontFamily: theme.typography.heading.fontFamily,
              fontSize: theme.typography.heading.fontSize.h2,
              fontWeight: 700,
              color: accent,
              textTransform: 'uppercase',
            }}
          >
            {title}
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: 3,
            }}
          >
            <div
              style={{
                width: 4,
                height: 4,
                borderRadius: 4,
                backgroundColor: accent,
              }}
            />
            <div
              style={{
                width: 4,
                height: 4,
                borderRadius: 4,
                backgroundColor: accent,
                opacity: 0.7,
              }}
            />
            <div
              style={{
                width: 4,
                height: 4,
                borderRadius: 4,
                backgroundColor: accent,
                opacity: 0.4,
              }}
            />
          </div>
        </div>
      )

    case 'quantum':
    default:
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
              display: 'flex',
              padding: '2px 8px',
              borderRadius: 4,
              backgroundColor: style.accentWash,
              border: `1px solid ${accent}`,
              fontFamily: theme.typography.heading.fontFamily,
              fontSize: theme.typography.heading.fontSize.h2 - 1.5,
              fontWeight: 700,
              color: accent,
              textTransform: 'uppercase',
            }}
          >
            {title}
          </div>
          <div
            style={{
              flexGrow: 1,
              height: 1,
              backgroundColor: theme.colors.border,
            }}
          />
        </div>
      )
  }
}

function JobCard({
  item,
  theme,
  variant,
  locale,
}: {
  item: WorkItem
  theme: PdfcnTheme
  variant: ProCreativeVariant
  locale: OutputLocale
}) {
  const style = styleOf(theme)
  const accent = sectionAccent(style, 'work')
  const dateRange = formatRange(item.startDate, item.endDate, locale)

  const isCard = variant === 'quantum' || variant === 'brutalist'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        marginTop: theme.spacing.componentGap,
        breakInside: 'avoid',
        ...(isCard
          ? {
              padding: '8px 10px',
              borderRadius: variant === 'brutalist' ? 0 : 6,
              border:
                variant === 'brutalist'
                  ? `1.5px solid ${theme.colors.foreground}`
                  : `1px solid ${theme.colors.border}`,
              backgroundColor:
                variant === 'quantum' ? style.accentWash : undefined,
            }
          : {}),
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
            marginTop: 3,
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
                borderRadius: variant === 'brutalist' ? 0 : 3,
                border: `1px solid ${theme.colors.border}`,
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

function ProCreativeBody({
  resume,
  theme,
  convention = 'intl',
  variant,
}: {
  resume: Resume
  theme: PdfcnTheme
  convention?: Convention
  variant: ProCreativeVariant
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
      <ProHeading title={section.title} theme={theme} variant={variant} />
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
          paddingBottom: 10,
          borderBottom:
            variant === 'brutalist'
              ? `3px solid ${theme.colors.foreground}`
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
              fontSize: theme.typography.heading.fontSize.h1 * 1.25,
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
              borderRadius: variant === 'brutalist' ? 0 : 6,
              border:
                variant === 'brutalist'
                  ? `2px solid ${theme.colors.foreground}`
                  : undefined,
            }}
          />
        ) : null}
      </div>

      {/* ── Summary ── */}
      {basics.summary ? (
        <>
          <ProHeading
            title={local.headings.summary}
            theme={theme}
            variant={variant}
          />
          <div style={{ marginTop: 4 }}>{basics.summary}</div>
        </>
      ) : null}

      {/* ── Work Experience ── */}
      <Ordered
        resume={resume}
        /* This design has no order axis of its own; Experience first is what it always drew. */
        fallback="experience"
        custom={(section, i) => (
          <Block
            key={i}
            block={section}
            theme={theme}
            chrome={{
              heading: (title) => (
                <ProHeading title={title} theme={theme} variant={variant} />
              ),
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
              <ProHeading
                title={local.headings.work}
                theme={theme}
                variant={variant}
                kind="work"
              />
              {resume.work.map((w, i) => (
                <JobCard
                  key={i}
                  item={w}
                  theme={theme}
                  variant={variant}
                  locale={locale}
                />
              ))}
            </>
          )}
        </Slot>
        <Slot name="education">
          {resume.education.length === 0 ? null : (
            <>
              <ProHeading
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
              <ProHeading
                title={local.headings.skills}
                theme={theme}
                variant={variant}
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
              <ProHeading
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
        <Slot name="certifications">
          {resume.certifications.length === 0 ? null : (
            <>
              <ProHeading
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
        </Slot>
        <Slot name="languages">
          {resume.languages.length === 0 ? null : (
            <>
              <ProHeading
                title={local.headings.languages}
                theme={theme}
                variant={variant}
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

export function createProCreativeTemplate(
  variant: ProCreativeVariant,
  convention: Convention = 'intl',
) {
  return function ProCreativeTemplate({
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
            <ProCreativeBody
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
