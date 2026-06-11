/**
 * Deterministic route planning helpers — Phase 16G (PART 1 / 2 / 4).
 *
 * Pure functions, no side effects, no API calls. They give the preview the
 * building blocks for:
 *   • PART 1 — splitting a day into FIXED ANCHORS vs FLEXIBLE STOPS so only the
 *     flexible stops are reordered by the optimiser (anchors never move).
 *   • PART 2 — a chronology validator that guarantees monotonic start times and
 *     repairs/flags impossible ordering.
 *   • PART 4 — group-size and weather-aware travel buffers.
 *
 * Kept framework-free and operating on a minimal activity shape so it is easy to
 * unit-test and reuse.
 */

import type { ActivityCategory } from '@/types'
import { parseHHMM } from '@/lib/ai/activityDuration'

/** Minimal shape this module needs — a subset of EditableGeneratedActivity. */
export interface RoutePlanActivity {
  _key: string
  title: string
  category: ActivityCategory
  _removed?: boolean
  _lat?: number
  _lng?: number
  isBreak?: boolean
  /** Optional explicit activity-type hint from the generator. */
  activityType?: string
}

// ── Anchor classification (PART 1) ───────────────────────────────────────────

export type AnchorKind =
  | 'arrival'      // arrival at station/airport
  | 'departure'    // departure from station/airport (board train/flight)
  | 'transfer'     // long transfer leg (station→stay, stay→station)
  | 'checkin'      // hotel check-in
  | 'checkout'     // hotel check-out
  | 'base'         // hotel / stay base marker
  | null

const ARRIVAL_RE = /\b(arrival|arrive|arriving|reach(?:ing)?|land(?:ing)?|deboard)\b/i
const DEPARTURE_RE = /\b(departure|depart(?:ing)?|board(?:ing)?|catch(?: the)?|onward train|onward flight|leave for (?:the )?(?:station|airport))\b/i
const TRANSFER_RE = /\b(transfer|drive to|cab to|taxi to|pick-?up|drop-?off|en route to (?:the )?(?:station|airport|hotel))\b/i
const CHECKIN_RE = /\bcheck[\s-]?in\b/i
const CHECKOUT_RE = /\bcheck[\s-]?out\b/i
const STATION_AIRPORT_RE = /\b(station|railway|airport|terminal|junction|njp|ndls|sdah|hwh)\b/i

/**
 * Classify an activity as a fixed anchor kind, or null when it is a flexible
 * stop. Uses the explicit `activityType` hint first, then category + title.
 */
export function anchorKind(a: RoutePlanActivity): AnchorKind {
  const at = (a.activityType ?? '').toLowerCase()
  if (at === 'arrival' || at === 'station_arrival' || at === 'airport_arrival') return 'arrival'
  if (at === 'departure' || at === 'station_departure' || at === 'airport_departure') return 'departure'

  if (a.category === 'hotel') return 'base'

  const title = a.title ?? ''
  if (CHECKIN_RE.test(title)) return 'checkin'
  if (CHECKOUT_RE.test(title)) return 'checkout'

  if (a.category === 'transport') {
    if (ARRIVAL_RE.test(title)) return 'arrival'
    if (DEPARTURE_RE.test(title)) return 'departure'
    if (TRANSFER_RE.test(title) || STATION_AIRPORT_RE.test(title)) return 'transfer'
    // A bare transport activity is still position-sensitive — treat as transfer.
    return 'transfer'
  }

  return null
}

export function isFixedAnchor(a: RoutePlanActivity): boolean {
  return anchorKind(a) !== null
}

/** True when this anchor represents leaving for / boarding departure transport. */
export function isDepartureAnchor(a: RoutePlanActivity): boolean {
  const k = anchorKind(a)
  return k === 'departure'
}

// ── Terminal departure logic (terminal-anchor hotfix PART 1) ─────────────────

const ONBOARD_RE = /\b(onboard|on[\s-]?board|in[\s-]?(?:train|flight)|aboard|journey|enroute|en[\s-]?route\s+meal|train\s+meal|onward\s+(?:train|flight|journey))\b/i
const WAIT_RE = /\b(boarding|station\s+buffer|airport\s+buffer|wait(?:ing)?\s+(?:at|for)|platform|lounge)\b/i

