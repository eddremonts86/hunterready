/**
 * The one request, and the safety net under it.
 *
 * Streaming was added for the loading screen, and the loading screen is not worth a single failed
 * extraction. So the behaviour that matters most here is the boring one: when a gateway cannot stream,
 * the upload still gets its answer. `provider.ts` accepts any Anthropic-compatible endpoint and this
 * project has already met three that were compatible in different amounts.
 */
import { describe, expect, it, vi } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { ask } from '../ask'
import { REFINE_ALIASES } from '../narrate'

const PARAMS = {
  model: 'test',
  max_tokens: 16,
  messages: [],
} as unknown as Anthropic.MessageCreateParamsNonStreaming

const MESSAGE = { id: 'streamed' } as unknown as Anthropic.Message
const FALLBACK = { id: 'unstreamed' } as unknown as Anthropic.Message

/** A client whose stream emits the given JSON fragments, then resolves. */
function streaming(fragments: Array<string>) {
  const create = vi.fn().mockResolvedValue(FALLBACK)
  const handlers: Record<string, (...args: Array<never>) => void> = {}
  const client = {
    messages: {
      create,
      stream: vi.fn(() => ({
        on(event: string, handler: (...args: Array<never>) => void) {
          handlers[event] = handler
          return this
        },
        finalMessage() {
          for (const fragment of fragments) {
            handlers.inputJson?.(fragment as never)
          }
          return Promise.resolve(MESSAGE)
        },
      })),
    },
  } as unknown as Anthropic
  return { client, create }
}

/** A client whose stream is broken in whatever way the gateway chose today. */
function broken(atCreation: boolean) {
  const create = vi.fn().mockResolvedValue(FALLBACK)
  const client = {
    messages: {
      create,
      stream: vi.fn(() => {
        if (atCreation) throw new Error('no SSE here')
        return {
          on() {
            return this
          },
          finalMessage: () => Promise.reject(new Error('stream died')),
        }
      }),
    },
  } as unknown as Anthropic
  return { client, create }
}

describe('ask', () => {
  it('narrates the sections as the tool input streams', async () => {
    const notes: Array<[string, number]> = []
    const { client } = streaming([
      '{"resume":{"basics":{"fullName":"X"},',
      '"work":[{"company":"A"},{"company":"B"}]}}',
    ])
    const message = await ask(client, PARAMS, {
      onNote: (key, count) => notes.push([key, count]),
    })
    expect(message).toBe(MESSAGE)
    expect(notes.map(([key]) => key)).toContain('basics')
    expect(
      Math.max(...notes.filter(([k]) => k === 'work').map(([, n]) => n)),
    ).toBe(2)
  })

  it('reads the private path’s different field names through the alias table', async () => {
    const notes: Array<string> = []
    const { client } = streaming([
      '{"fullName":"X","jobs":[{"role":"A"},{"role":"B"}]}',
    ])
    await ask(client, PARAMS, {
      onNote: (key) => notes.push(key),
      aliases: REFINE_ALIASES,
    })
    expect(notes).toContain('basics')
    expect(notes).toContain('work')
  })

  it('falls back to one unstreamed call when the gateway cannot stream', async () => {
    for (const atCreation of [true, false]) {
      const { client, create } = broken(atCreation)
      await expect(ask(client, PARAMS)).resolves.toBe(FALLBACK)
      expect(create).toHaveBeenCalledOnce()
    }
  })

  it('does not spend a second request on somebody who navigated away', async () => {
    const controller = new AbortController()
    controller.abort()
    const { client, create } = broken(true)
    await expect(
      ask(client, PARAMS, { signal: controller.signal }),
    ).rejects.toThrow()
    expect(create).not.toHaveBeenCalled()
  })

  it('watches nothing when there is nobody to narrate to', async () => {
    const { client } = streaming(['{"resume":{"work":[{}]}}'])
    await expect(ask(client, PARAMS)).resolves.toBe(MESSAGE)
  })
})
