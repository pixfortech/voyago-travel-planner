/**
 * POST /api/ai/enrich-food — Phase 16D.
 *
 * Replaces generic AI-generated food breaks with real Google Places
 * restaurant/café suggestions. Called client-side after the trip generator
 * returns a result, before the preview is shown.
 *
 * Input: a subset of the GeneratedDay[] plan (food activities only) + context.
 * Output: enrichment patches keyed by {dayIdx, actIdx}.
 *
 * Server-only — the Maps key never leaves this module.
 */

import { NextRequest, NextResponse } from 'next/server'
import { searchPlaces, isMapsAvailable } from '@/lib/maps/googleServer'
import type { FoodPreference } from '@/types'

// ── Spend estimator ────────────────────────────────────────────────────────

interface SpendRange {
  min: number
  max: number
  perPersonMin: number
  perPersonMax: number
  confidence: 'low' | 'medium' | 'high'
  basis: 'google_price_level' | 'heuristic'
}

// Per-person INR ranges by Google price level.
const PRICE_LEVEL_RANGES: Record<number, [number, number]> = {
  1: [80, 220],
  2: [200, 550],
  3: [500, 1400],
  4: [1400, 4000],
}

// Heuristic per-person INR ranges by food budget style.
const STYLE_RANGES: Record<string, [number, number]> = {
  budget: [80, 250],
  mid_range: [200, 600],
  premium: [550, 2000],
}

function estimateSpend(
  priceLevel: number | undefined,
  foodBudgetStyle: string | undefined,
  travellerCount: number,
  currency: string,
): SpendRange {
  const isINR = currency === 'INR'
  let perMin: number
  let perMax: number
  let confidence: 'low' | 'medium' | 'high'
  let basis: 'google_price_level' | 'heuristic'

  // Confidence reflects how exact the pricing source is — never overstate it:
  //   high   — only for user-entered exact cost or a reliable explicit pricing
  //            source (not produced by this Google-derived estimator).
  //   medium — Google priceLevel band (a rough bucket, not exact menu pricing)
  //            corroborated by rating / type.
  //   low    — heuristic from food budget style only, with no priceLevel signal.
  if (priceLevel != null && PRICE_LEVEL_RANGES[priceLevel]) {
    ;[perMin, perMax] = PRICE_LEVEL_RANGES[priceLevel]!
    confidence = 'medium'
    basis = 'google_price_level'
  } else {
    const [lo, hi] = STYLE_RANGES[foodBudgetStyle ?? 'mid_range'] ?? [150, 450]
    perMin = lo
    perMax = hi
    // A priceLevel that exists but has no mapped band still nudges us above a
    // pure style guess, but stays heuristic and capped at low confidence.
    confidence = 'low'
    basis = 'heuristic'
  }

  // Rough USD/EUR conversion if not INR (1 INR ≈ 0.012 USD).
  if (!isINR) {
    const factor = 0.012
    perMin = Math.max(1, Math.round(perMin * factor))
    perMax = Math.max(2, Math.round(perMax * factor))
  }

  const n = Math.max(1, travellerCount)
  return {
    perPersonMin: perMin,
    perPersonMax: perMax,
    min: perMin * n,
    max: perMax * n,
    confidence,
    basis,
  }
}

// ── Reason tag builder ─────────────────────────────────────────────────────

function buildReasonTags(
  rating: number | undefined,
  priceLevel: number | undefined,
  types: string[] | undefined,
  basis: 'google_price_level' | 'heuristic',
): string[] {
  const tags: string[] = ['Google-verified']
  if (rating != null) {
    if (rating >= 4.2) tags.push(`Highly rated (${rating}★)`)
    else if (rating >= 3.5) tags.push(`Well-rated (${rating}★)`)
  }
  if (basis === 'google_price_level' && priceLevel != null) {
    const priceTag = ['Free', 'Budget-friendly', 'Mid-range', 'Premium', 'Luxury'][priceLevel]
    if (priceTag) tags.push(priceTag)
  }
  if (types) {
    if (types.some((t) => t.includes('vegetarian'))) tags.push('Vegetarian-friendly')
    if (types.some((t) => t.includes('cafe') || t.includes('coffee'))) tags.push('Café')
    if (types.some((t) => t.includes('fast_food'))) tags.push('Quick service')
  }
  return tags
}

