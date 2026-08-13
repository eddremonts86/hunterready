/**
 * Which model provider does the extracting.
 *
 * Configurable rather than hardcoded, because the endpoint is an operational decision and the
 * extraction code should not care: any provider exposing an Anthropic-compatible Messages API with
 * tool use works. MiniMax publishes one at `https://api.minimax.io/anthropic`, which is what this
 * project is currently pointed at (Edd's instruction, 2026-08-13).
 *
 * Resolution order, first complete set wins:
 *   1. `HUNTERREADY_LLM_*`      — explicit, and what the Docker image should set
 *   2. `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` (+ `ANTHROPIC_MODEL`)
 *   3. `ANTHROPIC_API_KEY`      — Anthropic proper
 *   4. `MINIMAX_API_KEY` + `MINIMAX_BASE_URL` + `MINIMAX_MODEL`
 *
 * Nothing here logs a token, and nothing writes one to disk.
 */
import Anthropic from '@anthropic-ai/sdk'

/** MiniMax's Anthropic-compatible endpoint, used when only the OpenAI-style vars are present. */
const MINIMAX_ANTHROPIC_BASE = 'https://api.minimax.io/anthropic'

export interface Provider {
  client: Anthropic
  model: string
  /** For logs and metrics. Never a credential — a host name at most. */
  label: string
}

function value(name: string): string | undefined {
  const raw = process.env[name]
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

export function resolveProvider(): Provider | undefined {
  // 1. Explicit project configuration.
  const ownToken = value('HUNTERREADY_LLM_TOKEN')
  const ownBase = value('HUNTERREADY_LLM_BASE_URL')
  const ownModel = value('HUNTERREADY_LLM_MODEL')
  if (ownToken !== undefined) {
    return {
      client: new Anthropic({
        authToken: ownToken,
        ...(ownBase === undefined ? {} : { baseURL: ownBase }),
      }),
      model: ownModel ?? 'claude-haiku-4-5-20251001',
      label: ownBase ?? 'anthropic',
    }
  }

  // 2. An Anthropic-compatible gateway: base URL plus a bearer token.
  const gatewayToken = value('ANTHROPIC_AUTH_TOKEN')
  const gatewayBase = value('ANTHROPIC_BASE_URL')
  if (gatewayToken !== undefined) {
    return {
      client: new Anthropic({
        authToken: gatewayToken,
        ...(gatewayBase === undefined ? {} : { baseURL: gatewayBase }),
      }),
      model: value('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5-20251001',
      label: gatewayBase ?? 'anthropic',
    }
  }

  // 3. Anthropic proper.
  const anthropicKey = value('ANTHROPIC_API_KEY')
  if (anthropicKey !== undefined) {
    return {
      client: new Anthropic({
        apiKey: anthropicKey,
        ...(gatewayBase === undefined ? {} : { baseURL: gatewayBase }),
      }),
      model: value('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5-20251001',
      label: 'anthropic',
    }
  }

  // 4. MiniMax configured the OpenAI-compatible way. Its Anthropic-compatible host takes the same
  //    credential, so we point at that rather than shipping a second client.
  const minimaxKey = value('MINIMAX_API_KEY')
  if (minimaxKey !== undefined) {
    return {
      client: new Anthropic({
        authToken: minimaxKey,
        baseURL: MINIMAX_ANTHROPIC_BASE,
      }),
      model: value('MINIMAX_MODEL') ?? 'MiniMax-M3',
      label: MINIMAX_ANTHROPIC_BASE,
    }
  }

  return undefined
}

export function isConfigured(): boolean {
  return resolveProvider() !== undefined
}
