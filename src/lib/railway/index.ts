/**
 * Railway data layer — public barrel.
 *
 * One import surface for the whole Indian Railways integration:
 *   • station master + search   → ./stationSearch  (data: @/data/railway/stations)
 *   • nearest-station (haversine)→ ./nearestStations
 *   • train/timetable engine     → ./timetable      (impl: @/lib/trains/*)
 */

export {
  searchRailwayStations,
  getStationByCode as getRailwayStationByCode,
  stationsInState,
  formatStationLabel,
} from './stationSearch'

export {
  haversineKm,
  nearestStations,
  nearestStationSplit,
  type NearbyStation,
  type NearestStationOptions,
  type NearestStationSplit,
} from './nearestStations'

export { RAILWAY_STATIONS, RAILWAY_STATES, type RailwayStation } from '@/data/railway/stations'

export * from './timetable'