// ── Food search query builder ──────────────────────────────────────────────

function buildFoodSearchQuery(
  activityTitle: string,
  mealType: string | undefined,
  suggestedQuery: string | undefined,
  foodPreferences: FoodPreference[],
  destination: string,
): string {
  // Prefer the AI-supplied query if it looks food-specific.
  if (suggestedQuery && suggestedQuery.toLowerCase().includes('restaurant')) {
    return suggestedQuery
  }
  if (suggestedQuery && suggestedQuery.toLowerCase().includes('café')) {
    return suggestedQuery
  }

  const isCafe = mealType === 'cafe' || activityTitle.toLowerCase().includes('café') || activityTitle.toLowerCase().includes('cafe')
  const isVeg = foodPreferences.includes('vegetarian') || foodPreferences.includes('vegan') || foodPreferences.includes('jain')
  const isNonVeg = foodPreferences.includes('non_vegetarian')

  const foodType = isCafe
    ? 'café'
    : isVeg
      ? 'vegetarian restaurant'
      : isNonVeg
        ? 'restaurant'
        : 'restaurant'

  return `${foodType} ${destination}`
}

// ── Request / response shapes ──────────────────────────────────────────────

interface FoodActivity {
  dayIdx: number
  actIdx: number
  title: string
  mealType?: string
  suggestedPlaceSearchQuery?: string
  isBreak?: boolean
}

interface RequestBody {
  destination: string
  travellerCount: number
  currency: string
  foodPreferences?: FoodPreference[]
  foodBudgetStyle?: 'budget' | 'mid_range' | 'premium'
  /** Only food activities (category === 'food') should be included. */
  foodActivities: FoodActivity[]
}

export interface FoodEnrichmentPatch {
  dayIdx: number
  actIdx: number
  restaurantSuggestion: {
    placeId: string
    name: string
    address?: string
    rating?: number
    priceLevel?: number
    lat: number
    lng: number
  }
  estimatedSpendRange: { min: number; max: number; perPersonMin: number; perPersonMax: number }
  spendConfidence: 'low' | 'medium' | 'high'
  spendBasis: 'google_price_level' | 'heuristic'
  reasonTags: string[]
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isMapsAvailable()) {
    return NextResponse.json({ available: false, patches: [] }, { status: 200 })
  }

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const {
    destination = '',
    travellerCount = 1,
    currency = 'INR',
    foodPreferences = [],
    foodBudgetStyle,
    foodActivities = [],
  } = body

  if (!destination.trim()) {
    return NextResponse.json({ error: 'destination_required' }, { status: 400 })
  }

  // Cap to avoid abuse: maximum 12 food activities.
  const targets = foodActivities.slice(0, 12)

  const patches: FoodEnrichmentPatch[] = []
  // Deduplicate queries within a single request to save quota.
  const queryCache = new Map<string, Awaited<ReturnType<typeof searchPlaces>>>()

  for (const fa of targets) {
    const query = buildFoodSearchQuery(
      fa.title,
      fa.mealType,
      fa.suggestedPlaceSearchQuery,
      foodPreferences,
      destination,
    )

    let results = queryCache.get(query)
    if (!results) {
      try {
        results = await searchPlaces(query, { maxResults: 3 })
        queryCache.set(query, results)
      } catch {
        // Skip this activity on API failure — continue with others.
        continue
      }
    }

    const top = results[0]
    if (!top) continue

    const spend = estimateSpend(top.priceLevel, foodBudgetStyle, travellerCount, currency)
    const tags = buildReasonTags(top.rating, top.priceLevel, top.types, spend.basis)

    patches.push({
      dayIdx: fa.dayIdx,
      actIdx: fa.actIdx,
      restaurantSuggestion: {
        placeId: top.placeId,
        name: top.name,
        address: top.address || undefined,
        rating: top.rating,
        priceLevel: top.priceLevel,
        lat: top.lat,
        lng: top.lng,
      },
      estimatedSpendRange: {
        min: spend.min,
        max: spend.max,
        perPersonMin: spend.perPersonMin,
        perPersonMax: spend.perPersonMax,
      },
      spendConfidence: spend.confidence,
      spendBasis: spend.basis,
      reasonTags: tags,
    })
  }

  return NextResponse.json({ available: true, patches }, { status: 200 })
}
