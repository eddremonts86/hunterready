/**
 * What `/v1` promises, asserted on the parts that can be checked without a server.
 *
 * The endpoints are proved against a booted build in `tests/production-parity.parity.test.ts`,
 * because an API's contract is a claim about a deployed process and a mocked handler cannot make
 * it. What lives here is the reasoning a unit test can hold: that `/v1` did not grow a second copy
 * of a rule that already exists once elsewhere.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const V1 = join(process.cwd(), 'src/routes/v1')
const files = readdirSync(V1)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ name: f, text: readFileSync(join(V1, f), 'utf8') }))

const textOf = (name: string) => files.find((f) => f.name === name)?.text ?? ''

describe('every /v1 route authenticates and limits per key', () => {
  it.each(files.map((f) => f.name))('%s asks for a key first', (name) => {
    expect(textOf(name)).toContain('apiCaller(request)')
    expect(textOf(name)).toContain('unauthorized(id)')
  })

  it.each(files.map((f) => f.name))('%s buckets by key, not by IP', (name) => {
    // Two partners behind one NAT must not share a bucket, and one partner must not escape by
    // moving hosts.
    expect(textOf(name)).toContain('checkRateLimit(`key:${caller.keyId}`)')
  })
})

describe('/v1 reuses the rules rather than restating them', () => {
  it('renders through the browser route s own paid-design gate', () => {
    /*
      The gate is exported from `api/render.tsx` and called here. A copy would be a second place for
      the paywall to hold or fail, and the parity suite only watches one of them.
    */
    expect(textOf('render.tsx')).toContain(
      'refuseUnlessEntitled(request, selection)',
    )
  })

  it('reads consent through chosenProvider, not with its own parser', () => {
    // Five endpoints once had five copies of this rule and four were wrong (chosen-provider.ts).
    const cv = textOf('cv.tsx')
    expect(cv).toContain('consentOn(request, form.get')
    expect(cv).toContain('consentedToTransfer(asked)')
    expect(cv).not.toMatch(/===\s*'minimax'|===\s*'deepseek'/)
  })

  it('never returns zod issues, which quote the value they rejected', () => {
    // docs/07: a rejected value is CV content, and an issue list puts it in a response body.
    for (const { name, text } of files) {
      expect(text, `${name} must not return parsed.error`).not.toContain(
        'parsed.error',
      )
    }
  })
})

describe('every response carries a request id', () => {
  it.each(files.map((f) => f.name))('%s sets x-request-id', (name) => {
    // The only thread between a partner reporting a failure and a log line, given that the log has
    // no content in it by design.
    expect(textOf(name)).toContain("'x-request-id': id")
  })
})
