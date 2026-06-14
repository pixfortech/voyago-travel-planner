/**
 * India railway station seed — COMPATIBILITY SHIM.
 *
 * The station master + search now live in the dedicated railway data layer:
 *   • data:   src/data/railway/stations.ts        (RAILWAY_STATIONS)
 *   • search: src/lib/railway/stationSearch.ts    (fuzzy/code/alias/city search)
 *   • nearest:src/lib/railway/nearestStations.ts  (haversine nearest-station)
 *
 * This module is kept so existing imports
 * (`IndiaRailwayStation`, `INDIA_RAILWAY_STATIONS`, `searchRailwayStations`)
 * continue to work unchanged while transparently benefiting from the expanded
 * all-India dataset (incl. full Goa / Konkan coverage) and the stronger search.
 *
 * The `RailwayStation` schema is a superset of the legacy `IndiaRailwayStation`
 * shape (it adds optional district/zone/keywords/major), so every legacy
 * consumer remains type-compatible.
 */

import type { RailwayStation } from './railway/stations'
import { RAILWAY_STATIONS } from './railway/stations'
import { searchRailwayStations as searchMaster } from '@/lib/railway/stationSearch'

/** @deprecated Use `RailwayStation` from `@/data/railway/stations`. */
export type IndiaRailwayStation = RailwayStation

/** @deprecated Use `RAILWAY_STATIONS` from `@/data/railway/stations`. */
export const INDIA_RAILWAY_STATIONS: IndiaRailwayStation[] = RAILWAY_STATIONS

/**
 * Search by station name, code, city, state, alias, keyword, or fuzzy/typo.
 * Delegates to the railway station-search layer (kept here for back-compat).
 */
export function searchRailwayStations(query: string, limit = 8): IndiaRailwayStation[] {
  return searchMaster(query, limit)
}
