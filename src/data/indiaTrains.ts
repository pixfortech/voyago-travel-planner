/**
 * India railway seed dataset — Phase 16G transport (PART 4/5).
 *
 * A small seed of named trains relevant to NE India / Gangtok flows. Real IRCTC
 * data is NOT scraped here — this seed exists solely for route-mismatch warnings
 * and train-name auto-fill. It is intentionally incomplete; the manual override
 * is always allowed (seed gaps must not block the user).
 *
 * Timings are APPROXIMATE and from public sources — always verify on NTES/IRCTC
 * before travel. Marked with a disclaimer in all UI surfaces.
 *
 * To add more trains: append to INDIA_TRAINS. Each entry needs routeStationCodes
 * as an ordered list of key IRCTC station codes along the route.
 */

export interface IndiaTrainData {
  trainNumber: string
  trainName: string
  /** Short alias used in search (e.g. "Shatabdi"). */
  shortName?: string
  /**
   * Ordered list of key station codes along the route (not exhaustive — only
   * enough for from/to mismatch detection).
   */
  routeStationCodes: string[]
  /** Human-readable route description, e.g. "Kalka → Howrah". */
  routeDescription: string
  /** Primary origin station code (first / key departure station). */
  fromStationCode?: string
  /** Primary destination station code. */
  toStationCode?: string
  /**
   * Approximate departure time (HH:MM) from the primary origin station.
   * Source: public timetables. Always verify on NTES/IRCTC before travel.
   */
  departureTime?: string
  /**
   * Approximate arrival time (HH:MM) at the primary destination station.
   * May be "+1" day for overnight trains; not encoded here — verify on NTES.
   */
  arrivalTime?: string
  /**
   * Train number of the reverse/return paired train, if known.
   * e.g. 12041 (HWH→NJP) ↔ 12042 (NJP→HWH).
   */
  reverseTrainNumber?: string
  /** Days the train runs, e.g. "Daily", "Daily except Thu", "Tue,Fri". */
  daysOfRun?: string
}

