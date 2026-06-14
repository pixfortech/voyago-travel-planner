/**
 * Geo + metadata enrichment (Phase 7).
 *
 * Official CRIS RBS station details do NOT include coordinates (and often no
 * state/city). This merges that missing metadata from the curated 182-station
 * dataset BY CODE — coordinates are only ever copied from a source-backed
 * dataset, never invented. Stations with no coordinate match stay searchable
 * but are skipped by distance ranking.
 *
 * Also converts the curated seed into `StationMasterRecord[]` so the backend
 * search can fall back to it when the imported master is empty (dev/offline).
 *
 * Pure + relative-import only.
 */

import { RAILWAY_STATIONS, type RailwayStation } from '../../../data/railway/stations'
import type { StationMasterRecord } from './types'

const SEED_BY_CODE: Map<string, RailwayStation> = (() => {
  const m = new Map<string, RailwayStation>()
  for (const s of RAILWAY_STATIONS) m.set(s.code.toUpperCase(), s)
  return m
})()

/**
 * Fill missing lat/lng/state/city/district/keywords on imported records from
 * the curated seed (matched by station code). Existing non-empty values on the
 * imported record always win — official data is authoritative where present.
 */
export function enrichWithCuratedGeo(records: StationMasterRecord[]): StationMasterRecord[] {
  let enriched = 0
  const out = records.map((r) => {
    const seed = SEED_BY_CODE.get(r.stationCode.toUpperCase())
    if (!seed) return r
    const merged: StationMasterRecord = { ...r }
    if (merged.lat == null && seed.lat != null) merged.lat = seed.lat
    if (merged.lng == null && seed.lng != null) merged.lng = seed.lng
    if (!merged.state && seed.state) merged.state = seed.state
    if (!merged.city && seed.city) merged.city = seed.city
    if (!merged.district && seed.district) merged.district = seed.district
    // Merge curated aliases + keywords without losing parser-derived ones.
    const aliasSet = new Set([...(merged.aliases ?? []), ...(seed.aliases ?? [])])
    if (aliasSet.size) merged.aliases = Array.from(aliasSet)
    const kwSet = new Set([...(merged.searchKeywords ?? []), ...(seed.keywords ?? [])])
    if (kwSet.size) merged.searchKeywords = Array.from(kwSet)
    if (merged.lat != null && merged.lng != null) enriched++
    return merged
  })
  // eslint-disable-next-line no-console
  if (typeof process !== 'undefined' && process.env?.RAILWAY_IMPORT_DEBUG) {
    console.log(`[enrichGeo] coordinates present on ${enriched}/${out.length} records`)
  }
  return out
}

/** Convert the curated seed into station-master records (offline/dev fallback). */
export function seedAsMasterRecords(): StationMasterRecord[] {
  const now = new Date().toISOString()
  return RAILWAY_STATIONS.map((s) => ({
    stationCode: s.code,
    stationName: s.name,
    aliases: s.aliases,
    zone: s.zone,
    state: s.state,
    district: s.district,
    city: s.city,
    isActive: true,
    passengerRelevant: true,
    source: 'curated_seed' as const,
    lastImportedAt: now,
    confidence: 'seed' as const,
    status: 'Curated seed — verify against official master',
    lat: s.lat,
    lng: s.lng,
    searchKeywords: s.keywords,
  }))
}
