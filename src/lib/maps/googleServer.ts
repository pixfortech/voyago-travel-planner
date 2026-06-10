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
 *   • Places API (New)     — places:searchText      (text place search)
 *   • Google Routes API    — computeRoutes          (sequential leg distance/duration)
 *   • Google Routes API    — computeRouteMatrix     (traffic-aware road-cost matrix
 *                                                    for the optimiser; replaces the
 *                                                    old straight-line Haversine order)
 *   • Google Routes API    — computeRoutes          (exact polyline + totals for the
 *                                                    optimised order)
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
  RouteOptimisationMethod,
} from '@/types'

export type MapsKeySource = 'server_key' | 'public_key_fallback' | 'none'

/**
 * Which key source the server is actually using.
 *
 * 'server_key'         — GOOGLE_MAPS_API_KEY is set (Secret Manager / env).
 *                        This key should be unrestricted (no HTTP-referrer lock)
 *                        so it can call Google APIs from Cloud Run.
 * 'public_key_fallback'— Only NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is available.
 *                        Browser keys are typically HTTP-referrer restricted and
 *                        WILL be rejected by Google when called from a server
 *                        (no referrer header). Google returns 403; we surface 502.
 * 'none'               — No key is set at all; Maps features are unavailable.
 */
export function getMapsKeySource(): MapsKeySource {
  if (process.env.GOOGLE_MAPS_API_KEY?.trim()) return 'server_key'
  if (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()) return 'public_key_fallback'
  return 'none'
}

export function getServerMapsKey(): string {
  const source = getMapsKeySource()
  if (source === 'none') return ''
  if (source === 'public_key_fallback') {
    // Warn once per process. Browser keys are usually HTTP-referrer restricted;
    // Google will reject server-side calls with 403. Set GOOGLE_MAPS_API_KEY
    // (an unrestricted server key) as a Secret Manager secret to fix this.
    console.warn(
      '[Voyago Maps] WARNING: GOOGLE_MAPS_API_KEY is not set. ' +
      'Falling back to NEXT_PUBLIC_GOOGLE_MAPS_API_KEY which is a browser-restricted key. ' +
      'Server-side Google API calls will likely fail with 403. ' +
      'Add GOOGLE_MAPS_API_KEY as a Secret Manager secret in apphosting.yaml.',
    )
  }
  return (
    process.env.GOOGLE_MAPS_API_KEY?.trim() ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ??
    ''
  )
}

/** A properly-configured server key is present (not just the public browser key). */
export function isMapsServerConfigured(): boolean {
  return getMapsKeySource() !== 'none'
}

/**
 * Maps features are usable: feature flag on AND some key is set.
 * NOTE: if keySource === 'public_key_fallback', calls may still fail 403.
 * Check getMapsKeySource() === 'server_key' for guaranteed operability.
 */
export function isMapsAvailable(): boolean {
  return isFeatureEnabled('mapFeatures') && isMapsServerConfigured()
}

// ── Maps API error classification ───────────────────────────────────────────

/** Friendly, non-leaking error codes the route handler returns to the client. */
export type MapsApiErrorCode =
  | 'google_bad_request'
  | 'google_field_mask_invalid'
  | 'google_permission_denied'
  | 'google_api_not_enabled'
  | 'google_quota_exceeded'
  | 'google_invalid_key'
  | 'maps_request_failed'

export class MapsApiError extends Error {
  readonly code: MapsApiErrorCode
  /** Upstream Google HTTP status (for logging only). */
  readonly upstreamStatus: number
  /** Short, key-free detail safe to surface to the client. */
  readonly detail: string
  constructor(code: MapsApiErrorCode, upstreamStatus: number, detail: string) {
    super(code)
    this.name = 'MapsApiError'
    this.code = code
    this.upstreamStatus = upstreamStatus
    this.detail = detail
  }
}

/** Google's structured error envelope (returned in the response body on failure). */
interface GoogleErrorEnvelope {
  error?: { code?: number; message?: string; status?: string }
}

/**
 * Map a Google API HTTP status + error envelope to one of our friendly codes.
 * Never includes the API key (Google never echoes it; we also never log it).
 */
