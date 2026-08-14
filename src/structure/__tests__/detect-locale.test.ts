import { describe, expect, it } from 'vitest'
import { detectLocale } from '@/structure/detect-locale'

const ENGLISH = `
  Registered nurse with twelve years of experience in intensive care.
  Responsible for handover quality and the induction of new graduates.
  EXPERIENCE Shift Lead Nurse — led nursing handover for a 24-bed unit
  with rotating shifts. EDUCATION BSc Nursing. SKILLS Clinical management,
  triage, medication safety. Worked with teams from three wards.
`

const SPANISH = `
  Enfermera titulada con doce años de experiencia en cuidados intensivos.
  Responsable de la calidad del traspaso y la formación de nuevas graduadas.
  EXPERIENCIA Enfermera jefa de turno — gestión de una unidad de 24 camas
  como responsable de guardias. EDUCACIÓN Grado en Enfermería. HABILIDADES
  Gestión clínica, triaje. Trabajo en equipo desde 2014 hasta 2020, para
  tres plantas, con años de guardias.
`

const DANISH = `
  Sygeplejerske med tolv års erfaring på intensivafdeling, hvor jeg havde
  ansvar for overlevering og oplæring. ERFARING Teamleder på en afdeling
  med 24 senge, hvor jeg også arbejdede med kvalitet, både på dag- og
  nattevagter, og når afdelingen var presset. UDDANNELSE Sygeplejerske.
  KOMPETENCER Klinisk arbejde og ansvar for triage, og oplæring.
`

describe('locale detection', () => {
  it('reads each output language from its own prose', () => {
    expect(detectLocale(ENGLISH)).toBe('en')
    expect(detectLocale(SPANISH)).toBe('es')
    expect(detectLocale(DANISH)).toBe('da')
  })

  it('falls back to English rather than guessing', () => {
    // Too short to carry evidence — the schema default is the least surprising wrong answer.
    expect(detectLocale('Marta Sørensen +45 22 14 88 03')).toBe('en')
    expect(detectLocale('')).toBe('en')
    // Numbers and proper nouns carry no language.
    expect(detectLocale('2019 2020 2021 Rigshospitalet København 12345')).toBe(
      'en',
    )
  })

  it('is not fooled by a few borrowed words', () => {
    // An English CV that names a Spanish certification stays English.
    const text = `${ENGLISH} Certificación oficial de español obtained in Madrid.`
    expect(detectLocale(text)).toBe('en')
  })
})
