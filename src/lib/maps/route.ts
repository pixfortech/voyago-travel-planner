/**
 * Client-safe route helpers (Phase 6). Pure, no secrets.
 */

import type { Activity, ItineraryDay, DayRouteSummary, BudgetCoachRouteSummary } from '@/types'

/** Sort key: timed activities by time, untimed pushed to the end. */
function orderKey(a: Activity): string {
  return a.startTime || a.time || '~'
}

/**
 * Activities that can take part in a route: those with stored coordinates,
 * ordered the same way the itinerary shows them (by start time, untimed last).
 */
export function getRoutableActivities(activities: Activity[]): Activity[] {
  return activities
    .filter((a) => typeof a.lat === 'number' && typeof a.lng === 'number')
    .sort((a, b) => orderKey(a).localeCompare(orderKey(b)))
}

/** Whether a day has enough placed activities to compute a route. */
export function dayHasRoutablePair(day: ItineraryDay): boolean {
  return getRoutableActivities(day.activities).length >= 2
}

/**
 * Aggregate computed day routes into a high-level summary safe for the AI coach.
 * Returns undefined when nothing has been calculated.
 */
export function aggregateRouteSummaries(
  summaries: DayRouteSummary[],
  dayNumberById: Map<string, number>
): BudgetCoachRouteSummary | undefined {
  if (summaries.length === 0) return undefined
  let totalMeters = 0
  let totalSeconds = 0
  let busiestDayNumber: number | null = null
  let busiestSeconds = 0

  for (const s of summaries) {
    totalMeters += s.totalDistanceMeters
    totalSeconds += s.totalDurationSeconds
    if (s.totalDurationSeconds > busiestSeconds) {
      busiestSeconds = s.totalDurationSeconds
      busiestDayNumber = dayNumberById.get(s.dayId) ?? null
    }
  }

  return {
    daysWithRoutes: summaries.length,
    totalDistanceKm: Math.round((totalMeters / 1000) * 10) / 10,
    totalTravelMinutes: Math.round(totalSeconds / 60),
    busiestDayNumber,
    busiestDayTravelMinutes: Math.round(busiestSeconds / 60),
  }
}