function classifyGoogleError(httpStatus: number, env: GoogleErrorEnvelope | null): MapsApiError {
  const gStatus = env?.error?.status ?? ''
  const gMessage = env?.error?.message ?? ''
  const m = gMessage.toLowerCase()
  const detail = gMessage.slice(0, 300) || `Google returned HTTP ${httpStatus}.`

  // Field-mask problems come back as 400 INVALID_ARGUMENT mentioning the mask.
  if (httpStatus === 400 && (m.includes('field mask') || m.includes('fieldmask') || m.includes('field_mask'))) {
    return new MapsApiError('google_field_mask_invalid', httpStatus, detail)
  }

  switch (httpStatus) {
    case 400:
      return new MapsApiError('google_bad_request', httpStatus, detail)
    case 401:
      return new MapsApiError('google_invalid_key', httpStatus, detail)
    case 403:
      // "has not been used in project … or it is disabled" ⇒ API not enabled.
      if (gStatus === 'PERMISSION_DENIED' &&
          (m.includes('has not been used') || m.includes('is disabled') ||
           m.includes('not enabled') || m.includes('enable it'))) {
        return new MapsApiError('google_api_not_enabled', httpStatus, detail)
      }
      // Invalid/blocked key surfaces as 403 too.
      if (m.includes('api key') || m.includes('api_key') || m.includes('invalid key')) {
        return new MapsApiError('google_invalid_key', httpStatus, detail)
      }
      return new MapsApiError('google_permission_denied', httpStatus, detail)
    case 429:
      return new MapsApiError('google_quota_exceeded', httpStatus, detail)
    default:
      return new MapsApiError('maps_request_failed', httpStatus, detail)
  }
}

// ── Places (New) text search ────────────────────────────────────────────────

const PLACES_SEARCH_ENDPOINT = 'https://places.googleapis.com/v1/places:searchText'
const PLACES_SEARCH_FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.location,places.types'

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
  types?: string[]
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

  const res = await fetch(PLACES_SEARCH_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': PLACES_SEARCH_FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: query,
      regionCode: opts.regionCode ?? 'IN',
      maxResultCount: Math.min(Math.max(opts.maxResults ?? 8, 1), 12),
    }),
    cache: 'no-store',
  })

  if (!res.ok) {
    // Read Google's structured error so we can classify + log it (key-free).
    const env = (await res.json().catch(() => null)) as GoogleErrorEnvelope | null
    const apiErr = classifyGoogleError(res.status, env)
    // Safe server log: endpoint + field mask + Google status/code/message. Never the key.
    console.error('[Voyago Maps] places:searchText failed', {
      endpoint: PLACES_SEARCH_ENDPOINT,
      fieldMask: PLACES_SEARCH_FIELD_MASK,
      httpStatus: res.status,
      googleStatus: env?.error?.status ?? null,
      googleCode: env?.error?.code ?? null,
      googleMessage: env?.error?.message ?? null,
      mappedCode: apiErr.code,
    })
    throw apiErr
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
      types: Array.isArray(p.types) ? p.types : undefined,
    }))
}

// ── Places (New) Place Details ───────────────────────────────────────────────

/**
 * Trimmed Place Details result. Only the fields we explicitly request are
 * populated — we ask for the minimum needed to derive price/menu clues so the
 * call stays cheap. `reviews` text is used internally for safe price-clue
 * scanning only; we never display long review text.
 */
export interface PlaceDetailsResult {
  placeId: string
  name: string
  address?: string
  rating?: number
  userRatingsTotal?: number
  priceLevel?: number
  types?: string[]
  /** Official website / menu URL when Google provides one (never scraped here). */
  websiteUri?: string
  businessStatus?: string
  openNow?: boolean
  /** Review snippets — internal price-clue scanning only; not for display. */
  reviews?: Array<{ text: string; rating?: number }>
}

interface RawPlaceDetails {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  rating?: number
  userRatingCount?: number
  priceLevel?: string
  types?: string[]
  websiteUri?: string
  businessStatus?: string
  regularOpeningHours?: { openNow?: boolean }
  reviews?: Array<{ text?: { text?: string }; rating?: number }>
}

// Minimal field mask — only what we need for price/menu clues. Keeps cost down.
const PLACE_DETAILS_FIELD_MASK =
  'id,displayName,formattedAddress,rating,userRatingCount,priceLevel,types,websiteUri,businessStatus,regularOpeningHours.openNow,reviews.text.text,reviews.rating'

/**
 * Fetch Place Details for a single place. Fails soft: returns `null` on any
 * error so callers degrade to search-only data rather than breaking enrichment.
 * Intended for the SELECTED/top candidate only — never every search result.
 */
