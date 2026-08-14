/**
 * The content-fit estimator (v0.2). It is a hint, not the authority — the renderer decides
 * pagination — so these tests check that the *advice* is sensible, not that a page count is exact.
 */
import { describe, expect, it } from 'vitest'
import { estimateFit } from '../fit'
import { PHOTO_BOX_PT } from '../templates/modern-base'
import { getTheme } from '../themes'
import { Resume } from '@/schema/resume'

function resumeWith(
  jobs: number,
  bulletsEach: number,
  startYear = 2020,
): Resume {
  return Resume.parse({
    schemaVersion: '1.0',
    basics: {
      fullName: 'Test Person',
      headline: 'Care Assistant',
      email: 'a@b.co',
      summary:
        'A short professional summary that runs to about one line of text.',
    },
    work: Array.from({ length: jobs }, (_, i) => ({
      company: `Employer ${i}`,
      role: 'Care Assistant',
      startDate: `${startYear + i}-01`,
      endDate: i === 0 ? null : `${startYear + i + 1}-01`,
      highlights: Array.from(
        { length: bulletsEach },
        (_, b) =>
          `A responsibility described in a sentence of realistic length, number ${b}.`,
      ),
    })),
    skills: [
      { category: 'Care', items: ['Personal care', 'Mobility support'] },
    ],
  })
}

describe('estimateFit', () => {
  it('a short CV is one page with nothing to say about it', () => {
    const fit = estimateFit(resumeWith(2, 3), getTheme('modern'))
    expect(fit.pages).toBe(1)
    expect(fit.advice).toBeUndefined()
  })

  it('compact fits more than executive on identical content', () => {
    const resume = resumeWith(8, 4, 2010)
    const compact = estimateFit(resume, getTheme('compact'))
    const executive = estimateFit(resume, getTheme('executive'))
    // The whole reason `compact` exists.
    expect(compact.pages).toBeLessThanOrEqual(executive.pages)
  })

  it('warns about a page holding only a few lines, which is the ugliest case', () => {
    // Grow the content until something spills, then check the advice names the overflow.
    for (let jobs = 3; jobs <= 12; jobs++) {
      const fit = estimateFit(resumeWith(jobs, 3, 2012), getTheme('executive'))
      if (fit.pages >= 2 && fit.lastPageFill < 0.2) {
        expect(fit.advice).toMatch(/spills|page/i)
        return
      }
    }
  })

  it('always has something actionable to say about a three-page CV', () => {
    const fit = estimateFit(resumeWith(14, 5, 2004), getTheme('executive'))
    expect(fit.pages).toBeGreaterThanOrEqual(3)
    // Either message is right, and the near-empty-last-page one is *better* when it applies: "trim
    // three lines and it fits on two" is far more useful than "three pages is a lot". The specific
    // advice deliberately wins, and this test originally asserted the wrong precedence.
    expect(fit.advice).toMatch(/first page|skim|spills/i)
  })

  it('uses the generic three-page message when the last page is genuinely full', () => {
    // Enough content that page 3 is not nearly-empty, so the overflow message does not apply.
    for (let jobs = 14; jobs <= 30; jobs++) {
      const fit = estimateFit(resumeWith(jobs, 6, 2000), getTheme('executive'))
      if (fit.pages >= 3 && fit.lastPageFill >= 0.2) {
        expect(fit.advice).toMatch(/first page|skim/i)
        return
      }
    }
    throw new Error(
      'no case produced a full third page — adjust the fixture, not the assertion',
    )
  })

  it('never advises anything a job seeker cannot act on', () => {
    for (const themeId of [
      'modern',
      'professional',
      'executive',
      'compact',
    ] as const) {
      for (let jobs = 1; jobs <= 14; jobs += 3) {
        const advice = estimateFit(
          resumeWith(jobs, 4, 2008),
          getTheme(themeId),
        ).advice
        if (advice === undefined) continue
        // Plain language only: no jargon, no metrics the reader cannot see.
        expect(advice).not.toMatch(/px|pt\b|lineHeight|ATS|token/i)
        expect(advice.length).toBeGreaterThan(30)
      }
    }
  })
})

/**
 * The photo's effect on the page estimate.
 *
 * The masthead is a row, so its height is the taller of the text column and the photo. Counting only the
 * text made the estimate short on a European CV with a photo — enough to label a two-page document
 * "1 page", which docs/11's honest-counter rule exists to prevent.
 */
describe('a photo makes the masthead taller, and the estimate knows', () => {
  const theme = getTheme('modern')

  it('fills more of the page when the photo is taller than the text beside it', () => {
    const short = resumeWith(2, 3)
    const plain = estimateFit(short, theme)
    const withPhoto = estimateFit(short, theme, { photo: true })

    expect(withPhoto.pages).toBeGreaterThanOrEqual(plain.pages)
    if (withPhoto.pages === plain.pages) {
      expect(withPhoto.lastPageFill).toBeGreaterThan(plain.lastPageFill)
    }
  })

  it('changes nothing when no photo is drawn', () => {
    // The default has to leave every existing caller's number exactly as it was.
    const short = resumeWith(2, 3)
    expect(estimateFit(short, theme, { photo: false })).toEqual(
      estimateFit(short, theme),
    )
  })

  it('takes the taller of the two columns, not the sum of them', () => {
    /**
     * The assertion that pins `max()` rather than `+`. A masthead with a headline, a contact line, links
     * *and* personal details is already taller than the 78pt photo, so adding the photo must change
     * nothing at all. Summing them would over-count by the whole text column and start warning about a
     * second page that does not exist — the opposite failure, and just as dishonest.
     */
    const tall = Resume.parse({
      schemaVersion: '1.0',
      basics: {
        fullName: 'Test Person',
        headline: 'Registered Nurse — Intensive and Post-Operative Care',
        email: 'a@b.co',
        phone: '+45 22 14 88 03',
        links: [{ label: 'LinkedIn', url: 'https://example.org/in/test' }],
        personalDetails: [{ label: 'Nationality', value: 'Danish' }],
      },
      work: [
        {
          company: 'Employer',
          role: 'Nurse',
          startDate: '2020-01',
          endDate: null,
          highlights: ['A responsibility described in one realistic sentence.'],
        },
      ],
    })

    expect(estimateFit(tall, theme, { photo: true })).toEqual(
      estimateFit(tall, theme),
    )
    // Guards the guard: if PHOTO_BOX_PT grew past that masthead, this test would pass vacuously.
    expect(PHOTO_BOX_PT).toBeLessThan(90)
  })
})
