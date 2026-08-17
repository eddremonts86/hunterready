/**
 * Which model provider does the extracting.
 *
 * Configurable rather than hardcoded, because the endpoint is an operational decision and the
 * extraction code should not care: any provider exposing an Anthropic-compatible Messages API with
 * tool use works. MiniMax publishes one at `https://api.minimax.io/anthropic`, which is what this
 * project is currently pointed at (Edd's instruction, 2026-08-13).
 *
 * ## Choosing one when several are configured
 *
 * `HR_PROVIDER=deepseek|minimax|anthropic` picks explicitly, and that is the switch to use when the
 * question is "does this one read a CV better than that one". Comparing two models by commenting out
 * a credential is how you end up measuring the wrong one — and this project has already lost a session
 * to running a build that did not contain the code it was being asked about.
 *
 * Unset, the order below applies and is unchanged, so an existing deployment behaves exactly as it did.
 *
 * Resolution order, first complete set wins:
 *   1. `HUNTERREADY_LLM_*`      — explicit, and what the Docker image should set
 *   2. `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` (+ `ANTHROPIC_MODEL`)
 *   3. `ANTHROPIC_API_KEY`      — Anthropic proper
 *   4. `MINIMAX_API_KEY` + `MINIMAX_BASE_URL` + `MINIMAX_MODEL`
 *   5. `DEEPSEEK_API_KEY` + `DEEPSEEK_BASE_URL` + `DEEPSEEK_MODEL`
 *
 * Nothing here logs a token, and nothing writes one to disk.
 */
import Anthropic from '@anthropic-ai/sdk'

/** MiniMax's Anthropic-compatible endpoint, used when only the OpenAI-style vars are present. */
const MINIMAX_ANTHROPIC_BASE = 'https://api.minimax.io/anthropic'

/**
 * DeepSeek's, the same idea.
 *
 * They publish it for Claude Code, which is why it exists and why it takes the same tool-call shapes
 * this file already speaks. `extract.ts` still reads defensively at the boundary — compatible is not
 * identical, and this project has met three gateways that proved it.
 */
const DEEPSEEK_ANTHROPIC_BASE = 'https://api.deepseek.com/anthropic'

export interface Provider {
  client: Anthropic
  model: string
  /** For logs and metrics. Never a credential — a host name at most. */
  label: string
  /**
   * Where this model runs.
   *
   * `local` means our own hardware, inside the compose network — the CV never leaves the machine it
   * was uploaded to, so no consent is required and none is asked for. `third-party` means a transfer
   * to another company, which is exactly what the consent gate exists to obtain.
   */
  locality: 'local' | 'third-party'
  /**
   * This model reasons unless told not to, and its gateway refuses a forced tool call while it does.
   *
   * Measured against DeepSeek's Anthropic-compatible endpoint: `tool_choice: {type:'tool'}` returns
   * **400 "Thinking mode does not support this tool_choice"**, on every model name it accepts, with or
   * without a temperature. `thinking: {type:'disabled'}` alongside the same forced call returns 200
   * with the `tool_use` block we asked for.
   *
   * That matters more than it looks. Forcing the tool is ADR-001's whole mechanism — the schema is
   * derived from Zod so the model cannot drift from the contract — and `tool_choice: auto` would trade
   * that for a prompt and a repair loop. So the reasoning is what gets dropped, not the guarantee. The
   * cost is the narrated wait on this provider: `ask.ts` skips the reasoning rung entirely rather than
   * spending a doomed request discovering the same 400 on every upload.
   */
  forcesThinking?: boolean
}

/**
 * The local model — Ollama, in this stack's `llm` service.
 *
 * This exists because "the user declined" used to mean "fall back to regular expressions", and that
 * is not a satisfactory product. Declining a transfer to MiniMax should cost accuracy, not the
 * feature: a 3B instruct model on our own box reads a CV far better than a rule engine, and the
 * document still never leaves our infrastructure.
 *
 * Reached through the Anthropic SDK because Ollama ships an Anthropic-compatible surface at
 * `/v1/messages` alongside its native API. Same client, same tool-call plumbing, no second code path
 * to keep in step with the first — which is worth more than the small chance of a shape difference,
 * and `extract.ts` already guards the shapes it depends on because MiniMax taught it to.
 */
