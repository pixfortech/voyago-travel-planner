/**
 * POST /api/ai/enrich-food — Phase 16D (+ menu/review-aware refinement).
 *
 * Replaces generic AI-generated food breaks with real Google Places
 * restaurant/café suggestions, then estimates per-item food/drink prices using
 * a source hierarchy that prefers menu/website/review-derived clues over a flat
 * heuristic:
 *
 *   1. official_menu_or_website     — Place Details website/menu URL is STORED
 *                                     and surfaced as a link. We do NOT scrape
 *                                     it, so it never raises confidence above
 *                                     what we can confidently parse (none here).
 *   2. google_review_price_clues    — safe price signals scanned from review
 *                                     text snippets (e.g. "₹200", "1000 for two",
 *                                     "reasonable"). Estimates only — never quoted
 *                                     as current menu prices.
 *   3. google_price_level           — Google price level as a broad bucket.
 *   4. restaurant_type_city_heuristic — fallback from meal type + budget style.
 *
 * Place Details (website + reviews) is fetched for the SELECTED top candidate
 * only — never every search result — to control cost.
 *
 * No Google Maps HTML scraping. No Swiggy/Zomato scraping. Server-only — the
 * Maps key never leaves this module.
 */

import { NextRequest, NextResponse } from 'next/server'
import { searchPlaces, fetchPlaceDetails, isMapsAvailable } from '@/lib/maps/googleServer'
import type { FoodPreference, SuggestedFoodItem, SuggestedFoodItemBasis } from '@/types'

// ── Spend estimator ────────────────────────────────────────────────────────

type SpendBasis = 'google_price_level' | 'heuristic' | 'google_review_price_clues' | 'official_menu_or_website'

