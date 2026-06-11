/**
 * Itinerary sanity validation — Phase 16G (PART 12A).
 *
 * A final pre-save / pre-"Route optimised" sanity pass. Pure functions:
 *   1. City/destination boundary check — flag Google-verified places that sit far
 *      outside the destination area (likely a wrong-city match). Long-haul
 *      transfer anchors (arrival/departure/transfer) are exempt — they are meant
 *      to be far away.
 *   2. Impossible elevation/context check — a low-altitude destination (e.g.
 *      Kolkata) must not carry thousands-of-metres elevation or high-altitude
 *      warnings. Outlier elevations are flagged as suspect (bad geocode) and the
 *      low-altitude flag lets the UI suppress nonsensical altitude advice.
 *   3. (Chronology lives in routePlanning.ts — combined by the caller.)
 *
 * Returns structured issues so the caller can block / strongly-warn on save.
 */

import { haversineMeters } from '@/lib/location/distance'
import { isFixedAnchor, type RoutePlanActivity } from '@/lib/ai/routePlanning'

export interface ValidationActivity extends RoutePlanActivity {
  _placeId?: string
  _enriched?: boolean
  _elevationFeet?: number
}

export interface DestinationRef {
  city?: string
  lat?: number
  lng?: number
}

export type ValidationIssueType =
  | 'wrong_city_match'
  | 'impossible_elevation'
  | 'non_chronological'
  | 'route_optimise_failed'
  | 'departure_conflict'

export interface ValidationIssue {
  type: ValidationIssueType
  /** Activity key when the issue is tied to a specific stop. */
  key?: string
  message: string
  severity: 'warning' | 'block'
}

/** Reasonable straight-line radius (km) for "within the destination city/area". */
const CITY_RADIUS_KM = 80

/** Below this median elevation the destination is treated as low-altitude. */
const LOW_ALT_FT = 3000
/** An elevation this far above the median (in a low place) is physically suspect. */
const ELEV_OUTLIER_FT = 4000

export interface BoundaryResult {
  suspectKeys: Set<string>
  issues: ValidationIssue[]
}

/**
 * Flag verified places that are implausibly far from the destination centre.
 * Anchors (arrival/departure/transfer/hotel) are exempt — they are legitimately
 * far (e.g. NJP station for a Gangtok trip).
 */
export function checkCityBoundary(
  activities: ValidationActivity[],
  destination: DestinationRef,
): BoundaryResult {
  const suspectKeys = new Set<string>()
  const issues: ValidationIssue[] = []
  if (destination.lat == null || destination.lng == null) return { suspectKeys, issues }

  for (const a of activities) {
    if (a._removed || a._lat == null || a._lng == null) continue
    if (isFixedAnchor(a)) continue // long-haul anchors are allowed to be far
    const km = haversineMeters(destination.lat, destination.lng, a._lat, a._lng) / 1000
    if (km > CITY_RADIUS_KM) {
      suspectKeys.add(a._key)
      issues.push({
        type: 'wrong_city_match',
        key: a._key,
        severity: 'warning',
        message: `"${a.title}" is ≈${Math.round(km)} km from ${destination.city ?? 'the destination'} — the Google match may be the wrong place. Re-verify before saving.`,
      })
    }
  }
  return { suspectKeys, issues }
}

export interface ElevationResult {
  /** Destination is low-altitude → suppress altitude warnings/essentials. */
  lowAltitude: boolean
  medianFt: number | null
  suspectKeys: Set<string>
  issues: ValidationIssue[]
}

/**
 * Detect impossible elevation for the destination. Computes the median elevation
 * of geocoded stops; in a low place, any stop towering thousands of feet above is
 * a suspect bad geocode. Also reports whether the destination is low-altitude so
 * the UI can hide nonsensical high-altitude warnings.
 */
export function checkElevationSanity(activities: ValidationActivity[]): ElevationResult {
  const elevs: { key: string; ft: number }[] = []
  for (const a of activities) {
    if (a._removed || isFixedAnchor(a)) continue
    if (typeof a._elevationFeet === 'number') elevs.push({ key: a._key, ft: a._elevationFeet })
  }
  if (elevs.length === 0) return { lowAltitude: false, medianFt: null, suspectKeys: new Set(), issues: [] }

  const sorted = [...elevs].map((e) => e.ft).sort((x, y) => x - y)
  const medianFt = sorted[Math.floor(sorted.length / 2)]!
  const lowAltitude = medianFt < LOW_ALT_FT

  const suspectKeys = new Set<string>()
  const issues: ValidationIssue[] = []
  if (lowAltitude) {
    for (const e of elevs) {
      if (e.ft - medianFt > ELEV_OUTLIER_FT) {
        suspectKeys.add(e.key)
        issues.push({
          type: 'impossible_elevation',
          key: e.key,
          severity: 'warning',
          message: `An elevation of ≈${e.ft.toLocaleString()} ft is implausible for this area — the location match is likely wrong.`,
        })
      }
    }
  }
  return { lowAltitude, medianFt, suspectKeys, issues }
}

export interface ItineraryValidationInput {
  activities: ValidationActivity[]
  destination: DestinationRef
  /** Chronology issues already computed per day (PART 2). */
  chronologyIssueCount?: number
  /** True when an optimise run failed but a day still shows an optimised badge. */
  routeOptimiseFailed?: boolean
  /** Departure-day conflict message, when detected. */
  departureConflict?: string | null
}

export interface ItineraryValidationResult {
  issues: ValidationIssue[]
  suspectKeys: Set<string>
  lowAltitude: boolean
  /** True when nothing blocks/warns — safe to show "Route optimised" + save freely. */
  ok: boolean
  /** True when at least one issue is serious enough to gate "Create Trip". */
  needsReview: boolean
}

/**
 * Run the full sanity pass and aggregate issues. The caller blocks or strongly
 * warns on `needsReview`.
 */
export function validateItinerary(input: ItineraryValidationInput): ItineraryValidationResult {
  const boundary = checkCityBoundary(input.activities, input.destination)
  const elevation = checkElevationSanity(input.activities)

  const issues: ValidationIssue[] = [...boundary.issues, ...elevation.issues]
  const suspectKeys = new Set<string>()
  boundary.suspectKeys.forEach((k) => suspectKeys.add(k))
  elevation.suspectKeys.forEach((k) => suspectKeys.add(k))

  if (input.chronologyIssueCount && input.chronologyIssueCount > 0) {
    issues.push({
      type: 'non_chronological',
      severity: 'warning',
      message: 'Some activity times are out of order — route order may be inaccurate.',
    })
  }
  if (input.routeOptimiseFailed) {
    issues.push({
      type: 'route_optimise_failed',
      severity: 'warning',
      message: 'Route optimisation was unavailable — the plan is in its original order.',
    })
  }
  if (input.departureConflict) {
    issues.push({
      type: 'departure_conflict',
      severity: 'block',
      message: input.departureConflict,
    })
  }

  const needsReview = issues.length > 0
  return {
    issues,
    suspectKeys,
    lowAltitude: elevation.lowAltitude,
    ok: issues.length === 0,
    needsReview,
  }
}