export const INDIA_TRAINS: IndiaTrainData[] = [
  // ── NJP / Sealdah corridor ───────────────────────────────────────────────
  {
    trainNumber: '12343',
    trainName: 'Darjeeling Mail',
    routeStationCodes: ['NJP', 'MLDT', 'KIR', 'BHR', 'SDAH'],
    routeDescription: 'New Jalpaiguri → Sealdah',
    fromStationCode: 'NJP',
    toStationCode: 'SDAH',
    departureTime: '21:10',
    arrivalTime: '09:40',   // +1 day
    reverseTrainNumber: '12344',
    daysOfRun: 'Daily',
  },
  {
    trainNumber: '12344',
    trainName: 'Darjeeling Mail',
    routeStationCodes: ['SDAH', 'BHR', 'KIR', 'MLDT', 'NJP'],
    routeDescription: 'Sealdah → New Jalpaiguri',
    fromStationCode: 'SDAH',
    toStationCode: 'NJP',
    departureTime: '22:00',
    arrivalTime: '10:10',   // +1 day
    reverseTrainNumber: '12343',
    daysOfRun: 'Daily',
  },
  // ── NJP / Agartala ──────────────────────────────────────────────────────
  {
    trainNumber: '13149',
    trainName: 'Kanchankanya Express',
    routeStationCodes: ['NJP', 'JBN', 'AGC'],
    routeDescription: 'New Jalpaiguri → Agartala',
    fromStationCode: 'NJP',
    toStationCode: 'AGC',
    departureTime: '09:35',
    arrivalTime: '09:35',   // +1 day
    reverseTrainNumber: '13150',
    daysOfRun: 'Tue, Fri',
  },
  {
    trainNumber: '13150',
    trainName: 'Kanchankanya Express',
    routeStationCodes: ['AGC', 'JBN', 'NJP'],
    routeDescription: 'Agartala → New Jalpaiguri',
    fromStationCode: 'AGC',
    toStationCode: 'NJP',
    departureTime: '13:00',
    arrivalTime: '11:35',   // +1 day
    reverseTrainNumber: '13149',
    daysOfRun: 'Wed, Sun',
  },
  // ── Howrah / NJP corridor ────────────────────────────────────────────────
  {
    trainNumber: '12377',
    trainName: 'Padatik Express',
    routeStationCodes: ['HWH', 'BWN', 'MLDT', 'KIR', 'NJP'],
    routeDescription: 'Howrah → New Jalpaiguri',
    fromStationCode: 'HWH',
    toStationCode: 'NJP',
    departureTime: '23:55',
    arrivalTime: '12:30',   // +1 day
    reverseTrainNumber: '12378',
    daysOfRun: 'Daily',
  },
  {
    trainNumber: '12378',
    trainName: 'Padatik Express',
    routeStationCodes: ['NJP', 'KIR', 'MLDT', 'BWN', 'HWH'],
    routeDescription: 'New Jalpaiguri → Howrah',
    fromStationCode: 'NJP',
    toStationCode: 'HWH',
    departureTime: '15:55',
    arrivalTime: '05:40',   // +1 day
    reverseTrainNumber: '12377',
    daysOfRun: 'Daily',
  },
  {
    trainNumber: '12041',
    trainName: 'Shatabdi Express',
    shortName: 'Shatabdi',
    routeStationCodes: ['HWH', 'BWN', 'MLDT', 'NJP'],
    routeDescription: 'Howrah → New Jalpaiguri',
    fromStationCode: 'HWH',
    toStationCode: 'NJP',
    departureTime: '14:05',
    arrivalTime: '22:35',
    reverseTrainNumber: '12042',
    daysOfRun: 'Daily except Thu',
  },
  {
    trainNumber: '12042',
    trainName: 'Shatabdi Express',
    shortName: 'Shatabdi',
    routeStationCodes: ['NJP', 'MLDT', 'BWN', 'HWH'],
    routeDescription: 'New Jalpaiguri → Howrah',
    fromStationCode: 'NJP',
    toStationCode: 'HWH',
    departureTime: '05:55',
    arrivalTime: '14:35',
    reverseTrainNumber: '12041',
    daysOfRun: 'Daily except Wed',
  },
  // ── Kalka / Howrah (Netaji) ──────────────────────────────────────────────
  {
    trainNumber: '12312',
    trainName: 'Netaji Express',
    routeStationCodes: ['KLK', 'CDG', 'UMB', 'DLI', 'CNB', 'PNBE', 'HWH'],
    routeDescription: 'Kalka → Howrah',
    fromStationCode: 'KLK',
    toStationCode: 'HWH',
    departureTime: '05:30',
    arrivalTime: '10:30',   // +1 day (~29 hrs)
    daysOfRun: 'Daily',
  },
]

/** Search trains by number or name. Returns up to 10 results. */
export function searchTrains(query: string): IndiaTrainData[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  return INDIA_TRAINS.filter(
    (t) =>
      t.trainNumber.startsWith(q) ||
      t.trainName.toLowerCase().includes(q) ||
      (t.shortName?.toLowerCase().includes(q) ?? false),
  ).slice(0, 10)
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
 * the seed (via `reverseTrainNumber`). Returns `null` when unknown or if the
 * reverse is not in the seed.
 */
export function getSuggestedReturnTrain(outboundTrainNumber: string): IndiaTrainData | null {
  const outbound = fetchTrainDetails(outboundTrainNumber)
  if (!outbound?.reverseTrainNumber) return null
  return fetchTrainDetails(outbound.reverseTrainNumber)
}

/**
 * Validate that both from and to station codes appear in the train's known route.
 * Returns a warning string if there is a mismatch, or `null` if the route looks OK
 * (or the train is unknown — we never block an unknown train).
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
  const codes = train.routeStationCodes
  const hasFrom = codes.includes(fromCode.toUpperCase())
  const hasTo = codes.includes(toCode.toUpperCase())
  if (!hasFrom || !hasTo) {
    return (
      `${train.trainName} (${train.trainNumber}) does not appear to run from ${fromCity} to ${toCity}. ` +
      `Its route is ${train.routeDescription}. You can still continue — the seed may be incomplete.`
    )
  }
  return null
}
