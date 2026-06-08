/**
 * Encoded Polyline decoder — Phase 7E.
 *
 * Google's Routes API returns the road geometry as an "encoded polyline" string
 * (the Encoded Polyline Algorithm Format). This tiny, dependency-free decoder
 * turns it into an ordered array of {lat, lng} so we can draw the exact road
 * route on the Google Maps canvas. Runs on the client; adds no new packages.
 *
 * Reference: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */

export interface LatLngLiteral {
  lat: number
  lng: number
}

export function decodePolyline(encoded: string): LatLngLiteral[] {
  if (!encoded) return []

  const points: LatLngLiteral[] = []
  let index = 0
  let lat = 0
  let lng = 0
  const len = encoded.length

  while (index < len) {
    // Decode latitude delta.
    let result = 0
    let shift = 0
    let byte: number
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lat += (result & 1) !== 0 ? ~(result >> 1) : result >> 1

    // Decode longitude delta.
    result = 0
    shift = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lng += (result & 1) !== 0 ? ~(result >> 1) : result >> 1

    points.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }

  return points
}
