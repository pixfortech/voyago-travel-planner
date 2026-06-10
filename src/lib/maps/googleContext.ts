/**
 * Google Maps Platform — location context (server-only). Phase 16F.
 *
 * Wraps four Google APIs so their key never reaches the browser:
 *   • Elevation API    — batched terrain elevation for many points in one call.
 *   • Weather API      — daily forecast (current + up to 10 days ahead).
 *   • Air Quality API  — current AQI + dominant pollutant (local index when available).
 *   • Time Zone API    — IANA time zone + UTC offset for a coordinate.
 *
 * Every function FAILS SOFT: on any transport / API / quota error it resolves to
 * a structured `*_unavailable` result instead of throwing, so context enrichment
 * can never crash trip generation. Errors are logged server-side (key-free).
 */

import 'server-only'
import { getServerMapsKey } from '@/lib/maps/googleServer'
import type { WeatherSnapshot, AqiSnapshot, TimeZoneContext } from '@/types'

const METERS_TO_FEET = 3.28084

// ── Elevation ────────────────────────────────────────────────────────────────

export interface ElevationResult {
  /** Index into the input array. */
  index: number
  elevationMeters?: number
  elevationFeet?: number
  source: 'google_elevation' | 'unavailable'
  confidence: 'high' | 'unavailable'
}

interface ElevationApiResponse {
  status?: string
  results?: Array<{ elevation?: number; location?: { lat?: number; lng?: number } }>
}

/**
 * Fetch elevation for many coordinates in ONE Elevation API call (the API
 * accepts up to ~512 `lat,lng` pairs separated by `|`). Results are returned in
 * input order. Missing/failed points get a `source: 'unavailable'` entry.
 */
