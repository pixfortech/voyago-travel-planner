/**
 * Smart essentials & safety suggestions — Phase 16F (PART 8 + PART 14).
 *
 * Pure functions, no side effects, no API calls. They turn an ActivityContext
 * (elevation / weather / AQI) into:
 *   • plain-language per-activity warnings, and
 *   • practical "what to carry" suggestions for a day.
 *
 * Safety stance: advisory only. We never prescribe medicine, and we never tell
 * travellers to casually buy/use oxygen — high-altitude wording always defers to
 * a doctor. For ordinary hill stations we suggest warm clothes / hydration /
 * pacing / masks (if AQI is poor), not oxygen.
 */

import type {
  ActivityContext,
  AqiSnapshot,
  EssentialSuggestion,
  WeatherSnapshot,
} from '@/types'

// Categories we treat as "outdoor" for weather/AQI cautions.
const OUTDOOR_CATEGORIES = new Set(['sightseeing', 'adventure', 'leisure', 'spiritual'])

export function isOutdoorCategory(category: string | undefined): boolean {
  return category != null && OUTDOOR_CATEGORIES.has(category)
}

/** Normalise an AQI snapshot to a coarse air-quality band, scale-aware. */
export type AqiBand = 'good' | 'moderate' | 'poor' | 'unknown'

export function aqiBand(aqi: AqiSnapshot | undefined): AqiBand {
  if (!aqi || aqi.source === 'unavailable') return 'unknown'
  // Category text works across scales (CPCB + Google universal).
  const cat = (aqi.category ?? '').toLowerCase()
  if (cat) {
    if (/(severe|hazardous|very poor|bad|unhealthy|poor)/.test(cat)) return 'poor'
    if (/(moderate|satisfactory|low|acceptable)/.test(cat)) return 'moderate'
    if (/(good|excellent|clean)/.test(cat)) return 'good'
  }
  // Numeric fallback. Local scale (CPCB/US, 0–500): higher = worse.
  if (typeof aqi.aqi === 'number') {
    if (aqi.scale === 'universal') {
      // Universal UAQI: 0–100, higher is better.
      if (aqi.aqi >= 80) return 'good'
      if (aqi.aqi >= 50) return 'moderate'
      return 'poor'
    }
    if (aqi.aqi <= 100) return 'good'
    if (aqi.aqi <= 150) return 'moderate'
    return 'poor'
  }
  return 'unknown'
}

const HIGH_RAIN = 60     // % probability
const HOT_C = 33         // °C
const COLD_C = 10        // °C
const HIGH_ALT_FT = 8000
const VERY_HIGH_ALT_FT = 10000

/**
 * Per-activity plain-language warnings. `isOutdoor` gates weather/AQI cautions so
 * we don't warn about rain for an indoor museum lunch.
 */
export function buildContextWarnings(
  ctx: ActivityContext,
  isOutdoor: boolean,
): string[] {
  const warnings: string[] = []
  const w: WeatherSnapshot | undefined = ctx.weatherSnapshot
  const band = aqiBand(ctx.aqiSnapshot)

  if (isOutdoor && w && w.source !== 'unavailable') {
    if (typeof w.precipitationProbability === 'number' && w.precipitationProbability >= HIGH_RAIN) {
      warnings.push('Rain risk is high during this outdoor stop.')
    }
    if (typeof w.temperatureC === 'number') {
      if (w.temperatureC >= HOT_C) warnings.push('Hot weather expected — stay hydrated and avoid mid-day sun.')
      else if (w.temperatureC <= COLD_C) warnings.push('Cold weather expected — carry warm layers.')
    }
  }

  if (isOutdoor && band === 'poor') {
    warnings.push('Air quality is poor; consider a mask or shorter outdoor time.')
  }

  if (typeof ctx.elevationFeet === 'number') {
    if (ctx.elevationFeet >= VERY_HIGH_ALT_FT) {
      warnings.push('Very high elevation; pace slowly, keep warm, and consult a doctor if you have breathing or heart conditions.')
    } else if (ctx.elevationFeet >= HIGH_ALT_FT) {
      warnings.push('High elevation; keep warm and avoid overexertion.')
    }
  }

  return warnings
}

const DISCLAIMER =
  'Advisory only — not medical advice. Consult a doctor for personal health concerns.'

/**
 * Aggregate a day's activity contexts into a de-duplicated list of practical
 * carrying suggestions, ordered must_carry → recommended → optional.
 */
