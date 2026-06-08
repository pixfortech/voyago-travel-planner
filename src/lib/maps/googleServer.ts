/**
 * Google Maps — server-only integration (Phase 6 / updated Phase 7D).
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
 *   • Places API (New)     — places:searchText  (text place search)
 *   • Google Routes API    — computeRoutes      (sequential leg distance/duration)
 *   • Google Routes API    — computeRoutes      (optimised order via nearest-neighbour)
 */

import 'server-only'
import { isFeatureEnabled } from '@/lib/flags'
import { haversineMeters } from '@/lib/location/distance'
import type {
  PlaceSearchResult,
  RouteLeg,
  RouteRequestPoint,
  TravelMode,
  DayRouteSummary,
  OptimiseRoutePoint,
  OptimiseRouteResult,
  RouteOptimiseMode,
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
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.location',
    },
    body: JSON.stringify({
      textQuery: query,
      regionCode: opts.regionCode ?? 'IN',
      maxResultCount: Math.min(Math.max(opts.maxResults ?? 8, 1), 12),
    }),
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

// ── Google Routes API — shared helpers ──────────────────────────────────────

/** Maps our TravelMode enum to the Routes API enum value. */
const TRAVEL_MODE_MAP: Record<TravelMode, string> = {
  driving: 'DRIVE',
  walking: 'WALK',
  transit: 'TRANSIT',
}

interface RoutesApiLeg {
  distanceMeters?: number
  /** Duration as a protobuf Duration string, e.g. "300s". */
  duration?: string
}

interface RoutesApiResponse {
  routes?: Array<{
    legs?: RoutesApiLeg[]
    polyline?: { encodedPolyline?: string }
  }>
  error?: { code?: number; message?: string }
}

/** Legs plus the optional encoded road polyline for the whole route. */
interface RoutesApiResult {
  legs: RoutesApiLeg[]
  encodedPolyline: string | null
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

/** Parse a Routes API Duration string ("300s") into integer seconds. */
function parseDurationSeconds(dur?: string): number {
  if (!dur) return 0
  const match = dur.match(/^(\d+)s$/)
  return match ? parseInt(match[1]!, 10) : 0
}

/**
 * Call Google Routes API computeRoutes for an ordered list of lat/lng points.
 * Returns legs in order (origin→waypoint1, …, waypointN→destination) plus the
 * encoded road polyline for the whole route (when Google provides one).
 *
 * The routing preference is mode-dependent: TRANSIT/WALK do not support
 * TRAFFIC_AWARE, so we only request it (when needed) for DRIVE.
 *
 * Throws on auth or transport failure. On a per-leg routing failure the leg will
 * have zero distanceMeters/duration — callers flag these as !ok.
 */
async function fetchRoutesApiLegs(
  points: Array<{ lat: number; lng: number }>,
  travelMode: TravelMode,
): Promise<RoutesApiResult> {
  const key = getServerMapsKey()
  if (points.length < 2) throw new Error('not_enough_points')

  const toWaypoint = (p: { lat: number; lng: number }) => ({
    location: { latLng: { latitude: p.lat, longitude: p.lng } },
  })

  const body: Record<string, unknown> = {
    origin: toWaypoint(points[0]!),
    destination: toWaypoint(points[points.length - 1]!),
    travelMode: TRAVEL_MODE_MAP[travelMode],
    computeAlternativeRoutes: false,
    units: 'METRIC',
    // Overview-level polyline keeps the response (and decode cost) small.
    polylineQuality: 'OVERVIEW',
  }

  // routingPreference is only valid for DRIVE/TWO_WHEELER in the Routes API.
  if (travelMode === 'driving') {
    body.routingPreference = 'TRAFFIC_UNAWARE'
  }

  if (points.length > 2) {
    body.intermediates = points.slice(1, -1).map(toWaypoint)
  }

  const res = await fetch(
    'https://routes.googleapis.com/directions/v2:computeRoutes',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask':
          'routes.legs.distanceMeters,routes.legs.duration,routes.polyline.encodedPolyline',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    }
  )

  if (!res.ok) {
    if (res.status === 403 || res.status === 401) throw new Error('maps_auth_error')
    throw new Error(`maps_request_failed_${res.status}`)
  }

  const data = (await res.json()) as RoutesApiResponse
  if (data.error?.code) throw new Error(`maps_routes_error_${data.error.code}`)

  const route = data.routes?.[0]
  return {
    legs: route?.legs ?? [],
    encodedPolyline: route?.polyline?.encodedPolyline ?? null,
  }
}

// ── Routes API — sequential day route (replaces legacy Distance Matrix) ─────

/**
 * Compute consecutive legs between ordered points using Google Routes API.
 * One request covers all legs (origin + intermediates + destination).
 */
