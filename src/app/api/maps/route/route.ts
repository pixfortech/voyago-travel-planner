/**
 * Day route endpoint — POST /api/maps/route (Phase 6 / updated Phase 7D).
 *
 * Body: { dayId: string, points: RouteRequestPoint[], travelMode: TravelMode }
 * Returns: DayRouteSummary
 *
 * Computes sequential travel legs (distance + duration) between ordered
 * activities for one day using Google Routes API (computeRoutes). Returns 503
 * `maps_unavailable` when the feature is off or no key is set. User-triggered only.
 */

import { NextResponse } from 'next/server'
import { isMapsAvailable, computeDayRoute } from '@/lib/maps/googleServer'
import { rateLimit, clientKey } from '@/lib/server/rateLimit'
import type { RouteRequestPoint, TravelMode } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MODES: TravelMode[] = ['driving', 'walking', 'transit']

export async function POST(request: Request) {
  const limit = rateLimit(`maps-route:${clientKey(request)}`, 20, 60_000)
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

  const b = body as { dayId?: unknown; points?: unknown; travelMode?: unknown } | null
  const dayId = typeof b?.dayId === 'string' ? b.dayId : ''
  const travelMode: TravelMode = MODES.includes(b?.travelMode as TravelMode)
    ? (b!.travelMode as TravelMode)
    : 'driving'

  if (!dayId || !Array.isArray(b?.points)) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }

  // Validate + clamp the points list.
  const points: RouteRequestPoint[] = []
  for (const raw of b!.points as unknown[]) {
    const p = raw as Record<string, unknown>
    if (
      typeof p.activityId === 'string' &&
      typeof p.name === 'string' &&
      typeof p.lat === 'number' &&
      typeof p.lng === 'number' &&
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lng)
    ) {
      points.push({ activityId: p.activityId, name: p.name, lat: p.lat, lng: p.lng })
    }
    if (points.length >= 25) break // Routes API supports up to 25 waypoints
  }

  if (points.length < 2) {
    return NextResponse.json({ error: 'not_enough_points' }, { status: 400 })
  }

  try {
    const summary = await computeDayRoute(dayId, points, travelMode)
    return NextResponse.json(summary)
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Voyago Maps] route error:', err)
    }
    return NextResponse.json(
      { error: 'maps_route_failed', message: 'Route calculation is temporarily unavailable.' },
      { status: 502 }
    )
  }
}
