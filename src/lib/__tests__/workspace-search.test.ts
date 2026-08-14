import { describe, expect, it } from 'vitest'
import {
  PANELS,
  validateWorkspaceSearch as parse,
} from '@/lib/workspace-search'

describe('the workspace search params', () => {
  it('keeps every panel the sidebar actually has', () => {
    for (const entry of PANELS) {
      expect(parse({ panel: entry.id })).toEqual({ panel: entry.id })
    }
  })

  it('drops a panel that does not exist rather than throwing', () => {
    // The landing page is the one screen that has to survive a mistyped or truncated link.
    expect(parse({ panel: 'nonsense' })).toEqual({})
    expect(parse({ panel: '' })).toEqual({})
    expect(parse({ panel: 42 })).toEqual({})
    expect(parse({ panel: null })).toEqual({})
  })

  it('reads compare from a hand-typed link and from the router', () => {
    expect(parse({ compare: 'true' })).toEqual({ compare: true })
    expect(parse({ compare: true })).toEqual({ compare: true })
  })

  it('does not treat every truthy-looking value as a yes', () => {
    /*
      The trap being avoided: a loose `Boolean(search.compare)` would make `?compare=0` and
      `?compare=false` both switch the comparison **on**, which is the opposite of what was asked.
    */
    for (const value of ['false', '0', '1', 'yes', 0, 1, 'TRUE']) {
      expect(parse({ compare: value })).toEqual({})
    }
  })

  it('passes a cv id through untouched, and ignores an empty one', () => {
    expect(parse({ cv: '69907cf2-e92a-4572-9342-fd174e970403' })).toEqual({
      cv: '69907cf2-e92a-4572-9342-fd174e970403',
    })
    expect(parse({ cv: '' })).toEqual({})
    expect(parse({ cv: 12345 })).toEqual({})
  })

  it('leaves the default panel out, so the front door stays "/"', () => {
    // `check` is a legal value in a link somebody wrote, but nothing this app produces writes it.
    expect(parse({})).toEqual({})
    expect(parse({ panel: 'check' })).toEqual({ panel: 'check' })
  })

  it('reads the three together and ignores anything else in the URL', () => {
    expect(
      parse({
        panel: 'design',
        compare: 'true',
        cv: 'abc',
        // Analytics junk, a stale param from an older build, or somebody's tracking tag.
        utm_source: 'newsletter',
        step: '3',
      }),
    ).toEqual({ panel: 'design', compare: true, cv: 'abc' })
  })

  it('never carries the CV itself', () => {
    /*
      The privacy line, enforced rather than documented: a resume in a URL is a resume in browser history,
      in a server access log and in any link shortener it passes through. Nothing this validator returns can
      hold document content, so a future `?resume=` param cannot arrive by accident.
    */
    const parsed = parse({
      resume: '{"basics":{"fullName":"Marta"}}',
      cv: 'abc',
    })
    expect(parsed).toEqual({ cv: 'abc' })
    expect(JSON.stringify(parsed)).not.toContain('Marta')
  })
})
