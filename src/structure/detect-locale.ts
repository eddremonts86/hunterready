/**
 * Which language a CV is written in — decided locally, before any model sees it.
 *
 * The language panel used to default to English whatever arrived, so a Danish CV rendered with Danish
 * headings only after its owner noticed and switched by hand (Edd: "al agregar el CV este panel debería
 * ser capaz de saber en qué idioma está"). Detection sets `resume.locale` at extraction time, and the
 * panel simply reflects it.
 *
 * A stopword count, not a model call, and that is a considered choice: the three output languages are
 * lexically far apart, a CV is hundreds of words long, and the answer is needed on the rules path too —
 * where no model is available at all. Function words are the tell: prose in a language cannot avoid its
 * own prepositions. Section headings weigh in as well because CVs are heading-dense and the headings are
 * the most language-marked lines on the page.
 *
 * English is the tie-breaker and the floor, because it is the schema default and the least surprising
 * wrong answer: an undetected Danish CV in English furniture is the pre-detection status quo, while a
 * false Danish answer on an English CV would be a regression somebody has to notice.
 */
import type { OutputLocale } from '@/render/locale'

/**
 * Function words and CV furniture per language, chosen to be unambiguous ACROSS the three.
 *
 * Words shared between two of them are deliberately absent: `en` appears in English prose and is
 * Spanish's commonest preposition; `er`/`de` cross Danish and Spanish. A marker that scores two
 * languages at once only adds noise to the margin the decision rests on.
 */
const MARKERS: Record<OutputLocale, ReadonlyArray<string>> = {
  en: [
    'the',
    'and',
    'with',
    'for',
    'of',
    'experience',
    'education',
    'skills',
    'responsible',
    'management',
    'work',
    'from',
  ],
  es: [
    'experiencia',
    'educación',
    'formación',
    'habilidades',
    'trabajo',
    'desde',
    'hasta',
    'responsable',
    'gestión',
    'para',
    'como',
    'años',
  ],
  da: [
    'og',
    'på',
    'jeg',
    'erfaring',
    'uddannelse',
    'kompetencer',
    'arbejde',
    'ansvar',
    'hvor',
    'også',
    'når',
    'både',
  ],
}

/**
 * The winner needs this many marker hits, or the answer stays `en`.
 *
 * A scanned page of OCR noise, a CV that is mostly proper nouns and dates, or a two-line stub should
 * not flip the furniture into another language on three accidental matches.
 */
const MIN_HITS = 6

export function detectLocale(text: string): OutputLocale {
  const words = text
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((word) => word !== '')
  if (words.length === 0) return 'en'

  const counts = new Map<string, number>()
  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1)
  }

  const scores = (Object.keys(MARKERS) as Array<OutputLocale>).map(
    (locale) => ({
      locale,
      hits: MARKERS[locale].reduce(
        (sum, marker) => sum + (counts.get(marker) ?? 0),
        0,
      ),
    }),
  )

  scores.sort((a, b) => b.hits - a.hits)
  const [best, second] = scores

  // A clear winner, or English. "Clear" means both an absolute floor and daylight over the runner-up —
  // a 7-to-6 photo finish between Spanish and Danish is a coin flip wearing a score.
  if (best.hits < MIN_HITS) return 'en'
  if (best.hits < second.hits * 2 && best.locale !== 'en') {
    return best.hits - second.hits >= MIN_HITS ? best.locale : 'en'
  }
  return best.locale
}
