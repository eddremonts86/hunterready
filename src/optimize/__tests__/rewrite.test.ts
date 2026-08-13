/**
 * The rewrite pipeline, driven by a stubbed provider.
 *
 * What is worth testing here is not the model — it is the **control flow around it**, which is where
 * the product's promise lives. A fabricated suggestion must never reach the screen, no matter how
 * good it looks, and a failed call must leave the candidate's own words intact rather than blanking
 * a bullet.
 *
 * The stub returns exactly what each test needs it to, so these run offline, in milliseconds, and
 * fail for one reason each.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Resume } from '@/schema/resume'

const RESUME = Resume.parse({
  schemaVersion: '1.0',
  basics: {
    fullName: 'Tom Whitfield',
    email: 'tom.whitfield@example.com',
    links: [],
    personalDetails: [],
  },
  work: [
    {
      company: 'Northgate Supplies',
      role: 'Account Manager',
      startDate: '2024-01',
      endDate: null,
      highlights: [
        'Responsible for a book of 40 mid-market retail accounts.',
        'Helped with quarterly business reviews.',
      ],
      tech: [],
    },
  ],
  education: [],
  skills: [],
  projects: [],
  certifications: [],
  languages: [],
  awards: [],
  publications: [],
  volunteer: [],
  custom: [],
})

/** Queues one tool-call response per model turn, so a retry can be given a different answer. */
async function withModelReturning(...payloads: Array<unknown>) {
  vi.resetModules()
  let turn = 0
  const calls: Array<unknown> = []
  vi.doMock('@/structure/provider', () => ({
    resolveProvider: () => ({
      model: 'stub',
      client: {
        messages: {
          create: async (body: unknown) => {
            calls.push(body)
            const input = payloads[Math.min(turn, payloads.length - 1)]
            turn++
            if (input === 'throw') throw new Error('provider down')
            return {
              content: [
                {
                  type: 'tool_use',
                  id: `call_${turn}`,
                  name: 'submit_rewrite',
                  input,
                },
              ],
            }
          },
        },
      },
    }),
  }))
  const { rewriteBullets } = await import('../rewrite')
  return { rewriteBullets, calls: () => calls, turns: () => turn }
}

const FIRST = { only: [{ workIndex: 0, highlightIndex: 0 }] }

afterEach(() => {
  vi.doUnmock('@/structure/provider')
  vi.resetModules()
})

describe('an honest suggestion reaches the candidate', () => {
  it('returns it with its rationale and the fields the UI needs', async () => {
    const { rewriteBullets } = await withModelReturning({
      suggestion: 'Managed a book of 40 mid-market retail accounts.',
      rationale: 'Managed is stronger than "responsible for".',
      questions: ['What was the book worth?'],
      changed: ['verb', 'concision'],
    })

    const result = await rewriteBullets({ resume: RESUME, ...FIRST })
    const [rewrite] = result.rewrites

    expect(rewrite.outcome).toBe('suggested')
    expect(rewrite.suggestion).toBe(
      'Managed a book of 40 mid-market retail accounts.',
    )
    expect(rewrite.questions).toEqual(['What was the book worth?'])
    expect(rewrite.changed).toContain('verb')
    expect(result.tally.suggested).toBe(1)
  })

  it('reports a bullet the model judged already strong as unchanged, not as a suggestion', async () => {
    // A diff that changes nothing wastes the candidate's attention, which is the scarce resource.
    const { rewriteBullets } = await withModelReturning({
      suggestion: 'Responsible for a book of 40 mid-market retail accounts',
      rationale: 'Already direct.',
      questions: [],
      changed: [],
    })

    const result = await rewriteBullets({ resume: RESUME, ...FIRST })
    expect(result.rewrites[0].outcome).toBe('unchanged')
    expect(result.rewrites[0].suggestion).toBeUndefined()
  })
})

