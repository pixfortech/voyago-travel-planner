/**
 * Browser Geolocation wrapper for Voyago.
 *
 * Location permission is NEVER requested automatically. Every function here
 * must only be called in direct response to an explicit user action such as
 * tapping "Use current location" or "Start live tracking".
 *
 * Tracking in this module is foreground-only (web constraint). It pauses
 * whenever the browser tab loses focus and stops entirely when the page
 * unloads. Call it "foreground live tracking" or "active trip tracking" —
 * never "background tracking".
 */

export interface GeoPosition {
  latitude: number
  longitude: number
  accuracy: number
  altitude: number | null
  heading: number | null
  speed: number | null
  timestamp: number
}

export type GeoErrorKind =
  | 'permission_denied'
  | 'position_unavailable'
  | 'timeout'
  | 'not_supported'
  | 'unknown'

export interface GeoError {
  kind: GeoErrorKind
  message: string
}

function mapBrowserError(err: GeolocationPositionError): GeoError {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return { kind: 'permission_denied', message: 'Location permission was denied. Please allow location access in your browser settings.' }
    case err.POSITION_UNAVAILABLE:
      return { kind: 'position_unavailable', message: 'Location is currently unavailable. Try again in a moment.' }
    case err.TIMEOUT:
      return { kind: 'timeout', message: 'Location request timed out. Move to an area with better GPS signal.' }
    default:
      return { kind: 'unknown', message: err.message || 'An unknown location error occurred.' }
  }
}

function fromBrowserPosition(pos: GeolocationPosition): GeoPosition {
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    altitude: pos.coords.altitude,
    heading: pos.coords.heading,
    speed: pos.coords.speed,
    timestamp: pos.timestamp,
  }
}

export function isGeolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator
}

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15_000,
  maximumAge: 10_000,
}

/**
 * One-shot GPS fix. Only call this from a user-initiated action.
 * Resolves with position or rejects with a GeoError.
 */
export function getCurrentPosition(): Promise<GeoPosition> {
  if (!isGeolocationSupported()) {
    return Promise.reject<GeoPosition>({
      kind: 'not_supported',
      message: 'Your browser does not support geolocation.',
    } as GeoError)
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(fromBrowserPosition(pos)),
      (err) => reject(mapBrowserError(err)),
      GEO_OPTIONS,
    )
  })
}

/** Minimum movement (metres) before a live-tracking point is recorded. */
const MIN_MOVE_METERS = 50
/** Minimum time (ms) between consecutive recorded live-tracking points. */
const MIN_INTERVAL_MS = 30_000

/** Haversine distance for internal threshold check. Full version in distance.ts. */
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const r = (d: number) => (d * Math.PI) / 180
  const dLat = r(lat2 - lat1)
  const dLng = r(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export type WatchCallback = (pos: GeoPosition) => void
export type WatchErrorCallback = (err: GeoError) => void

/**
 * Foreground live tracking. Calls `onPosition` only when the user has moved
 * ≥50 m from the last saved point AND ≥30 s have passed since the last save.
 * Returns a cleanup function — call it to stop tracking.
 *
 * IMPORTANT: This is foreground-only. Tracking pauses when the tab is
 * backgrounded and stops when the page is unloaded. This is a web-app
 * constraint, not a configurable option.
 *
 * Only call this from a user-initiated "Start live tracking" action.
 */
export function watchPosition(
  onPosition: WatchCallback,
  onError: WatchErrorCallback,
  lastKnownLat?: number,
  lastKnownLng?: number,
): () => void {
  if (!isGeolocationSupported()) {
    onError({ kind: 'not_supported', message: 'Your browser does not support geolocation.' })
    return () => {}
  }

  let prevLat: number | null = lastKnownLat ?? null
  let prevLng: number | null = lastKnownLng ?? null
  let lastSavedAt = 0

  const watchId = navigator.geolocation.watchPosition(
    (raw) => {
      const pos = fromBrowserPosition(raw)
      const now = Date.now()

      if (now - lastSavedAt < MIN_INTERVAL_MS) return

      if (prevLat !== null && prevLng !== null) {
        if (distanceMeters(prevLat, prevLng, pos.latitude, pos.longitude) < MIN_MOVE_METERS) return
      }

      prevLat = pos.latitude
      prevLng = pos.longitude
      lastSavedAt = now
      onPosition(pos)
    },
    (err) => onError(mapBrowserError(err)),
    GEO_OPTIONS,
  )

  return () => navigator.geolocation.clearWatch(watchId)
}
