/**
 * Place text-search endpoint — POST /api/maps/places/search (Phase 6).
 *
 * Body: { query: string }
 * Returns: { results: PlaceSearchResult[] }
 *
 * Returns 503 `maps_unavailable` when the feature is off or no key is set, so
 * the client can fall back to manual location entry. The Google key stays
 * server-side; errors are mapped to friendly codes and never leak internals.
 */

import { NextResponse } from 'next/server'
import { isMapsAvailable, searchPlaces, MapsApiError, type MapsApiErrorCode } from '@/lib/maps/googleServer'
import { rateLimit, clientKey } from '@/lib/server/rateLimit'

/** HTTP status to return for each friendly error code. */
const ERROR_STATUS: Record<MapsApiErrorCode, number> = {
  google_bad_request: 400,
  google_field_mask_invalid: 500,
  google_permission_denied: 502,
  google_api_not_enabled: 502,
  google_quota_exceeded: 429,
  google_invalid_key: 502,
  maps_request_failed: 502,
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const limit = rateLimit(`maps-search:${clientKey(request)}`, 30, 60_000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterMs: limit.retryAfterMs },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) } }
    )
  }

  if (!isMapsAvailable()) {
    return NextResponse.json({ error: 'maps_unavailable' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const query = (body as { query?: unknown } | null)?.query
  if (typeof query !== 'string' || query.trim().length < 2) {
    return NextResponse.json({ error: 'invalid_query' }, { status: 400 })
  }

  try {
    const results = await searchPlaces(query.trim())
    return NextResponse.json({ results })
  } catch (err) {
    // Classified upstream Google failures → useful, key-free JSON.
    if (err instanceof MapsApiError) {
      return NextResponse.json(
        { error: err.code, detail: err.detail },
        { status: ERROR_STATUS[err.code] ?? 502 },
      )
    }
    // No key configured (feature flag on but key missing at call time).
    if (err instanceof Error && err.message === 'maps_not_configured') {
      return NextResponse.json({ error: 'maps_unavailable' }, { status: 503 })
    }
    // Transport / unexpected failure.
    console.error('[Voyago Maps] place search unexpected error:', err instanceof Error ? err.message : 'unknown')
    return NextResponse.json(
      { error: 'maps_request_failed', detail: 'Place search is temporarily unavailable.' },
      { status: 502 },
    )
  }
}
