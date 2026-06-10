/**
 * POST /api/maps/place-context — Phase 16F.
 *
 * Enriches geocoded itinerary stops with elevation, weather (for the planned
 * date), air quality and a destination time zone. Runs server-side so the Google
 * key never reaches the browser. Called by the preview AFTER place verification,
 * food enrichment and timing enrichment (weather needs the planned date).
 *
 * Performance: identical coordinates (rounded to 4 decimals ≈ 11 m) are
 * de-duplicated, so elevation is one batched call and weather/AQI run once per
 * unique location. Caps protect quota. Any single API failure degrades to an
 * `unavailable` field — it never fails the whole request.
 *
 * Returns `{ available: false }` when Maps is not configured so the client can
 * simply skip context (no fake data).
 */

import { NextRequest, NextResponse } from 'next/server'
import { isMapsAvailable } from '@/lib/maps/googleServer'
import {
  fetchElevationBatch,
  fetchWeatherForecast,
  fetchAirQuality,
  fetchTimeZone,
  pickWeatherForDate,
} from '@/lib/maps/googleContext'
import type { WeatherSnapshot, AqiSnapshot, TimeZoneContext } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface InputPoint {
  key: string
  lat: number
  lng: number
  /** Planned day date, YYYY-MM-DD — used to match the weather forecast. */
  date?: string
}

interface RequestBody {
  points: InputPoint[]
  /** Optional destination coordinate for the time-zone lookup. */
  destination?: { lat: number; lng: number }
}

export interface PlaceContextResult {
  key: string
  elevationMeters?: number
  elevationFeet?: number
  elevationSource: 'google_elevation' | 'unavailable'
  elevationConfidence: 'high' | 'unavailable'
  weatherSnapshot?: WeatherSnapshot
  aqiSnapshot?: AqiSnapshot
}

export interface PlaceContextResponse {
  available: boolean
  contexts: PlaceContextResult[]
  timeZone?: TimeZoneContext
}

// Round to 4 decimals (~11 m) so near-identical pins share one API call.
function roundKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`
}

// Hard caps to protect quota from a pathological request.
const MAX_POINTS = 60
const MAX_UNIQUE_WEATHER_AQI = 30

export async function POST(req: NextRequest): Promise<NextResponse<PlaceContextResponse>> {
  if (!isMapsAvailable()) {
    return NextResponse.json({ available: false, contexts: [] })
  }

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return NextResponse.json({ available: false, contexts: [] }, { status: 400 })
  }

  const points = (body.points ?? [])
    .filter((p) => p && typeof p.lat === 'number' && typeof p.lng === 'number' && p.key)
    .slice(0, MAX_POINTS)

  if (points.length === 0) {
    return NextResponse.json({ available: true, contexts: [] })
  }

  // 1. De-duplicate locations (rounded).
  const uniqueByKey = new Map<string, { lat: number; lng: number }>()
  for (const p of points) {
    const rk = roundKey(p.lat, p.lng)
    if (!uniqueByKey.has(rk)) uniqueByKey.set(rk, { lat: p.lat, lng: p.lng })
  }
  const uniqueKeys = Array.from(uniqueByKey.keys())
  const uniqueLocs = Array.from(uniqueByKey.values())

  // 2. Elevation — one batched call for all unique locations.
  const elevationResults = await fetchElevationBatch(uniqueLocs)
  const elevationByRk = new Map<string, (typeof elevationResults)[number]>()
  elevationResults.forEach((r, i) => elevationByRk.set(uniqueKeys[i]!, r))

  // 3. Weather forecast + AQI — once per unique location (capped, parallel).
  const weatherByRk = new Map<string, Awaited<ReturnType<typeof fetchWeatherForecast>>>()
  const aqiByRk = new Map<string, AqiSnapshot>()
  const cappedKeys = uniqueKeys.slice(0, MAX_UNIQUE_WEATHER_AQI)

  await Promise.all(
    cappedKeys.map(async (rk) => {
      const loc = uniqueByKey.get(rk)!
      const [weather, aqi] = await Promise.all([
        fetchWeatherForecast(loc.lat, loc.lng),
        fetchAirQuality(loc.lat, loc.lng),
      ])
      weatherByRk.set(rk, weather)
      aqiByRk.set(rk, aqi)
    }),
  )

  // 4. Time zone — single lookup for the destination (or first unique location).
  const tzLoc = body.destination ?? uniqueLocs[0]!
  const timeZone = await fetchTimeZone(tzLoc.lat, tzLoc.lng)

  // 5. Map results back onto each requested point.
  const contexts: PlaceContextResult[] = points.map((p) => {
    const rk = roundKey(p.lat, p.lng)
    const elev = elevationByRk.get(rk)
    const forecast = weatherByRk.get(rk)
    const aqi = aqiByRk.get(rk)

    const result: PlaceContextResult = {
      key: p.key,
      elevationSource: elev?.source ?? 'unavailable',
      elevationConfidence: elev?.confidence ?? 'unavailable',
    }
    if (elev?.elevationMeters != null) {
      result.elevationMeters = elev.elevationMeters
      result.elevationFeet = elev.elevationFeet
    }
    if (forecast) {
      const snap = pickWeatherForDate(forecast, p.date)
      if (snap.source !== 'unavailable') result.weatherSnapshot = snap
    }
    if (aqi && aqi.source !== 'unavailable') result.aqiSnapshot = aqi
    return result
  })

  return NextResponse.json({
    available: true,
    contexts,
    ...(timeZone.source !== 'unavailable' ? { timeZone } : {}),
  })
}