export async function fetchPlaceDetails(placeId: string): Promise<PlaceDetailsResult | null> {
  const key = getServerMapsKey()
  if (!key || !placeId) return null

  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': PLACE_DETAILS_FIELD_MASK,
      },
      cache: 'no-store',
    })
    if (!res.ok) {
      const env = (await res.json().catch(() => null)) as GoogleErrorEnvelope | null
      console.error('[Voyago Maps] places:get (details) failed', {
        httpStatus: res.status,
        googleStatus: env?.error?.status ?? null,
        googleMessage: env?.error?.message ?? null,
      })
      return null
    }
    const p = (await res.json()) as RawPlaceDetails
    if (!p.id) return null
    const reviews = Array.isArray(p.reviews)
      ? p.reviews
          .map((r) => ({ text: r.text?.text ?? '', rating: typeof r.rating === 'number' ? r.rating : undefined }))
          .filter((r) => r.text)
      : undefined
    return {
      placeId: p.id,
      name: p.displayName?.text ?? 'Unnamed place',
      address: p.formattedAddress || undefined,
      rating: typeof p.rating === 'number' ? p.rating : undefined,
      userRatingsTotal: typeof p.userRatingCount === 'number' ? p.userRatingCount : undefined,
      priceLevel: p.priceLevel ? PRICE_LEVEL_MAP[p.priceLevel] : undefined,
      types: Array.isArray(p.types) ? p.types : undefined,
      websiteUri: p.websiteUri || undefined,
      businessStatus: p.businessStatus || undefined,
      openNow: p.regularOpeningHours?.openNow,
      reviews,
    }
  } catch (err) {
    console.error('[Voyago Maps] places:get (details) threw', { message: err instanceof Error ? err.message : String(err) })
    return null
  }
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
  opts: { trafficAware?: boolean } = {},
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
  // TRAFFIC_AWARE (no departureTime) uses live current traffic so the optimised
  // order reflects practical, real-world drive times.
  if (travelMode === 'driving') {
    body.routingPreference = opts.trafficAware ? 'TRAFFIC_AWARE' : 'TRAFFIC_UNAWARE'
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

// ── Routes API — road-cost matrix (Compute Route Matrix) ───────────────────

interface RouteMatrixElement {
  originIndex?: number
  destinationIndex?: number
  distanceMeters?: number
  duration?: string
  condition?: string
}

/** Square road-cost matrices (metres / seconds) between every pair of points. */
interface RoadCostMatrix {
  distance: number[][]
  duration: number[][]
}

/**
 * Build a traffic-aware road-cost matrix between every pair of points using the
 * Google Routes API Compute Route Matrix endpoint. Each cell is the real road
 * distance/time of driving from i → j (not a straight line), so the optimiser
 * respects one-way roads, terrain and mountain switchbacks.
 *
 * Returns `null` (so the caller can fall back to Haversine) when:
 *   • the travel mode is TRANSIT (Route Matrix does not support transit), or
 *   • too many pairs are unreachable to trust the matrix.
 * Throws only on auth failure so the route handler can surface it.
 */
async function fetchRoadCostMatrix(
  points: Array<{ lat: number; lng: number }>,
  travelMode: TravelMode,
): Promise<RoadCostMatrix | null> {
  const key = getServerMapsKey()
  const n = points.length
  const apiMode = TRAVEL_MODE_MAP[travelMode]

  // Compute Route Matrix supports DRIVE / WALK / BICYCLE / TWO_WHEELER — not TRANSIT.
  if (apiMode === 'TRANSIT') return null

  const toMatrixWaypoint = (p: { lat: number; lng: number }) => ({
    waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } },
  })

  const body: Record<string, unknown> = {
    origins: points.map(toMatrixWaypoint),
    destinations: points.map(toMatrixWaypoint),
    travelMode: apiMode,
  }
  // Live traffic for driving (no departureTime ⇒ "now").
  if (travelMode === 'driving') {
    body.routingPreference = 'TRAFFIC_AWARE'
  }

  const res = await fetch(
    'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask':
          'originIndex,destinationIndex,distanceMeters,duration,condition',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    }
  )

  if (!res.ok) {
    if (res.status === 403 || res.status === 401) throw new Error('maps_auth_error')
    // A non-auth failure is recoverable — let the caller fall back to Haversine.
    return null
  }

  const data = (await res.json()) as RouteMatrixElement[] | { error?: unknown }
  if (!Array.isArray(data)) return null

  const INF = Number.POSITIVE_INFINITY
  const distance: number[][] = Array.from({ length: n }, () => new Array(n).fill(INF) as number[])
  const duration: number[][] = Array.from({ length: n }, () => new Array(n).fill(INF) as number[])
  for (let i = 0; i < n; i++) {
    distance[i]![i] = 0
    duration[i]![i] = 0
  }

  let reachable = 0
  for (const el of data) {
    const oi = el.originIndex
    const di = el.destinationIndex
    if (oi == null || di == null || oi >= n || di >= n) continue
    if (el.condition && el.condition !== 'ROUTE_EXISTS') continue
    if (oi === di) continue
    if (typeof el.distanceMeters === 'number') distance[oi]![di] = el.distanceMeters
    duration[oi]![di] = parseDurationSeconds(el.duration)
    reachable++
  }

  // Need at least half the off-diagonal pairs to trust the matrix.
  if (reachable < n * (n - 1) * 0.5) return null
  return { distance, duration }
}

