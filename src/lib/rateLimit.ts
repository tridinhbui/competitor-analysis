/**
 * Minimal in-memory rate limiter for AI-cost-incurring routes.
 *
 * CAVEAT: state is per Node process. On a multi-instance / serverless
 * deployment (Vercel, etc.) each instance has its own counters, so the
 * effective limit is (limit x instance count), not a hard global cap.
 * This stops a single runaway client/script from spamming one instance;
 * it is not a substitute for a shared store (Upstash/Redis) if this needs
 * to be a hard guarantee at scale.
 */

const buckets = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/** Cleans up long-idle buckets so the map doesn't grow unbounded. */
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, resetAt: bucket.resetAt };
}

export function rateLimitResponse(result: RateLimitResult) {
  const retryAfterSec = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return Response.json(
    { error: "Too many requests. Please wait a moment and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}
