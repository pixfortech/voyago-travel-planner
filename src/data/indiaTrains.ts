/**
 * India railway seed dataset — Phase 16G transport.
 *
 * A LOCAL SEED of named trains. Real IRCTC/NTES data is NOT scraped here — this
 * seed exists for route-mismatch warnings, direction clarity, and name/timing
 * auto-fill. It is intentionally incomplete; the manual override is always
 * allowed (seed gaps must never block the user).
 *
 * This file is the lowest layer of the train data service (see
 * `src/lib/trains/trainService.ts`). A fuller official timetable dataset or an
 * authorised live API can be plugged in above it without changing the UI.
 *
 * Timings are APPROXIMATE and from public timetables — always verify on
 * NTES/IRCTC before travel. `arrivalDayOffset` encodes overnight arrivals (e.g.
 * "+1"); we never show confusing internal "Up/Down" labels to users.
 *
 * To add more trains: append to INDIA_TRAINS. Each entry needs routeStationCodes
 * as an ordered list (IN THE DIRECTION OF TRAVEL) of key IRCTC station codes.
 */

/** Where a train record came from. The UI must not care which. */
export type TrainDataSource =
  | 'authorised_api'
  | 'official_timetable_import'
  | 'local_seed'
  | 'manual'

export type TrainType =
  | 'rajdhani'
  | 'shatabdi'
  | 'vande_bharat'
  | 'duronto'
  | 'superfast'
  | 'mail_express'
  | 'passenger'
  | 'other'

/** A station-wise stop entry (used by the official timetable import path). */
export interface TrainStationStop {
  code: string
  /** Arrival time HH:MM (local). Absent at the origin. */
  arr?: string
  /** Departure time HH:MM (local). Absent at the destination. */
  dep?: string
  /** Day offset from journey start (0 = same day, 1 = next day). */
  dayOffset?: number
}

export interface IndiaTrainData {
  trainNumber: string
  trainName: string
  /** Short alias used in search (e.g. "Shatabdi", "Rajdhani"). */
  shortName?: string
  /**
   * Ordered list of key station codes ALONG THE DIRECTION OF TRAVEL (not
   * exhaustive — enough for from/to + direction detection).
   */
  routeStationCodes: string[]
  /** Human-readable route description, e.g. "New Delhi → Sealdah". */
  routeDescription: string
  /** Primary origin station code (first / key departure station). */
  fromStationCode?: string
  /** Primary destination station code. */
  toStationCode?: string
  /** Approximate departure time (HH:MM) from the primary origin station. */
  departureTime?: string
  /** Approximate arrival time (HH:MM) at the primary destination station. */
  arrivalTime?: string
  /** Day offset of arrival from departure (1 = next day "+1"). */
  arrivalDayOffset?: number
  /** Train number of the reverse/return paired train, if known. */
  reverseTrainNumber?: string
  /** Days the train runs, e.g. "Daily", "Daily except Thu", "Tue, Fri". */
  daysOfRun?: string
  // ── Optional richer fields (official timetable import path) ──
  trainType?: TrainType
  /** Travel classes offered, e.g. ['1A','2A','3A']. */
  classes?: string[]
  /** Pantry / meals on board. */
  pantry?: boolean
  /** Full station-wise timetable, when imported. */
  stationTimings?: TrainStationStop[]
  /** Provenance of this record (defaults to 'local_seed'). */
  source?: TrainDataSource
}

