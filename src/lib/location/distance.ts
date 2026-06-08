/**
 * Haversine formula for approximate great-circle distances between GPS points.
 *
 * Accuracy: ±0.5% — sufficient for travel-history distance estimates but not
 * for turn-by-turn navigation. Results shown in the UI are clearly labelled
 * "approx." to set the right expectation.
 *
 * No external dependencies. Safe to call in any environment (client or server).
 */

/** Returns distance in metres between two GPS coordinates. */
export function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6_371_000
  const r = (d: number) => (d * Math.PI) / 180
  const dLat = r(lat2 - lat1)
  const dLng = r(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Returns distance in kilometres, rounded to 1 decimal place. */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  return Math.round(haversineMeters(lat1, lng1, lat2, lng2) / 100) / 10
}

export interface DistanceSummary {
  totalMeters: number
  totalKm: number
  legMeters: number[]
}

/**
 * Total distance through an ordered list of GPS points (oldest → newest).
 * Returns zero-distance summary for fewer than 2 points.
 */
export function computeTripDistance(
  points: Array<{ latitude: number; longitude: number }>,
): DistanceSummary {
  if (points.length < 2) return { totalMeters: 0, totalKm: 0, legMeters: [] }

  const legMeters: number[] = []
  let total = 0

  for (let i = 1; i < points.length; i++) {
    const d = haversineMeters(
      points[i - 1].latitude, points[i - 1].longitude,
      points[i].latitude,     points[i].longitude,
    )
    legMeters.push(d)
    total += d
  }

  return {
    totalMeters: total,
    totalKm: Math.round(total / 100) / 10,
    legMeters,
  }
}
