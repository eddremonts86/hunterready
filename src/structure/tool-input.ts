/**
 * Read a tool call's input, whatever the gateway wrapped it in.
 *
 * Anthropic returns the tool input as the object itself. **Ollama nests it under an extra `object`
 * key** — verified against `ollama/ollama:latest` with `qwen2.5:3b-instruct`:
 *
 *     Anthropic:  "input": { "resume": {…}, "provenance": [] }
 *     Ollama:     "input": { "object": { "resume": {…}, "provenance": [] } }
 *
 * Left unhandled, every schema validation fails, both repair rounds are spent, and extraction silently
 * degrades to the rule engine — which is exactly what the local model was added to avoid. The symptom
 * gives no hint of the cause: the request succeeds, the model answers well, and the result is `rules`.
 *
 * This is the third shape difference an "Anthropic-compatible" endpoint has produced in this project
 * (MiniMax's `content: null`, MiniMax's missing provenance, now this). The lesson each time is the
 * same: compatible is not identical, so read defensively at the boundary and keep the rest of the code
 * ignorant of which provider answered.
 */
export function unwrapToolInput(input: unknown): unknown {
  if (
    typeof input === 'object' &&
    input !== null &&
    !Array.isArray(input) &&
    Object.keys(input).length === 1 &&
    'object' in input
  ) {
    const inner = input.object
    // Only unwrap into another object. A single `object` key whose value is a string is somebody's
    // actual field called "object", not a wrapper.
    if (typeof inner === 'object' && inner !== null && !Array.isArray(inner)) {
      return inner
    }
  }
  return input
}
