/**
 * Content-fit estimation and page advice (v0.2).
 *
 * A CV that spills three lines onto a third page reads as careless, and the person writing it usually
 * cannot see that until the PDF exists. This estimates the length before the render so the interface
 * can say something useful while they are still editing.
 *
 * It is an **estimate and says so**. The renderer is the authority on pagination — the same content
 * lands differently under `executive` than under `compact`, and only the PDF knows. Treat this as a
 * hint that turns into a fact after the download.
 */
import type { PdfcnTheme } from '@/components/pdf/theme-types'
import type { Resume } from '@/schema/resume'

/** A4 at 96 dpi. */
const PAGE_HEIGHT = 1123

/** Characters that fit on one line at ~10.5pt across a typical text column. */
const CHARS_PER_LINE = 95

export interface FitEstimate {
  /** Estimated page count. Rounded up, minimum 1. */
  pages: number
  /** How full the last page is, 0–1. Useful for "a little over" messaging. */
  lastPageFill: number
  /** Plain-language advice, or undefined when the length is fine. */
  advice?: string
}

function lineCount(
  text: string | undefined,
  charsPerLine = CHARS_PER_LINE,
): number {
  if (text === undefined || text.trim() === '') return 0
  return Math.max(1, Math.ceil(text.trim().length / charsPerLine))
}

/** Years of experience implied by the earliest start date. */
function careerYears(resume: Resume): number {
  const years = resume.work
    .map((job) => Number(job.startDate?.slice(0, 4)))
    .filter((year) => Number.isFinite(year) && year > 1950)
  if (years.length === 0) return 0
  return 2026 - Math.min(...years)
}

export function estimateFit(resume: Resume, theme: PdfcnTheme): FitEstimate {
  const body = theme.typography.body.fontSize
  const leading = body * theme.typography.body.lineHeight
  const { page, sectionGap, componentGap } = theme.spacing

  const usable = PAGE_HEIGHT - page.marginTop - page.marginBottom
  // Narrower type fits more per line; wider margins fit fewer.
  const charsPerLine = Math.round(
    CHARS_PER_LINE *
      (10.5 / body) *
      ((595 - page.marginLeft - page.marginRight) / 507),
  )

  let height = 0

  // Header: name, headline, contact, links, summary.
  height +=
    theme.typography.heading.fontSize.h1 * theme.typography.heading.lineHeight
  height += resume.basics.headline === undefined ? 0 : leading
  height += leading // contact line
  height += resume.basics.links.length > 0 ? leading : 0
  height += resume.basics.personalDetails.length > 0 ? leading : 0
  height += lineCount(resume.basics.summary, charsPerLine) * leading

  const section = (rows: number) =>
    rows === 0 ? 0 : sectionGap + theme.typography.heading.fontSize.h2 * 1.4

  height += section(resume.work.length)
  for (const job of resume.work) {
    height += componentGap
    height += leading * 2 // title + meta
    height += lineCount(job.summary, charsPerLine) * leading
    for (const bullet of job.highlights) {
      height += lineCount(bullet, charsPerLine) * leading
    }
  }

  height += section(resume.education.length)
  for (const entry of resume.education) {
    height += componentGap + leading * 2
    height += entry.highlights.length * leading
  }

  height += section(resume.skills.length)
  for (const group of resume.skills) {
    height +=
      lineCount(`${group.category}: ${group.items.join(', ')}`, charsPerLine) *
      leading
  }

  height += section(resume.projects.length)
  for (const project of resume.projects) {
    height += componentGap + leading
    height += lineCount(project.description, charsPerLine) * leading
    height += project.highlights.length * leading
  }

  height += section(resume.certifications.length)
  height += resume.certifications.length * leading

  height += section(resume.languages.length)
  height += resume.languages.length > 0 ? leading : 0

  for (const custom of resume.custom) {
    height += section(1) + custom.items.length * leading
  }

  const pages = Math.max(1, Math.ceil(height / usable))
  const lastPageFill = Math.min(1, (height % usable || usable) / usable)

  return { pages, lastPageFill, advice: adviseOn(pages, lastPageFill, resume) }
}

/**
 * The advice is about the reader, not about a rule. Two pages is normal for an experienced person;
 * three is where a recruiter starts skimming. And a third page holding four lines is the one case
 * worth flagging loudly, because it is both the ugliest and the easiest to fix.
 */
function adviseOn(
  pages: number,
  lastPageFill: number,
  resume: Resume,
): string | undefined {
  const years = careerYears(resume)

  if (pages >= 2 && lastPageFill < 0.2) {
    return `This spills a little onto page ${pages}. Trimming a few lines would pull it back to ${pages - 1} — a page with three lines on it looks accidental.`
  }

  if (pages >= 3) {
    return `This runs to ${pages} pages. Most recruiters read the first page and skim the second, so the strongest material needs to be near the top.`
  }

  if (pages === 2 && years > 0 && years < 8) {
    return `This runs to two pages for about ${years} years of experience. One page is the usual expectation at that stage — but two is fine if every line earns its place.`
  }

  if (pages === 1 && years >= 12) {
    return `One page for ${years}+ years is tight. If you have cut real achievements to fit, a second page is expected at your level.`
  }

  return undefined
}
