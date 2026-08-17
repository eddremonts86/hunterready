/**
 * `showcase` — the design-first template, within the rule that makes this product worth using.
 *
 * ## The constraint that shaped it, stated first
 *
 * docs/05's ATS ruleset, rule 1: *"Single column for all content an ATS must read. A decorative
 * sidebar may hold **only redundant information** (a repeat of the location, a photo)."*
 *
 * So "design-first" here cannot mean what it means everywhere else. The conventional showcase CV puts
 * skills and contact details in a sidebar, and that is exactly the layout that reads back to a parser
 * with a job title wedged between a company and its dates. Building one would sell the visual and
 * quietly break the guarantee the whole product rests on.
 *
 * What is left is the interesting version of the problem: **make it look distinctly different using
 * only typography, rules and space, with one unbroken column of content.** A masthead the width of the
 * page, section headings that sit in a left gutter beside their content rather than above it, and
 * generous air. Nothing an extractor reads is out of order, because there is only ever one order.
 *
 * It is registered as `verified`, not `design-first`, and that is a claim the round-trip test checks
 * on every build — `TEMPLATE_IDS` is iterated there, so this template cannot be added without being
 * proven. If it ever stops surviving a parse-back, the suite fails rather than the rating quietly
 * becoming a lie.
 */
import { Fragment } from 'react'
import { Document, Page } from '@/lib/pdf-primitives'
import { PdfcnThemeProvider } from '@/components/pdf/theme-provider'
import type { PdfcnTheme } from '@/components/pdf/theme-types'
import { Block } from './block'
import { groupsOf, Ordered, Slot, volunteerGroup } from '../sections'
import type { Group } from '../sections'
import type { Resume } from '@/schema/resume'
import {
  formatLocation,
  formatRange,
  resolveLocale,
  formatYearMonth,
  joinParts,
} from '../format'
import { strings } from '../locale'
import { styleOf } from '../themes/style'

/**
 * The gutter that carries the section name.
 *
 * Wide enough to read as a deliberate column, narrow enough that the content column keeps a full
 * measure. This is the whole visual idea, and it costs the ATS nothing: the heading still precedes
 * its content in the document order, it is simply set beside it.
 */
const GUTTER = 104

function Rule({ theme }: { theme: PdfcnTheme }) {
  return (
    <div
      style={{
        display: 'flex',
        height: 1,
        backgroundColor: theme.colors.border,
      }}
    />
  )
}

/**
 * One section: its name in the gutter, its content beside it.
 *
 * `flexDirection: row` here is layout, not reading order — the heading is emitted before the content
 * in the document, which is what an extractor follows. Rule 3 ("reading order must equal visual
 * order") is satisfied both ways: left-to-right is also the visual order.
 *
 * NO letterSpacing on the heading, for the reason recorded at length in modern-base: it makes the
 * renderer position every glyph individually and the extractor reads back "E x p e r i e n c e".
 */