// ── TSP heuristic (nearest-neighbour + 2-opt) ──────────────────────────────

/** Total cost of an OPEN path (no return-to-start edge). */
function pathCost(order: number[], cost: number[][]): number {
  let total = 0
  for (let i = 0; i < order.length - 1; i++) {
    const c = cost[order[i]!]![order[i + 1]!]!
    if (Number.isFinite(c)) total += c
  }
  return total
}

/**
 * Order the visit sequence to minimise total road cost using a nearest-neighbour
 * construction followed by 2-opt local search. Endpoints can be pinned:
 *   • fixStart keeps index 0 first (the user's chosen day-start).
 *   • fixEnd keeps index n-1 last (e.g. returning to the hotel).
 * Works on any cost matrix — road duration, road distance, a blend, or Haversine.
 */
function solveOrder(
  cost: number[][],
  n: number,
  fixStart: boolean,
  fixEnd: boolean,
): number[] {
  if (n <= 2) return Array.from({ length: n }, (_, i) => i)

  const endNode = fixEnd ? n - 1 : -1

  // 1. Nearest-neighbour construction from index 0.
  const visited = new Array(n).fill(false) as boolean[]
  const order: number[] = [0]
  visited[0] = true
  if (endNode === 0) {
    // Degenerate (start == fixed end) — should not happen for n > 2.
  }

  const targetLen = fixEnd ? n - 1 : n
  while (order.length < targetLen) {
    const last = order[order.length - 1]!
    let best = -1
    let bestCost = Number.POSITIVE_INFINITY
    for (let j = 0; j < n; j++) {
      if (visited[j] || j === endNode) continue
      const c = cost[last]![j]!
      if (c < bestCost) {
        bestCost = c
        best = j
      }
    }
    if (best < 0) break
    order.push(best)
    visited[best] = true
  }
  if (fixEnd && !visited[endNode]!) {
    order.push(endNode)
    visited[endNode] = true
  }
  // Safety: append anything left unvisited (e.g. all-unreachable rows).
  for (let j = 0; j < n; j++) {
    if (!visited[j]) {
      order.push(j)
      visited[j] = true
    }
  }

  // 2. 2-opt improvement. Reversing order[i..k] only touches edges (i-1,i) and
  //    (k,k+1); we keep i ≥ 1 when the start is pinned and k ≤ n-2 when the end
  //    is pinned so the fixed endpoints never move.
  const iMin = fixStart ? 1 : 0
  const kMax = fixEnd ? n - 2 : n - 1
  let improved = true
  let guard = 0
  while (improved && guard < 60) {
    improved = false
    guard++
    let bestTotal = pathCost(order, cost)
    for (let i = iMin; i < kMax; i++) {
      for (let k = i + 1; k <= kMax; k++) {
        // Reverse the segment in place, measure, keep or revert.
        let a = i
        let b = k
        while (a < b) {
          const t = order[a]!
          order[a] = order[b]!
          order[b] = t
          a++
          b--
        }
        const next = pathCost(order, cost)
        if (next < bestTotal - 1e-6) {
          bestTotal = next
          improved = true
        } else {
          // revert
          a = i
          b = k
          while (a < b) {
            const t = order[a]!
            order[a] = order[b]!
            order[b] = t
            a++
            b--
          }
        }
      }
    }
  }

  return order
}

