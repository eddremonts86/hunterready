/**
 * A machine asserting that its user consented, and the direction that must fail (ADR-032).
 *
 * The bug this file exists for was written and caught during the same hour. The first version of
 * `assertedConsent` returned the *normalised* id, and `chosenProvider` maps the legacy value
 * `provider` to `default` — which is not a company, so feeding it onward produced `undefined` and a
 * caller who had correctly asserted consent would have silently got the local model.
 *
 * That is the benign direction, which is exactly why it would have survived: nothing breaks, nothing
 * logs, the extraction is just quietly worse for somebody who paid for better.
 */
import { describe, expect, it } from 'vitest'

import {
  CONSENT_HEADER,
  assertedConsent,
  consentOn,
  consentedToTransfer,
  providerIdFrom,
} from '../chosen-provider'

const withHeader = (value?: string) =>
  new Request('http://localhost/api/ingest', {
    headers: value === undefined ? {} : { [CONSENT_HEADER]: value },
  })

describe('the header names a company', () => {
  it('survives the whole chain to a provider id', () => {
    const asked = consentOn(withHeader('minimax'), null)
    expect(consentedToTransfer(asked)).toBe(true)
    expect(providerIdFrom(asked)).toBe('minimax')
  })

  it('carries the legacy value through as consent without a name', () => {
    // The regression. `provider` means "yes, to whoever this deployment uses".
    const asked = consentOn(withHeader('provider'), null)
    expect(consentedToTransfer(asked)).toBe(true)
    expect(providerIdFrom(asked)).toBeUndefined()
  })

  it('returns the raw value, not a normalised one', () => {
    expect(assertedConsent(withHeader('DeepSeek'))).toBe('DeepSeek')
  })
})

describe('it falls to local, which is the only safe direction', () => {
  it.each([
    ['no header', undefined],
    ['empty', ''],
    ['local', 'local'],
    ['a company nobody offers', 'openai-but-not-really'],
    ['the word yes', 'yes'],
  ])('%s means nothing leaves the machine', (_why, value) => {
    const asked = consentOn(withHeader(value), null)
    expect(consentedToTransfer(asked)).toBe(false)
  })
})

describe('a body beats a header', () => {
  it('prefers the person s own click over a machine s assertion', () => {
    // A browser field is a person answering. A header on the same request would be an override.
    const asked = consentOn(withHeader('minimax'), 'local')
    expect(consentedToTransfer(asked)).toBe(false)
  })

  it('falls through to the header when the body field is absent or blank', () => {
    expect(consentedToTransfer(consentOn(withHeader('minimax'), null))).toBe(
      true,
    )
    expect(consentedToTransfer(consentOn(withHeader('minimax'), '  '))).toBe(
      true,
    )
  })
})
