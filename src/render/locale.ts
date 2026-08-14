/**
 * The document's own language — v0.8. EN / ES / DA.
 *
 * ## What this localizes, and what it deliberately does not
 *
 * The document's **furniture**: section headings, month names, the word for "present", the separator in
 * a date range. Not the candidate's words. Their bullets, job titles and summary stay exactly as written.
 *
 * That split is the feature, not a limitation being apologised for. Someone applying in Denmark has
 * already written their CV in Danish — ingestion reads Danish CVs, and the accuracy suite scores them.
 * What was wrong until now is that we rendered their Danish CV with an English `Experience` heading and
 * `Mar 2019` dates, so the document read as half-translated by a tool that did not notice which language
 * it was holding. Translating their *content* is a different feature with a different risk: a
 * mistranslated job title is a wrong claim about their career, and no guard in this codebase could catch
 * it.
 *
 * ## This is the ATS ruleset, not an exception to it
 *
 * docs/05 clause 6 mandates standard section headings because real parsers key on them. A Danish
 * screener keys on `Erfaring`, not `Experience`. Localizing the headings is the correct reading of that
 * rule; rendering English headings on a Danish CV was the violation.
 *
 * ## Why a small hand-written table rather than `Intl`
 *
 * `Intl.DateTimeFormat` can produce month names, and it produces different ones across Node versions and
 * ICU builds — `sept.` or `sep.` for Spanish depending on the year. The ATS round-trip test asserts exact
 * strings, and a document whose dates change shape when the runtime is upgraded is exactly the failure
 * clause 7 exists to prevent. Thirty-six month abbreviations are cheaper than that risk.
 */

/** The languages whose hiring conventions this product knows. */
export const OUTPUT_LOCALES = ['en', 'es', 'da'] as const
export type OutputLocale = (typeof OUTPUT_LOCALES)[number]

export function isOutputLocale(value: string): value is OutputLocale {
  return (OUTPUT_LOCALES as ReadonlyArray<string>).includes(value)
}

/**
 * `resume.locale` is BCP-47 (`da-DK`, `es-419`), so match on the language subtag only.
 *
 * Anything unknown falls back to English rather than throwing. A CV in a language we do not have
 * furniture for still renders correctly in every other respect, and refusing to render it would be a
 * worse answer than an English heading.
 */
export function resolveLocale(locale: string | undefined): OutputLocale {
  const tag = (locale ?? 'en').toLowerCase().split(/[-_]/)[0]
  return isOutputLocale(tag) ? tag : 'en'
}

export interface LocaleStrings {
  /** For the language picker, in the language itself — nobody looks for "Danish" in a Danish UI. */
  endonym: string
  months: ReadonlyArray<string>
  /** What a null end date prints as. */
  present: string
  /** Between the two ends of a date range. En dash everywhere; kept here so it stays one decision. */
  rangeSeparator: string
  headings: {
    summary: string
    work: string
    education: string
    skills: string
    projects: string
    certifications: string
    languages: string
    awards: string
    volunteer: string
    publications: string
  }
}

/**
 * Headings taken from what CVs in each country actually say, not from translating the English.
 *
 * `Erfaring` rather than `Arbejdserfaring` and `Experiencia` rather than `Experiencia laboral`: both
 * longer forms are correct and both are less common on a real CV, and the point of a standard heading is
 * that it is the one the screener has seen a thousand times.
 */
const STRINGS: Record<OutputLocale, LocaleStrings> = {
  en: {
    endonym: 'English',
    months: [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ],
    present: 'Present',
    rangeSeparator: ' – ',
    headings: {
      summary: 'Summary',
      work: 'Experience',
      education: 'Education',
      skills: 'Skills',
      projects: 'Projects',
      certifications: 'Certifications',
      languages: 'Languages',
      awards: 'Awards',
      volunteer: 'Volunteer',
      publications: 'Publications',
    },
  },
  es: {
    endonym: 'Español',
    months: [
      'ene',
      'feb',
      'mar',
      'abr',
      'may',
      'jun',
      'jul',
      'ago',
      'sep',
      'oct',
      'nov',
      'dic',
    ],
    present: 'Actualidad',
    rangeSeparator: ' – ',
    headings: {
      summary: 'Perfil',
      work: 'Experiencia',
      education: 'Formación',
      skills: 'Competencias',
      projects: 'Proyectos',
      certifications: 'Certificaciones',
      languages: 'Idiomas',
      awards: 'Premios',
      volunteer: 'Voluntariado',
      publications: 'Publicaciones',
    },
  },
  da: {
    endonym: 'Dansk',
    months: [
      'jan.',
      'feb.',
      'mar.',
      'apr.',
      'maj',
      'jun.',
      'jul.',
      'aug.',
      'sep.',
      'okt.',
      'nov.',
      'dec.',
    ],
    present: 'Nu',
    rangeSeparator: ' – ',
    headings: {
      summary: 'Profil',
      work: 'Erfaring',
      education: 'Uddannelse',
      skills: 'Kompetencer',
      projects: 'Projekter',
      certifications: 'Certificeringer',
      languages: 'Sprog',
      awards: 'Priser',
      volunteer: 'Frivilligt arbejde',
      publications: 'Publikationer',
    },
  },
}

export function strings(locale: OutputLocale): LocaleStrings {
  return STRINGS[locale]
}

/** For the picker. Endonyms, so a Danish speaker looks for `Dansk`. */
export function localeOptions(): Array<{ id: OutputLocale; label: string }> {
  return OUTPUT_LOCALES.map((id) => ({ id, label: STRINGS[id].endonym }))
}
