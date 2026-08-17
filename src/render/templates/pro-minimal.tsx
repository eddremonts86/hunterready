/**
 * Pro Minimal & Distinctive Templates:
 * - `monolith-executive`: Formal centered prestigious masthead with double hairlines.
 * - `nordic-frost`: Pure Scandinavian calm with pale airy spacing and delicate bullets.
 * - `command-line`: Developer/CLI terminal aesthetic with prompt prefixes ($ and >).
 * - `metro-compact`: Urban transit-inspired left vertical color bar indicators per section.
 * - `monograph-serif`: Academic monograph and literary journal style layout.
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

export type ProMinimalVariant =
  'monolith' | 'nordic' | 'cli' | 'metro' | 'monograph'

function ProMinHeading({
  title,
  theme,
  variant,
  kind = 'other',
}: {
  title: string
  theme: PdfcnTheme
  variant: ProMinimalVariant
  kind?: 'work' | 'education' | 'skills' | 'projects' | 'other'
}) {
  const style = styleOf(theme)
  const accent = sectionAccent(style, kind === 'projects' ? 'other' : kind)

  switch (variant) {
    case 'monolith':
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            marginTop: theme.spacing.sectionGap * 1.2,
          }}
        >
          <div
            style={{
              width: '100%',
              height: 0.8,
              backgroundColor: theme.colors.border,
            }}
          />
          <div
            style={{
              fontFamily: theme.typography.heading.fontFamily,
              fontSize: theme.typography.heading.fontSize.h2 - 0.5,
              fontWeight: 700,
              textTransform: 'uppercase',
              color: style.headingInAccent ? accent : theme.colors.foreground,
              marginTop: 2,
              marginBottom: 2,
            }}
          >
            {title}
          </div>
          <div
            style={{
              width: '100%',
              height: 0.8,
              backgroundColor: theme.colors.border,
            }}
          />
        </div>
      )

    case 'cli':
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginTop: theme.spacing.sectionGap * 0.9,
          }}
        >
          <span
            style={{
              fontWeight: 800,
              fontSize: theme.typography.body.fontSize,
              color: accent,
            }}
          >
            $
          </span>
          <span
            style={{
              fontFamily: theme.typography.heading.fontFamily,
              fontSize: theme.typography.heading.fontSize.h2 - 1,
              fontWeight: 700,
              color: style.headingInAccent ? accent : theme.colors.foreground,
              textTransform: 'uppercase',
            }}
          >
            {title}
          </span>
        </div>
      )

    case 'metro':
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
          <div style={{ width: 4, height: 14, backgroundColor: accent }} />
          <div
            style={{
              fontFamily: theme.typography.heading.fontFamily,
              fontSize: theme.typography.heading.fontSize.h2,
              fontWeight: 800,
              textTransform: 'uppercase',
              color: theme.colors.foreground,
            }}
          >
            {title}
          </div>
        </div>
      )

    case 'monograph':
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
              fontWeight: 600,
              color: style.headingInAccent ? accent : theme.colors.foreground,
              textTransform: 'uppercase',
            }}
          >
            {title}
          </div>
          <div style={{ height: 1, backgroundColor: accent }} />
        </div>
      )

    case 'nordic':
    default:
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            marginTop: theme.spacing.sectionGap * 1.1,
          }}
        >
          <div
            style={{
              fontFamily: theme.typography.heading.fontFamily,
              fontSize: theme.typography.heading.fontSize.h2 - 0.5,
              fontWeight: 500,
              textTransform: 'uppercase',
              color: style.headingInAccent ? accent : theme.colors.foreground,
            }}
          >
            {title}
          </div>
          <div
            style={{
              width: 32,
              height: 2,
              backgroundColor: accent,
            }}
          />
        </div>
      )
  }
}

function MinJobItem({
  item,
  theme,
  variant,
  locale,
}: {
  item: WorkItem
  theme: PdfcnTheme
  variant: ProMinimalVariant
  locale: OutputLocale
}) {
  const style = styleOf(theme)
  const accent = sectionAccent(style, 'work')
  const dateRange = formatRange(item.startDate, item.endDate, locale)
  const isCli = variant === 'cli'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: isCli ? 1 : 2,
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
            gap: 5,
          }}
        >
          {isCli ? (
            <span style={{ color: accent, fontWeight: 700 }}>&gt;</span>
          ) : null}
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
    </div>
  )
}

function ProMinimalBody({
  resume,
  theme,
  convention = 'intl',
  variant,
}: {
  resume: Resume
  theme: PdfcnTheme
  convention?: Convention
  variant: ProMinimalVariant
}) {
  const { basics } = resume
  const style = styleOf(theme)
  const accent = style.accent
  const locale = resolveLocale(resume.locale)
  const local = strings(locale)
  const showPhoto = convention === 'eu' && basics.photoUrl !== undefined
  const showPersonalDetails =
    convention === 'eu' && basics.personalDetails.length > 0
  const isCentered = variant === 'monolith' && !showPhoto

  /* One renderer for a titled block of lines: custom sections, awards, publications, volunteering. */
  const group = (section: Group, i: number) => (
    <Fragment key={i}>
      <ProMinHeading title={section.title} theme={theme} variant={variant} />
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
          alignItems: 'center',
          gap: 16,
          paddingBottom: 10,
          borderBottom:
            variant === 'cli'
              ? `1px dashed ${accent}`
              : `1.5px solid ${theme.colors.border}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            minWidth: 0,
            alignItems: isCentered ? 'center' : 'flex-start',
            textAlign: isCentered ? 'center' : 'left',
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
              justifyContent: isCentered ? 'center' : 'flex-start',
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
              borderRadius: 4,
            }}
          />
        ) : null}
      </div>

      {/* ── Summary ── */}
      {basics.summary ? (
        <>
          <ProMinHeading
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
                <ProMinHeading title={title} theme={theme} variant={variant} />
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
              <ProMinHeading
                title={local.headings.work}
                theme={theme}
                variant={variant}
                kind="work"
              />
              {resume.work.map((w, i) => (
                <MinJobItem
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
              <ProMinHeading
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
              <ProMinHeading
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
              <ProMinHeading
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
              <ProMinHeading
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
              <ProMinHeading
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

export function createProMinimalTemplate(
  variant: ProMinimalVariant,
  convention: Convention = 'intl',
) {
  return function ProMinimalTemplate({
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
            <ProMinimalBody
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
