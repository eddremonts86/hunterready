/**
 * Structured logging with a hard rule: **no CV content, ever.**
 *
 * Not a guideline (docs/07-privacy.md). A log line is the easiest place for personal data to leak
 * out of a stateless system and into somewhere it persists — a log aggregator, a terminal
 * scrollback, an error tracker. So the only things this can emit are counts, durations, codes and
 * booleans, and `event()` refuses anything that looks like a name, an address or free text.
 *
 * The refusal is a runtime check rather than a convention, because conventions do not survive a
 * hurried Friday.
 */

type Primitive = string | number | boolean | null | undefined

/** Field names allowed to carry a string. Anything else must be a number or a boolean. */
const STRING_ALLOWLIST = new Set([
  'event',
  'requestId',
  'code',
  'shape',
  'attempt',
  'stop',
  'format',
  'method',
  'status',
  'promptVersion',
  'provider',
  'level',
  /**
   * A closed vocabulary — `suggested` / `fabricated` / `unavailable`.
   *
   * Named with its suffix on purpose. `outcome` alone would be the kind of generic key somebody later
   * hangs a message or a filename on, and this allowlist is only as good as the assumption that every
   * name on it can carry one of a handful of known words and nothing else.
   */
  'summaryOutcome',
])

function scrub(fields: Record<string, Primitive>): Record<string, Primitive> {
  const out: Record<string, Primitive> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    if (typeof value === 'string' && !STRING_ALLOWLIST.has(key)) {
      // A string on a non-allowlisted field is exactly how a job title ends up in a log.
      out[key] = '[redacted]'
      continue
    }
    if (typeof value === 'string' && value.length > 120) {
      out[key] = '[oversized]'
      continue
    }
    out[key] = value
  }
  return out
}

export function event(
  name: string,
  fields: Record<string, Primitive> = {},
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...scrub({ event: name, ...fields }),
  })
  console.log(line)
}

export function errorEvent(
  name: string,
  fields: Record<string, Primitive> = {},
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level: 'error',
    ...scrub({ event: name, ...fields }),
  })
  console.error(line)
}

/** Correlates the lines of one request. Not derived from anything about the user. */
export function requestId(): string {
  return Math.random().toString(36).slice(2, 10)
}
