/**
 * Known CV section headings, in the languages we support.
 *
 * Typography alone is not a reliable heading signal, and finding that out cost a rewrite: in a
 * real fixture every glyph came back as the same regular font face (the renderer had substituted
 * it), so bold detection was uniformly false and the only remaining signal was size — which made
 * the **candidate's name** the most heading-like line on the page.
 *
 * A vocabulary is the honest primary signal. Our own ATS ruleset mandates standard headings, real
 * parsers key on them, and the words are few and stable. Typography stays as a fallback for
 * headings we do not know.
 *
 * Language coverage matches PRODUCT.md: English, Spanish, Danish. Sector-neutral throughout — a
 * nurse's "Autorisation" and an engineer's "Tech stack" are both just sections.
 */

/** Canonical section keys the extraction prompt understands. */
export type SectionKind =
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'certifications'
  | 'languages'
  | 'awards'
  | 'publications'
  | 'volunteer'
  | 'courses'
  | 'references'
  | 'interests'
  | 'personal'
  | 'other'

/**
 * Longest-first within each kind, so "work experience" wins over "work". Values are already
 * normalized: lowercase, unaccented, no punctuation.
 */
const VOCABULARY: Array<[SectionKind, Array<string>]> = [
  [
    'experience',
    [
      // en
      'professional experience',
      'work experience',
      'employment history',
      'career history',
      'experience',
      'employment',
      'work history',
      // es
      'experiencia profesional',
      'experiencia laboral',
      'experiencia',
      'trayectoria profesional',
      // da
      'erhvervserfaring',
      'arbejdserfaring',
      'erfaring',
      'ansaettelser',
    ],
  ],
  [
    'education',
    [
      'education and training',
      'education',
      'academic background',
      'qualifications',
      'formacion academica',
      'formacion',
      'educacion',
      'estudios',
      'uddannelse',
      'uddannelser',
    ],
  ],
  [
    'skills',
    [
      'skills and competencies',
      'technical skills',
      'core skills',
      'key skills',
      'competencies',
      'skills',
      'habilidades',
      'competencias',
      'aptitudes',
      'conocimientos',
      'kompetencer',
      'kernekompetencer',
      'faglige kompetencer',
      'faerdigheder',
      'it kompetencer',
      'competencias clave',
    ],
  ],
  ['projects', ['selected projects', 'projects', 'proyectos', 'projekter']],
  [
    'certifications',
    [
      'certifications and licences',
      'certifications and licenses',
      'certifications',
      'certificates',
      'licences',
      'licenses',
      'accreditations',
      'certificaciones',
      'certificados',
      'titulaciones',
      'autorisation',
      'certificeringer',
    ],
  ],
  [
    'languages',
    ['languages', 'idiomas', 'lenguas', 'sprog', 'sprogkundskaber'],
  ],
  ['awards', ['awards and honours', 'awards', 'honours', 'premios', 'priser']],
  ['publications', ['publications', 'publicaciones', 'publikationer']],
  [
    'volunteer',
    [
      'volunteer experience',
      'volunteering',
      'volunteer',
      'voluntariado',
      'frivilligt arbejde',
    ],
  ],
  [
    'courses',
    ['courses and training', 'training', 'courses', 'cursos', 'kurser'],
  ],
  ['references', ['references', 'referencias', 'referencer']],
  [
    'interests',
    [
      'interests and activities',
      'interests',
      'hobbies',
      'intereses',
      'interesser',
    ],
  ],
  [
    'personal',
    [
      'personal details',
      'personal information',
      'datos personales',
      'informacion personal',
      'personlige oplysninger',
      'persondata',
      // Bare forms: designed CVs label the block with one word, and a letter-spaced "D ATO S"
      // only collapses if the stripped form is recognisable here.
      'datos',
      'details',
    ],
  ],
  [
    'summary',
    [
      'professional summary',
      'personal profile',
      'career objective',
      'about me',
      'summary',
      'profile',
      'objective',
      'about',
      'perfil profesional',
      'perfil',
      'resumen',
      'sobre mi',
      'objetivo',
      'profil',
      'resume',
    ],
  ],
]

/** Lowercase, strip accents and trailing punctuation, collapse whitespace. */
export function normalizeHeading(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[:.·|—–-]+\s*$/, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A heading tracked out letter by letter, joined back up — or `undefined` if it is not one.
 *
 * Designed CVs set section headings with heavy letter-spacing, and a PDF text layer preserves it as
 * real spaces: `FORMACIÓN` arrives as `F O R M A C I Ó N`. That normalizes to nine "words", so the
 * four-word guard below threw it away and **the whole section vanished** — every entry under it lost,
 * silently, on exactly the kind of CV somebody paid a designer for. It is what cost the Spanish
 * fixture its education section (docs/08), and it is not a Spanish problem: any tracked-out heading in
 * any language disappears the same way.
 *
 * The test is that *every* token is a single character. Prose cannot satisfy that, so this cannot
 * misfire on the sentence the guard exists to reject. Four tokens minimum, because a genuine
 * three-word heading needs no help and should go down the normal path.
 *
 * Word boundaries are lost on the way in — `normalizeHeading` collapses runs of whitespace, so
 * `F O R M A C I Ó N  A C A D É M I C A` cannot be told from one long word. That is why the caller
 * compares against the vocabulary with its spaces removed rather than trying to put them back.
 */
function collapseLetterSpaced(normalized: string): string | undefined {
  const tokens = normalized.split(' ')
  if (tokens.length < 4) return undefined
  if (!tokens.every((token) => token.length === 1)) return undefined
  return tokens.join('')
}

/**
 * Returns the section kind when the line *is* a heading, not merely when it mentions one.
 * "Experience" matches; "I have 12 years of experience in intensive care" must not, or every
 * summary paragraph becomes a section break.
 */
export function matchSection(text: string): SectionKind | undefined {
  const normalized = normalizeHeading(text)
  if (normalized === '') return undefined

  /**
   * The letter-spaced path is tried first and returns on its own.
   *
   * It has to come before the four-word guard, which is precisely what was rejecting these lines. It
   * does not fall through to the exact match afterwards: a line of single characters either spells a
   * heading or is not one, and letting it continue would only ever compare `f o r m a c i o n` against
   * a vocabulary that has no spaced entries.
   */
  const collapsed = collapseLetterSpaced(normalized)
  if (collapsed !== undefined) {
    for (const [kind, phrases] of VOCABULARY) {
      for (const phrase of phrases) {
        if (collapsed === phrase.replace(/ /g, '')) return kind
      }
    }
    return undefined
  }

  if (normalized.split(' ').length > 4) return undefined

  for (const [kind, phrases] of VOCABULARY) {
    for (const phrase of phrases) {
      if (normalized === phrase) return kind
    }
  }
  return undefined
}

export function isKnownSectionHeading(text: string): boolean {
  return matchSection(text) !== undefined
}
