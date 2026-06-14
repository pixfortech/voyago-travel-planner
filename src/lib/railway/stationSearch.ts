/**
 * Railway station search — robust, source-backed lookup over the station master.
 *
 * Matches by: station code (exact + prefix), station name (exact + prefix +
 * substring), alias/spelling variation, city, state, keyword, and a light
 * fuzzy/typo fallback (bounded Levenshtein) so "Vasco"/"Madgaon"/"Margao"/
 * "VSG"/"MAO" all resolve. Pure + import-light (only the data file) so it runs
 * on the client, the server, and a standalone Node smoke test.
 */

import { RAILWAY_STATIONS, type RailwayStation } from '../../data/railway/stations'

function norm(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[.'`’]/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
}

/** Bounded Levenshtein distance; returns `max + 1` once it provably exceeds max. */
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

/**
 * Score one station against a normalised query. Higher = better; -1 = no match.
 * Exact code/name win; aliases and prefixes next; city/state/keyword and a
 * typo-tolerant fuzzy pass fill the long tail.
 */
function scoreStation(s: RailwayStation, q: string): number {
  const code = norm(s.code)
  const name = norm(s.name)
  const city = norm(s.city)
  const state = norm(s.state)
  const aliases = (s.aliases ?? []).map(norm)
  const keywords = (s.keywords ?? []).map(norm)

  // Exact matches.
  if (code === q) return 100
  if (name === q) return 96
  if (aliases.some((a) => a === q)) return 94
  if (city === q) return 88

  // Prefix matches.
  if (code.startsWith(q)) return 86
  if (name.startsWith(q)) return 82
  if (aliases.some((a) => a.startsWith(q))) return 78
  if (city.startsWith(q)) return 70

  // Word-boundary prefix inside multi-word names ("vasco" → "vasco da gama").
  if (name.split(' ').some((w) => w.startsWith(q))) return 66
  if (aliases.some((a) => a.split(' ').some((w) => w.startsWith(q)))) return 64

  // Substring matches.
  if (name.includes(q)) return 52
  if (aliases.some((a) => a.includes(q))) return 48
  if (city.includes(q)) return 44
  if (keywords.some((k) => k.includes(q))) return 38
  if (state === q) return 34
  if (state.includes(q)) return 22

  // Fuzzy fallback for typos (only worthwhile for queries of a few chars).
  if (q.length >= 4) {
    const max = q.length <= 6 ? 1 : 2
    if (levenshtein(name, q, max) <= max) return 30
    if (aliases.some((a) => levenshtein(a, q, max) <= max)) return 28
    if (levenshtein(city, q, max) <= max) return 26
  }

  return -1
}

/**
 * Search the station master. Results are ranked by score, then `major` stations,
 * then shorter names (more canonical), then alphabetical. Empty query returns the
 * major stations so a freshly-opened dropdown is still useful.
 */
export function searchRailwayStations(query: string, limit = 8): RailwayStation[] {
  const q = norm(query)
  if (!q) {
    return RAILWAY_STATIONS.filter((s) => s.major)
      .slice(0, limit)
      .map((s) => ({ ...s }))
  }

  const scored: { s: RailwayStation; score: number }[] = []
  for (const s of RAILWAY_STATIONS) {
    const score = scoreStation(s, q)
    if (score >= 0) scored.push({ s, score })
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (!!b.s.major !== !!a.s.major) return (b.s.major ? 1 : 0) - (a.s.major ? 1 : 0)
    if (a.s.name.length !== b.s.name.length) return a.s.name.length - b.s.name.length
    return a.s.name.localeCompare(b.s.name)
  })

  return scored.slice(0, limit).map((x) => x.s)
}

/** Exact station lookup by IRCTC code. */
export function getStationByCode(code: string): RailwayStation | null {
  const c = code.trim().toUpperCase()
  return RAILWAY_STATIONS.find((s) => s.code.toUpperCase() === c) ?? null
}

/** All stations in a given state (case-insensitive). */
export function stationsInState(state: string): RailwayStation[] {
  const q = norm(state)
  return RAILWAY_STATIONS.filter((s) => norm(s.state) === q)
}

/**
 * Display label, e.g. "Madgaon Junction (MAO), Goa". Single source of truth so
 * dropdowns, AI context, and cards all read identically.
 */
export function formatStationLabel(s: Pick<RailwayStation, 'name' | 'code' | 'state'>): string {
  return `${s.name} (${s.code}), ${s.state}`
}
