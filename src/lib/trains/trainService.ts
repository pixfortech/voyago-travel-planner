/**
 * Train data service — Phase 16G (PART 7 + PART 10).
 *
 * A single abstraction the UI talks to, so it never needs to know whether a
 * train/station came from an authorised live API, an imported official
 * timetable, or the small local seed.
 *
 * Data-source priority (highest → lowest):
 *   1. authorised_api            — a configured live train API (not wired here)
 *   2. official_timetable_import — a dropped-in normalised timetable dataset
 *   3. local_seed                — the bundled seed in src/data/indiaTrains.ts
 *
 * No scraping. The live-API and import layers are optional and registered at
 * runtime; until then everything resolves against the local seed.
 */

import {
  INDIA_TRAINS,
  trainServesRoute,
  type IndiaTrainData,
  type RouteMatch,
  type TrainDataSource,
} from '@/data/indiaTrains'
import {
  INDIA_RAILWAY_STATIONS,
  searchRailwayStations,
  type IndiaRailwayStation,
} from '@/data/indiaRailwayStations'

// ── Registry: imported / live datasets layered over the local seed ───────────

let importedTrains: IndiaTrainData[] = []
let liveApiTrains: IndiaTrainData[] = []

/**
 * Register a normalised official-timetable dataset (from `parseTimetableImport`).
 * Replaces any previously-registered import. Trains here override seed entries
 * with the same number.
 */
export function registerImportedTimetable(trains: IndiaTrainData[]): void {
  importedTrains = trains
}

/** Register results from an authorised live API (highest priority). */
export function registerLiveApiTrains(trains: IndiaTrainData[]): void {
  liveApiTrains = trains
}

/** Whether a higher-tier source than the local seed is active. */
export function activeTrainSource(): TrainDataSource {
  if (liveApiTrains.length) return 'authorised_api'
  if (importedTrains.length) return 'official_timetable_import'
  return 'local_seed'
}

/**
 * The merged dataset, highest-priority source winning per train number. Seed is
 * always the base so the app works with no import/API configured.
 */
function allTrains(): IndiaTrainData[] {
  const byNumber = new Map<string, IndiaTrainData>()
  for (const t of INDIA_TRAINS) byNumber.set(t.trainNumber, { source: 'local_seed', ...t })
  for (const t of importedTrains) byNumber.set(t.trainNumber, { source: 'official_timetable_import', ...t })
  for (const t of liveApiTrains) byNumber.set(t.trainNumber, { source: 'authorised_api', ...t })
  return Array.from(byNumber.values())
}

// ── Stations ─────────────────────────────────────────────────────────────────

export interface StationResult extends IndiaRailwayStation {
  source: TrainDataSource
}

/** Search stations by name/code/city/alias. */
export function searchStations(query: string, limit = 8): StationResult[] {
  return searchRailwayStations(query, limit).map((s) => ({ ...s, source: 'local_seed' as const }))
}

export function getStationByCode(code: string): IndiaRailwayStation | null {
  const c = code.trim().toUpperCase()
  return INDIA_RAILWAY_STATIONS.find((s) => s.code.toUpperCase() === c) ?? null
}

// ── Trains ───────────────────────────────────────────────────────────────────

/** A search result enriched with how it relates to the requested route. */
export interface TrainSearchResult {
  train: IndiaTrainData
  routeMatch: RouteMatch
  source: TrainDataSource
}

export interface TrainSearchOptions {
  /** Origin station code — enables direction-aware ranking. */
  fromCode?: string
  /** Destination station code — enables direction-aware ranking. */
  toCode?: string
  /** Travel date (reserved for live API; unused by seed). */
  date?: string
  limit?: number
}

function matchesQuery(t: IndiaTrainData, q: string): boolean {
  if (!q) return true
  return (
    t.trainNumber.startsWith(q) ||
    t.trainName.toLowerCase().includes(q) ||
    (t.shortName?.toLowerCase().includes(q) ?? false) ||
    (t.trainType?.toLowerCase().includes(q) ?? false)
  )
}

const ROUTE_RANK: Record<RouteMatch, number> = { match: 0, unknown: 1, reverse: 2, mismatch: 3 }

/**
 * Search trains by number/name/type, route-aware when from/to codes are given.
 *
 * Ranking (PART 10):
 *   1. Trains serving the selected route in the correct direction ('match')
 *   2. Trains where direction is unknown (no from/to given)
 *   3. Trains serving the route in reverse, then non-matching ('reverse' / 'mismatch')
 * Within the same rank, more specific number matches and named expresses come first.
 */
