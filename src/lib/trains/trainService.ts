/**
 * Train data service — Phase 16G (PART 7 + PART 10 + hotfix Parts 1–3).
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
 *
 * Hotfix additions (Parts 1–3):
 *   • getStationSchedule(trainNumber, stationCode)
 *   • getTrainLegTiming(trainNumber, fromCode, toCode)
 *   • getImportDataStatus() — UI banner when only seed data is loaded
 *   • Auto-load src/data/imported/railwayTimetable.json and
 *     src/data/imported/railwayStations.json when those files are non-empty.
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
import { parseTimetableImport } from '@/lib/trains/timetableImport'
import importedTimetableRaw from '@/data/imported/railwayTimetable.json'
import importedStationsRaw from '@/data/imported/railwayStations.json'

// ── Auto-load imported datasets when non-empty files are dropped in ──────────

const _fileTrains: IndiaTrainData[] = parseTimetableImport(importedTimetableRaw)
const _fileStations: IndiaRailwayStation[] = (() => {
  if (!Array.isArray(importedStationsRaw) || importedStationsRaw.length === 0) return []
  return (importedStationsRaw as unknown[]).filter(
    (s): s is IndiaRailwayStation =>
      typeof s === 'object' && s !== null && typeof (s as IndiaRailwayStation).code === 'string',
  )
})()

// ── Registry: imported / live datasets layered over the local seed ───────────

let importedTrains: IndiaTrainData[] = _fileTrains
let importedStations: IndiaRailwayStation[] = _fileStations
let liveApiTrains: IndiaTrainData[] = []

/**
 * Register a normalised official-timetable dataset (from `parseTimetableImport`).
 * Replaces any previously-registered import. Trains here override seed entries
 * with the same number.
 */
export function registerImportedTimetable(trains: IndiaTrainData[]): void {
  importedTrains = trains
}

