/**
 * POST /api/maps/itinerary-timing — Phase 16E.
 *
 * Computes per-consecutive-pair travel times for each day's geocoded activities
 * using the Google Routes API. Called client-side after place enrichment +
 * route optimisation have run (so activities are in their final order).
 *
 * Returns flat leg list keyed by {date, fromKey, toKey}. The client merges
 * these back into the editable preview state.
 *
 * Falls back gracefully: if Maps is not configured, returns {available:false}
 * so the client can use its haversine fallback instead.
 */

import { NextRequest, NextResponse } from 'next/server'
import { isMapsAvailable, computeDayRoute } from '@/lib/maps/googleServer'
import type { TravelMode } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface InputPoint {
  key: string
  name: string
  lat: number
  lng: number
}

interface InputDay {
  date: string
  points: InputPoint[]
}

interface RequestBody {
  days: InputDay[]
  travelMode?: TravelMode
}

export interface TimingLeg {
  date: string
  fromKey: string
  toKey: string
  durationSeconds: number
  distanceMeters: number
  durationText: string
  distanceText: string
  source: 'google_routes'
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isMapsAvailable()) {
    return NextResponse.json({ available: false, legs: [] })
  }

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const { days = [], travelMode = 'driving' } = body
  const legs: TimingLeg[] = []

  // Process each day independently — one Routes API call per day with ≥ 2 geocoded points.
  for (const day of days.slice(0, 10)) {
    const pts = day.points.filter(
      (p) => typeof p.lat === 'number' && typeof p.lng === 'number' && p.key && p.name,
    )
    if (pts.length < 2) continue

    try {
      const routePoints = pts.map((p) => ({ activityId: p.key, name: p.name, lat: p.lat, lng: p.lng }))
      const summary = await computeDayRoute(day.date, routePoints, travelMode)

      for (const leg of summary.legs) {
        if (!leg.ok) continue
        legs.push({
          date: day.date,
          fromKey: leg.originActivityId,
          toKey: leg.destinationActivityId,
          durationSeconds: leg.durationSeconds,
          distanceMeters: leg.distanceMeters,
          durationText: leg.durationText,
          distanceText: leg.distanceText,
          source: 'google_routes',
        })
      }
    } catch {
      // Skip this day on failure — client will use haversine fallback.
    }
  }

  return NextResponse.json({ available: true, legs })
}
