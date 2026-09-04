/**
 * Which model provider does the extracting.
 *
 * Configurable rather than hardcoded, because the endpoint is an operational decision and the
 * extraction code should not care: any provider exposing an Anthropic-compatible Messages API with
 * tool use works. MiniMax publishes one at `https://api.minimax.io/anthropic`, which is what this
 * project is pointed at (Edd, 2026-09-03, ADR-038).
 *
 * ## One company, and the machinery for several is still here
 *
 * MiniMax was the original provider (2026-08-13) and DeepSeek joined it to be measured against it.
 * **MiniMax is the only one** — ADR-038, which reverses ADR-036 — and DeepSeek is gone from this file
 * rather than left
 * configured-but-unused, because a provider that is present in the code and absent from the deployment
 * is the shape this repository keeps finding at the wrong end of a debugging session.
 *
 * `HR_PROVIDER=minimax|anthropic` still picks explicitly, and the registry below still takes more than
 * one entry. That is deliberate: the day another company is added, the consent gate already names each
 * and the person's answer already records which, and none of that has to be rebuilt.
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

import { event } from '@/lib/log'

/**
 * MiniMax's Anthropic-compatible endpoint, used when only the OpenAI-style vars are present.
 *
 * They publish it for Claude Code, which is why it exists and why it takes the same tool-call shapes
 * this file already speaks. `extract.ts` still reads defensively at the boundary — compatible is not
 * identical, and this project has met three gateways that proved it.
 */
const MINIMAX_ANTHROPIC_BASE = 'https://api.minimax.io/anthropic'

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
   * Measured against MiniMax's Anthropic-compatible endpoint: `tool_choice: {type:'tool'}` returns
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
 * is not a satisfactory product. Declining a transfer to the third party should cost accuracy, not the
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

/**
 * MiniMax — the third-party model, singular, since ADR-038.
 *
 * It was the original provider on 2026-08-13, was removed on 2026-08-29 by ADR-036 in favour of
 * DeepSeek, and is back because Edd asked for it: *"tienes que usar minimax m3 (solo él) como modelo
 * externo."*
 *
 * **The measurement always pointed here.** ADR-036 recorded, in its own second heading, that it was
 * deciding against the only head-to-head this project ever ran: plan 08 scored provenance across both
 * and MiniMax won it — 34% and 97% on the fixtures where DeepSeek produced none at all on a 75-field
 * document, three passes running. So this reversal restores the provider the data preferred, and the
 * intervening month cost the release nothing, because `DEEPSEEK_API_KEY` was never set in production
 * (roadmap item 13) and the third-party path was dark the whole time.
 *
 * `MiniMax-M3` by name, which is both the model Edd named and what this defaulted to before. Unlike
 * DeepSeek's endpoint — which answered 200 to invented model names and quietly served something else
 * — a wrong name here is a 404, which is the failure mode to prefer.
 */
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
 * twice over. For `HR_PROVIDER` it is because asking for one company and silently getting another is
 * how a comparison produces a confident wrong answer — that was a live risk while there were two, and
 * the rule is kept now that there is one because the day a second returns is not the day to remember
 * it. For a **person's** choice it is far more serious: consent under docs/07 is consent to a *named
 * company*, so sending their CV to a different one than the one they picked is the transfer they did
 * not agree to.
 */
const BY_ID: Record<string, () => Provider | undefined> = {
  minimax,
  anthropic,
}

export type ProviderId = keyof typeof BY_ID

/** The name a person would recognise. Not derived from the host, so a new one is named on purpose. */
const NAMES: Record<string, string> = {
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
 * It used to be one: whichever the resolution order landed on, offered as "send it" or "do not". Then
 * it was two, and the gate named each because the choice was the person's. It is one again — MiniMax,
 * ADR-036 — and the machinery stays, because the choice it carries was never really *which* company: it
 * is whether the CV leaves this machine at all. That question survives having a single answer on the
 * other side of it, and the gate still has to name the company for the consent to mean anything.
 *
 * `HR_PROVIDER`, when set, pins the deployment to one and this list narrows to it — a deployment that
 * has decided is not asking.
 */
export function availableProviders(): Array<ProviderChoice> {
  announceProviders()
  const pinned = value('HR_PROVIDER')?.toLowerCase()
  const ids = pinned === undefined ? Object.keys(BY_ID) : [pinned]
  return ids
    .filter((id) => BY_ID[id]?.() !== undefined)
    .map((id) => ({ id, name: NAMES[id] ?? id }))
}

/**
 * Say once, at boot, which providers resolved and which did not.
 *
 * **Because the absence was silent, and that cost a release.** DeepSeek shipped on 2026-08-18 and did
 * not appear in production: a provider factory returns `undefined` without its key, so the app
 * started clean, health was green, and a model somebody had deliberately added was simply not in the
 * list. Nothing was wrong enough to log. It was found by reading `/api/processing` after the deploy.
 *
 * Names only, from the fixed `BY_ID` keys. **No key, no fragment of one, and not even a length** —
 * the length of a secret is information about the secret, and `log.ts`'s scrubber cannot know that a
 * number it is handed came from one.
 *
 * Skipping is not a failure. Running with one provider is a valid deployment, and the local model is
 * always there. This is a line to read, not an alarm.
 */
let announced = false

export function announceProviders(): void {
  /*
    Once per process, following `db/crypto.ts`, which says the same thing about encryption for the
    same reason. There is no boot hook in this app — no nitro plugin, no server entry of our own — so
    "at startup" means "at first use", and the first use is the first request to `/api/processing`.
  */
  if (announced) return
  announced = true

  const pinned = value('HR_PROVIDER')?.toLowerCase()
  const ids = Object.keys(BY_ID)
  const configured = ids.filter((id) => BY_ID[id]?.() !== undefined)
  const skipped = ids.filter((id) => !configured.includes(id))

  /*
    The field names are prefixed because `log.ts` allowlists names, not values: a bare `skipped` is
    a key somebody later hangs a filename on. Adding to that allowlist is meant to be deliberate, and
    the first version of this line was redacted to `[redacted]` by the scrubber, which is the scrubber
    working rather than being in the way.
  */
  event('providers.resolved', {
    providersConfigured: configured.join(',') || 'none',
    providersSkipped: skipped.join(',') || 'none',
    // A pin means only one of them can ever be chosen, which is worth seeing next to the list.
    providerPinned: pinned ?? 'none',
  })
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

  /*
    4. MiniMax, the only third-party model this product offers (ADR-038).

    There were two here once and the line read `minimax() ?? deepseek()`, which made MiniMax the
    default by position rather than by decision. One company is the answer either way, so there is no
    order left to get wrong — and nothing silently substitutes another if this one is unconfigured,
    because consent under docs/07 is consent to a *named* company.
  */
  return minimax()
}

export function isConfigured(): boolean {
  return resolveProvider() !== undefined
}