/** Register additional stations from an imported dataset (overrides seed by code). */
export function registerImportedStations(stations: IndiaRailwayStation[]): void {
  importedStations = stations
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

export interface ImportDataStatus {
  timetableLoaded: boolean
  stationsLoaded: boolean
  /** Human-readable note for the UI when running on seed data only. */
  limitedDataMessage: string | null
}

/**
 * Status banner for the UI: when only seed data is available, surfaces the
 * "Full train timetable dataset not loaded. Showing limited local results."
 * message so users know to verify at IRCTC.
 */
export function getImportDataStatus(): ImportDataStatus {
  const timetableLoaded = liveApiTrains.length > 0 || importedTrains.length > 0
  const stationsLoaded = importedStations.length > 0
  return {
    timetableLoaded,
    stationsLoaded,
    limitedDataMessage:
      !timetableLoaded
        ? 'Full train timetable dataset not loaded. Showing limited local results.'
        : null,
  }
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

/** Search stations by name/code/city/alias. Imported stations override seed by code. */
export function searchStations(query: string, limit = 8): StationResult[] {
  const q = query.trim().toLowerCase()
  // Merge seed + imported, with imported taking precedence by code.
  const byCode = new Map<string, IndiaRailwayStation>()
  for (const s of INDIA_RAILWAY_STATIONS) byCode.set(s.code.toUpperCase(), s)
  for (const s of importedStations) byCode.set(s.code.toUpperCase(), s)

  const all = Array.from(byCode.values())
  if (!q) return all.slice(0, limit).map((s) => ({ ...s, source: importedStations.some((is) => is.code.toUpperCase() === s.code.toUpperCase()) ? 'official_timetable_import' as const : 'local_seed' as const }))

  const matches = all.filter(
    (s) =>
      s.code.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      (s.city ?? '').toLowerCase().includes(q) ||
      (s.aliases ?? []).some((a) => a.toLowerCase().includes(q)),
  )

  return matches.slice(0, limit).map((s) => {
    const isImported = importedStations.some((is) => is.code.toUpperCase() === s.code.toUpperCase())
    return { ...s, source: isImported ? 'official_timetable_import' as const : 'local_seed' as const }
  })
}

export function getStationByCode(code: string): IndiaRailwayStation | null {
  const c = code.trim().toUpperCase()
  // Check imported stations first (higher priority).
  const imported = importedStations.find((s) => s.code.toUpperCase() === c)
  if (imported) return imported
  return INDIA_RAILWAY_STATIONS.find((s) => s.code.toUpperCase() === c) ?? null
}

// ── PART 1: Station schedule + leg timing ────────────────────────────────────

/** A single stop's schedule entry for a train. */
export interface StationScheduleEntry {
  stationCode: string
  stationName?: string
  /** Scheduled arrival at this stop (HH:MM). Absent for the origin. */
  arrival?: string
  /** Scheduled departure from this stop (HH:MM). Absent for the terminus. */
  departure?: string
  /** Day offset from train start date (0 = same day, 1 = next day). */
  dayOffset?: number
  distanceKm?: number
}

/** The computed timing for a journey leg between two stops on a single train. */
export interface TrainLegTiming {
  trainNumber: string
  trainName: string
  fromStation: StationScheduleEntry
  toStation: StationScheduleEntry
  /** Departure from origin stop (HH:MM). Null when not in data. */
  departureTime: string | null
  /** Arrival at destination stop (HH:MM). Null when not in data. */
  arrivalTime: string | null
  /** Approximate journey minutes. Null when times are unavailable. */
  durationMinutes: number | null
}

function parseHHMMToMins(t?: string): number | null {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  if (h == null || isNaN(h) || m == null || isNaN(m)) return null
  return h * 60 + m
}

/**
 * Return the scheduled arrival/departure of a specific station on a train.
 * Checks station-wise timings first, then falls back to origin/terminus fields.
 */
export function getStationSchedule(
  trainNumber: string,
  stationCode: string,
): StationScheduleEntry | null {
  const train = getTrainDetails(trainNumber)
  if (!train) return null
  const code = stationCode.trim().toUpperCase()

  // Prefer full station-wise timings when available.
  if (train.stationTimings?.length) {
    const stop = train.stationTimings.find((s) => s.code.toUpperCase() === code)
    if (stop) {
      return {
        stationCode: code,
        arrival: stop.arr,
        departure: stop.dep,
        dayOffset: stop.dayOffset,
      }
    }
  }

  // Fall back to origin/terminus fields.
  if (train.fromStationCode?.toUpperCase() === code) {
    return { stationCode: code, departure: train.departureTime, dayOffset: 0 }
  }
  if (train.toStationCode?.toUpperCase() === code) {
    return { stationCode: code, arrival: train.arrivalTime, dayOffset: train.arrivalDayOffset ?? 0 }
  }

  // The station is on the route but no timing data is available.
  if (train.routeStationCodes.some((c) => c.toUpperCase() === code)) {
    return { stationCode: code }
  }

  return null
}

/**
 * Get departure/arrival and journey duration for a leg between two stations on
 * a train. Returns null if either station is not on the train's route.
 */
export function getTrainLegTiming(
  trainNumber: string,
  fromStationCode: string,
  toStationCode: string,
): TrainLegTiming | null {
  const train = getTrainDetails(trainNumber)
  if (!train) return null

  const fromEntry = getStationSchedule(trainNumber, fromStationCode)
  const toEntry = getStationSchedule(trainNumber, toStationCode)
  if (!fromEntry || !toEntry) return null

  const depTime = fromEntry.departure ?? null
  const arrTime = toEntry.arrival ?? null

  let durationMinutes: number | null = null
  if (depTime && arrTime) {
    const depMins = parseHHMMToMins(depTime)
    const arrMins = parseHHMMToMins(arrTime)
    if (depMins != null && arrMins != null) {
      const dayDiff = ((toEntry.dayOffset ?? 0) - (fromEntry.dayOffset ?? 0)) * 24 * 60
      const raw = arrMins - depMins + dayDiff
      if (raw > 0) durationMinutes = raw
    }
  }

  return {
    trainNumber,
    trainName: train.trainName,
    fromStation: fromEntry,
    toStation: toEntry,
    departureTime: depTime,
    arrivalTime: arrTime,
    durationMinutes,
  }
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
 * Full user-facing one-line label for a train.
 * Format: "12314 Sealdah Rajdhani Express — NDLS 16:30 → SDAH 10:10 +1"
 * Never shows "Up/Down" naming.
 */
export function formatTrainLabel(train: IndiaTrainData): string {
  const from = train.fromStationCode ?? ''
  const to = train.toStationCode ?? ''
  const dep = train.departureTime ?? ''
  const arr = train.arrivalTime ?? ''
  const offset = train.arrivalDayOffset ? ` +${train.arrivalDayOffset}` : ''

  if (from && to && dep && arr) {
    return `${train.trainNumber} ${train.trainName} — ${from} ${dep} → ${to} ${arr}${offset}`
  }
  if (from && to) {
    return `${train.trainNumber} ${train.trainName} — ${from} → ${to}${dep ? ` Dep ${dep}` : ''}${arr ? ` Arr ${arr}${offset}` : ''}`
  }
  const timing = [dep ? `Dep ${dep}` : '', arr ? `Arr ${arr}${offset}` : ''].filter(Boolean).join(' → ')
  return `${train.trainNumber} ${train.trainName} — ${train.routeDescription}${timing ? ` — ${timing}` : ''}`
}
