/**
 * India railway seed dataset — Phase 16G transport (PART 4/5).
 *
 * A small seed of named trains relevant to NE India / Gangtok flows. Real IRCTC
 * data is NOT scraped here — this seed exists solely for route-mismatch warnings
 * and train-name auto-fill. It is intentionally incomplete; the manual override
 * is always allowed (seed gaps must not block the user).
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
}

export const INDIA_TRAINS: IndiaTrainData[] = [
  {
    trainNumber: '12343',
    trainName: 'Darjeeling Mail',
    routeStationCodes: ['NJP', 'MLDT', 'KIR', 'BHR', 'SDAH'],
    routeDescription: 'New Jalpaiguri → Sealdah',
  },
  {
    trainNumber: '12344',
    trainName: 'Darjeeling Mail',
    routeStationCodes: ['SDAH', 'BHR', 'KIR', 'MLDT', 'NJP'],
    routeDescription: 'Sealdah → New Jalpaiguri',
  },
  {
    trainNumber: '13149',
    trainName: 'Kanchankanya Express',
    routeStationCodes: ['NJP', 'JBN', 'AGC'],
    routeDescription: 'New Jalpaiguri → Agartala',
  },
  {
    trainNumber: '13150',
    trainName: 'Kanchankanya Express',
    routeStationCodes: ['AGC', 'JBN', 'NJP'],
    routeDescription: 'Agartala → New Jalpaiguri',
  },
  {
    trainNumber: '12377',
    trainName: 'Padatik Express',
    routeStationCodes: ['HWH', 'BWN', 'MLDT', 'KIR', 'NJP'],
    routeDescription: 'Howrah → New Jalpaiguri',
  },
  {
    trainNumber: '12378',
    trainName: 'Padatik Express',
    routeStationCodes: ['NJP', 'KIR', 'MLDT', 'BWN', 'HWH'],
    routeDescription: 'New Jalpaiguri → Howrah',
  },
  {
    trainNumber: '12041',
    trainName: 'Shatabdi Express',
    shortName: 'Shatabdi',
    routeStationCodes: ['HWH', 'BWN', 'MLDT', 'NJP'],
    routeDescription: 'Howrah → New Jalpaiguri',
  },
  {
    trainNumber: '12042',
    trainName: 'Shatabdi Express',
    shortName: 'Shatabdi',
    routeStationCodes: ['NJP', 'MLDT', 'BWN', 'HWH'],
    routeDescription: 'New Jalpaiguri → Howrah',
  },
  {
    trainNumber: '12312',
    trainName: 'Netaji Express',
    routeStationCodes: ['KLK', 'CDG', 'UMB', 'DLI', 'CNB', 'PNBE', 'HWH'],
    routeDescription: 'Kalka → Howrah',
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
