/**
 * Station-master parser (Phase 2/3).
 *
 * Normalises an OFFICIAL station dump — CRIS RBS "Station Details" or the OGD
 * (data.gov.in) republication — into `StationMasterRecord[]`. Tolerant of the
 * column-header variations these exports use. Accepts CSV text or a JSON array.
 *
 * NEVER fabricates records: rows missing a station code/name are skipped and
 * reported as issues. Source provenance, validity-derived active flag, gauge,
 * traffic type, and conservative aliases are captured; coordinates are NOT
 * invented here (they are merged from curated geo in `enrichGeo.ts`).
 *
 * Pure + relative-import only, so the import smoke test runs under plain Node.
 */

import type {
  StationMasterRecord,
  StationSourceTag,
  ParseResult,
  ImportIssue,
} from './types'

export const IMPORTER_VERSION = '1.0.0'

// ── Header normalisation ─────────────────────────────────────────────────────
// CRIS RBS / OGD exports use varying header spellings; map them to canonical keys.

type CanonicalField =
  | 'code' | 'name' | 'numericCode' | 'zone' | 'division'
  | 'validFrom' | 'validTo' | 'gauge' | 'traffic'
  | 'state' | 'district' | 'city' | 'lat' | 'lng'

const HEADER_ALIASES: Record<CanonicalField, string[]> = {
  code: ['station code', 'stn code', 'stncode', 'code', 'station_code', 'scode'],
  name: ['station name', 'stn name', 'stnname', 'name', 'station_name', 'sname'],
  numericCode: ['stn number', 'station number', 'numeric code', 'station numeric code', 'stn no', 'stncode numeric', 'station_no'],
  zone: ['zone', 'zone code', 'railway zone', 'zone_cd'],
  division: ['division', 'divn', 'div', 'division name'],
  validFrom: ['valid from', 'date from', 'valid_from', 'from date', 'w.e.f', 'wef'],
  validTo: ['valid to', 'valid upto', 'valid_to', 'to date', 'date to', 'valid till'],
  gauge: ['gauge', 'track gauge'],
  traffic: ['traffic', 'traffic type', 'station type', 'category', 'traffic_type', 'type'],
  state: ['state', 'state name'],
  district: ['district', 'district name'],
  city: ['city', 'locality', 'town'],
  lat: ['latitude', 'lat', 'y'],
  lng: ['longitude', 'long', 'lng', 'lon', 'x'],
}