/** Sum consecutive road legs of a sequence through a cost matrix (skips ∞). */
function sumSequence(order: number[], cost: number[][]): number {
  let total = 0
  for (let i = 0; i < order.length - 1; i++) {
    const c = cost[order[i]!]![order[i + 1]!]!
    if (Number.isFinite(c)) total += c
  }
  return total
}

/** Max finite value in a matrix (for normalising the balanced blend). */
function maxFinite(m: number[][]): number {
  let max = 0
  for (const row of m) {
    for (const v of row) {
      if (Number.isFinite(v) && v > max) max = v
    }
  }
  return max || 1
}

// ── Routes API — smart route optimiser (Phase 7D / road-aware rewrite) ─────

/**
 * Find an optimised visit order using REAL road costs, then return exact road
 * distance/time and a drawable polyline for that order.
 *
 * Primary path (when a key is configured and the matrix is reachable):
 *   1. Build a traffic-aware road-cost matrix via Compute Route Matrix.
 *   2. Solve the order with a TSP heuristic (nearest-neighbour + 2-opt) on the
 *      cost metric the mode asks for: duration (fastest), distance (shortest),
 *      or a normalised blend (balanced).
 *   3. Pin the start/end as requested (default: keep first fixed).
 *   4. One Compute Routes call for the optimised order → polyline + totals.
 *
 * Fallback path (no matrix — e.g. TRANSIT mode or a transient matrix failure):
 *   Solve the order with Haversine straight-line costs instead, clearly labelled
 *   `haversine_fallback`. Haversine is NEVER the primary order when the road
 *   matrix is available.
 *
 * Returns Haversine totals for both orders (used by the rule-based coach) plus
 * exact road totals for the original AND optimised orders so the UI can show a
 * real before/after with distance + time saved.
 */