export function resolveLocalProvider(): Provider | undefined {
  const base = value('OLLAMA_BASE_URL')
  if (base === undefined) return undefined
  return {
    client: new Anthropic({
      // Ollama needs no credential. The SDK insists on one, so it gets a placeholder that never
      // leaves this process.
      apiKey: 'ollama-local',
      // No `/v1` suffix: the SDK appends `/v1/messages` itself, so adding it here produced
      // `/v1/v1/messages` and a 404 that surfaced as a silent fall back to the rule engine.
      baseURL: base.replace(/\/+$/, ''),
    }),
    model: value('OLLAMA_MODEL') ?? 'qwen2.5:3b-instruct',
    label: 'local',
    locality: 'local',
  }
}

function value(name: string): string | undefined {
  const raw = process.env[name]
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

/** DeepSeek, added so it can be measured against MiniMax on the same CVs (Edd, 2026-08-17). */
function deepseek(): Provider | undefined {
  const key = value('DEEPSEEK_API_KEY')
  if (key === undefined) return undefined
  return {
    client: new Anthropic({
      authToken: key,
      baseURL: value('DEEPSEEK_BASE_URL') ?? DEEPSEEK_ANTHROPIC_BASE,
    }),
    model: value('DEEPSEEK_MODEL') ?? 'deepseek-chat',
    label: value('DEEPSEEK_BASE_URL') ?? DEEPSEEK_ANTHROPIC_BASE,
    locality: 'third-party',
    forcesThinking: true,
  }
}

function minimax(): Provider | undefined {
  const key = value('MINIMAX_API_KEY')
  if (key === undefined) return undefined
  return {
    client: new Anthropic({
      authToken: key,
      baseURL: value('MINIMAX_BASE_URL') ?? MINIMAX_ANTHROPIC_BASE,
    }),
    model: value('MINIMAX_MODEL') ?? 'MiniMax-M3',
    label: value('MINIMAX_BASE_URL') ?? MINIMAX_ANTHROPIC_BASE,
    locality: 'third-party',
  }
}

function anthropic(): Provider | undefined {
  const key = value('ANTHROPIC_API_KEY')
  if (key === undefined) return undefined
  return {
    client: new Anthropic({
      apiKey: key,
      ...(value('ANTHROPIC_BASE_URL') === undefined
        ? {}
        : { baseURL: value('ANTHROPIC_BASE_URL') }),
    }),
    model: value('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5-20251001',
    label: 'anthropic',
    locality: 'third-party',
  }
}

/**
 * The named ones.
 *
 * A name that resolves to nothing returns `undefined` rather than falling back, which is deliberate
 * twice over. For `HR_PROVIDER` it is because asking for DeepSeek and silently getting MiniMax is how
 * a comparison produces a confident wrong answer. For a **person's** choice it is far more serious:
 * consent under docs/07 is consent to a *named company*, so sending their CV to a different one than
 * the one they picked is the transfer they did not agree to.
 */
const BY_ID: Record<string, () => Provider | undefined> = {
  deepseek,
  minimax,
  anthropic,
}

export type ProviderId = keyof typeof BY_ID

/** The name a person would recognise. Not derived from the host, so a new one is named on purpose. */
const NAMES: Record<string, string> = {
  deepseek: 'DeepSeek',
  minimax: 'MiniMax',
  anthropic: 'Anthropic',
}

export interface ProviderChoice {
  id: string
  /** What the consent gate calls it. This is the string somebody is agreeing to. */
  name: string
}

/**
 * Every third-party model this deployment could use — the list the person chooses from.
 *
 * It used to be one: whichever the resolution order landed on, offered as "send it" or "do not". Two
 * are configured now and the choice is the person's, so the gate names each and the answer records
 * which. `HR_PROVIDER`, when set, pins the deployment to one and this list narrows to it — a
 * deployment that has decided is not asking.
 */
export function availableProviders(): Array<ProviderChoice> {
  const pinned = value('HR_PROVIDER')?.toLowerCase()
  const ids = pinned === undefined ? Object.keys(BY_ID) : [pinned]
  return ids
    .filter((id) => BY_ID[id]?.() !== undefined)
    .map((id) => ({ id, name: NAMES[id] ?? id }))
}

export function providerById(id: string): Provider | undefined {
  return BY_ID[id.toLowerCase()]?.()
}

export function resolveProvider(): Provider | undefined {
  const chosen = value('HR_PROVIDER')?.toLowerCase()
  if (chosen !== undefined) return BY_ID[chosen]?.()

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
      locality: 'third-party',
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
      locality: 'third-party',
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
      locality: 'third-party',
    }
  }

  // 4 and 5. Both configured the OpenAI-compatible way; both publish an Anthropic-compatible host
  //          that takes the same credential, so we point at those rather than shipping a second client.
  return minimax() ?? deepseek()
}

export function isConfigured(): boolean {
  return resolveProvider() !== undefined
}
