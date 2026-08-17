/**
 * One request to a model, streamed so the waiting screen can say what is happening inside it.
 *
 * ## What the wait actually is, measured
 *
 * The model call is the longest thing that happens to an upload, and until this was measured nobody
 * knew what it was doing during it. Against the real gateway, one realistic extraction — 8 jobs, a
 * 3.2KB answer — looks like this:
 *
 *     plain, temperature 0      32.2s   tool JSON: 1 delta, arriving at 32.2s
 *     thinking, temperature 0   34.9s   201 reasoning deltas, first at 1ms, last at 15.8s, max gap 1.4s
 *
 * Two things follow, and both were surprises.
 *
 * **Watching the answer stream does not work.** MiniMax buffers the tool input and flushes it whole at
 * the end — 4,339 of 4,340 characters in the final delta. `narrate.ts` reads it correctly and reports
 * every section at the finish line, which narrates a wait that has already finished. Ollama does the
 * same. That approach cannot show a wait on either provider we run.
 *
 * **Asking for the reasoning does work, and costs about 8%.** The thinking channel covers the first
 * half of the wait at better than one update a second, and MiniMax accepts it at `temperature: 0` — so
 * "extraction is transcription, not authorship" is untouched. That figure is one pair of runs against a
 * shared endpoint; treat 8% as "small", not as a benchmark.
 *
 * The reasoning text itself never leaves this process — `reasoning.ts` matches it against a fixed table
 * of our own words and emits a section key. See that file for why nothing weaker would do.
 *
 * ## Three attempts, in order, and why each exists
 *
 *  1. **Streamed, with reasoning.** What we want.
 *  2. **Streamed, without it.** Anthropic proper rejects `thinking` alongside `temperature: 0`, and any
 *     compatible gateway may not implement it at all. The refusal is remembered per model, so a provider
 *     that says no is asked once rather than on every upload.
 *  3. **Unstreamed.** `provider.ts` accepts any Anthropic-compatible endpoint, and compatible is not
 *     identical — this project has already been bitten by MiniMax's `content: null`, by its missing
 *     provenance array, and by Ollama wrapping a tool input in an extra object. Without this rung, a
 *     gateway with poor SSE would degrade every upload to the rule engine and give no hint why: the
 *     request succeeds, the model answers well, and the result is `method: rules`. That exact failure
 *     has cost this project a debugging session once already.
 *
 * A nicer loading screen is not worth one failed extraction. Narration is the decoration; the answer is
 * the product, and the ladder is what keeps that ordering true in code rather than in intent.
 *
 * An abort skips the remaining rungs: somebody who navigated away should not be charged two more calls
 * to discover that they left.
 */
import type Anthropic from '@anthropic-ai/sdk'
import type { NoteFn } from '@/lib/progress'
import { narrate } from './narrate'
import type { Aliases } from './narrate'
import { watchReasoning } from './reasoning'
import { errorEvent } from '@/lib/log'

/**
 * Room for the model to think, and a ceiling on what that costs.
 *
 * The measured run reasoned for 15.8 seconds and stopped on its own well inside this, so the budget
 * bounds the pathological case rather than describing a target. Raising it buys nothing observed;
 * lowering it risks truncating the reasoning of a genuinely long CV, and a model cut off mid-thought is
 * a change to extraction quality made in pursuit of a loading screen.
 */
function budget(): number {
  const raw = Number(process.env.HR_REASONING_BUDGET)
  return Number.isFinite(raw) && raw > 0 ? raw : 3072
}

/** `HR_REASONING=off` turns the narration off everywhere without a deploy of new code. */
function narrationWanted(): boolean {
  return (process.env.HR_REASONING ?? '').trim().toLowerCase() !== 'off'
}

/**
 * Models whose provider refused the reasoning channel.
 *
 * Per process and deliberately not persisted: a restart re-asks, which is right when the thing being
 * remembered is a remote service's capabilities rather than a fact.
 */
const noReasoning = new Set<string>()

export interface AskOptions {
  signal?: AbortSignal
  /** Where the narration goes. Omitted, nothing is watched and nothing is emitted. */
  onNote?: NoteFn
  /** Field names that mean a section under another name — `REFINE_ALIASES` for the private path. */
  aliases?: Aliases
  /**
   * Ask for the reasoning channel. Worth it only where the wait is long enough to narrate, which is
   * extraction; the private path's correction call is small and answers before a screen could redraw.
   */
  reasoning?: boolean
}

export async function ask(
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
  options: AskOptions = {},
): Promise<Anthropic.Message> {
  const { signal, onNote, aliases } = options
  const wantsReasoning =
    options.reasoning === true &&
    onNote !== undefined &&
    narrationWanted() &&
    !noReasoning.has(params.model)

  const rungs: Array<{ params: typeof params; streamed: boolean }> = []
  if (wantsReasoning) {
    rungs.push({
      params: {
        ...params,
        thinking: { type: 'enabled', budget_tokens: budget() },
      },
      streamed: true,
    })
  }
  rungs.push({ params, streamed: true }, { params, streamed: false })

  let last: unknown
  for (const [index, rung] of rungs.entries()) {
    try {
      return rung.streamed
        ? await streamed(client, rung.params, signal, onNote, aliases)
        : await client.messages.create(rung.params, { signal })
    } catch (error) {
      if (signal?.aborted === true) throw error
      // Only the first rung carries `thinking`, so only its failure says anything about the capability.
      if (index === 0 && wantsReasoning) {
        noReasoning.add(params.model)
        /*
          Logged, because the alternative is what this cost to find: the ladder catches the refusal, the
          upload succeeds, and the loading screen is silent for thirty seconds with nothing anywhere
          saying why. One line, and it is the difference between "this provider will not narrate" and a
          feature that looks broken. Class and status only — an SDK error message can quote the request
          body, and that body is somebody's CV.
        */
        errorEvent('extract.reasoning_refused', {
          model: params.model,
          kind: error instanceof Error ? error.constructor.name : typeof error,
          status:
            typeof (error as { status?: unknown })?.status === 'number'
              ? (error as { status: number }).status
              : undefined,
        })
      }
      last = error
    }
  }
  throw last
}

async function streamed(
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
  signal: AbortSignal | undefined,
  onNote: NoteFn | undefined,
  aliases: Aliases | undefined,
): Promise<Anthropic.Message> {
  const live = client.messages.stream(params, { signal })
  // `finalMessage()` rejects with the same error; this listener exists only so the emitter has one,
  // because without it the SDK treats an error event as unhandled.
  live.on('error', () => {})

  if (onNote !== undefined) {
    /*
      Two watchers on one request, because the two halves of the wait speak differently. The reasoning
      names the part of the CV being worked out; the tool call, when it finally lands, names the
      sections with their counts. Both emit keys into the same channel, and `progressNote` folds a
      repeat back onto the row it already drew — so a section reasoned about at second three and written
      at second thirty is one row that lights up twice, not two rows.
    */
    const reason = watchReasoning((key) => onNote(key, 0))
    live.on('thinking', (delta) => {
      reason.push(delta)
    })

    const written = narrate((state) => onNote(state.key, state.count), aliases)
    live.on('inputJson', (partial) => {
      written.push(partial)
    })

    /*
      The silent tail. Reasoning stops around the halfway mark and the answer does not appear for many
      seconds after; the tool-use block opening is the real event separating them, so it is what moves
      the screen rather than a timer pretending to know.
    */
    live.on('streamEvent', (event) => {
      if (
        event.type === 'content_block_start' &&
        event.content_block.type === 'tool_use'
      ) {
        onNote('writing', 0)
      }
    })
  }

  return await live.finalMessage()
}