export async function fetchElevationBatch(
  points: Array<{ lat: number; lng: number }>,
): Promise<ElevationResult[]> {
  const key = getServerMapsKey()
  const unavailable = (): ElevationResult[] =>
    points.map((_, index) => ({ index, source: 'unavailable', confidence: 'unavailable' }))

  if (!key || points.length === 0) return unavailable()

  // Elevation API has a request-size limit; chunk defensively at 200 points.
  const CHUNK = 200
  const out: ElevationResult[] = []
  for (let start = 0; start < points.length; start += CHUNK) {
    const chunk = points.slice(start, start + CHUNK)
    const locations = chunk.map((p) => `${p.lat},${p.lng}`).join('|')
    try {
      const url =
        `https://maps.googleapis.com/maps/api/elevation/json` +
        `?locations=${encodeURIComponent(locations)}&key=${encodeURIComponent(key)}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) {
        console.error('[Voyago Context] elevation HTTP', res.status)
        chunk.forEach((_, i) => out.push({ index: start + i, source: 'unavailable', confidence: 'unavailable' }))
        continue
      }
      const data = (await res.json()) as ElevationApiResponse
      if (data.status !== 'OK' || !Array.isArray(data.results)) {
        console.error('[Voyago Context] elevation status', data.status)
        chunk.forEach((_, i) => out.push({ index: start + i, source: 'unavailable', confidence: 'unavailable' }))
        continue
      }
      chunk.forEach((_, i) => {
        const elev = data.results![i]?.elevation
        if (typeof elev === 'number' && Number.isFinite(elev)) {
          const meters = Math.round(elev)
          out.push({
            index: start + i,
            elevationMeters: meters,
            elevationFeet: Math.round(meters * METERS_TO_FEET),
            source: 'google_elevation',
            confidence: 'high',
          })
        } else {
          out.push({ index: start + i, source: 'unavailable', confidence: 'unavailable' })
        }
      })
    } catch (err) {
      console.error('[Voyago Context] elevation failed', (err as Error).message)
      chunk.forEach((_, i) => out.push({ index: start + i, source: 'unavailable', confidence: 'unavailable' }))
    }
  }
  return out
}

// ── Weather ──────────────────────────────────────────────────────────────────

const WEATHER_UNAVAILABLE: WeatherSnapshot = { source: 'unavailable', confidence: 'unavailable' }

interface WeatherTemp { degrees?: number }
interface WeatherSubForecast {
  weatherCondition?: { description?: { text?: string }; type?: string }
  relativeHumidity?: number
  precipitation?: { probability?: { percent?: number } }
  wind?: { speed?: { value?: number } }
}
interface WeatherForecastDay {
  displayDate?: { year?: number; month?: number; day?: number }
  maxTemperature?: WeatherTemp
  minTemperature?: WeatherTemp
  feelsLikeMaxTemperature?: WeatherTemp
  daytimeForecast?: WeatherSubForecast
}
interface WeatherForecastResponse {
  forecastDays?: WeatherForecastDay[]
}

function ymd(d: { year?: number; month?: number; day?: number } | undefined): string | null {
  if (!d?.year || !d?.month || !d?.day) return null
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
}

/**
 * Fetch a daily weather forecast for one location and return a map of
 * `YYYY-MM-DD` → snapshot, plus the last available day (for closest-match
 * fallback). Returns an empty map (never throws) on any failure.
 */
export async function fetchWeatherForecast(
  lat: number,
  lng: number,
): Promise<{ byDate: Map<string, WeatherSnapshot>; lastDate: string | null }> {
  const key = getServerMapsKey()
  const empty = { byDate: new Map<string, WeatherSnapshot>(), lastDate: null }
  if (!key) return empty

  try {
    const url =
      `https://weather.googleapis.com/v1/forecast/days:lookup` +
      `?key=${encodeURIComponent(key)}` +
      `&location.latitude=${lat}&location.longitude=${lng}&days=10`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      console.error('[Voyago Context] weather HTTP', res.status)
      return empty
    }
    const data = (await res.json()) as WeatherForecastResponse
    const days = Array.isArray(data.forecastDays) ? data.forecastDays : []
    const byDate = new Map<string, WeatherSnapshot>()
    let lastDate: string | null = null

    for (const day of days) {
      const date = ymd(day.displayDate)
      if (!date) continue
      const dayPart = day.daytimeForecast
      const max = day.maxTemperature?.degrees
      const min = day.minTemperature?.degrees
      let temperatureC: number | undefined
      if (typeof max === 'number' && typeof min === 'number') temperatureC = Math.round((max + min) / 2)
      else if (typeof max === 'number') temperatureC = Math.round(max)

      const snapshot: WeatherSnapshot = {
        temperatureC,
        feelsLikeC:
          typeof day.feelsLikeMaxTemperature?.degrees === 'number'
            ? Math.round(day.feelsLikeMaxTemperature.degrees)
            : undefined,
        condition: dayPart?.weatherCondition?.description?.text,
        precipitationProbability: dayPart?.precipitation?.probability?.percent,
        humidity: dayPart?.relativeHumidity,
        windKph:
          typeof dayPart?.wind?.speed?.value === 'number'
            ? Math.round(dayPart.wind.speed.value)
            : undefined,
        source: 'google_weather',
        confidence: 'high',
        fetchedForDateTime: date,
      }
      byDate.set(date, snapshot)
      lastDate = date
    }
    return { byDate, lastDate }
  } catch (err) {
    console.error('[Voyago Context] weather failed', (err as Error).message)
    return empty
  }
}

/**
 * Resolve a snapshot for a wanted date: exact match → confidence high; otherwise
 * closest available (the last forecast day) → confidence low. Unavailable when
 * the forecast map is empty.
 */
export function pickWeatherForDate(
  forecast: { byDate: Map<string, WeatherSnapshot>; lastDate: string | null },
  wantedDate: string | undefined,
): WeatherSnapshot {
  if (forecast.byDate.size === 0) return WEATHER_UNAVAILABLE
  if (wantedDate && forecast.byDate.has(wantedDate)) {
    return { ...forecast.byDate.get(wantedDate)!, fetchedForDateTime: wantedDate }
  }
  // Closest available: use the last forecast day, marked low confidence.
  if (forecast.lastDate) {
    const snap = forecast.byDate.get(forecast.lastDate)!
    return { ...snap, confidence: 'low', fetchedForDateTime: wantedDate ?? forecast.lastDate }
  }
  return WEATHER_UNAVAILABLE
}

