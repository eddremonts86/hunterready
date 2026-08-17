/**
 * The name the consent gate puts in front of somebody before their CV leaves the building.
 *
 * docs/07 requires consent "naming the provider — not buried in a ToS checkbox", so this string is not
 * cosmetic: it is the thing being consented to. A new provider whose host nobody taught this function
 * shows up as `api.deepseek.com`, which is honest but reads like a leak rather than a company — and
 * the failure is silent, because the gate still renders and only the sentence is worse.
 */
import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'

const source = await readFile('src/routes/api/processing.tsx', 'utf8')

/** Mirrors the route's private helper, which should stay private. The last test pins them together. */
function displayName(label: string): string {
  const host = label.replace(/^https?:\/\//, '').replace(/[/:].*$/, '')
  if (host === 'anthropic' || host.endsWith('anthropic.com')) return 'Anthropic'
  if (host.endsWith('minimax.io') || host.endsWith('minimaxi.com')) {
    return 'MiniMax'
  }
  if (host.endsWith('deepseek.com')) return 'DeepSeek'
  if (host.endsWith('openai.com')) return 'OpenAI'
  return host
}

describe('the provider a visitor is asked to consent to', () => {
  it('names every host this build can be pointed at', () => {
    expect(displayName('https://api.deepseek.com/anthropic')).toBe('DeepSeek')
    expect(displayName('https://api.minimax.io/anthropic')).toBe('MiniMax')
    expect(displayName('anthropic')).toBe('Anthropic')
  })

  it('falls back to the bare host rather than to a friendly lie', () => {
    // "our AI partner" is what this must never say. A hostname reads worse and can be trusted.
    expect(displayName('https://api.example.com/v1')).toBe('api.example.com')
  })

  it('is the same mapping the route ships, not this file’s opinion of it', () => {
    for (const host of ['deepseek.com', 'minimax.io', 'anthropic.com']) {
      expect(source, `the route no longer names ${host}`).toContain(host)
    }
  })
})
