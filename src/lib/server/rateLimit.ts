/**
 * Minimal in-memory rate limiter — Phase 0 foundation.
 *
 * A simple fixed-window counter keyed by an arbitrary string (e.g. client IP or
 * uid). This is a basic server-side safety check to guard the AI routes against
 * accidental loops and abuse during development. It is per-instance and resets
 * on restart; a durable limiter can replace it when AI generation goes live.
 */

import 'server-only'

interface Window {
  count: number
  resetAt: number
}

const windows = new Map<string, Window>()

export interface RateLimitResult {
  ok: boolean
  remaining: number
  retryAfterMs: number
}

export function rateLimit(key: string, limit = 30, windowMs = 60_000): RateLimitResult {
  const now = Date.now()
  const existing = windows.get(key)

  if (!existing || now >= existing.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, remaining: limit - 1, retryAfterMs: 0 }
  }

  if (existing.count >= limit) {
    return { ok: false, remaining: 0, retryAfterMs: existing.resetAt - now }
  }

  existing.count += 1
  return { ok: true, remaining: limit - existing.count, retryAfterMs: 0 }
}

/** Best-effort client identifier from a request, for rate-limit keys. */
export function clientKey(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}
