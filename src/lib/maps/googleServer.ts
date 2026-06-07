/**
 * Google Maps — server-only integration (Phase 6).
 *
 * All Google API calls live here so the API key never reaches the browser. The
 * key is read at request time (never at import time), so importing this module
 * is cheap and never throws when no key is configured.
 *
 * Key resolution prefers a dedicated server secret, falling back to the public
 * browser key if that is the only one a developer has set:
 *   1. GOOGLE_MAPS_API_KEY            (server-only — recommended)
 *   2. NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (public — convenient for local dev)
 *
 * Google APIs used:
 *   • Places API (New)  — places:searchText  (text place search)
 *   • Distance Matrix API — sequential leg distance/duration for a day route
 */

import 'server-only'
import { isFeatureEnabled } from '@/lib/flags'
import type {
  PlaceSearchResult,
  RouteLeg,
  RouteRequestPoint,
  TravelMode,
  DayRouteSummary,
} from '@/types'

export function getServerMapsKey(): string {
  return (
    process.env.GOOGLE_MAPS_API_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ??
    ''
  ).trim()
}

/** A key is configured server-side (does not reveal the key). */
export function isMapsServerConfigured(): boolean {
  return getServerMapsKey().length > 0
}

/** Maps features are usable: feature flag on AND a key is configured. */
export function isMapsAvailable(): boolean {
  return isFeatureEnabled('mapFeatures') && isMapsServerConfigured()
}

// ── Places (New) text search ────────────────────────────────────────────────

// New Places API encodes price level as an enum string; map to 0–4.
const PRICE_LEVEL_MAP: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
}

interface RawPlace {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  rating?: number
  userRatingCount?: number
  priceLevel?: string
  location?: { latitude?: number; longitude?: number }
}

/**
 * Text search for places. Region-biased to India by default. Returns a trimmed
 * list of the only fields we persist/show. Throws on transport/API failure so
 * the route handler can map it to a friendly error.
 */
export async function searchPlaces(
  query: string,
  opts: { regionCode?: string; maxResults?: number } = {}
): Promise<PlaceSearchResult[]> {
  const key = getServerMapsKey()
  if (!key) throw new Error('maps_not_configured')

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      // Field mask keeps the response (and billing) minimal.
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.location',
    },
    body: JSON.stringify({
      textQuery: query,
      regionCode: opts.regionCode ?? 'IN',
      maxResultCount: Math.min(Math.max(opts.maxResults ?? 8, 1), 12),
    }),
    // Never cache user queries.
    cache: 'no-store',
  })

  if (!res.ok) {
    const status = res.status
    if (status === 403 || status === 401) throw new Error('maps_auth_error')
    throw new Error(`maps_request_failed_${status}`)
  }

  const data = (await res.json()) as { places?: RawPlace[] }
  const places = data.places ?? []
  return places
    .filter((p) => p.id && p.location?.latitude != null && p.location?.longitude != null)
    .map((p) => ({
      placeId: p.id as string,
      name: p.displayName?.text ?? 'Unnamed place',
      address: p.formattedAddress ?? '',
      rating: typeof p.rating === 'number' ? p.rating : undefined,
      userRatingsTotal: typeof p.userRatingCount === 'number' ? p.userRatingCount : undefined,
      priceLevel: p.priceLevel ? PRICE_LEVEL_MAP[p.priceLevel] : undefined,
      lat: p.location!.latitude as number,
      lng: p.location!.longitude as number,
    }))
}

// ── Distance Matrix — sequential day route ───────────────────────────────────

interface DistanceElement {
  status?: string
  distance?: { text?: string; value?: number }
  duration?: { text?: string; value?: number }
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km`
  return `${meters} m`
}

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`
}

/**
 * Compute consecutive legs between ordered points using one Distance Matrix
 * request (origins = points[0..n-2], destinations = points[1..n-1]; the i-th leg
 * is row i, element i). Returns a full day summary with totals and warnings.
 */
export async function computeDayRoute(
  dayId: string,
  points: RouteRequestPoint[],
  travelMode: TravelMode
): Promise<DayRouteSummary> {
  const key = getServerMapsKey()
  if (!key) throw new Error('maps_not_configured')
  if (points.length < 2) throw new Error('not_enough_points')

  const origins = points.slice(0, -1)
  const destinations = points.slice(1)

  const coord = (p: RouteRequestPoint) => `${p.lat},${p.lng}`
  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json')
  url.searchParams.set('origins', origins.map(coord).join('|'))
  url.searchParams.set('destinations', destinations.map(coord).join('|'))
  url.searchParams.set('mode', travelMode)
  url.searchParams.set('units', 'metric')
  url.searchParams.set('key', key)

  const res = await fetch(url.toString(), { cache: 'no-store' })
  if (!res.ok) {
    if (res.status === 403 || res.status === 401) throw new Error('maps_auth_error')
    throw new Error(`maps_request_failed_${res.status}`)
  }

  const data = (await res.json()) as {
    status?: string
    rows?: { elements?: DistanceElement[] }[]
  }
  if (data.status && data.status !== 'OK') throw new Error(`maps_status_${data.status}`)

  const legs: RouteLeg[] = []
  let totalDistance = 0
  let totalDuration = 0

  for (let i = 0; i < origins.length; i++) {
    const el = data.rows?.[i]?.elements?.[i]
    const ok = el?.status === 'OK' && el.distance?.value != null && el.duration?.value != null
    const distanceMeters = ok ? (el!.distance!.value as number) : 0
    const durationSeconds = ok ? (el!.duration!.value as number) : 0
    if (ok) {
      totalDistance += distanceMeters
      totalDuration += durationSeconds
    }
    legs.push({
      originActivityId: origins[i].activityId,
      destinationActivityId: destinations[i].activityId,
      originName: origins[i].name,
      destinationName: destinations[i].name,
      travelMode,
      distanceText: ok ? (el!.distance!.text ?? formatDistance(distanceMeters)) : '—',
      durationText: ok ? (el!.duration!.text ?? formatDuration(durationSeconds)) : 'No route',
      distanceMeters,
      durationSeconds,
      ok: Boolean(ok),
    })
  }

  // Warnings: long single hops, large total travel, or unreachable legs.
  const warnings: string[] = []
  const longLeg = legs.find((l) => l.ok && l.durationSeconds > 60 * 60)
  if (longLeg) {
    warnings.push(
      `${longLeg.originName} → ${longLeg.destinationName} is over an hour of travel (${longLeg.durationText}).`
    )
  }
  if (totalDuration > 4 * 60 * 60) {
    warnings.push(
      `This day has heavy travel (${formatDuration(totalDuration)} total) — consider splitting activities across days.`
    )
  }
  const failed = legs.filter((l) => !l.ok).length
  if (failed > 0) {
    warnings.push(
      `${failed} leg(s) had no available ${travelMode} route. Try a different travel mode.`
    )
  }

  return {
    dayId,
    travelMode,
    legs,
    totalDistanceText: formatDistance(totalDistance),
    totalDurationText: formatDuration(totalDuration),
    totalDistanceMeters: totalDistance,
    totalDurationSeconds: totalDuration,
    warnings,
  }
}
