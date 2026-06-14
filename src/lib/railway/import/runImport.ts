/**
 * Import orchestrator (Phase 2/3/10).
 *
 * Pure pipeline: source content → parse → geo-enrich → sanitised, hashed
 * records + category counts. Storage is decoupled (see store/*) so this runs in
 * a plain Node smoke test with no Firestore. NEVER fabricates records.
 *
 * Pure + relative-import only.
 */

import { parseStationDump, IMPORTER_VERSION, type ParseOptions } from './parseStationDump'
import { enrichWithCuratedGeo } from './enrichGeo'
import type { StationMasterRecord, ParseResult, ImportStatus } from './types'

export { IMPORTER_VERSION }

/** Remove `undefined` values so the record is Firestore-safe (Phase 10). */
export function sanitizeRecord<T extends object>(rec: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(rec)) {
    if (v === undefined) continue
    if (Array.isArray(v)) {
      const arr = v.filter((x) => x !== undefined)
      if (arr.length) out[k] = arr
    } else out[k] = v
  }
  return out as T
}

/**
 * Deterministic content hash (FNV-1a) over the stable fields. Lets the store
 * skip unchanged records on re-import (incremental upsert), avoiding pointless
 * Firestore writes (Phase 10).
 */
export function contentHash(rec: StationMasterRecord): string {
  const stable = JSON.stringify({
    c: rec.stationCode, n: rec.stationName, nc: rec.stationNumericCode,
    a: rec.aliases, z: rec.zone, d: rec.division, s: rec.state,
    di: rec.district, ci: rec.city, vf: rec.validFrom, vt: rec.validTo,
    ia: rec.isActive, g: rec.gauge, t: rec.trafficType,
    pr: rec.passengerRelevant, go: rec.goodsOnly, ps: rec.privateSiding,
    la: rec.lat, ln: rec.lng,
  })
  let h = 0x811c9dc5
  for (let i = 0; i < stable.length; i++) {
    h ^= stable.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

export interface PreparedImport {
  records: StationMasterRecord[]
  parse: ParseResult
  categoryCounts: NonNullable<ImportStatus['categoryCounts']>
}

/**
 * Parse + enrich + sanitise + hash a source dump, ready for a store to upsert.
 * Does not touch any backend.
 */
export function prepareImport(content: string, opts: ParseOptions = {}): PreparedImport {
  const parse = parseStationDump(content, opts)
  const enriched = enrichWithCuratedGeo(parse.records)
  const records = enriched.map((r) => {
    const clean = sanitizeRecord(r)
    return { ...clean, contentHash: contentHash(r) }
  })

  const categoryCounts = {
    total: records.length,
    active: records.filter((r) => r.isActive).length,
    passenger: records.filter((r) => r.passengerRelevant).length,
    goodsOnly: records.filter((r) => r.goodsOnly).length,
    privateSiding: records.filter((r) => r.privateSiding).length,
    withCoordinates: records.filter((r) => r.lat != null && r.lng != null).length,
  }

  return { records, parse, categoryCounts }
}