export const INDIA_TRAINS: IndiaTrainData[] = [
  // ── Delhi ⇄ Kolkata Rajdhani (PART 9) ────────────────────────────────────
  {
    trainNumber: '12314',
    trainName: 'Sealdah Rajdhani Express',
    shortName: 'Rajdhani',
    routeStationCodes: ['NDLS', 'CNB', 'DHN', 'ASN', 'DGR', 'SDAH'],
    routeDescription: 'New Delhi → Sealdah',
    fromStationCode: 'NDLS',
    toStationCode: 'SDAH',
    departureTime: '16:30',
    arrivalTime: '10:10',
    arrivalDayOffset: 1,
    reverseTrainNumber: '12313',
    daysOfRun: 'Daily',
    trainType: 'rajdhani',
    classes: ['1A', '2A', '3A'],
    pantry: true,
    source: 'local_seed',
  },
  {
    trainNumber: '12313',
    trainName: 'Sealdah Rajdhani Express',
    shortName: 'Rajdhani',
    routeStationCodes: ['SDAH', 'DGR', 'ASN', 'DHN', 'CNB', 'NDLS'],
    routeDescription: 'Sealdah → New Delhi',
    fromStationCode: 'SDAH',
    toStationCode: 'NDLS',
    departureTime: '16:50',
    arrivalTime: '10:50',
    arrivalDayOffset: 1,
    reverseTrainNumber: '12314',
    daysOfRun: 'Daily',
    trainType: 'rajdhani',
    classes: ['1A', '2A', '3A'],
    pantry: true,
    source: 'local_seed',
  },
  {
    trainNumber: '12302',
    trainName: 'Howrah Rajdhani Express',
    shortName: 'Rajdhani',
    routeStationCodes: ['NDLS', 'CNB', 'DHN', 'ASN', 'HWH'],
    routeDescription: 'New Delhi → Howrah',
    fromStationCode: 'NDLS',
    toStationCode: 'HWH',
    departureTime: '16:55',
    arrivalTime: '09:55',
    arrivalDayOffset: 1,
    reverseTrainNumber: '12301',
    daysOfRun: 'Daily',
    trainType: 'rajdhani',
    classes: ['1A', '2A', '3A'],
    pantry: true,
    source: 'local_seed',
  },
  {
    trainNumber: '12301',
    trainName: 'Howrah Rajdhani Express',
    shortName: 'Rajdhani',
    routeStationCodes: ['HWH', 'ASN', 'DHN', 'CNB', 'NDLS'],
    routeDescription: 'Howrah → New Delhi',
    fromStationCode: 'HWH',
    toStationCode: 'NDLS',
    departureTime: '16:50',
    arrivalTime: '10:00',
    arrivalDayOffset: 1,
    reverseTrainNumber: '12302',
    daysOfRun: 'Daily',
    trainType: 'rajdhani',
    classes: ['1A', '2A', '3A'],
    pantry: true,
    source: 'local_seed',
  },
  // ── NJP / Sealdah corridor ───────────────────────────────────────────────
  {
    trainNumber: '12343',
    trainName: 'Darjeeling Mail',
    routeStationCodes: ['NJP', 'MLDT', 'ASN', 'SDAH'],
    routeDescription: 'New Jalpaiguri → Sealdah',
    fromStationCode: 'NJP',
    toStationCode: 'SDAH',
    departureTime: '20:00',
    arrivalTime: '06:15',
    arrivalDayOffset: 1,
    reverseTrainNumber: '12344',
    daysOfRun: 'Daily',
    trainType: 'mail_express',
    pantry: true,
    source: 'local_seed',
  },
  {
    trainNumber: '12344',
    trainName: 'Darjeeling Mail',
    routeStationCodes: ['SDAH', 'ASN', 'MLDT', 'NJP'],
    routeDescription: 'Sealdah → New Jalpaiguri',
    fromStationCode: 'SDAH',
    toStationCode: 'NJP',
    departureTime: '22:05',
    arrivalTime: '08:00',
    arrivalDayOffset: 1,
    reverseTrainNumber: '12343',
    daysOfRun: 'Daily',
    trainType: 'mail_express',
    pantry: true,
    source: 'local_seed',
  },
  // ── Howrah / NJP corridor ────────────────────────────────────────────────
  {
    trainNumber: '12377',
    trainName: 'Padatik Express',
    routeStationCodes: ['SDAH', 'ASN', 'MLDT', 'NJP'],
    routeDescription: 'Sealdah → New Jalpaiguri',
    fromStationCode: 'SDAH',
    toStationCode: 'NJP',
    departureTime: '23:00',
    arrivalTime: '09:30',
    arrivalDayOffset: 1,
    reverseTrainNumber: '12378',
    daysOfRun: 'Daily',
    trainType: 'superfast',
    pantry: true,
    source: 'local_seed',
  },
  {
    trainNumber: '12378',
    trainName: 'Padatik Express',
    routeStationCodes: ['NJP', 'MLDT', 'ASN', 'SDAH'],
    routeDescription: 'New Jalpaiguri → Sealdah',
    fromStationCode: 'NJP',
    toStationCode: 'SDAH',
    departureTime: '19:35',
    arrivalTime: '06:05',
    arrivalDayOffset: 1,
    reverseTrainNumber: '12377',
    daysOfRun: 'Daily',
    trainType: 'superfast',
    pantry: true,
    source: 'local_seed',
  },
  {
    trainNumber: '12041',
    trainName: 'Shatabdi Express',
    shortName: 'Shatabdi',
    routeStationCodes: ['HWH', 'MLDT', 'NJP'],
    routeDescription: 'Howrah → New Jalpaiguri',
    fromStationCode: 'HWH',
    toStationCode: 'NJP',
    departureTime: '14:05',
    arrivalTime: '22:35',
    arrivalDayOffset: 0,
    reverseTrainNumber: '12042',
    daysOfRun: 'Daily except Thu',
    trainType: 'shatabdi',
    classes: ['CC', 'EC'],
    pantry: true,
    source: 'local_seed',
  },
  {
    trainNumber: '12042',
    trainName: 'Shatabdi Express',
    shortName: 'Shatabdi',
    routeStationCodes: ['NJP', 'MLDT', 'HWH'],
    routeDescription: 'New Jalpaiguri → Howrah',
    fromStationCode: 'NJP',
    toStationCode: 'HWH',
    departureTime: '05:55',
    arrivalTime: '14:35',
    arrivalDayOffset: 0,
    reverseTrainNumber: '12041',
    daysOfRun: 'Daily except Wed',
    trainType: 'shatabdi',
    classes: ['CC', 'EC'],
    pantry: true,
    source: 'local_seed',
  },
  // ── Vande Bharat (Howrah ⇄ NJP) ──────────────────────────────────────────
  {
    trainNumber: '22301',
    trainName: 'Vande Bharat Express',
    shortName: 'Vande Bharat',
    routeStationCodes: ['HWH', 'MLDT', 'NJP'],
    routeDescription: 'Howrah → New Jalpaiguri',
    fromStationCode: 'HWH',
    toStationCode: 'NJP',
    departureTime: '05:55',
    arrivalTime: '13:25',
    arrivalDayOffset: 0,
    reverseTrainNumber: '22302',
    daysOfRun: 'Daily except Wed',
    trainType: 'vande_bharat',
    classes: ['CC', 'EC'],
    pantry: true,
    source: 'local_seed',
  },
  {
    trainNumber: '22302',
    trainName: 'Vande Bharat Express',
    shortName: 'Vande Bharat',
    routeStationCodes: ['NJP', 'MLDT', 'HWH'],
    routeDescription: 'New Jalpaiguri → Howrah',
    fromStationCode: 'NJP',
    toStationCode: 'HWH',
    departureTime: '15:25',
    arrivalTime: '22:55',
    arrivalDayOffset: 0,
    reverseTrainNumber: '22301',
    daysOfRun: 'Daily except Wed',
    trainType: 'vande_bharat',
    classes: ['CC', 'EC'],
    pantry: true,
    source: 'local_seed',
  },
]