describe('a fabricated suggestion never reaches the candidate', () => {
  it('retries once, naming the violation', async () => {
    const { rewriteBullets, turns } = await withModelReturning(
      {
        suggestion: 'Managed 40 accounts, growing revenue 25%.',
        rationale: 'Added the outcome.',
        questions: [],
        changed: ['verb'],
      },
      {
        suggestion: 'Managed a book of 40 mid-market retail accounts.',
        rationale: 'Dropped the figure I could not support.',
        questions: ['By how much did revenue grow?'],
        changed: ['verb'],
      },
    )

    const result = await rewriteBullets({ resume: RESUME, ...FIRST })
    expect(turns()).toBe(2)
    expect(result.rewrites[0].outcome).toBe('suggested')
    expect(result.rewrites[0].suggestion).not.toMatch(/25%/)
    // The pressure became a question for the candidate — the whole point of the feature.
    expect(result.rewrites[0].questions[0]).toMatch(/revenue/i)
  })

  it('keeps the original when both attempts invent, and says why', async () => {
    const { rewriteBullets } = await withModelReturning({
      suggestion: 'Managed 40 accounts, growing revenue 25% in HubSpot.',
      rationale: 'Quantified the impact.',
      questions: [],
      changed: ['verb'],
    })

    const result = await rewriteBullets({ resume: RESUME, ...FIRST })
    const [rewrite] = result.rewrites

    expect(rewrite.outcome).toBe('fabricated')
    expect(rewrite.suggestion).toBeUndefined()
    expect(rewrite.original).toBe(RESUME.work[0].highlights[0])
    expect(rewrite.rejected?.map((f) => f.value)).toEqual(
      expect.arrayContaining(['25%', 'HubSpot']),
    )
    expect(result.tally.fabricated).toBe(1)
  })

  it('catches a figure planted in a question rather than in the bullet', async () => {
    // "Was it really 40% growth?" plants the number just as well, wearing the costume of a helpful
    // prompt. The guard runs over the whole payload for exactly this.
    const { rewriteBullets } = await withModelReturning({
      suggestion: 'Managed a book of 40 mid-market retail accounts.',
      rationale: 'Stronger verb.',
      questions: ['Was that the 25% growth year?'],
      changed: ['verb'],
    })

    const result = await rewriteBullets({ resume: RESUME, ...FIRST })
    expect(result.rewrites[0].outcome).toBe('fabricated')
  })
})

describe('failure leaves the candidate their own words', () => {
  it('keeps the original when the provider is down', async () => {
    const { rewriteBullets } = await withModelReturning('throw')
    const result = await rewriteBullets({ resume: RESUME, ...FIRST })

    expect(result.rewrites[0].outcome).toBe('unavailable')
    expect(result.rewrites[0].original).toBe(RESUME.work[0].highlights[0])
    expect(result.rewrites[0].suggestion).toBeUndefined()
  })

  it('lists every requested bullet even when a call fails', async () => {
    // A silent omission reads as "this one was fine". The UI must be able to say otherwise.
    const { rewriteBullets } = await withModelReturning('throw')
    const result = await rewriteBullets({ resume: RESUME })
    expect(result.rewrites).toHaveLength(2)
    expect(result.tally.unavailable).toBe(2)
  })

  it('never mutates the resume it was given', async () => {
    const { rewriteBullets } = await withModelReturning({
      suggestion: 'Managed a book of 40 mid-market retail accounts.',
      rationale: '',
      questions: [],
      changed: [],
    })
    const before = JSON.stringify(RESUME)
    await rewriteBullets({ resume: RESUME })
    expect(JSON.stringify(RESUME)).toBe(before)
  })
})

describe('with no provider configured', () => {
  it('reports every bullet as unavailable rather than pretending', async () => {
    vi.resetModules()
    vi.doMock('@/structure/provider', () => ({
      resolveProvider: () => undefined,
    }))
    const { rewriteBullets } = await import('../rewrite')

    const result = await rewriteBullets({ resume: RESUME })
    expect(result.tally.unavailable).toBe(2)
    expect(result.rewrites.every((r) => r.suggestion === undefined)).toBe(true)
  })
})

