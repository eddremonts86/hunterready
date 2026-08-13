/**
 * Field labels used by form- and table-shaped CVs.
 *
 * A large share of real CVs — especially Danish and German ones — are built as a two-column Word
 * table: label on the left, value on the right. Flattened row-wise that becomes
 *
 *     Navn
 *     Eline Storm Johnsen
 *     E-mailadresse
 *     eline_storm@hotmail.com
 *
 * which is correct flattening and completely useless unless something knows that `Navn` is a label
 * rather than a value. Without this, the first real CV we tested extracted its owner's name as
 * "Personlige oplysninger Navn" — the section heading plus the field label.
 *
 * Languages come in the same shape (`Dansk` / `Modersmål`), which is why proficiency words are here
 * too: they are how we tell a language name from its level when the pair arrives as two lines.
 */

export type LabelKind =
  | 'name'
  | 'email'
  | 'phone'
  | 'address'
  | 'birthdate'
  | 'nationality'
  | 'website'
  | 'title'
  | 'other'

const LABELS: Array<[LabelKind, Array<string>]> = [
  [
    'name',
    ['navn', 'name', 'nombre', 'fulde navn', 'full name', 'nombre completo'],
  ],
  [
    'email',
    [
      'e mailadresse',
      'e mail',
      'email',
      'emailadresse',
      'mail',
      'correo',
      'correo electronico',
    ],
  ],
  [
    'phone',
    [
      'telefonnummer',
      'telefon',
      'phone',
      'telephone',
      'mobil',
      'mobile',
      'telefono',
      'movil',
      'tel',
    ],
  ],
  ['address', ['adresse', 'address', 'direccion', 'bopael']],
  [
    'birthdate',
    [
      'fodselsdato',
      'foedselsdato',
      'date of birth',
      'fecha de nacimiento',
      'born',
      'alder',
      'age',
    ],
  ],
  [
    'nationality',
    ['nationalitet', 'nationality', 'nacionalidad', 'statsborgerskab'],
  ],
  [
    'website',
    ['hjemmeside', 'website', 'web', 'linkedin', 'portfolio', 'sitio web'],
  ],
  ['title', ['stilling', 'titel', 'title', 'puesto', 'cargo', 'job title']],
]

/** Proficiency words, so a language/level pair split across two lines can be rejoined. */
const PROFICIENCY = [
  // da
  'modersmal',
  'flydende',
  'meget godt',
  'godt',
  'nogen kendskab',
  'begynder',
  // en
  'native',
  'mother tongue',
  'fluent',
  'advanced',
  'intermediate',
  'basic',
  'beginner',
  'conversational',
  // es
  'lengua materna',
  'nativo',
  'nativa',
  'fluido',
  'avanzado',
  'intermedio',
  'basico',
  'principiante',
]

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The label kind when this line *is* a bare field label, not a value that mentions one. */
export function matchLabel(text: string): LabelKind | undefined {
  const normalized = normalize(text)
  if (normalized === '' || normalized.split(' ').length > 3) return undefined

  for (const [kind, phrases] of LABELS) {
    if (phrases.includes(normalized)) return kind
  }
  return undefined
}

export function isLabel(text: string): boolean {
  return matchLabel(text) !== undefined
}

/**
 * Words people put in front of a level, which the level lists do not carry: `nivel intermedio`,
 * `level: fluent`, `niveau avanzado`. Matching only the bare word meant a real CV's
 * "English — nivel intermedio" produced a language with no level at all.
 */
const LEVEL_QUALIFIER = /^(?:nivel|level|niveau|niveau de|nivel de|level of)\s+/

/** The level phrase with any qualifier removed, normalized. */
function levelText(text: string): string {
  return normalize(text).replace(LEVEL_QUALIFIER, '').trim()
}

/** True when the line is a proficiency level rather than a language name. */
export function isProficiency(text: string): boolean {
  const normalized = normalize(text)
  const bare = levelText(text)
  return (
    PROFICIENCY.includes(normalized) ||
    PROFICIENCY.includes(bare) ||
    /^[abc][12]\b/.test(normalized)
  )
}

/** CEFR level if the text states or implies one. */
export function toCefr(
  text: string,
): 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'native' | undefined {
  const normalized = levelText(text)
  const explicit = /\b([abc][12])\b/.exec(normalized)
  if (explicit !== null) {
    return explicit[1].toUpperCase() as 'A1'
  }
  if (
    [
      'modersmal',
      'native',
      'mother tongue',
      'lengua materna',
      'nativo',
      'nativa',
    ].includes(normalized)
  ) {
    return 'native'
  }
  if (['flydende', 'fluent', 'fluido'].includes(normalized)) return 'C1'
  if (['meget godt', 'advanced', 'avanzado'].includes(normalized)) return 'B2'
  if (
    ['godt', 'intermediate', 'intermedio', 'conversational'].includes(
      normalized,
    )
  )
    return 'B1'
  if (
    ['begynder', 'beginner', 'basic', 'basico', 'principiante'].includes(
      normalized,
    )
  )
    return 'A2'
  return undefined
}
