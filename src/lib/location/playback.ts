/**
 * Builds a unified, in-memory route playback dataset from all three sources
 * of location-tagged data in Voyago:
 *   1. Travel History check-ins and foreground live-tracking points
 *   2. Itinerary activities that carry Google Maps place coordinates (lat/lng)
 *   3. Photo memories that have GPS metadata attached
 *
 * The result is sorted chronologically and is never persisted. Route playback
 * remains private to trip members and is not included in public share snapshots.
 */

import type {
  ItineraryDay,
  TripLocationPoint,
  TripMemory,
  PlaybackPoint,
} from '@/types'

export function buildPlaybackPoints(
  days: ItineraryDay[],
  locationPoints: TripLocationPoint[],
  memories: TripMemory[],
): PlaybackPoint[] {
  const out: PlaybackPoint[] = []

  // ── Source 1: Travel History (check-ins + live tracking) ─────────────────
  for (const lp of locationPoints) {
    const dayKey = lp.dayKey ?? lp.capturedAt.slice(0, 10)
    out.push({
      id: `loc-${lp.id}`,
      type: lp.source === 'live_tracking' ? 'live_tracking' : 'checkin',
      label: lp.label || (lp.source === 'live_tracking' ? 'Live point' : 'Check-in'),
      timestamp: lp.capturedAt,
      latitude: lp.latitude,
      longitude: lp.longitude,
      accuracy: lp.accuracy,
      dayKey,
      linkedLocationPointId: lp.id,
      locationCtx: {
        label: lp.label,
        note: lp.note,
        accuracy: lp.accuracy,
        source: lp.source,
        capturedAt: lp.capturedAt,
      },
    })
  }

  // ── Source 2: Itinerary activities with Google Maps place coordinates ─────
  for (const day of days) {
    for (const a of day.activities) {
      if (a.lat == null || a.lng == null) continue
      // Use the activity's startTime if available; otherwise noon as a stable
      // fallback so the point sorts into the right day without guessing.
      const timestamp = a.startTime
        ? `${day.date}T${a.startTime}:00`
        : `${day.date}T12:00:00`
      out.push({
        id: `act-${a.id}`,
        type: 'activity',
        label: a.title,
        timestamp,
        latitude: a.lat,
        longitude: a.lng,
        dayKey: day.date,
        linkedActivityId: a.id,
        activityCtx: {
          title: a.title,
          category: a.category,
          startTime: a.startTime,
          locationName: a.locationName,
          placeName: a.placeName,
        },
      })
    }
  }

  // ── Source 3: Memories with GPS metadata ──────────────────────────────────
  for (const m of memories) {
    if (!m.location) continue
    const dayKey = m.dayKey ?? (m.capturedAt ?? m.uploadedAt).slice(0, 10)
    out.push({
      id: `mem-${m.id}`,
      type: 'memory',
      label: m.title || m.placeName || 'Photo',
      timestamp: m.capturedAt ?? m.uploadedAt,
      latitude: m.location.latitude,
      longitude: m.location.longitude,
      accuracy: m.location.accuracy,
      dayKey,
      linkedMemoryId: m.id,
      memoryCtx: {
        title: m.title,
        photoUrl: m.photoUrl,
        placeName: m.placeName,
        capturedAt: m.capturedAt,
      },
    })
  }

  // Sort chronologically; ISO strings compare correctly as strings.
  return out.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

/** Group a flat sorted array of PlaybackPoints by dayKey (YYYY-MM-DD). */
export function groupPlaybackByDay(
  points: PlaybackPoint[],
): Map<string, PlaybackPoint[]> {
  const map = new Map<string, PlaybackPoint[]>()
  for (const p of points) {
    if (!map.has(p.dayKey)) map.set(p.dayKey, [])
    map.get(p.dayKey)!.push(p)
  }
  return map
}