/**
 * A departure anchor (board train / flight / leave for station) is TERMINAL:
 * nothing in the city itinerary may follow it. Only travel-context items
 * (onboard journey/meal, station wait, arrival at the next city) are allowed
 * after it.
 */
export function isTerminalDeparture(a: RoutePlanActivity): boolean {
  return anchorKind(a) === 'departure'
}

/**
 * True when an activity is legitimately allowed AFTER a terminal departure:
 * onboard journey/meal, station/airport wait, or arrival at the next city.
 * Everything else (sightseeing, city restaurants, markets, temples) is not.
 */
export function isTravelContextAfterDeparture(a: RoutePlanActivity): boolean {
  const k = anchorKind(a)
  if (k === 'arrival' || k === 'departure') return true
  const t = (a.title ?? '').toLowerCase()
  return ONBOARD_RE.test(t) || WAIT_RE.test(t)
}

/**
 * Index of the LAST terminal departure anchor in a visible (non-removed)
 * activity list, or -1 when there is none. Anything after this index that is
 * not travel-context is an impossible post-departure activity.
 */
export function terminalDepartureIndex(activities: RoutePlanActivity[]): number {
  let idx = -1
  activities.forEach((a, i) => {
    if (!a._removed && isTerminalDeparture(a)) idx = i
  })
  return idx
}

export interface OptimisePartition {
  /** Keys of flexible, geocoded, non-removed stops to reorder. */
  flexibleKeys: string[]
  /** Geocoded anchor immediately before the flexible block (route start). */
  boundaryStart?: RoutePlanActivity
  /** Geocoded anchor immediately after the flexible block (route end). */
  boundaryEnd?: RoutePlanActivity
}

/**
 * Partition a day's activities for optimisation: find the flexible geocoded
 * stops and the geocoded anchors that bound them (so the optimiser routes FROM
 * the arrival/hotel and TO the departure/hotel without moving those anchors).
 */
export function partitionForOptimise(activities: RoutePlanActivity[]): OptimisePartition {
  const active = activities.filter((a) => !a._removed)
  const flexibleKeys: string[] = []
  let firstFlexIdx = -1
  let lastFlexIdx = -1

  active.forEach((a, i) => {
    const geocoded = a._lat != null && a._lng != null
    if (!isFixedAnchor(a) && geocoded) {
      flexibleKeys.push(a._key)
      if (firstFlexIdx < 0) firstFlexIdx = i
      lastFlexIdx = i
    }
  })

  let boundaryStart: RoutePlanActivity | undefined
  let boundaryEnd: RoutePlanActivity | undefined

  if (firstFlexIdx > 0) {
    for (let i = firstFlexIdx - 1; i >= 0; i--) {
      const a = active[i]!
      if (isFixedAnchor(a) && a._lat != null && a._lng != null) { boundaryStart = a; break }
    }
  }
  if (lastFlexIdx >= 0 && lastFlexIdx < active.length - 1) {
    for (let i = lastFlexIdx + 1; i < active.length; i++) {
      const a = active[i]!
      if (isFixedAnchor(a) && a._lat != null && a._lng != null) { boundaryEnd = a; break }
    }
  }

  return { flexibleKeys, boundaryStart, boundaryEnd }
}

/**
 * Rebuild a day's activity array applying a new order to ONLY the flexible slots,
 * leaving anchors and non-geocoded items in their exact positions.
 */
export function applyFlexibleOrder<T extends RoutePlanActivity>(
  activities: T[],
  rankedFlexibleKeys: string[],
): T[] {
  const flexSet = new Set(rankedFlexibleKeys)
  // Queue of the flexible activities in their new ranked order.
  const byKey = new Map(activities.map((a) => [a._key, a]))
  const queue = rankedFlexibleKeys.map((k) => byKey.get(k)).filter((a): a is T => a != null)
  let qi = 0
  return activities.map((a) => {
    if (!a._removed && flexSet.has(a._key)) {
      const next = queue[qi++]
      return next ?? a
    }
    return a
  })
}