function Section({
  title,
  theme,
  children,
}: {
  title: string
  theme: PdfcnTheme
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        marginTop: theme.spacing.sectionGap * 1.35,
      }}
    >
      <Rule theme={theme} />
      <div style={{ display: 'flex', flexDirection: 'row', gap: 16 }}>
        <div
          style={{
            display: 'flex',
            width: GUTTER,
            flexShrink: 0,
            fontFamily: theme.typography.heading.fontFamily,
            fontSize: theme.typography.heading.fontSize.h2,
            fontWeight: theme.typography.heading.fontWeight,
            /*
              The gutter name is this template's signature, so it is where the theme's ink shows.
              Color only — the treatment axis (bands, boxes) belongs to modern-base's stacked headings;
              painting a band across a 104pt gutter would just draw a brick.
            */
            color: styleOf(theme).headingInAccent
              ? styleOf(theme).accent
              : theme.colors.foreground,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            gap: theme.spacing.componentGap,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function Bullets({
  items,
  theme,
}: {
  items: Array<string>
  theme: PdfcnTheme
}) {
  return (
    <Fragment>
      {items.map((item, index) => (
        <div
          key={index}
          style={{ display: 'flex', flexDirection: 'row', gap: 6 }}
        >
          {/* A real character, not a rendered shape: a bare glyph an extractor drops is fine, a
              meaning-carrying icon is not (rule 5). */}
          <div
            style={{
              display: 'flex',
              color: styleOf(theme).bulletsInAccent
                ? styleOf(theme).accent
                : theme.colors.mutedForeground,
            }}
          >
            •
          </div>
          <div style={{ display: 'flex', flexGrow: 1 }}>{item}</div>
        </div>
      ))}
    </Fragment>
  )
}

function Body({ resume, theme }: { resume: Resume; theme: PdfcnTheme }) {
  const { basics } = resume
  // The document's language, from the CV's own `locale` (v0.8). Headings and dates only — see
  // `src/render/locale.ts` for why the candidate's own words are never translated.
  const locale = resolveLocale(resume.locale)
  const local = strings(locale)
  const contact = joinParts([
    basics.email,
    basics.phone,
    formatLocation(basics.location),
    ...basics.links.map((link) => link.url),
  ])

  /* One renderer for a titled block of lines: custom sections, awards, publications, volunteering. */
  const group = (section: Group, index: number) => (
    <Section key={index} title={section.title} theme={theme}>
      <Bullets items={section.items} theme={theme} />
    </Section>
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
      {/* Masthead: full width, text only. An ATS drops an image header whole (rule 4). */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          paddingBottom: 14,
        }}
      >
        <div
          style={{
            fontFamily: theme.typography.heading.fontFamily,
            fontSize: theme.typography.heading.fontSize.h1 * 1.35,
            fontWeight: theme.typography.heading.fontWeight,
            lineHeight: 1.05,
          }}
        >
          {basics.fullName}
        </div>
        {basics.headline === undefined ? null : (
          <div
            style={{
              fontSize: theme.typography.body.fontSize + 1,
              color: theme.colors.mutedForeground,
            }}
          >
            {basics.headline}
          </div>
        )}
        {contact === '' ? null : (
          <div
            style={{
              marginTop: 4,
              fontSize: theme.typography.body.fontSize - 1,
              color: theme.colors.mutedForeground,
            }}
          >
            {contact}
          </div>
        )}
        {/* One heavy stroke in the theme's ink under the masthead — the loudest thing on the page. */}
        <div
          style={{
            marginTop: 10,
            height: 3,
            backgroundColor: styleOf(theme).accent,
          }}
        />
      </div>

      {basics.summary === undefined ? null : (
        <Section title={local.headings.summary} theme={theme}>
          <div style={{ display: 'flex' }}>{basics.summary}</div>
        </Section>
      )}

      <Ordered
        resume={resume}
        fallback={'experience'}
        custom={(section, index) => (
          <Block
            key={index}
            block={section}
            theme={theme}
            chrome={{
              // Never called: `group` below handles every kind that has a heading.
              heading: (title) => (
                <Section title={title} theme={theme}>
                  {null}
                </Section>
              ),
              line: (text, k) => (
                <Bullets key={k} items={[text]} theme={theme} />
              ),
              group: (title, children) => (
                <Section title={title} theme={theme}>
                  {children}
                </Section>
              ),
            }}
          />
        )}
      >
        <Slot name="work">
          {resume.work.length === 0 ? null : (
            <Section title={local.headings.work} theme={theme}>
              {resume.work.map((job, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    // A job must never split across a page boundary — the layout bug users notice most.
                    breakInside: 'avoid',
                  }}
                >
                  <div
                    style={{
                      fontWeight: theme.typography.heading.fontWeight,
                    }}
                  >
                    {joinParts([job.role, job.company], ' — ')}
                  </div>
                  <div
                    style={{
                      fontSize: theme.typography.body.fontSize - 1,
                      color: theme.colors.mutedForeground,
                    }}
                  >
                    {joinParts([
                      formatRange(job.startDate, job.endDate, locale),
                      job.location,
                    ])}
                  </div>
                  {job.summary === undefined ? null : (
                    <div style={{ display: 'flex', marginTop: 2 }}>
                      {job.summary}
                    </div>
                  )}
                  <Bullets items={job.highlights} theme={theme} />
                </div>
              ))}
            </Section>
          )}
        </Slot>
        <Slot name="education">
          {resume.education.length === 0 ? null : (
            <Section title={local.headings.education} theme={theme}>
              {resume.education.map((entry, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    breakInside: 'avoid',
                  }}
                >
                  <div
                    style={{ fontWeight: theme.typography.heading.fontWeight }}
                  >
                    {joinParts(
                      [
                        joinParts([entry.degree, entry.field], ' '),
                        entry.institution,
                      ],
                      ' — ',
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: theme.typography.body.fontSize - 1,
                      color: theme.colors.mutedForeground,
                    }}
                  >
                    {formatRange(entry.startDate, entry.endDate, locale)}
                  </div>
                  <Bullets items={entry.highlights} theme={theme} />
                </div>
              ))}
            </Section>
          )}
        </Slot>
        <Slot name="skills">
          {resume.skills.length === 0 ? null : (
            <Section title={local.headings.skills} theme={theme}>
              {resume.skills.map((group, index) => (
                <div key={index} style={{ display: 'flex' }}>
                  {/* No rating bars or dots: they extract as noise and say nothing (rule 8). */}
                  {`${group.category}: ${group.items.join(', ')}`}
                </div>
              ))}
            </Section>
          )}
        </Slot>
        <Slot name="certifications">
          {resume.certifications.length === 0 ? null : (
            <Section title={local.headings.certifications} theme={theme}>
              {resume.certifications.map((cert, index) => (
                <div key={index} style={{ display: 'flex' }}>
                  {joinParts([
                    cert.name,
                    cert.issuer,
                    formatYearMonth(cert.date),
                    cert.identifier,
                  ])}
                </div>
              ))}
            </Section>
          )}
        </Slot>
        <Slot name="languages">
          {resume.languages.length === 0 ? null : (
            <Section title={local.headings.languages} theme={theme}>
              <div style={{ display: 'flex' }}>
                {resume.languages
                  .map((language) =>
                    joinParts(
                      [language.name, language.raw ?? language.level],
                      ' ',
                    ),
                  )
                  .join(' · ')}
              </div>
            </Section>
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

export function ShowcaseTemplate({
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
          <Body resume={resume} theme={theme} />
        </PdfcnThemeProvider>
      </Page>
    </Document>
  )
}