export async function computeOptimisedRoute(
  points: OptimiseRoutePoint[],
  travelMode: TravelMode,
  mode: RouteOptimiseMode,
  opts: { keepFirstFixed?: boolean; keepLastFixed?: boolean } = {},
): Promise<OptimiseRouteResult> {
  const key = getServerMapsKey()
  if (!key) throw new Error('maps_not_configured')
  if (points.length < 2) throw new Error('not_enough_points')

  const n = points.length
  const keepFirstFixed = opts.keepFirstFixed ?? true
  const keepLastFixed = opts.keepLastFixed ?? false
  const coordsAll = points.map((p) => ({ lat: p.lat, lng: p.lng }))
  const warnings: string[] = []

  // Haversine matrix — always available, used for coach comparison + fallback.
  const hav: number[][] = Array.from({ length: n }, () => new Array(n).fill(0) as number[])
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        hav[i]![j] = haversineMeters(
          points[i]!.lat, points[i]!.lng,
          points[j]!.lat, points[j]!.lng,
        )
      }
    }
  }

  // 1. Try the real road-cost matrix (traffic-aware for driving).
  let roadMatrix: RoadCostMatrix | null = null
  try {
    roadMatrix = await fetchRoadCostMatrix(coordsAll, travelMode)
  } catch (err) {
    if ((err as Error).message === 'maps_auth_error') throw err
    roadMatrix = null
  }

  // 2. Choose the cost metric for the requested mode and solve the order.
  let order: number[]
  let optimisationMethod: RouteOptimisationMethod
  let trafficAware = false

  if (roadMatrix) {
    let cost: number[][]
    if (mode === 'shortest') {
      cost = roadMatrix.distance
    } else if (mode === 'fastest') {
      cost = roadMatrix.duration
    } else {
      // balanced — normalise each metric to [0,1] and average.
      const maxD = maxFinite(roadMatrix.distance)
      const maxT = maxFinite(roadMatrix.duration)
      cost = roadMatrix.distance.map((row, i) =>
        row.map((d, j) => {
          const t = roadMatrix!.duration[i]![j]!
          if (!Number.isFinite(d) || !Number.isFinite(t)) return Number.POSITIVE_INFINITY
          return 0.5 * (d / maxD) + 0.5 * (t / maxT)
        }),
      )
    }
    order = solveOrder(cost, n, keepFirstFixed, keepLastFixed)
    optimisationMethod = 'route_matrix_tsp'
    trafficAware = travelMode === 'driving'
  } else {
    // Fallback: order by straight-line distance (clearly labelled).
    order = solveOrder(hav, n, keepFirstFixed, keepLastFixed)
    optimisationMethod = 'haversine_fallback'
    warnings.push(
      'Live road data was unavailable — order estimated from straight-line distances.',
    )
  }

  // 3. Haversine totals (kept for the rule-based coach).
  const identity = Array.from({ length: n }, (_, i) => i)
  const originalHaversine = sumSequence(identity, hav)
  const optimisedHaversine = sumSequence(order, hav)

  // 4. Road totals for the ORIGINAL order (from the matrix, when we have it).
  let originalRouteDistanceMeters = 0
  let originalRouteDurationSeconds = 0
  if (roadMatrix) {
    originalRouteDistanceMeters = Math.round(sumSequence(identity, roadMatrix.distance))
    originalRouteDurationSeconds = Math.round(sumSequence(identity, roadMatrix.duration))
  }

  // 5. One Compute Routes call for the optimised order → polyline + exact totals.
  const optimisedCoords = order.map((i) => ({ lat: points[i]!.lat, lng: points[i]!.lng }))
  let routeDistMeters = 0
  let routeDurSeconds = 0
  let encodedPolyline: string | null = null
  try {
    const { legs: apiLegs, encodedPolyline: poly } = await fetchRoutesApiLegs(
      optimisedCoords,
      travelMode,
      { trafficAware: travelMode === 'driving' },
    )
    for (const leg of apiLegs) {
      routeDistMeters += leg.distanceMeters ?? 0
      routeDurSeconds += parseDurationSeconds(leg.duration)
    }
    encodedPolyline = poly
  } catch {
    warnings.push('Exact road totals unavailable — showing estimates only.')
  }

  // If Compute Routes failed but the matrix is present, fall back to matrix sums.
  if (routeDistMeters === 0 && roadMatrix) {
    routeDistMeters = Math.round(sumSequence(order, roadMatrix.distance))
  }
  if (routeDurSeconds === 0 && roadMatrix) {
    routeDurSeconds = Math.round(sumSequence(order, roadMatrix.duration))
  }

  // 6. Savings (only meaningful when we have road totals for both orders).
  const distanceSavedMeters =
    originalRouteDistanceMeters > 0 ? originalRouteDistanceMeters - routeDistMeters : 0
  const durationSavedSeconds =
    originalRouteDurationSeconds > 0 ? originalRouteDurationSeconds - routeDurSeconds : 0

  // 7. Coach warnings.
  if (durationSavedSeconds > 5 * 60) {
    warnings.push(
      `Optimised order saves ≈${formatDuration(durationSavedSeconds)} of driving (${formatDistance(Math.max(0, distanceSavedMeters))} less).`,
    )
  } else {
    const savedHav = originalHaversine - optimisedHaversine
    const savedPct = originalHaversine > 0 ? (savedHav / originalHaversine) * 100 : 0
    if (savedPct > 25) {
      warnings.push(
        `Significant backtracking detected — optimised order saves ≈${(savedHav / 1000).toFixed(1)} km straight-line.`,
      )
    }
  }
  if (routeDurSeconds > 4 * 3600) {
    warnings.push(
      `Even optimised, this day has ${formatDuration(routeDurSeconds)} of travel — consider splitting across days.`,
    )
  }
  if (n > 8) {
    warnings.push(
      `${n} stops in one day is ambitious. A relaxed pace typically fits 4–6 stops.`,
    )
  }

  // Dev-only: log the method + before/after labels (never the key or raw response).
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[Voyago Optimise] method=${optimisationMethod} mode=${mode} traffic=${trafficAware} keepFirst=${keepFirstFixed} keepLast=${keepLastFixed}`,
    )
    console.log('[Voyago Optimise] original:', points.map((p) => p.name))
    console.log('[Voyago Optimise] optimised:', order.map((i) => points[i]!.name))
  }

  return {
    mode,
    travelMode,
    optimisationMethod,
    trafficAware,
    keepFirstFixed,
    keepLastFixed,
    originalOrder: points.map((p) => p.id),
    optimisedOrder: order.map((i) => points[i]!.id),
    originalHaversineMeters: Math.round(originalHaversine),
    optimisedHaversineMeters: Math.round(optimisedHaversine),
    originalRouteDistanceMeters,
    originalRouteDurationSeconds,
    optimisedRouteDistanceMeters: Math.round(routeDistMeters),
    optimisedRouteDurationSeconds: routeDurSeconds,
    distanceSavedMeters,
    durationSavedSeconds,
    ...(encodedPolyline ? { routePolyline: encodedPolyline } : {}),
    warnings,
  }
}
