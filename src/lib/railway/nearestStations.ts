/**
 * Nearest railway station logic (Phase 5).
 *
 * Pure haversine great-circle distance over the station master's lat/lng. Only
 * stations WITH coordinates participate; the rest are silently skipped (they
 * remain fully searchable by text). Used to give the AI planner realistic
 * boarding/arrival stations for a destination (e.g. Goa → MAO / THVM / VSG).
 */

import { RAILWAY_STATIONS, type RailwayStation } from '../../data/railway/stations'

export interface NearbyStation {
  station: RailwayStation
  distanceKm: number
}

const EARTH_RADIUS_KM = 6371

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Great-circle distance in km between two coordinates (±0.5%). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.min(1, Math.sqrt(a)))
}

export interface NearestStationOptions {
  /** Max results to return (default 6). */
  limit?: number
  /** Ignore stations further than this many km (default 150). */
  maxDistanceKm?: number
}

/**
 * Stations nearest to a coordinate, closest first. Returns `[]` when no station
 * with coordinates falls within `maxDistanceKm`.
 */
export function nearestStations(
  lat: number,
  lng: number,
  opts: NearestStationOptions = {},
): NearbyStation[] {
  const limit = opts.limit ?? 6
  const maxDistanceKm = opts.maxDistanceKm ?? 150
  const out: NearbyStation[] = []
  for (const s of RAILWAY_STATIONS) {
    if (s.lat == null || s.lng == null) continue
    const distanceKm = haversineKm(lat, lng, s.lat, s.lng)
    if (distanceKm <= maxDistanceKm) out.push({ station: s, distanceKm: Math.round(distanceKm * 10) / 10 })
  }
  out.sort((a, b) => a.distanceKm - b.distanceKm)
  return out.slice(0, limit)
}

export interface NearestStationSplit {
  /** Closest station of any size. */
  nearest: NearbyStation | null
  /** Closest `major` junction/terminal (often the better boarding option). */
  nearestMajor: NearbyStation | null
  /** Up to `limit` nearby stations, closest first. */
  all: NearbyStation[]
}

/**
 * Nearest station split into "nearest of any kind" + "nearest major junction",
 * which is what a trip planner actually needs (a local halt vs. a station with
 * long-distance trains).
 */
export function nearestStationSplit(
  lat: number,
  lng: number,
  opts: NearestStationOptions = {},
): NearestStationSplit {
  const all = nearestStations(lat, lng, opts)
  return {
    nearest: all[0] ?? null,
    nearestMajor: all.find((x) => x.station.major) ?? null,
    all,
  }
}