export async function computeDayRoute(
  dayId: string,
  points: RouteRequestPoint[],
  travelMode: TravelMode
): Promise<DayRouteSummary> {
  const key = getServerMapsKey()
  if (!key) throw new Error('maps_not_configured')
  if (points.length < 2) throw new Error('not_enough_points')

  const coords = points.map((p) => ({ lat: p.lat, lng: p.lng }))
  const { legs: apiLegs } = await fetchRoutesApiLegs(coords, travelMode)

  const legs: RouteLeg[] = []
  let totalDistance = 0
  let totalDuration = 0

  for (let i = 0; i < points.length - 1; i++) {
    const apiLeg = apiLegs[i]
    const distanceMeters = apiLeg?.distanceMeters ?? 0
    const durationSeconds = parseDurationSeconds(apiLeg?.duration)
    const ok = distanceMeters > 0 || durationSeconds > 0

    if (ok) {
      totalDistance += distanceMeters
      totalDuration += durationSeconds
    }

    legs.push({
      originActivityId: points[i]!.activityId,
      destinationActivityId: points[i + 1]!.activityId,
      originName: points[i]!.name,
      destinationName: points[i + 1]!.name,
      travelMode,
      distanceText: ok ? formatDistance(distanceMeters) : '—',
      durationText: ok ? formatDuration(durationSeconds) : 'No route',
      distanceMeters,
      durationSeconds,
      ok,
    })
  }

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

// ── Routes API — smart route optimiser (Phase 7D) ──────────────────────────

/**
 * Find an optimised visit order using a nearest-neighbour greedy algorithm
 * seeded with Haversine straight-line distances, then compute the exact road
 * distance and travel time for the optimised route via Google Routes API.
 *
 * The starting point is always preserved so the user's day-start is respected.
 * Returns Haversine approximations for BOTH orders (for apple-to-apple comparison)
 * plus exact Routes API figures for the optimised order.
 */
export async function computeOptimisedRoute(
  points: OptimiseRoutePoint[],
  travelMode: TravelMode,
  // mode is a hint; all modes use nearest-neighbour ordering since we don't have
  // live traffic data at this tier. Stored in the result for client display.
  mode: RouteOptimiseMode,
): Promise<OptimiseRouteResult> {
  const key = getServerMapsKey()
  if (!key) throw new Error('maps_not_configured')
  if (points.length < 2) throw new Error('not_enough_points')

  const n = points.length

  // 1. Build Haversine pairwise distance matrix.
  const dist: number[][] = Array.from({ length: n }, () => new Array(n).fill(0) as number[])
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        dist[i][j] = haversineMeters(
          points[i]!.lat, points[i]!.lng,
          points[j]!.lat, points[j]!.lng,
        )
      }
    }
  }

  // 2. Nearest-neighbour from index 0 (preserve the starting point).
  const visited = new Array(n).fill(false) as boolean[]
  const order: number[] = [0]
  visited[0] = true

  while (order.length < n) {
    const last = order[order.length - 1]!
    let best = -1
    let bestDist = Infinity
    for (let j = 0; j < n; j++) {
      if (!visited[j] && dist[last]![j]! < bestDist) {
        bestDist = dist[last]![j]!
        best = j
      }
    }
    if (best < 0) break
    order.push(best)
    visited[best] = true
  }

  // 3. Haversine totals for both orders.
  let originalHaversine = 0
  for (let i = 0; i < n - 1; i++) {
    originalHaversine += dist[i]![i + 1]!
  }

  let optimisedHaversine = 0
  for (let i = 0; i < order.length - 1; i++) {
    optimisedHaversine += dist[order[i]!]![order[i + 1]!]!
  }

  // 4. Google Routes API exact figures for the optimised order.
  const optimisedPoints = order.map((i) => points[i]!)
  const coords = optimisedPoints.map((p) => ({ lat: p.lat, lng: p.lng }))

  let routeDistMeters = 0
  let routeDurSeconds = 0
  let encodedPolyline: string | null = null
  const warnings: string[] = []

  try {
    const { legs: apiLegs, encodedPolyline: poly } = await fetchRoutesApiLegs(coords, travelMode)
    for (const leg of apiLegs) {
      routeDistMeters += leg.distanceMeters ?? 0
      routeDurSeconds += parseDurationSeconds(leg.duration)
    }
    encodedPolyline = poly
  } catch {
    warnings.push('Exact road times unavailable — showing straight-line estimates only.')
  }

  // 5. Coach warnings.
  const savedHaversine = originalHaversine - optimisedHaversine
  const savedPct = originalHaversine > 0 ? (savedHaversine / originalHaversine) * 100 : 0

  if (savedPct > 25) {
    warnings.push(
      `Significant backtracking detected — optimised order saves ≈${(savedHaversine / 1000).toFixed(1)} km straight-line.`
    )
  }
  if (routeDurSeconds > 4 * 3600) {
    warnings.push(
      `Even optimised, this day has ${formatDuration(routeDurSeconds)} of travel — consider splitting across days.`
    )
  }
  if (n > 8) {
    warnings.push(
      `${n} stops in one day is ambitious. A relaxed pace typically fits 4–6 stops.`
    )
  }

  return {
    mode,
    travelMode,
    originalOrder: points.map((p) => p.id),
    optimisedOrder: order.map((i) => points[i]!.id),
    originalHaversineMeters: Math.round(originalHaversine),
    optimisedHaversineMeters: Math.round(optimisedHaversine),
    optimisedRouteDistanceMeters: Math.round(routeDistMeters),
    optimisedRouteDurationSeconds: routeDurSeconds,
    ...(encodedPolyline ? { routePolyline: encodedPolyline } : {}),
    warnings,
  }
}
