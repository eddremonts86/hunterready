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
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  chosenProvider,
  consentedToTransfer,
  providerIdFrom,
} from '@/lib/chosen-provider'

describe('the answer about where a CV may go', () => {
  it('reads a named company as consent to that company', () => {
    expect(consentedToTransfer('minimax')).toBe(true)
    expect(providerIdFrom('minimax')).toBe('minimax')
    expect(providerIdFrom('Anthropic')).toBe('anthropic')
  })

  /**
   * The safety property, and the reason removing a provider is a privacy change.
   *
   * `deepseek` was a company somebody could consent to between 2026-08-29 and 2026-09-03. A browser
   * tab open since before ADR-038, or an API caller holding an old record, still sends the name — and
   * the only correct reading is **no**. It must not become consent to whoever replaced it: the person
   * named a company, that company is not on offer, and nobody agreed to the substitute.
   *
   * The name in this test has now been `minimax` and `deepseek` in turn, which is the point: whichever
   * provider just left is the one a stale client is still naming.
   *
   * It falls out of `KNOWN` rather than needing a rule of its own, which is the whole argument for
   * checking against a list instead of "not empty and not local".
   */
  it('reads a company that is no longer offered as a refusal, not as consent to its replacement', () => {
    expect(consentedToTransfer('deepseek')).toBe(false)
    expect(providerIdFrom('deepseek')).toBeUndefined()
    expect(chosenProvider('deepseek')).toBeUndefined()
  })

  /**
   * The drift guard, and the reason this file gained one.
   *
   * `KNOWN` in `chosen-provider.ts` mirrors `BY_ID` in `structure/provider.ts` and was kept in step by
   * hand. ADR-038 swapped the provider in `BY_ID` and not in `KNOWN`, so `'minimax'` read as
   * *not-consent* and every upload through the third-party path quietly extracted on the local model.
   * The suite was green: the assertions above named whichever provider the list happened to contain,
   * so they moved with the bug instead of catching it.
   *
   * Parsed out of the source rather than imported, because `provider.ts` constructs the Anthropic SDK
   * at import time and `BY_ID` is not exported. Text is a weak instrument in general; here the thing
   * being checked *is* a literal list, and the alternative is no check at all.
   */
  it('accepts every provider the resolver can actually return', () => {
    const source = readFileSync(
      join(import.meta.dirname, '..', '..', 'structure', 'provider.ts'),
      'utf8',
    )
    const block = /const BY_ID[\s\S]*?=\s*\{\n([\s\S]*?)\n\}/.exec(source)?.[1]
    expect(
      block,
      'BY_ID could not be found in provider.ts — this guard has stopped guarding',
    ).toBeDefined()

    const ids = [
      ...(block ?? '').matchAll(/^\s*([a-zA-Z][a-zA-Z0-9_]*)\s*[,:]/gm),
    ].map((m) => m[1])
    expect(ids.length, 'no provider ids parsed out of BY_ID').toBeGreaterThan(0)

    for (const id of ids) {
      expect(
        chosenProvider(id),
        `${id} resolves in provider.ts but is not consent here, so choosing it falls to the local model`,
      ).toBe(id)
    }
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
    expect(providerIdFrom('  MiniMax  ')).toBe('minimax')
    expect(consentedToTransfer('  LOCAL ')).toBe(false)
    // And a retired name is still a refusal however it is spelled.
    expect(consentedToTransfer('  DeepSeek  ')).toBe(false)
  })
})
