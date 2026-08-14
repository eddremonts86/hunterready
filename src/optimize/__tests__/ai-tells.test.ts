/**
 * The AI-tell checker.
 *
 * Two properties matter, and the second is the one that keeps this from becoming a nuisance:
 *
 * 1. It finds the phrases a recruiter has learned to spot.
 * 2. It stays quiet on a real CV. The audience is every sector, so a word list that fires on "align the
 *    pallets" or a landscaper's "landscape" would flag correct documents until somebody muted it — and
 *    a muted check takes the useful findings with it.
 */
import { describe, expect, it } from 'vitest'
import {
  countAiTells,
  describeAiTells,
  findAiTells,
  pickCleaner,
} from '../ai-tells'

const kinds = (text: string) => findAiTells(text).map((tell) => tell.kind)
const phrases = (text: string) => findAiTells(text).map((tell) => tell.phrase)

describe('it finds what a recruiter has learned to spot', () => {
  it('catches the vocabulary', () => {
    expect(kinds('I leveraged a robust and seamless process.')).toContain(
      'vocabulary',
    )
    expect(phrases('Delving into the intricacies of the role.')).toEqual(
      expect.arrayContaining(['delving', 'intricacies']),
    )
  })

  it('catches negative parallelism', () => {
    expect(
      kinds('Not only did I lead the rota, but also trained the team.'),
    ).toContain('negative-parallelism')
    expect(kinds("It's not just a job, it's a calling.")).toContain(
      'negative-parallelism',
    )
    expect(kinds('This is more than just a warehouse role.')).toContain(
      'negative-parallelism',
    )
  })

  it('catches the -ing clause that adds emphasis and no information', () => {
    expect(
      kinds('Ran the weekly cycle count, showcasing my attention to detail.'),
    ).toContain('ing-analysis')
    expect(
      kinds('Rebuilt the pick path, thereby demonstrating initiative.'),
    ).toContain('ing-analysis')
  })

  it('catches character claims nobody can check', () => {
    expect(
      kinds('A results-driven team player, passionate about logistics.'),
    ).toContain('promotional')
    expect(kinds('I have a proven track record and wear many hats.')).toContain(
      'promotional',
    )
  })

  it('catches filler', () => {
    expect(
      kinds(
        "In today's fast-paced environment, it is important to note that...",
      ),
    ).toContain('filler')
    expect(kinds('Communication plays a crucial role in the unit.')).toContain(
      'filler',
    )
  })

  it('catches the cover-letter lines read ten thousand times', () => {
    expect(kinds('I have long admired your esteemed organisation.')).toContain(
      'cover-letter-cliche',
    )
    expect(
      kinds(
        'Seeking a challenging role where I can contribute to your continued success.',
      ),
    ).toContain('cover-letter-cliche')
    expect(
      kinds(
        'I was thrilled to see this vacancy and believe I am an ideal fit for it.',
      ),
    ).toContain('cover-letter-cliche')
  })
})

describe('it stays quiet on a real CV', () => {
  it('says nothing about ordinary bullets from four different sectors', () => {
    /**
     * The assertion that keeps this usable. Every line here is the kind of thing the fixtures actually
     * contain, across a nurse, a warehouse supervisor, an account manager and a chef.
     */
    const real = [
      'Led nursing handover for a 24-bed unit across rotating three-shift cover.',
      'Precepted 14 newly graduated nurses through their first six months.',
      'Supervised a 30-person shift across inbound and outbound docks.',
      'Ran the weekly cycle-count programme and reconciled discrepancies.',
      'Managed a book of 40 mid-market retail accounts.',
      'Rebuilt the pick-path layout after mapping where pickers actually walked.',
      'Held the forklift licence and trained four new drivers on it.',
      'Covered triage during the department’s winter escalation periods.',
    ]
    for (const line of real) {
      expect(findAiTells(line), line).toEqual([])
    }
  })

  it('does not fire on the concrete senses of align and landscape', () => {
    // A warehouse CV aligns pallets; a landscaper works on landscapes. A tech-flavoured word list would
    // misfire on exactly the people this product is for.
    expect(findAiTells('Aligned the pallets before wrapping.')).toEqual([])
    expect(
      findAiTells('Maintained the hospital grounds and landscape.'),
    ).toEqual([])
    // But the abstract uses are caught.
    expect(kinds('My skills align with your requirements.')).toContain(
      'vocabulary',
    )
    expect(kinds('Experience across the digital landscape.')).toContain(
      'vocabulary',
    )
  })

  it('leaves the en dash alone, because the ATS ruleset mandates it', () => {
    // A checker that flagged `Mar 2019 – Present` or `Role — Employer` would fire on every correct
    // document, get muted, and take the useful findings with it.
    expect(findAiTells('Shift Lead Nurse — Rigshospitalet')).toEqual([])
    expect(findAiTells('Mar 2019 – Present')).toEqual([])
  })

  it('leaves a genuine list of three alone', () => {
    // A CV is full of real lists. Telling a padded triple from a real one needs the content, and a check
    // that guesses is a check that cries wolf.
    expect(
      findAiTells('Intensive care, ventilator management and triage.'),
    ).toEqual([])
  })
})

describe('the retry gets something actionable', () => {
  it('names the exact phrases rather than asking for a better tone', () => {
    const message = describeAiTells(
      findAiTells(
        'Not only leveraged the system, but also showcasing results.',
      ),
    )
    expect(message).toMatch(/leveraged|showcasing|Not only/)
    // "Make it sound more human" is not actionable, so the message must quote.
    expect(message).toContain('"')
  })

  it('says nothing when there is nothing to say', () => {
    expect(describeAiTells([])).toBe('')
  })
})

describe('the cleaner of two attempts wins, and a tie keeps the first', () => {
  it('takes the retry when it has fewer tells', () => {
    const first = 'I leveraged a robust process, showcasing my skills.'
    const second = 'I ran the process and trained the team on it.'
    expect(pickCleaner(first, second)).toBe(second)
    expect(countAiTells(second)).toBe(0)
  })

  it('keeps the first when the retry is no better', () => {
    // A retry has to earn its place. Preferring the newer version on a tie churns output for nothing.
    const first = 'I ran the rota.'
    const second = 'I managed the rota.'
    expect(pickCleaner(first, second)).toBe(first)
  })

  it('keeps the first when the retry is worse', () => {
    const first = 'I ran the rota for a 24-bed unit.'
    const second = 'I leveraged a seamless approach to the rota.'
    expect(pickCleaner(first, second)).toBe(first)
  })
})
