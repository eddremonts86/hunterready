/**
 * An in-process cache for rewrites.
 *
 * docs/06: *"Cache aggressively on `hash(bullet + promptVersion)` — users re-run this constantly
 * while iterating."* That is the literal usage pattern: someone accepts three suggestions, edits a
 * fourth bullet by hand, and asks again. Without a cache every unchanged bullet is a fresh model
 * call, and a 25-bullet CV costs 25 calls to answer a question about one line.
 *
 * Deliberately in-memory and deliberately small:
 *
 *  • **No persistence.** A cache on disk would be a store of CV content, and ADR-004 says this
 *    service holds nothing. The entries die with the process, which is the correct lifetime for
 *    somebody else's employment history.
 *  • **Bounded, with the oldest evicted.** An unbounded map keyed on user input is a memory leak
 *    with a rate limiter in front of it, which is a slower memory leak.
 *  • **Keyed on the prompt version**, so changing the prompt invalidates everything rather than
 *    serving yesterday's wording under today's rules.
 *
 * A single shared instance is fine because the key already includes everything that distinguishes
 * one request from another, and because a hit is only ever *the same bullet in the same CV*.
 */
import type { BulletRewrite } from './rewrite'

/** Roughly a few hundred CVs' worth of bullets. Small enough to be invisible, big enough to work. */
const MAX_ENTRIES = 2_000

interface Entry {
  value: BulletRewrite
  at: number
}

const entries = new Map<string, Entry>()

export function cacheGet(key: string): BulletRewrite | undefined {
  const hit = entries.get(key)
  if (hit === undefined) return undefined
  // Re-insert so recency is the map's own iteration order; eviction then takes the oldest.
  entries.delete(key)
  entries.set(key, { ...hit, at: hit.at })
  return hit.value
}

export function cacheSet(key: string, value: BulletRewrite): void {
  /**
   * `unavailable` is never cached.
   *
   * It means the provider was down or the call failed — a fact about the last ten seconds, not about
   * the bullet. Caching it would turn one transient outage into a permanently unimprovable line, and
   * the user would have no way to tell that retrying was pointless because it is not.
   */
  if (value.outcome === 'unavailable') return

  entries.set(key, { value, at: Date.now() })

  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next()
    if (oldest.done === true) break
    entries.delete(oldest.value)
  }
}

/** Test seam, and a way for an operator to drop everything without a restart. */
export function cacheClear(): void {
  entries.clear()
}

export function cacheSize(): number {
  return entries.size
}
