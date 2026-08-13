/**
 * In-memory per-IP rate limiting for the upload endpoint.
 *
 * `/api/ingest` parses untrusted files and then spends money on a model call, so it is a direct
 * cost-abuse vector on an unauthenticated endpoint (docs/07-privacy.md). This is the cheap 90%:
 * it stops a script, not a botnet.
 *
 * Honest limitations, stated rather than discovered later:
 *   • per-process, so N replicas allow N × the limit. Fine at one replica; move to Redis when
 *     that stops being true.
 *   • memory-only, so a restart forgives everyone.
 *   • an IP is a poor identity behind CGNAT, which is why the limit is generous.
 */

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/** Generous: a real person re-uploading a few CVs must never hit this. */
export const INGEST_LIMIT = 12
export const INGEST_WINDOW_MS = 10 * 60 * 1000

/** Bounded so a hostile spread of source IPs cannot grow the map without limit. */
const MAX_TRACKED = 10_000

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

export function checkRateLimit(
  key: string,
  limit = INGEST_LIMIT,
  windowMs = INGEST_WINDOW_MS,
  now = Date.now(),
): RateLimitResult {
  const existing = buckets.get(key)

  if (existing === undefined || existing.resetAt <= now) {
    if (buckets.size >= MAX_TRACKED) {
      // Drop everything already expired; if that frees nothing, drop the oldest window.
      for (const [k, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(k)
      }
      if (buckets.size >= MAX_TRACKED) {
        const oldest = [...buckets.entries()].sort(
          (a, b) => a[1].resetAt - b[1].resetAt,
        )[0]
        if (oldest !== undefined) buckets.delete(oldest[0])
      }
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 }
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000),
      ),
    }
  }

  existing.count++
  return {
    allowed: true,
    remaining: limit - existing.count,
    retryAfterSeconds: 0,
  }
}

/**
 * Best-effort client identity. Coolify and most proxies set `x-forwarded-for`; the leftmost entry
 * is the client. Spoofable, which is why this is rate limiting and not authorization.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded !== null && forwarded.trim() !== '') {
    return forwarded.split(',')[0].trim()
  }
  return request.headers.get('x-real-ip') ?? 'unknown'
}

/** Test-only. */
export function resetRateLimits(): void {
  buckets.clear()
}