// ── Direction-aware route matching ───────────────────────────────────────────

/** How a train relates to a requested station pair. */
export type RouteMatch =
  | 'match'      // serves both stations in the requested direction
  | 'reverse'    // serves both stations but in the OPPOSITE direction
  | 'mismatch'   // does not serve both stations
  | 'unknown'    // not enough info (no from/to given)

/**
 * Determine whether a train serves `fromCode → toCode` in the correct direction,
 * using the ordered routeStationCodes. Never throws; returns 'unknown' when codes
 * are missing.
 */
export function trainServesRoute(
  train: IndiaTrainData,
  fromCode?: string,
  toCode?: string,
): RouteMatch {
  if (!fromCode || !toCode) return 'unknown'
  const codes = train.routeStationCodes.map((c) => c.toUpperCase())
  const fi = codes.indexOf(fromCode.toUpperCase())
  const ti = codes.indexOf(toCode.toUpperCase())
  if (fi < 0 || ti < 0) return 'mismatch'
  return fi < ti ? 'match' : 'reverse'
}

/** Search trains by number or name. Returns up to `limit` results. */
export function searchTrains(query: string, limit = 10): IndiaTrainData[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  return INDIA_TRAINS.filter(
    (t) =>
      t.trainNumber.startsWith(q) ||
      t.trainName.toLowerCase().includes(q) ||
      (t.shortName?.toLowerCase().includes(q) ?? false),
  ).slice(0, limit)
}

/**
 * Look up a train by number from the local seed. Returns `null` when the number
 * is not in the seed (live data not configured — caller should show a note).
 */
export function fetchTrainDetails(trainNumber: string): IndiaTrainData | null {
  return INDIA_TRAINS.find((t) => t.trainNumber === trainNumber.trim()) ?? null
}

/**
 * Given the outbound train number, return the paired reverse/return train from
 * the seed (via `reverseTrainNumber`). Returns `null` when unknown.
 */
export function getSuggestedReturnTrain(outboundTrainNumber: string): IndiaTrainData | null {
  const outbound = fetchTrainDetails(outboundTrainNumber)
  if (!outbound?.reverseTrainNumber) return null
  return fetchTrainDetails(outbound.reverseTrainNumber)
}

/**
 * Validate that both from and to station codes appear in the train's known route.
 * Returns a warning string if there is a mismatch / wrong direction, or `null`
 * if the route looks OK (or the train is unknown — we never block an unknown train).
 */
export function validateTrainRoute(
  trainNumber: string,
  fromCode: string,
  fromCity: string,
  toCode: string,
  toCity: string,
): string | null {
  if (!trainNumber || !fromCode || !toCode) return null
  const train = fetchTrainDetails(trainNumber)
  if (!train) return null // unknown train — seed may be incomplete, no warning
  const rel = trainServesRoute(train, fromCode, toCode)
  if (rel === 'match' || rel === 'unknown') return null
  if (rel === 'reverse') {
    return (
      `${train.trainName} (${train.trainNumber}) runs ${train.routeDescription} — that is the OPPOSITE ` +
      `direction to ${fromCity} → ${toCity}.${train.reverseTrainNumber ? ` You may want train ${train.reverseTrainNumber} instead.` : ''} ` +
      `You can still continue — verify before booking.`
    )
  }
  return (
    `${train.trainName} (${train.trainNumber}) does not appear to run from ${fromCity} to ${toCity}. ` +
    `Its route is ${train.routeDescription}. You can still continue — the seed may be incomplete.`
  )
}
