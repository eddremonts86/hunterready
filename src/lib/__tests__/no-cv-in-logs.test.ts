/**
 * The one hard rule in CLAUDE.md that had no automated proof behind it.
 *
 *   "No CV content in logs, errors, analytics or telemetry. Ever." (docs/07-privacy.md)
 *
 * It has held so far by construction, and every piece of that construction is a decision somebody
 * made carefully and nobody guarded: `log.ts` takes an allowlist of field names, `narrate.ts` was
 * built so characters only ever accumulate in key position, `/api/render` stopped returning zod
 * issues because a zod issue quotes the value it rejected. None of those was tested. `log.ts` itself,
 * the module that enforces the rule, had no test file at all.
 *
 * The v0.1 spec's verifier for this assumed an error reporter that was never wired — there is no
 * Sentry in this repo — so the check was recorded as **unrun** and carried to the roadmap. This is
 * the runnable half: it needs no reporter, because it watches the paths that exist.
 *
 * See docs/plans/11-verifier-5-instrument.md.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { event, errorEvent } from '../log'
import { extractByRules } from '@/structure/fallback'

/** Captures both channels, because `event` writes to stdout and `errorEvent` to stderr. */
function capture(run: () => void): string {
  const lines: Array<string> = []
  const push = (l: unknown) => void lines.push(String(l))
  const out = vi.spyOn(console, 'log').mockImplementation(push)
  const err = vi.spyOn(console, 'error').mockImplementation(push)
  try {
    run()
  } finally {
    out.mockRestore()
    err.mockRestore()
  }
  return lines.join('\n')
}

afterEach(() => vi.restoreAllMocks())

describe('the logger denies strings by default', () => {
  it('redacts a string on a field nobody allowlisted', () => {
    // The shape of the accident: a job title reaches a log through a plausible-looking field name.
    const written = capture(() =>
      event('test.thing', { headline: 'Registered Nurse, Intensive Care' }),
    )
    expect(written).not.toContain('Registered Nurse')
    expect(written).toContain('[redacted]')
  })

  it('lets numbers and booleans through, which is what a log is for', () => {
    const written = capture(() =>
      event('test.counts', { fields: 27, ok: true, ms: 1840 }),
    )
    expect(written).toContain('27')
    expect(written).toContain('true')
  })

  it('applies the same rule on the error channel', () => {
    // `errorEvent` is the path an exception takes, and an exception is where content usually rides.
    const written = capture(() =>
      errorEvent('test.failed', { detail: 'Marta Sørensen, Rigshospitalet' }),
    )
    expect(written).not.toContain('Sørensen')
    expect(written).toContain('[redacted]')
  })

  it('truncates an oversized string even on an allowlisted field', () => {
    const written = capture(() => event('test.long', { code: 'x'.repeat(400) }))
    expect(written).toContain('[oversized]')
  })
})

/**
 * The allowlist is the whole guarantee, so it is pinned.
 *
 * Not to freeze it — names get added, that is fine — but to make adding one **visible in a diff**.
 * A name added quietly is how a field that carries a code today carries a filename next year, which
 * is the exact reasoning `log.ts` already records about `summaryOutcome`.
 */
describe('the allowlist is a reviewed list', () => {
  it('contains exactly these names', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/log.ts'), 'utf8')
    const block = source.slice(
      source.indexOf('const STRING_ALLOWLIST'),
      source.indexOf('])', source.indexOf('const STRING_ALLOWLIST')),
    )
    const names = [...block.matchAll(/^\s*'([a-zA-Z]+)',$/gm)].map((m) => m[1])

    expect(names.sort()).toEqual(
      [
        'attempt',
        /*
          Added 2026-08-19 with plan 01's webhook, and this is the diff the pin exists to produce.

          `billingKind` is Stripe's event type — `customer.subscription.updated` — and
          `billingOutcome` is one of `pro`, `free`, `ignored`. The handler passes exactly these two
          and nothing else from the event, and the ledger they describe holds no amount, no currency,
          no card and no customer (ADR-034), so there is no personal value in reach of either name.
        */
        'billingKind',
        'billingOutcome',
        'code',
        'event',
        'format',
        'level',
        'method',
        'promptVersion',
        'provider',
        'providerPinned',
        'providersConfigured',
        'providersSkipped',
        'requestId',
        'shape',
        'status',
        'stop',
        'summaryOutcome',
      ].sort(),
    )
  })
})

