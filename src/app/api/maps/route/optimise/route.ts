/**
 * Smart Route Optimiser endpoint — POST /api/maps/route/optimise (Phase 7D).
 *
 * Body: {
 *   points: OptimiseRoutePoint[],  // id, name, lat, lng
 *   travelMode: TravelMode,
 *   mode: RouteOptimiseMode,       // 'fastest' | 'shortest' | 'balanced'
 *   keepFirstFixed?: boolean,      // pin the first stop as the day-start (default true)
 *   keepLastFixed?: boolean,       // pin the last stop as the day-end (default false)
 * }
 * Returns: OptimiseRouteResult
 *
 * Orders stops by REAL road cost: a traffic-aware Compute Route Matrix solved
 * with a TSP heuristic, then a Compute Routes call for the exact polyline +
 * totals. Straight-line Haversine is used only as a fallback. Returns 503 when
 * Maps is unavailable. User-triggered only.
 */

import { NextResponse } from 'next/server'
import { isMapsAvailable, computeOptimisedRoute } from '@/lib/maps/googleServer'
import { rateLimit, clientKey } from '@/lib/server/rateLimit'
import type { TravelMode, RouteOptimiseMode, OptimiseRoutePoint } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TRAVEL_MODES: TravelMode[] = ['driving', 'walking', 'transit']
const OPTIMISE_MODES: RouteOptimiseMode[] = ['fastest', 'shortest', 'balanced']
const MAX_POINTS = 23 // Routes API supports up to 25 waypoints (origin + 23 intermediates + destination)

export async function POST(request: Request) {
  const limit = rateLimit(`maps-optimise:${clientKey(request)}`, 10, 60_000)
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

  const b = body as {
    points?: unknown
    travelMode?: unknown
    mode?: unknown
    keepFirstFixed?: unknown
    keepLastFixed?: unknown
  } | null

  const travelMode: TravelMode = TRAVEL_MODES.includes(b?.travelMode as TravelMode)
    ? (b!.travelMode as TravelMode)
    : 'driving'

  const mode: RouteOptimiseMode = OPTIMISE_MODES.includes(b?.mode as RouteOptimiseMode)
    ? (b!.mode as RouteOptimiseMode)
    : 'fastest'

  // Default: keep the first stop fixed (planning from a chosen start), let the
  // optimiser choose the best end. Both are caller-overridable booleans.
  const keepFirstFixed = typeof b?.keepFirstFixed === 'boolean' ? b.keepFirstFixed : true
  const keepLastFixed = typeof b?.keepLastFixed === 'boolean' ? b.keepLastFixed : false

  if (!Array.isArray(b?.points)) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }

  const points: OptimiseRoutePoint[] = []
  for (const raw of b!.points as unknown[]) {
    const p = raw as Record<string, unknown>
    if (
      typeof p.id === 'string' &&
      typeof p.name === 'string' &&
      typeof p.lat === 'number' &&
      typeof p.lng === 'number' &&
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lng)
    ) {
      points.push({ id: p.id, name: p.name, lat: p.lat, lng: p.lng })
    }
    if (points.length >= MAX_POINTS) break
  }

  if (points.length < 2) {
    return NextResponse.json({ error: 'not_enough_points' }, { status: 400 })
  }

  try {
    const result = await computeOptimisedRoute(points, travelMode, mode, {
      keepFirstFixed,
      keepLastFixed,
    })
    return NextResponse.json(result)
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Voyago] route optimise error:', err)
    }
    return NextResponse.json(
      { error: 'optimise_failed', message: 'Route optimisation is temporarily unavailable.' },
      { status: 502 }
    )
  }
}