export function buildEssentialSuggestions(
  contexts: ActivityContext[],
): EssentialSuggestion[] {
  if (contexts.length === 0) return []

  // Aggregate the "worst case" signals across the day.
  let maxRain = 0
  let minTempC: number | undefined
  let maxTempC: number | undefined
  let maxElevFt: number | undefined
  let worstAqiBand: AqiBand = 'unknown'
  let worstAqiValue: number | undefined

  const bandRank: Record<AqiBand, number> = { unknown: 0, good: 1, moderate: 2, poor: 3 }

  for (const ctx of contexts) {
    const w = ctx.weatherSnapshot
    if (w && w.source !== 'unavailable') {
      if (typeof w.precipitationProbability === 'number') maxRain = Math.max(maxRain, w.precipitationProbability)
      if (typeof w.temperatureC === 'number') {
        minTempC = minTempC == null ? w.temperatureC : Math.min(minTempC, w.temperatureC)
        maxTempC = maxTempC == null ? w.temperatureC : Math.max(maxTempC, w.temperatureC)
      }
    }
    if (typeof ctx.elevationFeet === 'number') {
      maxElevFt = maxElevFt == null ? ctx.elevationFeet : Math.max(maxElevFt, ctx.elevationFeet)
    }
    const band = aqiBand(ctx.aqiSnapshot)
    if (bandRank[band] > bandRank[worstAqiBand]) {
      worstAqiBand = band
      worstAqiValue = ctx.aqiSnapshot?.aqi
    }
  }

  const out: EssentialSuggestion[] = []

  // ── Air quality ──
  if (worstAqiBand === 'poor') {
    out.push({
      category: 'air_quality',
      priority: 'must_carry',
      item: 'N95/KN95 masks',
      reason: 'Air quality is poor; masks help reduce exposure to dust and pollution. Consider shorter outdoor stretches.',
      basedOn: { aqi: worstAqiValue },
      medicalDisclaimer: DISCLAIMER,
    })
  } else if (worstAqiBand === 'moderate') {
    out.push({
      category: 'air_quality',
      priority: 'recommended',
      item: 'N95/KN95 masks (if sensitive)',
      reason: 'Air quality is acceptable but variable; carry a mask if you are sensitive to dust or pollution.',
      basedOn: { aqi: worstAqiValue },
    })
  }

  // ── Altitude ──
  if (maxElevFt != null && maxElevFt >= VERY_HIGH_ALT_FT) {
    out.push({
      category: 'altitude',
      priority: 'must_carry',
      item: 'Warm layers, water, and slow pacing',
      reason: 'Very high altitude. Avoid overexertion, stay hydrated, and ascend gradually. Consider discussing portable oxygen or other precautions with a doctor before travel, especially if travellers have respiratory or heart conditions.',
      basedOn: { elevationFeet: maxElevFt },
      medicalDisclaimer: DISCLAIMER,
    })
  } else if (maxElevFt != null && maxElevFt >= HIGH_ALT_FT) {
    out.push({
      category: 'altitude',
      priority: 'recommended',
      item: 'Warm layers and water',
      reason: 'High altitude. Keep warm, stay hydrated, and pace yourself to avoid overexertion.',
      basedOn: { elevationFeet: maxElevFt },
      medicalDisclaimer: DISCLAIMER,
    })
  }

  // ── Rain ──
  if (maxRain >= HIGH_RAIN) {
    out.push({
      category: 'rain',
      priority: 'recommended',
      item: 'Umbrella / raincoat and a waterproof pouch',
      reason: `Rain probability is high (${Math.round(maxRain)}%). Keep electronics dry.`,
      basedOn: { rainProbability: Math.round(maxRain) },
    })
  }

  // ── Cold ──
  if (minTempC != null && minTempC <= COLD_C) {
    out.push({
      category: 'cold',
      priority: 'recommended',
      item: 'Light woollens / jacket',
      reason: `Temperatures can drop to around ${minTempC}°C. Carry warm clothing.`,
      basedOn: { temperatureC: minTempC },
    })
  }

  // ── Heat ──
  if (maxTempC != null && maxTempC >= HOT_C) {
    out.push({
      category: 'heat',
      priority: 'recommended',
      item: 'Sunglasses, cap, sunscreen and water',
      reason: `It can get hot (around ${maxTempC}°C). Protect against sun and stay hydrated.`,
      basedOn: { temperatureC: maxTempC },
    })
  } else {
    // General sun protection for outdoor-heavy days even when not "hot".
    const hasOutdoorWeather = contexts.some(
      (c) => c.weatherSnapshot && c.weatherSnapshot.source !== 'unavailable',
    )
    if (hasOutdoorWeather && maxRain < HIGH_RAIN) {
      out.push({
        category: 'general',
        priority: 'optional',
        item: 'Sunglasses and a cap',
        reason: 'Useful for extended outdoor sightseeing.',
        basedOn: {},
      })
    }
  }

  const order: Record<EssentialSuggestion['priority'], number> = {
    must_carry: 0,
    recommended: 1,
    optional: 2,
  }
  return out.sort((a, b) => order[a.priority] - order[b.priority])
}
