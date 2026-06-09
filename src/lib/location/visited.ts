/**
 * Smart Visited Places detection (Phase 15A).
 *
 * Pure, import-safe helpers (no I/O, no secrets). Compares saved location
 * signals — Travel History check-ins, foreground live-tracking points and GPS
 * attached to photo memories — against itinerary activity coordinates to detect
 * which planned places were LIKELY visited.
 *
 * Detection is APPROXIMATE and only ever yields `likely_visited`. It NEVER
 * auto-confirms or mutates anything — the user confirms or skips. A stored
 * `activity.visitedStatus` always wins over a live detection.
 */

import type {
  Activity,
  ItineraryDay,
  TripLocationPoint,
  TripMemory,
  VisitedDetection,
  VisitedConfidence,
  VisitedSource,
  VisitedStatus,
} from '@/types'
import { haversineMeters } from './distance'

/** Default match radius (metres). Configurable within the clamp range below. */
export const DEFAULT_VISIT_RADIUS_METERS = 150
export const MIN_VISIT_RADIUS_METERS = 100
export const MAX_VISIT_RADIUS_METERS = 250

/** Largest amount (metres) GPS accuracy may widen the effective radius by. */
const MAX_ACCURACY_WIDEN_METERS = 150

export function clampRadius(r: number): number {
  if (!Number.isFinite(r)) return DEFAULT_VISIT_RADIUS_METERS
  return Math.max(MIN_VISIT_RADIUS_METERS, Math.min(MAX_VISIT_RADIUS_METERS, Math.round(r)))
}

interface CandidatePoint {
  id?: string
  lat: number
  lng: number
  accuracy?: number
  capturedAt?: string
  source: VisitedSource
}

/** Flatten all usable location signals into a single candidate list. */
export function gatherCandidatePoints(
  locationPoints: TripLocationPoint[],
  memories: TripMemory[],
): CandidatePoint[] {
  const pts: CandidatePoint[] = []
  for (const lp of locationPoints) {
    if (lp.latitude == null || lp.longitude == null) continue
    pts.push({
      id: lp.id,
      lat: lp.latitude,
      lng: lp.longitude,
      accuracy: lp.accuracy,
      capturedAt: lp.capturedAt,
      source: lp.source === 'live_tracking' ? 'live_tracking' : 'location_history',
    })
  }
  for (const m of memories) {
    if (!m.location) continue
    pts.push({
      id: m.id,
      lat: m.location.latitude,
      lng: m.location.longitude,
      accuracy: m.location.accuracy,
      capturedAt: m.location.capturedAt ?? m.capturedAt,
      source: 'memory',
    })
  }
  return pts
}

function confidenceFor(distance: number, radius: number, accuracy?: number): VisitedConfidence {
  const acc = accuracy ?? 0
  if (distance <= radius * 0.4 && acc <= 50) return 'high'
  if (distance <= radius * 0.75) return 'medium'
  return 'low'
}

export interface DetectVisitedOptions {
  /** Base radius in metres (clamped to 100–250). Defaults to 150. */
  radiusMeters?: number
}

/**
 * Detect likely-visited activities. Returns one detection per activity that has
 * coordinates AND a location signal within the (accuracy-widened) radius.
 * Activities without lat/lng are skipped entirely.
 */
export function detectVisitedActivities(
  days: ItineraryDay[],
  locationPoints: TripLocationPoint[],
  memories: TripMemory[],
  opts: DetectVisitedOptions = {},
): VisitedDetection[] {
  const radius = clampRadius(opts.radiusMeters ?? DEFAULT_VISIT_RADIUS_METERS)
  const candidates = gatherCandidatePoints(locationPoints, memories)
  if (candidates.length === 0) return []

  const detections: VisitedDetection[] = []
  for (const day of days) {
    for (const act of day.activities) {
      if (act.lat == null || act.lng == null) continue
      let best: { dist: number; pt: CandidatePoint } | null = null
      for (const pt of candidates) {
        const d = haversineMeters(act.lat, act.lng, pt.lat, pt.lng)
        // Widen the radius by (capped) GPS accuracy so a fuzzy fix still matches.
        const effective = radius + Math.min(pt.accuracy ?? 0, MAX_ACCURACY_WIDEN_METERS)
        if (d <= effective && (!best || d < best.dist)) best = { dist: d, pt }
      }
      if (best) {
        detections.push({
          activityId: act.id,
          dayId: day.id,
          status: 'likely_visited',
          confidence: confidenceFor(best.dist, radius, best.pt.accuracy),
          source: best.pt.source,
          nearestDistanceMeters: Math.round(best.dist),
          matchedLocationPointId: best.pt.id,
          matchedAt: best.pt.capturedAt,
        })
      }
    }
  }
  return detections
}

/** Build a quick lookup of activityId → detection. */
export function detectionMap(detections: VisitedDetection[]): Map<string, VisitedDetection> {
  return new Map(detections.map((d) => [d.activityId, d]))
}

/**
 * The status to display/use for an activity. A stored status always wins; if
 * none is stored, a live detection downgrades to `likely_visited`, else
 * `not_visited`.
 */
export function effectiveVisitedStatus(
  activity: Activity,
  hasDetection: boolean,
): VisitedStatus {
  if (activity.visitedStatus) return activity.visitedStatus
  return hasDetection ? 'likely_visited' : 'not_visited'
}

/**
 * Count location check-ins that are NOT near any planned activity — a rough
 * proxy for "unplanned places visited". Uses a slightly wider radius so a
 * check-in just outside a place's match radius isn't double-counted.
 */
export function countUnplannedVisited(
  days: ItineraryDay[],
  locationPoints: TripLocationPoint[],
  opts: DetectVisitedOptions = {},
): number {
  const radius = clampRadius(opts.radiusMeters ?? DEFAULT_VISIT_RADIUS_METERS) * 1.5
  const activityCoords: Array<{ lat: number; lng: number }> = []
  for (const day of days) {
    for (const act of day.activities) {
      if (act.lat != null && act.lng != null) activityCoords.push({ lat: act.lat, lng: act.lng })
    }
  }
  let count = 0
  for (const lp of locationPoints) {
    if (lp.source !== 'manual_checkin') continue
    if (lp.latitude == null || lp.longitude == null) continue
    const nearAny = activityCoords.some(
      (c) => haversineMeters(lp.latitude, lp.longitude, c.lat, c.lng) <= radius,
    )
    if (!nearAny) count++
  }
  return count
}