interface SpendRange {
  perPersonMin: number
  perPersonMax: number
  min: number
  max: number
  confidence: 'low' | 'medium' | 'high'
  basis: SpendBasis
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

const NON_INR_FACTOR = 0.012 // 1 INR ≈ 0.012 USD (rough)

// ── Review price-clue scanner ───────────────────────────────────────────────

interface ReviewClue {
  perPersonMin: number
  perPersonMax: number
  /** numeric = parsed amounts (medium); keyword_only = weak text signal (low). */
  kind: 'numeric' | 'keyword_only'
}

/**
 * Scan review text for SAFE price clues only. We read short snippets internally,
 * never display long review text, and never treat the result as confirmed
 * current menu pricing. Returns per-person INR band, or null when no clue.
 */
function scanReviewPriceClues(reviews: Array<{ text: string }> | undefined): ReviewClue | null {
  if (!reviews || reviews.length === 0) return null
  const amounts: number[] = [] // per-person rupee amounts
  let keyword: 'cheap' | 'mid' | 'expensive' | null = null

  for (const r of reviews) {
    const text = (r.text || '').slice(0, 600).toLowerCase() // small snippet only
    if (!text) continue

    // "₹1000 for two" / "1000 for couple" → per person = /2.
    for (const m of Array.from(text.matchAll(/(?:₹|rs\.?|inr)?\s?(\d{2,5})\s*(?:\/-)?\s*(?:for two|for 2|for couple)/g))) {
      const v = parseInt(m[1]!, 10)
      if (v >= 50 && v <= 100000) amounts.push(Math.round(v / 2))
    }
    // "₹300 per person" / "300 pp" / "300 each"
    for (const m of Array.from(text.matchAll(/(?:₹|rs\.?|inr)?\s?(\d{2,5})\s*(?:\/-)?\s*(?:per person|per head|pp|each)/g))) {
      const v = parseInt(m[1]!, 10)
      if (v >= 30 && v <= 50000) amounts.push(v)
    }
    // Bare currency-tagged amounts "₹200", "Rs 500".
    for (const m of Array.from(text.matchAll(/(?:₹|rs\.?|inr)\s?(\d{2,5})/g))) {
      const v = parseInt(m[1]!, 10)
      if (v >= 30 && v <= 5000) amounts.push(v)
    }

    // Keyword signals (weak).
    if (/\b(expensive|pricey|costly|overpriced)\b/.test(text)) keyword = 'expensive'
    else if (/\b(reasonable|affordable|value for money|worth it)\b/.test(text) && keyword !== 'expensive') keyword = 'mid'
    else if (/\b(cheap|budget|inexpensive|pocket friendly|pocket-friendly)\b/.test(text) && !keyword) keyword = 'cheap'
  }

  if (amounts.length >= 2) {
    amounts.sort((a, b) => a - b)
    const lo = amounts[Math.floor(amounts.length * 0.2)]!
    const hi = amounts[Math.floor(amounts.length * 0.8)]!
    return { perPersonMin: Math.min(lo, hi), perPersonMax: Math.max(lo, hi), kind: 'numeric' }
  }
  if (amounts.length === 1) {
    const v = amounts[0]!
    return { perPersonMin: Math.round(v * 0.7), perPersonMax: Math.round(v * 1.4), kind: 'numeric' }
  }
  if (keyword) {
    const band = keyword === 'expensive' ? [600, 1600] : keyword === 'cheap' ? [80, 250] : [200, 550]
    return { perPersonMin: band[0]!, perPersonMax: band[1]!, kind: 'keyword_only' }
  }
  return null
}

/**
 * Resolve a per-person spend band using the source hierarchy. Confidence is
 * deliberately conservative — most estimates stay medium or low.
 */
function estimateSpend(
  priceLevel: number | undefined,
  foodBudgetStyle: string | undefined,
  travellerCount: number,
  currency: string,
  reviewClue: ReviewClue | null,
): SpendRange {
  let perMin: number
  let perMax: number
  let confidence: 'low' | 'medium' | 'high'
  let basis: SpendBasis

  if (reviewClue && reviewClue.kind === 'numeric') {
    // Numeric review clues — medium confidence (estimate, not confirmed menu).
    perMin = reviewClue.perPersonMin
    perMax = reviewClue.perPersonMax
    confidence = 'medium'
    basis = 'google_review_price_clues'
  } else if (priceLevel != null && PRICE_LEVEL_RANGES[priceLevel]) {
    // Google price level — broad bucket, medium confidence.
    ;[perMin, perMax] = PRICE_LEVEL_RANGES[priceLevel]!
    confidence = 'medium'
    basis = 'google_price_level'
  } else if (reviewClue && reviewClue.kind === 'keyword_only') {
    // Weak review text only — low confidence.
    perMin = reviewClue.perPersonMin
    perMax = reviewClue.perPersonMax
    confidence = 'low'
    basis = 'google_review_price_clues'
  } else {
    // Pure heuristic — low confidence.
    const [lo, hi] = STYLE_RANGES[foodBudgetStyle ?? 'mid_range'] ?? [150, 450]
    perMin = lo
    perMax = hi
    confidence = 'low'
    basis = 'heuristic'
  }

  if (currency !== 'INR') {
    perMin = Math.max(1, Math.round(perMin * NON_INR_FACTOR))
    perMax = Math.max(2, Math.round(perMax * NON_INR_FACTOR))
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

// ── Suggested-item builder ──────────────────────────────────────────────────

interface ItemTemplate {
  name: string
  category: SuggestedFoodItem['category']
  vegType: NonNullable<SuggestedFoodItem['vegType']>
  /** Fraction of a per-person meal this item represents (shares ≈ sum to 1). */
  share: number
}

const VEG_LABEL = (vegan: boolean) => (vegan ? 'Vegan' : 'Vegetarian')

function templatesFor(
  mealType: string | undefined,
  wantVeg: boolean,
  wantNonVeg: boolean,
  vegan: boolean,
): ItemTemplate[] {
  const vegType: NonNullable<SuggestedFoodItem['vegType']> = vegan ? 'vegan' : 'veg'
  const vlabel = VEG_LABEL(vegan)
  // No explicit preference → show a general set marked unknown.
  const neutral = !wantVeg && !wantNonVeg

  if (mealType === 'cafe') {
    const items: ItemTemplate[] = [
      { name: 'Coffee / beverage', category: 'drink', vegType: neutral ? 'unknown' : vegType, share: 0.45 },
      { name: 'Cake / dessert', category: 'dessert', vegType: neutral ? 'unknown' : vegType, share: 0.3 },
      { name: 'Sandwich / light bite', category: 'food', vegType: neutral ? 'unknown' : vegType, share: 0.25 },
    ]
    return items
  }

  if (mealType === 'breakfast') {
    const out: ItemTemplate[] = []
    if (wantNonVeg) out.push({ name: 'Egg / non-veg breakfast', category: 'food', vegType: 'non_veg', share: 0.65 })
    if (wantVeg || neutral) out.push({ name: `${neutral ? 'Breakfast plate' : `${vlabel} breakfast plate`}`, category: 'food', vegType: neutral ? 'unknown' : vegType, share: 0.65 })
    out.push({ name: 'Tea / coffee', category: 'drink', vegType: neutral ? 'unknown' : 'veg', share: 0.35 })
    return out
  }

  if (mealType === 'snack') {
    return [
      { name: neutral ? 'Local snack plate' : wantNonVeg && !wantVeg ? 'Non-veg snack plate' : `${vlabel} snack plate`, category: 'snack', vegType: neutral ? 'unknown' : wantNonVeg && !wantVeg ? 'non_veg' : vegType, share: 0.65 },
      { name: 'Beverage', category: 'drink', vegType: neutral ? 'unknown' : 'veg', share: 0.35 },
    ]
  }

  // Default: lunch / dinner / generic meal.
  const out: ItemTemplate[] = []
  if (wantVeg || neutral) out.push({ name: neutral ? 'Main course' : `${vlabel} main course`, category: 'food', vegType: neutral ? 'unknown' : vegType, share: 0.55 })
  if (wantNonVeg) out.push({ name: 'Non-veg main course', category: 'food', vegType: 'non_veg', share: 0.55 })
  out.push({ name: 'Bread / rice', category: 'food', vegType: neutral ? 'unknown' : 'veg', share: 0.2 })
  out.push({ name: 'Beverage / lassi', category: 'drink', vegType: neutral ? 'unknown' : 'veg', share: 0.25 })
  return out
}

const SOURCE_NOTE: Record<SuggestedFoodItemBasis, string> = {
  official_menu_or_website: 'Estimated from official menu/website where available.',
  google_review_price_clues: 'Estimated from review price clues; menu price not confirmed.',
  google_price_level: 'Estimated from Google price level and restaurant type.',
  restaurant_type_city_heuristic: 'Heuristic estimate only.',
  user_entered: 'Entered by you.',
  unknown: 'Estimate only.',
}

function spendBasisToItemBasis(b: SpendBasis): SuggestedFoodItemBasis {
  if (b === 'google_review_price_clues') return 'google_review_price_clues'
  if (b === 'google_price_level') return 'google_price_level'
  if (b === 'official_menu_or_website') return 'official_menu_or_website'
  return 'restaurant_type_city_heuristic'
}

function buildSuggestedItems(
  mealType: string | undefined,
  foodPreferences: FoodPreference[],
  spend: SpendRange,
  currency: string,
): SuggestedFoodItem[] {
  const wantVeg = foodPreferences.includes('vegetarian') || foodPreferences.includes('jain') || foodPreferences.includes('vegan')
  const wantNonVeg = foodPreferences.includes('non_vegetarian')
  const vegan = foodPreferences.includes('vegan') && !foodPreferences.includes('vegetarian')

  const templates = templatesFor(mealType, wantVeg, wantNonVeg, vegan)
  const itemBasis = spendBasisToItemBasis(spend.basis)
  const note = SOURCE_NOTE[itemBasis]

  return templates.map((t) => {
    const min = Math.max(1, Math.round(spend.perPersonMin * t.share))
    const max = Math.max(min + 1, Math.round(spend.perPersonMax * t.share))
    return {
      name: t.name,
      category: t.category,
      vegType: t.vegType,
      estimatedPriceMin: min,
      estimatedPriceMax: max,
      currency,
      confidence: spend.confidence,
      basis: itemBasis,
      sourceNote: note,
    }
  })
}

// ── Reason tag builder ─────────────────────────────────────────────────────

function buildReasonTags(
  rating: number | undefined,
  priceLevel: number | undefined,
  types: string[] | undefined,
  basis: SpendBasis,
): string[] {
  const tags: string[] = ['Google-verified']
  if (rating != null) {
    if (rating >= 4.2) tags.push(`Highly rated (${rating}★)`)
    else if (rating >= 3.5) tags.push(`Well-rated (${rating}★)`)
  }
  if (basis === 'google_review_price_clues') tags.push('Review-based estimate')
  else if (basis === 'google_price_level' && priceLevel != null) {
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
  if (suggestedQuery && suggestedQuery.toLowerCase().includes('restaurant')) return suggestedQuery
  if (suggestedQuery && suggestedQuery.toLowerCase().includes('café')) return suggestedQuery

  const isCafe = mealType === 'cafe' || activityTitle.toLowerCase().includes('café') || activityTitle.toLowerCase().includes('cafe')
  const isVeg = foodPreferences.includes('vegetarian') || foodPreferences.includes('vegan') || foodPreferences.includes('jain')
  const isNonVeg = foodPreferences.includes('non_vegetarian')

  const foodType = isCafe ? 'café' : isVeg ? 'vegetarian restaurant' : isNonVeg ? 'restaurant' : 'restaurant'
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
  spendBasis: SpendBasis
  reasonTags: string[]
  /** Per-item price estimates with explicit source + confidence. */
  suggestedItems: SuggestedFoodItem[]
  /** Menu/website URL from Place Details (never scraped). */
  menuSourceUrl?: string
  menuSourceType?: 'google_place_website' | 'google_place_menu' | 'unknown'
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
  // Cache Place Details per placeId so repeated picks don't re-fetch.
  const detailsCache = new Map<string, Awaited<ReturnType<typeof fetchPlaceDetails>>>()

  for (const fa of targets) {
    const query = buildFoodSearchQuery(fa.title, fa.mealType, fa.suggestedPlaceSearchQuery, foodPreferences, destination)

    let results = queryCache.get(query)
    if (!results) {
      try {
        results = await searchPlaces(query, { maxResults: 3 })
        queryCache.set(query, results)
      } catch {
        continue // skip this activity on API failure — continue with others
      }
    }

    const top = results[0]
    if (!top) continue

    // Fetch Place Details for the SELECTED top candidate only (website + reviews).
    let details = detailsCache.get(top.placeId)
    if (details === undefined) {
      details = await fetchPlaceDetails(top.placeId) // fails soft → null
      detailsCache.set(top.placeId, details)
    }

    const reviewClue = scanReviewPriceClues(details?.reviews)
    const priceLevel = details?.priceLevel ?? top.priceLevel
    const spend = estimateSpend(priceLevel, foodBudgetStyle, travellerCount, currency, reviewClue)
    const tags = buildReasonTags(details?.rating ?? top.rating, priceLevel, details?.types ?? top.types, spend.basis)
    const suggestedItems = buildSuggestedItems(fa.mealType, foodPreferences, spend, currency)

    const menuSourceUrl = details?.websiteUri
    const menuSourceType: FoodEnrichmentPatch['menuSourceType'] | undefined = menuSourceUrl
      ? 'google_place_website'
      : undefined

    patches.push({
      dayIdx: fa.dayIdx,
      actIdx: fa.actIdx,
      restaurantSuggestion: {
        placeId: top.placeId,
        name: details?.name ?? top.name,
        address: (details?.address ?? top.address) || undefined,
        rating: details?.rating ?? top.rating,
        priceLevel,
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
      suggestedItems,
      ...(menuSourceUrl ? { menuSourceUrl, menuSourceType } : {}),
    })
  }

  return NextResponse.json({ available: true, patches }, { status: 200 })
}
