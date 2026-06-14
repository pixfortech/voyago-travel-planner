/**
 * Railway timetable layer (Phase 3/4) — cohesive re-export.
 *
 * The train/timetable engine (merged seed + imported + live-API registry,
 * station-wise schedule lookup, leg-timing, route validation, import-status
 * banner) lives in `src/lib/trains/`. This module re-exports the timetable-
 * facing surface under the unified `@/lib/railway/*` namespace so callers have
 * one place to import the railway data layer from.
 *
 * Anti-hallucination: these helpers only ever return what is present in the
 * registered data sources. When schedule data is absent they return `null` /
 * empty — callers must surface "Schedule data unavailable" / "Static timetable"
 * / "Needs verification" rather than inventing numbers, times, or live status.
 */

export {
  searchTrains,
  searchStations,
  getStationByCode,
  getTrainDetails,
  getTrainsBetweenStations,
  getStationSchedule,
  getTrainLegTiming,
  validateTrainForRoute,
  formatTrainLabel,
  activeTrainSource,
  getImportDataStatus,
  registerImportedTimetable,
  registerImportedStations,
  registerLiveApiTrains,
  type StationResult,
  type TrainSearchResult,
  type TrainSearchOptions,
  type StationScheduleEntry,
  type TrainLegTiming,
  type TrainRouteValidation,
  type ImportDataStatus,
} from '@/lib/trains/trainService'

export type {
  IndiaTrainData,
  TrainDataSource,
  TrainType,
  TrainStationStop,
  RouteMatch,
} from '@/data/indiaTrains'

/**
 * Human-readable confidence label for a train record's data source. Keeps
 * trust wording consistent across the UI (never claims "live"/"confirmed").
 */
export function trainSourceLabel(
  source: 'authorised_api' | 'official_timetable_import' | 'local_seed' | 'manual' | undefined,
): string {
  switch (source) {
    case 'authorised_api': return 'Verified source'
    case 'official_timetable_import': return 'Static timetable'
    case 'manual': return 'Manually entered'
    case 'local_seed':
    default: return 'Static timetable · needs verification'
  }
}