// ── Group/weather-aware buffers (PART 4) ─────────────────────────────────────

export interface BufferInputs {
  travellerCount: number
  /** Max rain probability (%) along the leg, when known. */
  rainProbability?: number
  /** True when the next stop is a station/airport departure (stronger buffer). */
  toDeparture?: boolean
}

export interface BufferResult {
  /** Flat minutes added for group coordination at this transition. */
  groupBufferMins: number
  /** Multiplier applied to base travel time for weather (≥ 1). */
  weatherMultiplier: number
  /** Short human note, or null when no buffer applied. */
  note: string | null
}

/**
 * Compute a travel buffer for one transition. Large groups need coordination
 * time; rain/monsoon inflates travel; station/airport departures get extra.
 */
export function transitionBuffer(inp: BufferInputs): BufferResult {
  const n = Math.max(1, inp.travellerCount || 1)
  let groupBufferMins = 0
  const notes: string[] = []

  if (n >= 8) { groupBufferMins = 25; notes.push(`+${groupBufferMins} min for a large group (${n})`) }
  else if (n >= 4) { groupBufferMins = 12; notes.push(`+${groupBufferMins} min for group size (${n})`) }

  let weatherMultiplier = 1
  if (typeof inp.rainProbability === 'number' && inp.rainProbability >= 60) {
    weatherMultiplier = 1.25
    notes.push('+25% travel for high rain risk')
  } else if (typeof inp.rainProbability === 'number' && inp.rainProbability >= 40) {
    weatherMultiplier = 1.15
    notes.push('+15% travel for rain risk')
  }

  if (inp.toDeparture) {
    groupBufferMins += 20
    notes.push('+20 min station/airport departure buffer')
  }

  return {
    groupBufferMins,
    weatherMultiplier,
    note: notes.length ? notes.join('; ') : null,
  }
}

/** Recommended pre-departure buffer (minutes) before transport leaves. */
export function departureLeadMinutes(
  mode: 'train' | 'flight_domestic' | 'flight_international' | 'bus' | 'car' | undefined,
  opts: { largeGroup?: boolean; highRain?: boolean } = {},
): number {
  let base: number
  switch (mode) {
    case 'flight_international': base = 180; break
    case 'flight_domestic': base = 120; break
    case 'train': base = 50; break
    case 'bus': base = 30; break
    default: base = 40
  }
  if (opts.largeGroup) base += 20
  if (opts.highRain) base += 20
  return base
}

// ── Chronology validator (PART 2) ────────────────────────────────────────────

export interface ChronoActivity {
  _key: string
  _removed?: boolean
  _plannedStart?: string
  _plannedEnd?: string
}

export interface ChronoIssue {
  key: string
  message: string
}

export interface ChronoResult {
  ok: boolean
  issues: ChronoIssue[]
}

/**
 * Validate that planned start times are monotonically non-decreasing and each
 * stop starts no earlier than the previous stop's end. Operates on the computed
 * `_plannedStart`/`_plannedEnd` (which the timing engine produces in order, so
 * this should normally pass — it is a guard against regressions / manual edits).
 */
export function validateChronology(activities: ChronoActivity[]): ChronoResult {
  const issues: ChronoIssue[] = []
  let prevEnd: number | null = null
  let prevStart: number | null = null

  for (const a of activities) {
    if (a._removed) continue
    const start = parseHHMM(a._plannedStart)
    const end = parseHHMM(a._plannedEnd)
    if (start == null) continue
    if (prevStart != null && start < prevStart) {
      issues.push({ key: a._key, message: 'Start time is earlier than the previous stop.' })
    } else if (prevEnd != null && start + 1 < prevEnd) {
      // Allow exact back-to-back; flag only a real overlap (> 1 min).
      issues.push({ key: a._key, message: 'Overlaps the previous stop — not enough travel/buffer time.' })
    }
    prevStart = start
    if (end != null) prevEnd = end
  }

  return { ok: issues.length === 0, issues }
}