describe('the cache key', () => {
  it('changes with the bullet and with the prompt version', async () => {
    const { rewriteCacheKey } = await import('../rewrite')
    const { REWRITE_PROMPT_VERSION } = await import('../prompt')

    expect(rewriteCacheKey('a', 'ctx')).not.toBe(rewriteCacheKey('b', 'ctx'))
    expect(rewriteCacheKey('a', 'ctx')).not.toBe(rewriteCacheKey('a', 'other'))
    expect(rewriteCacheKey('a', 'ctx')).toBe(rewriteCacheKey('a', 'ctx'))
    // The version is in the key so a prompt change invalidates every entry.
    expect(REWRITE_PROMPT_VERSION).toMatch(/^rewrite-v\d+$/)
  })
})

describe('answering a question makes the number the candidate’s own', () => {
  /**
   * The mechanism the whole feature is built around.
   *
   * A weak bullet is weak because it has no scale, and the industry answer is to invent one. We ask
   * instead — and when the candidate answers, that answer becomes source material. The guard then
   * *permits* the figure, because they wrote it. The number reaches the CV because it is theirs.
   */
  it('lets a rewrite use a figure the candidate supplied, which would otherwise be rejected', async () => {
    const suggestion = {
      suggestion: 'Ran quarterly business reviews for 12 key accounts.',
      rationale: 'Used the number you gave us.',
      questions: [],
      changed: ['verb'],
    }

    const { rewriteBullets } = await withModelReturning(suggestion)
    const withoutAnswer = await rewriteBullets({
      resume: RESUME,
      only: [{ workIndex: 0, highlightIndex: 1 }],
    })
    // 12 is nowhere in the CV, so the guard throws it away.
    expect(withoutAnswer.rewrites[0].outcome).toBe('fabricated')

    const { rewriteBullets: second } = await withModelReturning(suggestion)
    const withAnswer = await second({
      resume: RESUME,
      only: [{ workIndex: 0, highlightIndex: 1 }],
      answers: ['There were 12 key accounts in the review cycle.'],
    })
    expect(withAnswer.rewrites[0].outcome).toBe('suggested')
    expect(withAnswer.rewrites[0].suggestion).toContain('12')
  })
})

describe('the cache', () => {
  it('does not pay for the same bullet twice', async () => {
    const { cacheClear } = await import('../cache')
    cacheClear()

    const { rewriteBullets, turns } = await withModelReturning({
      suggestion: 'Managed a book of 40 mid-market retail accounts.',
      rationale: '',
      questions: [],
      changed: ['verb'],
    })

    await rewriteBullets({ resume: RESUME, ...FIRST })
    expect(turns()).toBe(1)
    await rewriteBullets({ resume: RESUME, ...FIRST })
    // Same bullet, same answers, same prompt version: no second call.
    expect(turns()).toBe(1)
  })

  it('does not serve a stale suggestion once a question has been answered', async () => {
    const { cacheClear } = await import('../cache')
    cacheClear()

    const { rewriteBullets, turns } = await withModelReturning({
      suggestion: 'Managed a book of 40 mid-market retail accounts.',
      rationale: '',
      questions: [],
      changed: ['verb'],
    })

    await rewriteBullets({ resume: RESUME, ...FIRST })
    await rewriteBullets({
      resume: RESUME,
      ...FIRST,
      answers: ['The book was worth about £2M.'],
    })
    // Answering is exactly when the right rewrite changes, so the answer is part of the key.
    expect(turns()).toBe(2)
  })

  it('never caches a failure — an outage is a fact about the last ten seconds', async () => {
    const { cacheClear, cacheSize } = await import('../cache')
    cacheClear()

    const { rewriteBullets } = await withModelReturning('throw')
    await rewriteBullets({ resume: RESUME, ...FIRST })
    // Caching it would turn one transient outage into a permanently unimprovable line.
    expect(cacheSize()).toBe(0)
  })
})