function buildHeaderMap(headers: string[]): Partial<Record<CanonicalField, number>> {
  const map: Partial<Record<CanonicalField, number>> = {}
  headers.forEach((h, i) => {
    const norm = h.trim().toLowerCase().replace(/["']/g, '')
    for (const field of Object.keys(HEADER_ALIASES) as CanonicalField[]) {
      if (map[field] != null) continue
      if (HEADER_ALIASES[field].includes(norm)) map[field] = i
    }
  })
  return map
}

// ── CSV tokeniser (handles quoted fields + embedded commas/quotes) ───────────

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else inQuotes = false
      } else cur += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

// ── Field helpers ────────────────────────────────────────────────────────────

function clean(v: unknown): string | undefined {
  if (v == null) return undefined
  const s = String(v).trim()
  if (!s || s === '-' || s.toUpperCase() === 'NA' || s.toUpperCase() === 'NULL') return undefined
  return s
}

function parseDateish(v: string | undefined): string | undefined {
  if (!v) return undefined
  // Accept ISO, dd-mm-yyyy, dd/mm/yyyy, yyyy-mm-dd. Return ISO date when parseable.
  const dmY = v.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (dmY) {
    const [, d, m, y] = dmY
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const ymd = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (ymd) {
    const [, y, m, d] = ymd
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return v // keep raw; downstream treats unparseable as open-ended
}

const SENTINEL_OPEN = /^(9999|2999|31[-/]12[-/]9999|9999-12-31)/

/** Derive operational status from validity dates. Open-ended / future = active. */
function deriveActive(validFrom?: string, validTo?: string, today = new Date()): boolean {
  const toDate = (s?: string): number | null => {
    if (!s) return null
    if (SENTINEL_OPEN.test(s)) return Number.POSITIVE_INFINITY
    const t = Date.parse(s)
    return isNaN(t) ? null : t
  }
  const now = today.getTime()
  const from = toDate(validFrom)
  const to = toDate(validTo)
  if (from != null && from > now) return false // not yet valid
  if (to != null && to < now) return false // expired
  return true
}

/** Classify traffic/station type into passenger / goods-only / private-siding. */
function classifyTraffic(traffic?: string): {
  passengerRelevant?: boolean
  goodsOnly?: boolean
  privateSiding?: boolean
} {
  if (!traffic) return {} // unknown — leave flags unset rather than guess
  const t = traffic.toLowerCase()
  const isSiding = /siding|private|non[- ]?railway|block hut|block station|outer/.test(t)
  const hasCoaching = /coach|passenger|both|all|mixed|halt|flag/.test(t)
  const goodsOnly = /goods/.test(t) && !hasCoaching && !isSiding
  return {
    passengerRelevant: hasCoaching || (!goodsOnly && !isSiding) ? true : false,
    goodsOnly: goodsOnly || undefined,
    privateSiding: isSiding || undefined,
  }
}

/** Conservative, non-misleading alias generation from the canonical name. */
function deriveAliases(name: string): string[] {
  const out = new Set<string>()
  const base = name.replace(/\b(jn|junction|terminus|terminal|central|cantt|cantonment)\b\.?/gi, '').replace(/\s+/g, ' ').trim()
  if (base && base.toLowerCase() !== name.toLowerCase()) out.add(base)
  if (/-/.test(name)) out.add(name.replace(/-/g, ' ').replace(/\s+/g, ' ').trim())
  if (/\bjn\b/i.test(name)) out.add(name.replace(/\bjn\b/i, 'Junction'))
  out.delete(name)
  return Array.from(out).filter((a) => a.length >= 3)
}

// ── Row → record ─────────────────────────────────────────────────────────────

function rowToRecord(
  get: (f: CanonicalField) => string | undefined,
  source: StationSourceTag,
  sourceKey: string,
  importedAt: string,
): StationMasterRecord | null {
  const stationCode = clean(get('code'))?.toUpperCase()
  const stationName = clean(get('name'))
  if (!stationCode || !stationName) return null

  const validFrom = parseDateish(clean(get('validFrom')))
  const validTo = parseDateish(clean(get('validTo')))
  const trafficType = clean(get('traffic'))
  const { passengerRelevant, goodsOnly, privateSiding } = classifyTraffic(trafficType)
  const latRaw = clean(get('lat'))
  const lngRaw = clean(get('lng'))
  const lat = latRaw != null && !isNaN(Number(latRaw)) ? Number(latRaw) : undefined
  const lng = lngRaw != null && !isNaN(Number(lngRaw)) ? Number(lngRaw) : undefined
  const aliases = deriveAliases(stationName)

  return {
    stationCode,
    stationName,
    stationNumericCode: clean(get('numericCode')),
    aliases: aliases.length ? aliases : undefined,
    zone: clean(get('zone'))?.toUpperCase(),
    division: clean(get('division')),
    state: clean(get('state')),
    district: clean(get('district')),
    city: clean(get('city')),
    validFrom,
    validTo,
    isActive: deriveActive(validFrom, validTo),
    gauge: clean(get('gauge'))?.toUpperCase(),
    trafficType,
    passengerRelevant,
    goodsOnly,
    privateSiding,
    source,
    sourceKey,
    lastImportedAt: importedAt,
    confidence: source === 'CRIS_RBS' || source === 'OGD' ? 'official' : 'needs_verification',
    lat,
    lng,
  }
}

/** Dedup by `stationCode|numericCode`, last-wins, merging non-empty fields. */
function dedupe(records: StationMasterRecord[]): StationMasterRecord[] {
  const byKey = new Map<string, StationMasterRecord>()
  for (const r of records) {
    const key = `${r.stationCode}|${r.stationNumericCode ?? ''}`
    const prev = byKey.get(key)
    byKey.set(key, prev ? { ...prev, ...r } : r)
  }
  return Array.from(byKey.values())
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface ParseOptions {
  source?: StationSourceTag
  /** Stable identifier for the dump (file name / resource id). */
  sourceKey?: string
  importedAt?: string
}

/** Parse a CSV station dump into normalised records + issue log. */
export function parseStationCsv(csv: string, opts: ParseOptions = {}): ParseResult {
  const source = opts.source ?? 'CRIS_RBS'
  const importedAt = opts.importedAt ?? new Date().toISOString()
  const issues: ImportIssue[] = []
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return { records: [], issues: [{ row: 0, reason: 'empty or header-only CSV' }], source }

  const headers = parseCsvLine(lines[0])
  const hmap = buildHeaderMap(headers)
  if (hmap.code == null || hmap.name == null) {
    return { records: [], issues: [{ row: 0, reason: `could not locate station code/name columns in header: ${headers.join('|')}` }], source }
  }

  const records: StationMasterRecord[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    const get = (f: CanonicalField): string | undefined => {
      const idx = hmap[f]
      return idx != null ? cols[idx] : undefined
    }
    const rec = rowToRecord(get, source, `${opts.sourceKey ?? 'csv'}#${i}`, importedAt)
    if (rec) records.push(rec)
    else issues.push({ row: i, reason: 'missing station code or name', raw: lines[i].slice(0, 120) })
  }
  return { records: dedupe(records), issues, source }
}

/** Parse a JSON-array station dump (OGD-style records) into normalised records. */
export function parseStationJson(raw: unknown, opts: ParseOptions = {}): ParseResult {
  const source = opts.source ?? 'OGD'
  const importedAt = opts.importedAt ?? new Date().toISOString()
  const issues: ImportIssue[] = []
  if (!Array.isArray(raw)) return { records: [], issues: [{ row: 0, reason: 'JSON dump is not an array' }], source }

  const records: StationMasterRecord[] = []
  raw.forEach((row, i) => {
    if (typeof row !== 'object' || row == null) {
      issues.push({ row: i, reason: 'row is not an object' })
      return
    }
    // Build a lowercase key index so header aliasing works on object keys too.
    const lc: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) lc[k.trim().toLowerCase()] = v
    const get = (f: CanonicalField): string | undefined => {
      for (const alias of HEADER_ALIASES[f]) {
        if (lc[alias] != null) return clean(lc[alias])
      }
      return undefined
    }
    const rec = rowToRecord(get, source, `${opts.sourceKey ?? 'json'}#${i}`, importedAt)
    if (rec) records.push(rec)
    else issues.push({ row: i, reason: 'missing station code or name' })
  })
  return { records: dedupe(records), issues, source }
}

/** Auto-detect CSV vs JSON and parse. */
export function parseStationDump(content: string, opts: ParseOptions = {}): ParseResult {
  const trimmed = content.trimStart()
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(content)
      const arr = Array.isArray(json) ? json : (json.records ?? json.data ?? json.stations)
      return parseStationJson(arr, opts)
    } catch {
      // fall through to CSV
    }
  }
  return parseStationCsv(content, opts)
}
