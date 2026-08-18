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

describe('every /v1 route enters through the same door', () => {
  /*
    `enterV1` is authentication, the per-key rate-limit bucket and the request id, in one function.
    Asserting the call rather than its three effects is the point: when a route uses it, all three
    hold, and when a new route forgets it, this fails on the first run rather than on the first
    incident. It was extracted at the third endpoint, which is about when a pattern stops being a
    coincidence.
  */
  it.each(files.map((f) => f.name))('%s calls enterV1', (name) => {
    expect(textOf(name)).toContain('await enterV1(request,')
  })

  it.each(files.map((f) => f.name))('%s returns the refusal', (name) => {
    // Reading the entry and continuing anyway would authenticate and then serve regardless.
    expect(textOf(name)).toContain(
      "if ('refusal' in entry) return entry.refusal",
    )
  })

  it('and enterV1 is the only place the bucket is chosen', () => {
    // One decision about what a rate-limit key is, not eight that can drift apart.
    for (const { name, text } of files) {
      expect(text, `${name} must not bucket on its own`).not.toContain(
        'checkRateLimit(',
      )
    }
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
  it.each(files.map((f) => f.name))('%s threads the id through', (name) => {
    /*
      The only link between a partner saying "this failed at 14:02" and a log line, given that the
      log deliberately holds no CV content. Either the route sets the header itself, or it hands the
      id to a helper that does.
    */
    const text = textOf(name)
    const threaded =
      text.includes("'x-request-id': id") ||
      text.includes('entry.ok.id') ||
      text.includes('v1Json(entry.ok.id')
    expect(threaded, `${name} loses the request id`).toBe(true)
  })
})
