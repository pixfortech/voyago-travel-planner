/**
 * Kolkata route-intelligence validation scenario — Phase 16G (PART 3).
 *
 * A PRACTICAL validation case (NOT hardcoded into product logic) used to sanity
 * check the deterministic route-planning helpers: anchor partitioning, chronology
 * validity, and group/weather buffers. Run it with ts-node / a quick script, or
 * import `runKolkataScenario()` from a dev route. Nothing here affects production.
 *
 * Why Kolkata: Belur Math + Dakshineswar sit together in the far north; Howrah is
 * west-central; Prinsep Ghat is south-central. A naive optimiser zig-zags across
 * the city. The helpers below should (a) keep the hotel base anchored at start/
 * end, (b) reorder only the flexible stops, and (c) never leave times out of
 * chronological order.
 */

import {
  partitionForOptimise,
  applyFlexibleOrder,
  transitionBuffer,
  validateChronology,
  type RoutePlanActivity,
} from '@/lib/ai/routePlanning'

export interface ScenarioStop extends RoutePlanActivity {
  /** Approx coords used to verify grouping (north vs south of the city). */
  _lat: number
  _lng: number
}

/** Belur / Dakshineswar (north), Howrah (west), Prinsep Ghat (south) + hotel base. */
export const KOLKATA_STOPS: ScenarioStop[] = [
  { _key: 'hotel', title: 'Stay base (Park Street)', category: 'hotel', _lat: 22.5530, _lng: 88.3520 },
  { _key: 'belur', title: 'Belur Math', category: 'spiritual', _lat: 22.6326, _lng: 88.3556 },
  { _key: 'dakshineswar', title: 'Dakshineswar Kali Temple', category: 'spiritual', _lat: 22.6549, _lng: 88.3576 },
  { _key: 'howrah', title: 'Howrah Bridge', category: 'sightseeing', _lat: 22.5851, _lng: 88.3468 },
  { _key: 'prinsep', title: 'Prinsep Ghat', category: 'leisure', _lat: 22.5571, _lng: 88.3344 },
]

export interface ScenarioReport {
  flexibleKeys: string[]
  boundaryStartKey?: string
  boundaryEndKey?: string
  /** Buffer minutes for a 9-person group with high rain on a station transfer. */
  largeGroupRainBuffer: ReturnType<typeof transitionBuffer>
  chronologyOkForMonotonic: boolean
  chronologyFlaggedForBadOrder: boolean
}

/**
 * Exercise the helpers and return a small report. Assertions are documented in
 * comments; the function never throws so it is safe to call from a dev route.
 */
export function runKolkataScenario(): ScenarioReport {
  // Hotel base is at the start → it must become the boundary start anchor, and
  // only the four real stops are flexible.
  const part = partitionForOptimise(KOLKATA_STOPS)

  // Sanity: a monotonic schedule passes; a deliberately broken one is flagged.
  const monotonic = validateChronology([
    { _key: 'a', _plannedStart: '08:25', _plannedEnd: '09:10' },
    { _key: 'b', _plannedStart: '09:30', _plannedEnd: '10:15' },
  ])
  const badOrder = validateChronology([
    { _key: 'a', _plannedStart: '09:15', _plannedEnd: '10:00' },
    { _key: 'b', _plannedStart: '08:25', _plannedEnd: '09:10' }, // earlier than the card above
  ])

  // A reorder of the flexible stops must keep the hotel anchor in place.
  const reordered = applyFlexibleOrder(KOLKATA_STOPS, ['dakshineswar', 'belur', 'howrah', 'prinsep'])
  // (reordered[0] should still be the hotel anchor)
  void reordered

  return {
    flexibleKeys: part.flexibleKeys,
    boundaryStartKey: part.boundaryStart?._key,
    boundaryEndKey: part.boundaryEnd?._key,
    largeGroupRainBuffer: transitionBuffer({ travellerCount: 9, rainProbability: 70, toDeparture: true }),
    chronologyOkForMonotonic: monotonic.ok,
    chronologyFlaggedForBadOrder: !badOrder.ok,
  }
}
