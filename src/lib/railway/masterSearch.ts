/**
 * Station-master search (Phase 6).
 *
 * Searches `StationMasterRecord[]` (the imported official master, or the curated
 * seed as fallback) by code, name, numeric code, alias, city, state, zone,
 * division, keyword, and a bounded-Levenshtein typo fallback. Supports the
 * Phase 3 filters (all / passenger / major / active-only). Pure + relative.
 */

import type { StationMasterRecord } from './import/types'

function norm(s: string): string {
  return s.toLowerCase().trim().replace(/[.'`’]/g, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ')
}

function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const prev = new Array(b.length + 1)
  const curr = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    let rowMin = curr[0]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
      if (curr[j] < rowMin) rowMin = curr[j]
    }
    if (rowMin > max) return max + 1
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]
  }
  return prev[b.length]
}

export type StationFilter = 'all' | 'passenger' | 'major' | 'active'

export interface MasterSearchOptions {
  limit?: number
  filter?: StationFilter
}

/** A record is "major" if it's a junction/terminal/central or a known big code. */
function isMajor(r: StationMasterRecord): boolean {
  return /\b(junction|terminus|terminal|central)\b/i.test(r.stationName)
}

function passesFilter(r: StationMasterRecord, filter: StationFilter): boolean {
  switch (filter) {
    case 'active': return r.isActive
    case 'passenger': return r.passengerRelevant !== false
    case 'major': return isMajor(r)
    case 'all':
    default: return true
  }
}

function scoreRecord(r: StationMasterRecord, q: string): number {
  const code = norm(r.stationCode)
  const numeric = r.stationNumericCode ? norm(r.stationNumericCode) : ''
  const name = norm(r.stationName)
  const city = r.city ? norm(r.city) : ''
  const state = r.state ? norm(r.state) : ''
  const zone = r.zone ? norm(r.zone) : ''
  const division = r.division ? norm(r.division) : ''
  const aliases = (r.aliases ?? []).map(norm)
  const keywords = (r.searchKeywords ?? []).map(norm)

  if (code === q) return 100
  if (numeric && numeric === q) return 98
  if (name === q) return 96
  if (aliases.some((a) => a === q)) return 94
  if (city && city === q) return 88

  if (code.startsWith(q)) return 86
  if (name.startsWith(q)) return 82
  if (aliases.some((a) => a.startsWith(q))) return 78
  if (city.startsWith(q)) return 70

  if (name.split(' ').some((w) => w.startsWith(q))) return 66
  if (aliases.some((a) => a.split(' ').some((w) => w.startsWith(q)))) return 64

  if (name.includes(q)) return 52
  if (aliases.some((a) => a.includes(q))) return 48
  if (city.includes(q)) return 44
  if (keywords.some((k) => k.includes(q))) return 38
  if (state === q) return 34
  if (zone === q || division === q) return 32
  if (state.includes(q)) return 22

  if (q.length >= 4) {
    const max = q.length <= 6 ? 1 : 2
    if (levenshtein(name, q, max) <= max) return 30
    if (aliases.some((a) => levenshtein(a, q, max) <= max)) return 28
    if (city && levenshtein(city, q, max) <= max) return 26
  }
  return -1
}

/** Search the master, ranked by score → active → major → shorter name. */
export function searchStationMaster(
  records: StationMasterRecord[],
  query: string,
  opts: MasterSearchOptions = {},
): StationMasterRecord[] {
  const limit = opts.limit ?? 8
  const filter = opts.filter ?? 'all'
  const q = norm(query)
  const pool = records.filter((r) => passesFilter(r, filter))

  if (!q) {
    return pool.filter(isMajor).slice(0, limit)
  }

  const scored: { r: StationMasterRecord; score: number }[] = []
  for (const r of pool) {
    const score = scoreRecord(r, q)
    if (score >= 0) scored.push({ r, score })
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.r.isActive !== b.r.isActive) return a.r.isActive ? -1 : 1
    if (isMajor(a.r) !== isMajor(b.r)) return isMajor(a.r) ? -1 : 1
    return a.r.stationName.length - b.r.stationName.length
  })
  return scored.slice(0, limit).map((x) => x.r)
}

/**
 * Display label: "Madgaon Junction (MAO), Goa". When state/city is unavailable
 * (official dump without enrichment), fall back to zone/division — never guess.
 */
export function formatMasterLabel(r: StationMasterRecord): string {
  const place = r.state ?? r.city ?? ([r.zone, r.division].filter(Boolean).join(' / ') || null)
  return `${r.stationName} (${r.stationCode})${place ? `, ${place}` : ''}`
}
