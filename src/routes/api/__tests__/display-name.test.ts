/**
 * Which company a base URL belongs to.
 *
 * Exists because production got this wrong in a way nobody could see. After the 2026-08-18 release
 * `/api/processing` reported `provider: "api.minimaxi.chat"` instead of `MiniMax`: the map covered
 * `.io` and `.com`, the deployment is configured against a `.chat` host, and the fallthrough returned
 * the hostname. No screen renders that field, so there was nothing to notice — every visible name
 * comes from `providers[].name`.
 *
 * A hostname is the *right* fallback for an unknown vendor, which is what made this quiet: the
 * failure and the designed behaviour look identical from outside. The only defence is naming the
 * hosts we actually deploy against, so this test is the list.
 */
import { describe, expect, it } from 'vitest'

import { displayName } from '../processing'

describe('displayName maps a base URL to a company', () => {
  it.each([
    ['https://api.minimax.io/anthropic', 'MiniMax'],
    ['https://api.minimaxi.com/anthropic', 'MiniMax'],
    // The one production actually uses. Removing it reproduces the 2026-08-18 defect.
    ['https://api.minimaxi.chat/anthropic', 'MiniMax'],
    ['https://api.deepseek.com/anthropic', 'DeepSeek'],
    ['https://api.openai.com/v1', 'OpenAI'],
    ['https://api.anthropic.com', 'Anthropic'],
    ['anthropic', 'Anthropic'],
  ])('%s → %s', (label, expected) => {
    expect(displayName(label)).toBe(expected)
  })

  it('falls back to the bare hostname for a vendor it does not know', () => {
    /*
      Deliberate, and documented in the function: "api.example.com" is a worse answer than "MiniMax"
      and a much better one than "our AI partner". docs/07 requires consent to a *named* provider, and
      a hostname names one; a friendly lie would not.
    */
    expect(displayName('https://api.example.com/v1/messages')).toBe(
      'api.example.com',
    )
  })

  it('strips the scheme, the path and a port before matching', () => {
    expect(displayName('http://api.minimax.io:8443/anthropic/v1')).toBe(
      'MiniMax',
    )
  })

  it('does not match a lookalike domain', () => {
    // `minimax.io.evil.test` ends with neither `minimax.io` nor anything else in the map, and must
    // not be reported as MiniMax to somebody deciding whether to send their CV.
    expect(displayName('https://minimax.io.evil.test/v1')).toBe(
      'minimax.io.evil.test',
    )
  })
})

describe('a lookalike host is not a company', () => {
  it.each([
    'https://evilminimax.io/v1',
    'https://minimax.io.evil.test/v1',
    'https://notdeepseek.com/v1',
  ])('%s is reported as itself', (label) => {
    /*
      `endsWith('minimax.io')` is also true of `evilminimax.io`, which the first version of this
      matched. Not reachable from a request — the label is our own configuration — but a typo in a
      base URL would have named a company to somebody deciding whether to send that company their CV.
    */
    const host = label.replace(/^https?:\/\//, '').replace(/[/:].*$/, '')
    expect(displayName(label)).toBe(host)
  })
})
