/**
 * Cross-field sanity checks on an extracted resume.
 *
 * Per-field confidence catches "I am unsure I read this correctly". It cannot catch a set of
 * individually-plausible values that are jointly impossible — and that is a real failure mode we
 * hit in testing: an extraction returned two roles with an open end date, which renders as two
 * jobs both labelled "Present". Every field looked fine; the combination was wrong, and it was
 * wrong *in the output the user sends to an employer*.
 *
 * So these are checks on the shape of a career, phrased for the person rather than the developer.
 * They are warnings, never corrections: we do not know which of the two jobs is the current one,
 * and guessing would be exactly the fabrication this project refuses.
 */
import type { Resume } from '@/schema/resume'

const CURRENT_YEAR = 2026

export function sanityWarnings(resume: Resume): Array<string> {
  const warnings: Array<string> = []

  // Two "still there" roles. Legitimate for a second job, but far more often a missed end date.
  const open = resume.work.filter((item) => item.endDate === null)
  if (open.length > 1) {
    warnings.push(
      `We read ${open.length} jobs as still ongoing, so they will all print as “Present”. If one of them has ended, please add its end date.`,
    )
  }

  const missingDates = resume.work.filter(
    (item) => item.startDate === undefined,
  )
  if (missingDates.length > 0) {
    warnings.push(
      `${missingDates.length === 1 ? 'One job has' : `${missingDates.length} jobs have`} no start date. Automated screening often sorts by date, so it is worth filling in.`,
    )
  }

  // An end before a start is always an error, never a career.
  for (const item of resume.work) {
    if (item.startDate === undefined || item.endDate === null) continue
    if (item.endDate < item.startDate) {
      warnings.push(
        `One job ends before it starts (${item.startDate} to ${item.endDate}). Please check those dates.`,
      )
      break
    }
  }

  const futureYear = resume.work.find((item) => {
    const year = Number(item.startDate?.slice(0, 4) ?? 0)
    return year > CURRENT_YEAR
  })
  if (futureYear !== undefined) {
    warnings.push('One start date is in the future. Please check it.')
  }

  // Education marked ongoing is the same class of miss as an open-ended job, and it reads worse:
  // a finished qualification printed as "Present" looks like an unfinished one.
  const openStudy = resume.education.filter((item) => item.endDate === null)
  if (openStudy.length > 0 && resume.work.length > 0) {
    warnings.push(
      `${openStudy.length === 1 ? 'One qualification is' : `${openStudy.length} qualifications are`} shown as still in progress, so ${openStudy.length === 1 ? 'it' : 'they'} will print as “Present”. If you have finished, please add the year.`,
    )
  }

  if (resume.basics.email === undefined) {
    warnings.push(
      'We did not find an email address. Without one a recruiter cannot reply to you.',
    )
  }

  if (resume.work.length === 0) {
    warnings.push(
      'We did not find any work history. That usually means the file was hard to read — check the original, or add your jobs below.',
    )
  }

  if (resume.skills.length === 0) {
    warnings.push(
      'We did not find a skills section. Screening tools look for one, so it is worth adding.',
    )
  }

  return warnings
}