// ── Air Quality ──────────────────────────────────────────────────────────────

const AQI_UNAVAILABLE: AqiSnapshot = { source: 'unavailable', confidence: 'unavailable' }

interface AqiIndex {
  code?: string
  aqi?: number
  category?: string
  dominantPollutant?: string
}
interface AqiResponse {
  indexes?: AqiIndex[]
  healthRecommendations?: { generalPopulation?: string }
}

/**
 * Fetch current air quality for a location. Prefers the local regulatory index
 * (e.g. India CPCB, 0–500 scale) when present; otherwise falls back to Google's
 * Universal AQI (0–100, higher is better). Never throws.
 */
export async function fetchAirQuality(lat: number, lng: number): Promise<AqiSnapshot> {
  const key = getServerMapsKey()
  if (!key) return AQI_UNAVAILABLE

  try {
    const res = await fetch(
      `https://airquality.googleapis.com/v1/currentConditions:lookup?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: { latitude: lat, longitude: lng },
          extraComputations: ['DOMINANT_POLLUTANT_CONCENTRATION'],
          customLocalAqis: [{ regionCode: 'IN', aqi: 'ind_cpcb' }],
          languageCode: 'en',
        }),
        cache: 'no-store',
      },
    )
    if (!res.ok) {
      console.error('[Voyago Context] air-quality HTTP', res.status)
      return AQI_UNAVAILABLE
    }
    const data = (await res.json()) as AqiResponse
    const indexes = Array.isArray(data.indexes) ? data.indexes : []
    if (indexes.length === 0) return AQI_UNAVAILABLE

    // Prefer a local index (anything that is not the universal "uaqi").
    const local = indexes.find((i) => i.code && i.code !== 'uaqi')
    const chosen = local ?? indexes.find((i) => i.code === 'uaqi') ?? indexes[0]!
    if (typeof chosen.aqi !== 'number') return AQI_UNAVAILABLE

    return {
      aqi: chosen.aqi,
      category: chosen.category,
      dominantPollutant: chosen.dominantPollutant,
      source: 'google_air_quality',
      confidence: 'high',
      scale: local ? 'local' : 'universal',
    }
  } catch (err) {
    console.error('[Voyago Context] air-quality failed', (err as Error).message)
    return AQI_UNAVAILABLE
  }
}

// ── Time Zone ────────────────────────────────────────────────────────────────

const TZ_UNAVAILABLE: TimeZoneContext = { source: 'unavailable' }

interface TimeZoneResponse {
  status?: string
  timeZoneId?: string
  timeZoneName?: string
  rawOffset?: number
  dstOffset?: number
}

/** Fetch the IANA time zone + UTC offset for a coordinate. Never throws. */
export async function fetchTimeZone(lat: number, lng: number): Promise<TimeZoneContext> {
  const key = getServerMapsKey()
  if (!key) return TZ_UNAVAILABLE

  try {
    const timestamp = Math.floor(Date.now() / 1000)
    const url =
      `https://maps.googleapis.com/maps/api/timezone/json` +
      `?location=${lat},${lng}&timestamp=${timestamp}&key=${encodeURIComponent(key)}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      console.error('[Voyago Context] time-zone HTTP', res.status)
      return TZ_UNAVAILABLE
    }
    const data = (await res.json()) as TimeZoneResponse
    if (data.status !== 'OK' || !data.timeZoneId) {
      console.error('[Voyago Context] time-zone status', data.status)
      return TZ_UNAVAILABLE
    }
    const utcOffsetMinutes =
      typeof data.rawOffset === 'number'
        ? Math.round((data.rawOffset + (data.dstOffset ?? 0)) / 60)
        : undefined
    return {
      timeZoneId: data.timeZoneId,
      timeZoneName: data.timeZoneName,
      utcOffsetMinutes,
      source: 'google_time_zone',
    }
  } catch (err) {
    console.error('[Voyago Context] time-zone failed', (err as Error).message)
    return TZ_UNAVAILABLE
  }
}
