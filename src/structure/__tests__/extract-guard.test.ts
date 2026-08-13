/**
 * The rules-outperformed guard.
 *
 * `fallback.ts` has always claimed the rule-based path is "the baseline the LLM has to beat", and
 * ADR-013 says a prompt change that does not beat plain rules is not an improvement. Neither statement
 * was enforced anywhere: the model's answer was accepted the moment it *parsed*.
 *
 * The failure that exposed it is the one worth pinning. Asking MiniMax for the same clean, single-column
 * fixture three times, one response came back schema-valid with **zero** jobs, zero skills and zero
 * languages — and it shipped as `method: 'llm'` while the deterministic path recovers every field of that
 * exact input. The user gets a blank CV, nothing reports a problem, and a retry silently fixes it.
 *
 * These tests drive `extractResume` with a stub provider so the comparison is exercised without a network
 * call and without depending on how the real model behaves today.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ingest } from '@/ingest'

const ROOT = process.cwd()

/** Minimal Anthropic-shaped response carrying one forced tool call. */
function toolResponse(input: unknown) {
  return {
    content: [{ type: 'tool_use', id: 'call_1', name: 'submit_cv', input }],
  }
}

async function normalizedFixture(name: string): Promise<string> {
  const bytes = new Uint8Array(
    await readFile(join(ROOT, 'fixtures/input', name)),
  )
  const result = await ingest(bytes, name)
  if (!result.ok) throw new Error(`fixture ${name} failed to ingest`)
  return result.normalized.text
}

/**
 * Stubs the provider so `extractResume` sees exactly the payload we hand it. The module is imported
 * fresh afterwards so each test gets its own stub.
 */
async function withProviderReturning(input: unknown) {
  vi.resetModules()
  vi.doMock('../provider', () => ({
    resolveProvider: () => ({
      client: { messages: { create: async () => toolResponse(input) } },
      model: 'stub-model',
    }),
    MINIMAX_ANTHROPIC_BASE: 'https://example.invalid',
  }))
  const { extractResume } = await import('../extract')
  return extractResume
}

const EMPTY_BUT_VALID = {
  resume: {
    locale: 'en',
    basics: {
      fullName: 'Tom Whitfield',
      links: [],
      personalDetails: [],
    },
    work: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    languages: [],
    awards: [],
    publications: [],
    volunteer: [],
    custom: [],
  },
  provenance: [],
}

describe('a schema-valid but empty model answer does not win', () => {
  afterEach(() => {
    vi.doUnmock('../provider')
    vi.resetModules()
  })

  it('ships the rules result instead, and says so', async () => {
    const extractResume = await withProviderReturning(EMPTY_BUT_VALID)
    const text = await normalizedFixture('clean-single-column.pdf')

    const result = await extractResume(text)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // The document has two jobs. An answer with none has lost it.
    expect(result.resume.work.length).toBeGreaterThan(0)
    expect(result.method).toBe('rules')
    expect(result.promptVersion).toContain('rules-outperformed')
  })

  it('leaves a genuinely better model answer alone', async () => {
    // Everything the rules find, plus a summary they do not attribute — so the model wins outright.
    const text = await normalizedFixture('clean-single-column.pdf')
    const { extractByRules } = await import('../fallback')
    const rules = extractByRules(text)

    const extractResume = await withProviderReturning({
      resume: {
        ...rules.resume,
        basics: {
          ...rules.resume.basics,
          summary: 'A summary the rules did not produce.',
        },
        certifications: [{ name: 'One extra certification' }],
      },
      provenance: [{ path: 'basics.fullName', confidence: 0.95 }],
    })

    const result = await extractResume(text)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.method).toBe('llm')
  })

  it('gives the model the tie, so a normal run is never second-guessed', async () => {
    const text = await normalizedFixture('clean-single-column.pdf')
    const { extractByRules } = await import('../fallback')
    const rules = extractByRules(text)

    const extractResume = await withProviderReturning({
      resume: rules.resume,
      provenance: [],
    })

    const result = await extractResume(text)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.method).toBe('llm')
  })
})