export function searchTrains(query: string, opts: TrainSearchOptions = {}): TrainSearchResult[] {
  const q = query.trim().toLowerCase()
  const limit = opts.limit ?? 12
  const pool = allTrains()

  const results: TrainSearchResult[] = pool
    .filter((t) => matchesQuery(t, q))
    .map((t) => ({
      train: t,
      routeMatch: trainServesRoute(t, opts.fromCode, opts.toCode),
      source: t.source ?? 'local_seed',
    }))

  results.sort((a, b) => {
    const r = ROUTE_RANK[a.routeMatch] - ROUTE_RANK[b.routeMatch]
    if (r !== 0) return r
    // Prefer exact number-prefix matches, then alphabetical by name.
    const aNum = q && a.train.trainNumber.startsWith(q) ? 0 : 1
    const bNum = q && b.train.trainNumber.startsWith(q) ? 0 : 1
    if (aNum !== bNum) return aNum - bNum
    return a.train.trainName.localeCompare(b.train.trainName)
  })

  return results.slice(0, limit)
}

/** Look up a single train by number across all sources. */
export function getTrainDetails(trainNumber: string): IndiaTrainData | null {
  const c = trainNumber.trim()
  return allTrains().find((t) => t.trainNumber === c) ?? null
}

/**
 * All trains that serve `fromCode → toCode` in the correct direction, ordered by
 * departure time when known. Returns [] when no seed train matches (the seed is
 * incomplete — the caller should allow manual entry).
 */
export function getTrainsBetweenStations(
  fromCode: string,
  toCode: string,
  _date?: string,
): IndiaTrainData[] {
  return allTrains()
    .filter((t) => trainServesRoute(t, fromCode, toCode) === 'match')
    .sort((a, b) => (a.departureTime ?? '').localeCompare(b.departureTime ?? ''))
}

export interface TrainRouteValidation {
  ok: boolean
  routeMatch: RouteMatch
  /** User-facing advisory when the route does not match (null when ok/unknown). */
  warning: string | null
  /** Suggested reverse train number when the selected one runs the opposite way. */
  suggestedTrainNumber?: string
}

/**
 * Validate a train against a station pair. Never blocks an unknown train; returns
 * a structured result the UI can use for warnings + a reverse-train suggestion.
 */
export function validateTrainForRoute(
  trainNumber: string,
  fromCode: string,
  toCode: string,
  fromCity?: string,
  toCity?: string,
): TrainRouteValidation {
  const train = getTrainDetails(trainNumber)
  if (!train) {
    return { ok: true, routeMatch: 'unknown', warning: null }
  }
  const routeMatch = trainServesRoute(train, fromCode, toCode)
  const fc = fromCity ?? fromCode
  const tc = toCity ?? toCode
  if (routeMatch === 'match' || routeMatch === 'unknown') {
    return { ok: true, routeMatch, warning: null }
  }
  if (routeMatch === 'reverse') {
    return {
      ok: false,
      routeMatch,
      warning:
        `${train.trainName} (${train.trainNumber}) runs ${train.routeDescription} — the opposite direction to ${fc} → ${tc}.` +
        (train.reverseTrainNumber ? ` Consider train ${train.reverseTrainNumber} instead.` : ''),
      suggestedTrainNumber: train.reverseTrainNumber,
    }
  }
  return {
    ok: false,
    routeMatch,
    warning:
      `${train.trainName} (${train.trainNumber}) does not appear to serve ${fc} → ${tc}. ` +
      `Its route is ${train.routeDescription}. The seed may be incomplete — verify before booking.`,
  }
}

/**
 * User-facing one-line label for a train + direction + timing. Never shows
 * internal "Up/Down" naming — always number, name, From → To, dep → arr.
 */
export function formatTrainLabel(train: IndiaTrainData): string {
  const dir = train.routeDescription
  const dep = train.departureTime ? `Dep ${train.departureTime}` : ''
  const arr = train.arrivalTime
    ? `Arr ${train.arrivalTime}${train.arrivalDayOffset ? ` +${train.arrivalDayOffset}` : ''}`
    : ''
  const timing = [dep, arr].filter(Boolean).join(' → ')
  return `${train.trainNumber} ${train.trainName} — ${dir}${timing ? ` — ${timing}` : ''}`
}
