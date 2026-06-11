/**
 * Official timetable import path — Phase 16G (PART 8).
 *
 * Lets a fuller train timetable / station dataset be plugged into the app WITHOUT
 * scraping IRCTC/NTES/Google. Accepts a normalised JSON array (CSV should be
 * converted to JSON before import). The dataset is intentionally NOT required to
 * be committed — it can be dropped in at runtime/build time and registered with
 * the train service, which then prefers it over the small local seed.
 *
 * Pure + side-effect-light: `parseTimetableImport` validates/normalises; the
 * train service decides when to register the result. No network calls here.
 */

import type { IndiaTrainData, TrainType, TrainStationStop } from '@/data/indiaTrains'

/** Raw shape accepted from an imported JSON dataset (loosely typed on purpose). */
export interface RawTimetableTrain {
  trainNumber?: string | number
  trainName?: string
  sourceStationCode?: string
  destinationStationCode?: string
  routeStationCodes?: string[]
  departureTime?: string
  arrivalTime?: string
  arrivalDayOffset?: number
  daysOfRun?: string
  trainType?: string
  classes?: string[]
  pantry?: boolean
  reverseTrainNumber?: string | number
  /** Station-wise timings: [{ code, arr, dep, dayOffset }]. */
  stationTimings?: Array<{ code?: string; arr?: string; dep?: string; dayOffset?: number }>
}

const VALID_TRAIN_TYPES: TrainType[] = [
  'rajdhani', 'shatabdi', 'vande_bharat', 'duronto', 'superfast', 'mail_express', 'passenger', 'other',
]

function normalizeType(t: string | undefined): TrainType | undefined {
  if (!t) return undefined
  const v = t.toLowerCase().replace(/[\s-]+/g, '_') as TrainType
  return VALID_TRAIN_TYPES.includes(v) ? v : 'other'
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined
  const s = String(v).trim()
  return s.length ? s : undefined
}

/**
 * Normalise raw imported rows into `IndiaTrainData[]`. Rows missing a train
 * number + name are skipped. When `routeStationCodes` is absent but
 * `stationTimings` are present, the route is derived from the stop codes (in
 * order). `source` is set to 'official_timetable_import'.
 */
export function parseTimetableImport(raw: unknown): IndiaTrainData[] {
  if (!Array.isArray(raw)) return []
  const out: IndiaTrainData[] = []

  for (const r of raw as RawTimetableTrain[]) {
    const trainNumber = str(r.trainNumber)
    const trainName = str(r.trainName)
    if (!trainNumber || !trainName) continue

    const stationTimings: TrainStationStop[] | undefined = Array.isArray(r.stationTimings)
      ? r.stationTimings
          .map((s) => ({
            code: str(s.code) ?? '',
            arr: str(s.arr),
            dep: str(s.dep),
            dayOffset: typeof s.dayOffset === 'number' ? s.dayOffset : undefined,
          }))
          .filter((s) => s.code)
      : undefined

    const routeStationCodes =
      Array.isArray(r.routeStationCodes) && r.routeStationCodes.length
        ? r.routeStationCodes.map((c) => String(c).toUpperCase())
        : stationTimings?.map((s) => s.code.toUpperCase()) ?? []

    if (routeStationCodes.length < 2) continue

    const fromCode = str(r.sourceStationCode)?.toUpperCase() ?? routeStationCodes[0]
    const toCode = str(r.destinationStationCode)?.toUpperCase() ?? routeStationCodes[routeStationCodes.length - 1]

    out.push({
      trainNumber,
      trainName,
      routeStationCodes,
      routeDescription: `${fromCode} → ${toCode}`,
      fromStationCode: fromCode,
      toStationCode: toCode,
      departureTime: str(r.departureTime),
      arrivalTime: str(r.arrivalTime),
      arrivalDayOffset: typeof r.arrivalDayOffset === 'number' ? r.arrivalDayOffset : undefined,
      reverseTrainNumber: str(r.reverseTrainNumber),
      daysOfRun: str(r.daysOfRun),
      trainType: normalizeType(r.trainType),
      classes: Array.isArray(r.classes) ? r.classes.map(String) : undefined,
      pantry: typeof r.pantry === 'boolean' ? r.pantry : undefined,
      stationTimings,
      source: 'official_timetable_import',
    })
  }

  return out
}
