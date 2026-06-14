/**
 * Station-master import — data model (Phase 3).
 *
 * The canonical station record produced by the import pipeline from an official
 * source dump (CRIS RBS Station Details, or the OGD republication). This is the
 * normalised shape stored in the backend station master and queried by search /
 * nearest-station. Import-free (pure types) so it loads anywhere.
 */

/** Where a station record originated. */
export type StationSourceTag = 'CRIS_RBS' | 'OGD' | 'curated_seed' | 'manual'

/** Trust label for a station record. */
export type StationConfidence = 'official' | 'seed' | 'needs_verification'

/**
 * One normalised station-master record. Optional fields are omitted (never
 * `undefined`) before any Firestore write — see `sanitizeRecord`.
 */
export interface StationMasterRecord {
  /** IRCTC/CRIS alphabetic station code, uppercase (PRIMARY KEY part 1). */
  stationCode: string
  /** Canonical station name. */
  stationName: string
  /** CRIS numeric station code, when present (PRIMARY KEY part 2 for dedup). */
  stationNumericCode?: string
  /** Alternate names / safe spelling variants searched alongside the name. */
  aliases?: string[]
  /** Railway zone code (e.g. "KR", "SWR"). */
  zone?: string
  /** Railway division. */
  division?: string
  /** State / UT, where available or enriched. */
  state?: string
  /** District, where available or enriched. */
  district?: string
  /** City / locality, where available or enriched. */
  city?: string
  /** Validity start (as given by source; ISO when parseable). */
  validFrom?: string
  /** Validity end (as given by source; ISO when parseable). */
  validTo?: string
  /** Whether the record is currently operational (derived from validity dates). */
  isActive: boolean
  /** Track gauge (e.g. "BG", "MG", "NG"), where available. */
  gauge?: string
  /** Raw traffic/station type from source (e.g. "Coaching", "Goods", "Both"). */
  trafficType?: string
  /** Inferred: serves passenger traffic (coaching / both / unknown-but-coded). */
  passengerRelevant?: boolean
  /** Inferred: goods-only handling point. */
  goodsOnly?: boolean
  /** Inferred: private siding / non-public operating point. */
  privateSiding?: boolean
  /** Source tag. */
  source: StationSourceTag
  /** Stable source key (e.g. resource id / file name + row). */
  sourceKey?: string
  /** ISO timestamp of the import that produced this record. */
  lastImportedAt?: string
  /** Trust label. */
  confidence?: StationConfidence
  /** Free-text status note. */
  status?: string
  /** Latitude (decimal degrees) — enriched from curated geo, never invented. */
  lat?: number
  /** Longitude (decimal degrees). */
  lng?: number
  /** Extra searchable keywords (nearby tourist areas, old names). */
  searchKeywords?: string[]
  /** Content hash for incremental upsert (set by the store, not the parser). */
  contentHash?: string
}

/** Counts produced by one import run. */
export interface ImportCounts {
  parsed: number
  added: number
  updated: number
  unchanged: number
  removed: number
  deactivated: number
  skipped: number
}

/** A single problem encountered while parsing a row. */
export interface ImportIssue {
  row: number
  reason: string
  raw?: string
}

/** Result of parsing + normalising a source dump (before storage). */
export interface ParseResult {
  records: StationMasterRecord[]
  issues: ImportIssue[]
  /** Distinct source tag of this dump. */
  source: StationSourceTag
}

/** Persisted import-status record (Phase 5). */
export interface ImportStatus {
  lastAttemptAt: string | null
  lastSuccessfulImportAt: string | null
  ok: boolean
  source: StationSourceTag | null
  counts: ImportCounts | null
  /** Breakdown by trafficType-derived category. */
  categoryCounts?: {
    total: number
    active: number
    passenger: number
    goodsOnly: number
    privateSiding: number
    withCoordinates: number
  }
  error: string | null
  /** Number of parse-level issues in the last run. */
  issueCount?: number
  /** Importer version, so format changes are traceable. */
  importerVersion?: string
}