/**
 * Nothing hands a CV field to a log call.
 *
 * Static, over the source, because the runtime test below can only prove the paths it happens to
 * walk. This one is cheap and total: it reads every file and looks for a `Resume` shape inside the
 * arguments of `event(` or `errorEvent(`.
 */
describe('no source file passes CV content to a log call', () => {
  /*
    Reaching *into* a CV, and doing something with it other than counting.

    Two versions of this were wrong before it was right, and both failures are the point of the
    comment. Matching the bare word `summary` flagged `summaryOutcome: summary.outcome`, which is a
    deliberately allowlisted closed vocabulary. Then matching the *access* flagged
    `workItems: extracted.resume.work.length`, which is a number and exactly what a log should carry.

    So: an access into a CV is suspicious, and one that terminates in `.length` or `.size` is a count.
    That is the real distinction — not the field's name and not the path, but whether what leaves is
    the content or a measurement of it.
  */
  const CV_ACCESS =
    /\b(resume|basics)\s*[.?[]|\.(fullName|headline|highlights|company|institution|summary|phone|email|address|location)\b/
  const IS_A_COUNT = /\.(length|size)\s*$/

  function offendingFragments(args: string): Array<string> {
    return args
      .replace(/\s+/g, ' ')
      .split(',')
      .map((fragment) => fragment.trim())
      .filter(
        (fragment) => CV_ACCESS.test(fragment) && !IS_A_COUNT.test(fragment),
      )
  }

  function sourceFiles(dir: string): Array<string> {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        return entry === '__tests__' ? [] : sourceFiles(full)
      }
      return /\.tsx?$/.test(entry) ? [full] : []
    })
  }

  function scanSource(): Array<string> {
    const offenders: Array<string> = []
    for (const file of sourceFiles(join(process.cwd(), 'src'))) {
      const text = readFileSync(file, 'utf8')
      // The call and its fields object, which ends at the first closing brace.
      for (const call of text.matchAll(
        /\b(?:error)?[eE]vent\(\s*'([^']*)'\s*,\s*\{([^}]*)\}/g,
      )) {
        for (const fragment of offendingFragments(call[2])) {
          offenders.push(
            `${file.replace(`${process.cwd()}/`, '')} → ${call[1]}: ${fragment}`,
          )
        }
      }
    }
    return offenders
  }

  it('finds none', () => {
    expect(scanSource()).toEqual([])
  })

  it('would catch one, which is the only reason to trust the line above', () => {
    /*
      CLAUDE.md's rule: a gate that has never failed is not working. Rather than asking a reader to
      break the codebase to check, the scanner is pointed at a violation written right here.
    */
    const planted = `
      event('ingest.parsed', { requestId: id, name: extracted.resume.basics.fullName })
      event('ingest.counted', { workItems: extracted.resume.work.length })
    `
    const found = [
      ...planted.matchAll(
        /\b(?:error)?[eE]vent\(\s*'([^']*)'\s*,\s*\{([^}]*)\}/g,
      ),
    ].flatMap((call) => offendingFragments(call[2]))

    // The name is caught. The count beside it is not, because a count is what a log is for.
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('fullName')
  })
})

/**
 * The runtime half: run a real extraction and watch everything that was written.
 *
 * `extractByRules` is the deterministic path, so this costs nothing and cannot flake on a model. The
 * strings below are chosen to be unmistakable — a real surname, a real-looking number — so a partial
 * leak cannot hide behind a common word.
 */
describe('a real extraction writes nothing personal', () => {
  const CV = `Anneli Sørensen-Vestergaard
Registered Nurse — Intensive Care
anneli.sv@example.org · +45 22 14 88 03 · Copenhagen

EXPERIENCE
Shift Lead Nurse, Rigshospitalet
Mar 2019 - Present
  - Led nursing handover for a 24-bed unit.
`

  const NEEDLES = [
    'Sørensen-Vestergaard',
    'anneli.sv@example.org',
    '22 14 88 03',
    'Rigshospitalet',
    '24-bed unit',
  ]

  it('leaks none of it to either channel', () => {
    const written = capture(() => {
      const result = extractByRules(CV)
      // Log the way a caller legitimately would: counts and codes about the result, never the result.
      event('ingest.extracted', {
        code: 'rules',
        shape: 'resume',
        attempt: 1,
      })
      expect(result).toBeDefined()
    })

    for (const needle of NEEDLES) {
      expect(written, `"${needle}" reached a log`).not.toContain(needle)
    }
  })
})
