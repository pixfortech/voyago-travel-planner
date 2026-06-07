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
import { isMapsAvailable, searchPlaces } from '@/lib/maps/googleServer'
import { rateLimit, clientKey } from '@/lib/server/rateLimit'

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
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Voyago Maps] place search error:', err)
    }
    const message = err instanceof Error ? err.message : 'unknown'
    const status = message === 'maps_auth_error' ? 502 : 502
    return NextResponse.json(
      { error: 'maps_search_failed', message: 'Place search is temporarily unavailable.' },
      { status }
    )
  }
}
