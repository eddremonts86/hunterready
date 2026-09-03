/**
 * Reading a person's answer about where their CV may go.
 *
 * This is the smallest function in the privacy path and the one with the least room for error: every
 * value it does not recognise has to mean *no*. The failure it guards against is not hypothetical —
 * five endpoints compared this field to the string `'provider'`, and the moment the gate started
 * naming companies four of them would have read a company name as a refusal and quietly done the work
 * locally, with nothing on screen to say so.
 *
 * The other direction is the one that matters: a value this treats as consent by accident is
 * somebody's employment history sent to a company they did not name.
 */
import { describe, expect, it } from 'vitest'
import {
  chosenProvider,
  consentedToTransfer,
  providerIdFrom,
} from '@/lib/chosen-provider'

describe('the answer about where a CV may go', () => {
  it('reads a named company as consent to that company', () => {
    expect(consentedToTransfer('deepseek')).toBe(true)
    expect(providerIdFrom('deepseek')).toBe('deepseek')
    expect(providerIdFrom('Anthropic')).toBe('anthropic')
  })

  /**
   * The safety property of ADR-036, and the reason removing a provider is a privacy change.
   *
   * `minimax` was a company somebody could consent to until 2026-08-29. A browser tab open since
   * before that, or an API caller holding an old record, still sends the name — and the only correct
   * reading is **no**. It must not become consent to whoever replaced it: the person named a company,
   * that company is not on offer, and nobody agreed to the substitute.
   *
   * It falls out of `KNOWN` rather than needing a rule of its own, which is the whole argument for
   * checking against a list instead of "not empty and not local".
   */
  it('reads a company that is no longer offered as a refusal, not as consent to its replacement', () => {
    expect(consentedToTransfer('minimax')).toBe(false)
    expect(providerIdFrom('minimax')).toBeUndefined()
    expect(chosenProvider('minimax')).toBeUndefined()
  })

  it('reads local as a refusal', () => {
    expect(consentedToTransfer('local')).toBe(false)
    expect(providerIdFrom('local')).toBeUndefined()
  })

  /**
   * Every shape a request can arrive in that is not an answer. All of them are `no`, and the list is
   * deliberately long: this is the assertion that would have caught the four broken endpoints.
   */
  it('reads anything it does not understand as a refusal', () => {
    for (const value of [
      undefined,
      null,
      '',
      '   ',
      0,
      1,
      true,
      {},
      [],
      'yes',
      'granted',
      'true',
    ]) {
      expect(
        consentedToTransfer(value),
        `${JSON.stringify(value)} was read as consent`,
      ).toBe(false)
    }
  })

  /**
   * The one legacy value that still counts.
   *
   * `'provider'` was the old yes-or-no. A page open since before the gate started naming companies
   * should not silently lose its answer — and what it consented to was "whoever this deployment
   * uses", so it resolves to no specific id and the deployment's own order applies.
   */
  it('honours the old yes-or-no without inventing a company for it', () => {
    expect(consentedToTransfer('provider')).toBe(true)
    expect(chosenProvider('provider')).toBe('default')
    expect(providerIdFrom('provider')).toBeUndefined()
  })

  it('is not fooled by case or stray whitespace', () => {
    expect(providerIdFrom('  DeepSeek  ')).toBe('deepseek')
    expect(consentedToTransfer('  LOCAL ')).toBe(false)
    // And a retired name is still a refusal however it is spelled.
    expect(consentedToTransfer('  MiniMax  ')).toBe(false)
  })
})
