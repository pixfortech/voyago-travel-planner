/**
 * Itinerary Gap Analysis (Phase 15A).
 *
 * Pure helper that turns the itinerary + saved location data into a progress
 * snapshot: how many planned places are visited / remaining / skipped, trip-time
 * and budget remaining, distance already travelled, and the next best places to
 * visit (ordered by nearness to the user's current location, when provided).
 *
 * No I/O, no secrets. Money is passed in already-computed (see calculations.ts)
 * to keep this module decoupled from the expense ledger.
 */

import type {
  Trip,
  ItineraryDay,
  TripLocationPoint,
  TripMemory,
  GapAnalysis,
  GapAnalysisPlace,
  VisitedDetection,
} from '@/types'
import { haversineMeters, computeTripDistance } from './distance'
import {
  detectVisitedActivities,
  detectionMap,
  effectiveVisitedStatus,
  countUnplannedVisited,
} from './visited'

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Inclusive whole-day difference between two YYYY-MM-DD dates. */
function dayDiff(fromISO: string, toISO: string): number {
  const a = new Date(fromISO + 'T00:00:00Z').getTime()
  const b = new Date(toISO + 'T00:00:00Z').getTime()
  return Math.round((b - a) / 86_400_000)
}

export interface GapAnalysisOptions {
  now: Date
  budgetTotal: number
  budgetSpent: number
  /** Only set when the user explicitly provided their current location. */
  currentLocation?: { lat: number; lng: number }
  radiusMeters?: number
}

/**
 * Compute the full gap analysis plus the underlying detections (returned so the
 * caller can reuse them for per-activity badges without recomputing).
 */
export function computeGapAnalysis(
  trip: Trip,
  days: ItineraryDay[],
  locationPoints: TripLocationPoint[],
  memories: TripMemory[],
  opts: GapAnalysisOptions,
): { analysis: GapAnalysis; detections: VisitedDetection[] } {
  const detections = detectVisitedActivities(days, locationPoints, memories, {
    radiusMeters: opts.radiusMeters,
  })
  const detMap = detectionMap(detections)

  const visitedPlaces: GapAnalysisPlace[] = []
  const remainingPlaces: GapAnalysisPlace[] = []
  const skippedPlaces: GapAnalysisPlace[] = []

  let totalPlanned = 0
  let withCoordinates = 0
  let confirmedVisited = 0
  let likelyVisited = 0
  let skipped = 0
  let notVisited = 0

  for (const day of days) {
    for (const act of day.activities) {
      totalPlanned++
      if (act.lat != null && act.lng != null) withCoordinates++
      const det = detMap.get(act.id)
      const status = effectiveVisitedStatus(act, !!det)

      const place: GapAnalysisPlace = {
        activityId: act.id,
        dayId: day.id,
        dayNumber: day.dayNumber,
        date: day.date,
        title: act.title,
        category: act.category,
        lat: act.lat,
        lng: act.lng,
        status,
        confidence: act.visitedConfidence ?? det?.confidence,
      }

      if (opts.currentLocation && act.lat != null && act.lng != null) {
        place.distanceFromCurrentMeters = Math.round(
          haversineMeters(opts.currentLocation.lat, opts.currentLocation.lng, act.lat, act.lng),
        )
      }

      switch (status) {
        case 'confirmed_visited':
          confirmedVisited++
          visitedPlaces.push(place)
          break
        case 'likely_visited':
          likelyVisited++
          visitedPlaces.push(place)
          break
        case 'skipped':
          skipped++
          skippedPlaces.push(place)
          break
        default:
          notVisited++
          remainingPlaces.push(place)
      }
    }
  }

  const accountedFor = confirmedVisited + likelyVisited + skipped
  const completionPercent =
    totalPlanned > 0 ? Math.round((accountedFor / totalPlanned) * 100) : 0

  // Distance travelled — order points oldest→newest, then sum consecutive legs.
  const ordered = [...locationPoints]
    .filter((p) => p.latitude != null && p.longitude != null)
    .sort((a, b) => (a.capturedAt ?? '').localeCompare(b.capturedAt ?? ''))
    .map((p) => ({ latitude: p.latitude, longitude: p.longitude }))
  const distanceTravelledKm = ordered.length >= 2 ? computeTripDistance(ordered).totalKm : 0

  // Trip time.
  const todayISO = isoDateOnly(opts.now)
  const tripDaysTotal = Math.max(dayDiff(trip.startDate, trip.endDate) + 1, 1)
  const elapsedRaw = dayDiff(trip.startDate, todayISO) + 1
  const tripDaysElapsed = Math.max(0, Math.min(elapsedRaw, tripDaysTotal))
  const tripDaysRemaining = Math.max(0, tripDaysTotal - tripDaysElapsed)

  // Next best places: remaining only, with coords, ordered by nearness when we
  // have a current location, else by day order.
  const nextBestPlaces = [...remainingPlaces]
    .filter((p) => p.lat != null && p.lng != null)
    .sort((a, b) => {
      if (a.distanceFromCurrentMeters != null && b.distanceFromCurrentMeters != null) {
        return a.distanceFromCurrentMeters - b.distanceFromCurrentMeters
      }
      if (a.dayNumber !== b.dayNumber) return a.dayNumber - b.dayNumber
      return a.title.localeCompare(b.title)
    })
    .slice(0, 6)

  const budgetTotal = opts.budgetTotal
  const budgetSpent = opts.budgetSpent
  const budgetRemaining = budgetTotal > 0 ? budgetTotal - budgetSpent : 0

  const analysis: GapAnalysis = {
    totalPlanned,
    withCoordinates,
    confirmedVisited,
    likelyVisited,
    skipped,
    notVisited,
    completionPercent,
    unplannedVisitedCount: countUnplannedVisited(days, locationPoints, {
      radiusMeters: opts.radiusMeters,
    }),
    visitedPlaces,
    remainingPlaces,
    skippedPlaces,
    distanceTravelledKm,
    tripDaysTotal,
    tripDaysElapsed,
    tripDaysRemaining,
    budgetTotal,
    budgetSpent,
    budgetRemaining,
    nextBestPlaces,
  }

  return { analysis, detections }
}
