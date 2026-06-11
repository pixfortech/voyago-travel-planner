/**
 * POST /api/ai/enrich-food — Phase 16D (+ menu/review-aware refinement + hotfix).
 *
 * Replaces generic AI-generated food breaks with real Google Places
 * restaurant/café suggestions, then estimates per-item food/drink prices using
 * a source hierarchy that prefers menu/website/review-derived clues over a flat
 * heuristic:
 *
 *   1. official_menu_or_website     — Place Details website/menu URL is STORED
 *                                     and surfaced as a link. We do NOT scrape it.
 *   2. google_review_item_mentions  — dish names found in review text snippets.
 *   3. google_review_price_clues    — price signals from review text.
 *   4. google_price_level           — Google price level as a broad bucket.
 *   5. restaurant_type_city_heuristic — fallback from meal type + budget style.
 *
 * Hotfix additions:
 *   - Locale-aware dish templates (NE India, Bengali, South Indian, etc.)
 *   - Dietary correctness: pure-veg restaurants never show non-veg items
 *   - Score-based restaurant candidate selection (rating + reviews + dietary match)
 *
 * No Google Maps HTML scraping. No Swiggy/Zomato scraping. Server-only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { searchPlaces, fetchPlaceDetails, isMapsAvailable } from '@/lib/maps/googleServer'
import type { FoodPreference, SuggestedFoodItem, SuggestedFoodItemBasis } from '@/types'
import type { PlaceSearchResult } from '@/types'

// ── Dietary profile detection ───────────────────────────────────────────────

type DietaryProfile = 'pure_veg' | 'mixed' | 'non_veg_friendly' | 'cafe' | 'dessert' | 'unknown'

/**
 * Detect the dietary profile of a restaurant from its name + Google place types.
 * Used for candidate scoring and to prevent pure-veg places from showing non-veg items.
 */
function detectDietaryProfile(name: string, types?: string[]): DietaryProfile {
  const n = name.toLowerCase()
  const t = (types ?? []).map((x) => x.toLowerCase())

  // Pure-veg signals (highest priority)
  if (
    /\bpure\s*veg\b|\bpurely\s*veg\b|\b100\s*%\s*veg\b|\bveg\s+(restaurant|dhaba|thali|bhojan|hotel|bhojnalaya)\b|\bsattvic\b|\bjain\s+(food|bhojan|restaurant)\b/.test(n) ||
    t.includes('vegetarian_restaurant')
  ) {
    return 'pure_veg'
  }

  // Café/coffee shop
  if (t.some((x) => x.includes('cafe') || x.includes('coffee_shop'))) return 'cafe'
  if (/\b(café|cafe|coffee|bakery|patisserie|tea\s*house)\b/.test(n)) return 'cafe'

  // Dessert / sweet shop
  if (t.some((x) => x.includes('dessert') || x.includes('ice_cream') || x.includes('confectionery'))) return 'dessert'
  if (/\b(sweets?|mithai|halwai|mishtan|cake\s*shop|ice.?cream|confectionery)\b/.test(n)) return 'dessert'

  // Non-veg friendly
  if (/\b(non.?veg|chicken|mutton|fish|seafood|bbq|grill|kebab|meat|biryani.*house|mughlai|coastal\s+seafood)\b/.test(n)) return 'non_veg_friendly'

  return 'mixed'
}

// ── Cuisine region detection ────────────────────────────────────────────────

type CuisineRegion = 'ne_india' | 'bengali' | 'south_indian' | 'north_indian' | 'rajasthani' | 'goan' | 'mumbai' | 'generic'

function detectCuisineRegion(destination: string): CuisineRegion {
  const d = destination.toLowerCase()

  // NE India / Himalayan
  if (/gangtok|sikkim|darjeeling|kalimpong|mirik|pelling|yuksom|lachung|lachen|namchi|ravangla|tashiling|kurseong|siliguri/.test(d)) return 'ne_india'
  if (/guwahati|shillong|kaziranga|cherrapunji|itanagar|imphal|aizawl|kohima|agartala/.test(d)) return 'ne_india'

  // Bengali cities
  if (/kolkata|howrah|durgapur|asansol|bankura|shantiniketan|bishnupur|burdwan/.test(d)) return 'bengali'

  // South Indian cities
  if (/bangalore|bengaluru|chennai|hyderabad|kochi|cochin|mysore|coimbatore|trivandrum|thiruvananthapuram|madurai|pondicherry|vijayawada/.test(d)) return 'south_indian'
  if (/kerala|karnataka|tamil\s*nadu|telangana|andhra/.test(d)) return 'south_indian'

  // Goa
  if (/\bgoa\b|panaji|mapusa|margao|vasco|calangute|anjuna/.test(d)) return 'goan'

  // Rajasthan
  if (/jaipur|udaipur|jodhpur|jaisalmer|pushkar|ajmer|bikaner|kota|chittorgarh/.test(d)) return 'rajasthani'

  // North Indian / Delhi / UP / Punjab
  if (/delhi|agra|lucknow|amritsar|chandigarh|varanasi|mathura|vrindavan|rishikesh|haridwar|mussoorie|shimla/.test(d)) return 'north_indian'

  // Mumbai / Maharashtra
  if (/mumbai|pune|nashik|aurangabad|lonavala|mahabaleshwar/.test(d)) return 'mumbai'

  return 'generic'
}

// ── Review item mention scanner ─────────────────────────────────────────────

interface DishMeta {
  patterns: string[]
  name: string
  vegType: 'veg' | 'non_veg' | 'vegan' | 'unknown'
  category: SuggestedFoodItem['category']
  region?: CuisineRegion | CuisineRegion[]
}

const DISH_KEYWORDS: DishMeta[] = [
  // NE India / Himalayan
  { patterns: ['momo', 'momos'], name: 'Momo', vegType: 'unknown', category: 'snack', region: 'ne_india' },
  { patterns: ['thukpa', 'thenthuk'], name: 'Thukpa noodle soup', vegType: 'unknown', category: 'food', region: 'ne_india' },
  { patterns: ['wai wai', 'wai-wai'], name: 'Wai Wai noodles', vegType: 'veg', category: 'snack', region: 'ne_india' },
  { patterns: ['chow mein', 'chowmein'], name: 'Chow mein', vegType: 'unknown', category: 'food', region: 'ne_india' },
  { patterns: ['gundruk'], name: 'Gundruk soup', vegType: 'veg', category: 'food', region: 'ne_india' },
  { patterns: ['sha phaley', 'shaphaley'], name: 'Sha Phaley', vegType: 'non_veg', category: 'snack', region: 'ne_india' },
  { patterns: ['tongba'], name: 'Tongba (millet drink)', vegType: 'veg', category: 'drink', region: 'ne_india' },
  // Bengali
  { patterns: ['rosogolla', 'rasgulla', 'rossogolla'], name: 'Rosogolla', vegType: 'veg', category: 'dessert', region: 'bengali' },
  { patterns: ['sandesh'], name: 'Sandesh', vegType: 'veg', category: 'dessert', region: 'bengali' },
  { patterns: ['mishti doi', 'mishti dahi'], name: 'Mishti Doi', vegType: 'veg', category: 'dessert', region: 'bengali' },
  { patterns: ['macher jhol', 'fish curry'], name: 'Macher Jhol (fish curry)', vegType: 'non_veg', category: 'food', region: 'bengali' },
  { patterns: ['kosha mangsho'], name: 'Kosha Mangsho', vegType: 'non_veg', category: 'food', region: 'bengali' },
  { patterns: ['luchi'], name: 'Luchi with sabzi', vegType: 'veg', category: 'food', region: 'bengali' },
  { patterns: ['kathi roll', 'kati roll'], name: 'Kathi Roll', vegType: 'unknown', category: 'snack', region: 'bengali' },
  // South Indian
  { patterns: ['masala dosa', 'dosa', 'dosai'], name: 'Masala Dosa', vegType: 'veg', category: 'food', region: 'south_indian' },
  { patterns: ['idli', 'idly'], name: 'Idli', vegType: 'veg', category: 'food', region: 'south_indian' },
  { patterns: ['medu vada', 'vada'], name: 'Medu Vada', vegType: 'veg', category: 'snack', region: 'south_indian' },
  { patterns: ['uttapam'], name: 'Uttapam', vegType: 'veg', category: 'food', region: 'south_indian' },
  { patterns: ['appam'], name: 'Appam with stew', vegType: 'unknown', category: 'food', region: 'south_indian' },
  { patterns: ['fish fry', 'fish curry rice'], name: 'Fish curry rice', vegType: 'non_veg', category: 'food', region: ['south_indian', 'goan'] },
  // Goan
  { patterns: ['prawn', 'prawns', 'prawn curry'], name: 'Prawn curry', vegType: 'non_veg', category: 'food', region: 'goan' },
  { patterns: ['goan fish curry'], name: 'Goan fish curry', vegType: 'non_veg', category: 'food', region: 'goan' },
  { patterns: ['bebinca'], name: 'Bebinca dessert', vegType: 'veg', category: 'dessert', region: 'goan' },
  // Rajasthan
  { patterns: ['dal bati', 'dal baati', 'dal bati churma'], name: 'Dal Baati Churma', vegType: 'veg', category: 'food', region: 'rajasthani' },
  { patterns: ['laal maas', 'lal maas'], name: 'Laal Maas', vegType: 'non_veg', category: 'food', region: 'rajasthani' },
  { patterns: ['kachori', 'pyaaz kachori'], name: 'Pyaaz Kachori', vegType: 'veg', category: 'snack', region: 'rajasthani' },
  { patterns: ['ghewar'], name: 'Ghewar', vegType: 'veg', category: 'dessert', region: 'rajasthani' },
  // North Indian
  { patterns: ['butter chicken', 'murgh makhani'], name: 'Butter Chicken', vegType: 'non_veg', category: 'food', region: 'north_indian' },
  { patterns: ['dal makhani', 'dal makhni'], name: 'Dal Makhani', vegType: 'veg', category: 'food', region: 'north_indian' },
  { patterns: ['chole bhature', 'chhole bhature'], name: 'Chole Bhature', vegType: 'veg', category: 'food', region: 'north_indian' },
  { patterns: ['rajma chawal', 'rajma rice'], name: 'Rajma Chawal', vegType: 'veg', category: 'food', region: 'north_indian' },
  // Mumbai / pan-Indian
  { patterns: ['vada pav', 'vada-pav'], name: 'Vada Pav', vegType: 'veg', category: 'snack', region: 'mumbai' },
  { patterns: ['pav bhaji'], name: 'Pav Bhaji', vegType: 'veg', category: 'food', region: 'mumbai' },
  { patterns: ['misal pav'], name: 'Misal Pav', vegType: 'veg', category: 'food', region: 'mumbai' },
  // Pan-Indian
  { patterns: ['biryani'], name: 'Biryani', vegType: 'non_veg', category: 'food' },
  { patterns: ['veg biryani', 'vegetable biryani'], name: 'Veg Biryani', vegType: 'veg', category: 'food' },
  { patterns: ['paneer'], name: 'Paneer dish', vegType: 'veg', category: 'food' },
  { patterns: ['thali'], name: 'Thali', vegType: 'veg', category: 'food' },
  { patterns: ['naan', 'garlic naan'], name: 'Garlic Naan', vegType: 'veg', category: 'food' },
  { patterns: ['paratha', 'aloo paratha'], name: 'Aloo Paratha', vegType: 'veg', category: 'food' },
  { patterns: ['samosa'], name: 'Samosa', vegType: 'veg', category: 'snack' },
  // Drinks
  { patterns: ['masala chai', 'masala tea', 'cutting chai'], name: 'Masala Chai', vegType: 'veg', category: 'drink' },
  { patterns: ['lassi'], name: 'Lassi', vegType: 'veg', category: 'drink' },
  { patterns: ['fresh juice', 'sugarcane juice'], name: 'Fresh juice', vegType: 'vegan', category: 'drink' },
  { patterns: ['cold coffee', 'iced coffee'], name: 'Cold coffee', vegType: 'veg', category: 'drink' },
  // Desserts
  { patterns: ['gulab jamun'], name: 'Gulab Jamun', vegType: 'veg', category: 'dessert' },
  { patterns: ['kulfi'], name: 'Kulfi', vegType: 'veg', category: 'dessert' },
  { patterns: ['jalebi'], name: 'Jalebi', vegType: 'veg', category: 'dessert' },
  { patterns: ['halwa'], name: 'Halwa', vegType: 'veg', category: 'dessert' },
  { patterns: ['ice cream'], name: 'Ice cream', vegType: 'veg', category: 'dessert' },
]

interface ReviewItemMention {
  name: string
  vegType: 'veg' | 'non_veg' | 'vegan' | 'unknown'
  category: SuggestedFoodItem['category']
  popularityHint: NonNullable<SuggestedFoodItem['popularityHint']>
  count: number
}

/**
 * Scan review text for dish name mentions and popularity signals.
 * Returns a ranked list of mentioned dishes — never displays raw review text to the user.
 */
function scanReviewItemMentions(
  reviews: Array<{ text: string }> | undefined,
  cuisineRegion: CuisineRegion,
): ReviewItemMention[] {
  if (!reviews || reviews.length === 0) return []

  const counts = new Map<string, ReviewItemMention>()

  for (const r of reviews) {
    const text = (r.text || '').slice(0, 600).toLowerCase()
    if (!text) continue

    // Popularity signals in this review
    const isBestSeller = /\b(best|must\s*try|famous\s*for|signature|specialty|specialty dish|their\s+\w+\s+is\s+amazing)\b/.test(text)
    const isPopular = /\b(popular|everyone\s+orders?|most\s+order|all\s+order)\b/.test(text)
    const isRecommended = /\b(recommend|try\s+the|go\s+for\s+the|order\s+the|best\s+here)\b/.test(text)

    for (const dish of DISH_KEYWORDS) {
      // Region filter — only match if dish is global or matches current region
      if (dish.region) {
        const regions = Array.isArray(dish.region) ? dish.region : [dish.region]
        if (!regions.includes(cuisineRegion) && cuisineRegion !== 'generic') continue
      }
      const matches = dish.patterns.some((pat) => text.includes(pat))
      if (!matches) continue

      const existing = counts.get(dish.name)
      const hint: NonNullable<SuggestedFoodItem['popularityHint']> = isBestSeller
        ? 'best_seller'
        : isPopular
          ? 'popular'
          : isRecommended
            ? 'recommended'
            : 'often_mentioned'

      if (existing) {
        existing.count++
        // Escalate popularity hint
        if (hint === 'best_seller' || (hint === 'popular' && existing.popularityHint === 'recommended')) {
          existing.popularityHint = hint
        }
      } else {
        counts.set(dish.name, {
          name: dish.name,
          vegType: dish.vegType,
          category: dish.category,
          popularityHint: hint,
          count: 1,
        })
      }
    }
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
}

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

const PRICE_LEVEL_RANGES: Record<number, [number, number]> = {
  1: [80, 220],
  2: [200, 550],
  3: [500, 1400],
  4: [1400, 4000],
}

const STYLE_RANGES: Record<string, [number, number]> = {
  budget: [80, 250],
  mid_range: [200, 600],
  premium: [550, 2000],
}

const NON_INR_FACTOR = 0.012

interface ReviewClue {
  perPersonMin: number
  perPersonMax: number
  kind: 'numeric' | 'keyword_only'
}

function scanReviewPriceClues(reviews: Array<{ text: string }> | undefined): ReviewClue | null {
  if (!reviews || reviews.length === 0) return null
  const amounts: number[] = []
  let keyword: 'cheap' | 'mid' | 'expensive' | null = null

  for (const r of reviews) {
    const text = (r.text || '').slice(0, 600).toLowerCase()
    if (!text) continue

    for (const m of Array.from(text.matchAll(/(?:₹|rs\.?|inr)?\s?(\d{2,5})\s*(?:\/-)?\s*(?:for two|for 2|for couple)/g))) {
      const v = parseInt(m[1]!, 10)
      if (v >= 50 && v <= 100000) amounts.push(Math.round(v / 2))
    }
    for (const m of Array.from(text.matchAll(/(?:₹|rs\.?|inr)?\s?(\d{2,5})\s*(?:\/-)?\s*(?:per person|per head|pp|each)/g))) {
      const v = parseInt(m[1]!, 10)
      if (v >= 30 && v <= 50000) amounts.push(v)
    }
    for (const m of Array.from(text.matchAll(/(?:₹|rs\.?|inr)\s?(\d{2,5})/g))) {
      const v = parseInt(m[1]!, 10)
      if (v >= 30 && v <= 5000) amounts.push(v)
    }

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
    perMin = reviewClue.perPersonMin
    perMax = reviewClue.perPersonMax
    confidence = 'medium'
    basis = 'google_review_price_clues'
  } else if (priceLevel != null && PRICE_LEVEL_RANGES[priceLevel]) {
    ;[perMin, perMax] = PRICE_LEVEL_RANGES[priceLevel]!
    confidence = 'medium'
    basis = 'google_price_level'
  } else if (reviewClue && reviewClue.kind === 'keyword_only') {
    perMin = reviewClue.perPersonMin
    perMax = reviewClue.perPersonMax
    confidence = 'low'
    basis = 'google_review_price_clues'
  } else {
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
  return { perPersonMin: perMin, perPersonMax: perMax, min: perMin * n, max: perMax * n, confidence, basis }
}

// ── Suggested-item builder ──────────────────────────────────────────────────

interface ItemTemplate {
  name: string
  category: SuggestedFoodItem['category']
  vegType: NonNullable<SuggestedFoodItem['vegType']>
  share: number
}

const VEG_LABEL = (vegan: boolean) => (vegan ? 'Vegan' : 'Vegetarian')

/** Locale-aware fallback templates when no review mentions are available. */
function localeTemplatesFor(
  mealType: string | undefined,
  region: CuisineRegion,
  wantVeg: boolean,
  wantNonVeg: boolean,
  vegan: boolean,
): ItemTemplate[] {
  const vegType: NonNullable<SuggestedFoodItem['vegType']> = vegan ? 'vegan' : 'veg'
  const neutral = !wantVeg && !wantNonVeg

  // Café: always generic
  if (mealType === 'cafe') {
    return [
      { name: 'Coffee / beverage', category: 'drink', vegType: neutral ? 'unknown' : vegType, share: 0.45 },
      { name: 'Cake / dessert', category: 'dessert', vegType: neutral ? 'unknown' : vegType, share: 0.3 },
      { name: 'Sandwich / light bite', category: 'food', vegType: neutral ? 'unknown' : vegType, share: 0.25 },
    ]
  }

  // Breakfast
  if (mealType === 'breakfast') {
    if (region === 'ne_india') {
      const out: ItemTemplate[] = []
      if (wantNonVeg) out.push({ name: 'Egg momo / egg paratha', category: 'food', vegType: 'non_veg', share: 0.65 })
      if (wantVeg || neutral) out.push({ name: neutral ? 'Momo / paratha' : `${VEG_LABEL(vegan)} momo / bread`, category: 'food', vegType: neutral ? 'unknown' : vegType, share: 0.65 })
      out.push({ name: 'Masala chai / tongba', category: 'drink', vegType: 'veg', share: 0.35 })
      return out
    }
    if (region === 'south_indian') {
      const out: ItemTemplate[] = []
      if (wantNonVeg) out.push({ name: 'Egg dosa / omelette', category: 'food', vegType: 'non_veg', share: 0.65 })
      if (wantVeg || neutral) out.push({ name: 'Idli / Dosa with sambhar', category: 'food', vegType: 'veg', share: 0.65 })
      out.push({ name: 'Filter coffee / tea', category: 'drink', vegType: 'veg', share: 0.35 })
      return out
    }
    if (region === 'bengali') {
      const out: ItemTemplate[] = []
      if (wantVeg || neutral) out.push({ name: 'Luchi with sabzi / Paratha', category: 'food', vegType: 'veg', share: 0.65 })
      if (wantNonVeg) out.push({ name: 'Egg roll / egg paratha', category: 'food', vegType: 'non_veg', share: 0.65 })
      out.push({ name: 'Masala chai', category: 'drink', vegType: 'veg', share: 0.35 })
      return out
    }
    // Generic / North Indian
    const out: ItemTemplate[] = []
    if (wantNonVeg) out.push({ name: 'Egg / non-veg breakfast', category: 'food', vegType: 'non_veg', share: 0.65 })
    if (wantVeg || neutral) out.push({ name: neutral ? 'Breakfast plate' : `${VEG_LABEL(vegan)} breakfast plate`, category: 'food', vegType: neutral ? 'unknown' : vegType, share: 0.65 })
    out.push({ name: 'Tea / coffee', category: 'drink', vegType: neutral ? 'unknown' : 'veg', share: 0.35 })
    return out
  }

  // Snack
  if (mealType === 'snack') {
    if (region === 'ne_india') {
      return [
        { name: neutral ? 'Momo / snack' : wantNonVeg && !wantVeg ? 'Non-veg momo' : 'Veg momo', category: 'snack', vegType: neutral ? 'unknown' : wantNonVeg && !wantVeg ? 'non_veg' : vegType, share: 0.65 },
        { name: 'Masala chai / Wai Wai', category: 'drink', vegType: 'veg', share: 0.35 },
      ]
    }
    if (region === 'bengali') {
      return [
        { name: neutral ? 'Kathi Roll / snack' : wantNonVeg ? 'Non-veg Kathi Roll' : 'Veg snack plate', category: 'snack', vegType: neutral ? 'unknown' : wantNonVeg ? 'non_veg' : vegType, share: 0.65 },
        { name: 'Lassi / tea', category: 'drink', vegType: 'veg', share: 0.35 },
      ]
    }
    if (region === 'rajasthani') {
      return [
        { name: 'Pyaaz Kachori / samosa', category: 'snack', vegType: 'veg', share: 0.65 },
        { name: 'Masala chai', category: 'drink', vegType: 'veg', share: 0.35 },
      ]
    }
    return [
      { name: neutral ? 'Local snack plate' : wantNonVeg && !wantVeg ? 'Non-veg snack plate' : `${VEG_LABEL(vegan)} snack plate`, category: 'snack', vegType: neutral ? 'unknown' : wantNonVeg && !wantVeg ? 'non_veg' : vegType, share: 0.65 },
      { name: 'Beverage', category: 'drink', vegType: neutral ? 'unknown' : 'veg', share: 0.35 },
    ]
  }

  // Lunch / dinner / generic meal
  if (region === 'ne_india') {
    const out: ItemTemplate[] = []
    if (wantVeg || neutral) out.push({ name: neutral ? 'Rice plate / momo' : 'Veg momo / thali', category: 'food', vegType: neutral ? 'unknown' : vegType, share: 0.55 })
    if (wantNonVeg) out.push({ name: 'Non-veg momo / thukpa', category: 'food', vegType: 'non_veg', share: 0.55 })
    out.push({ name: 'Masala chai / Wai Wai', category: 'drink', vegType: 'veg', share: 0.25 })
    out.push({ name: 'Fried rice / chow mein', category: 'food', vegType: neutral ? 'unknown' : 'veg', share: 0.2 })
    return out
  }
  if (region === 'bengali') {
    const out: ItemTemplate[] = []
    if (wantVeg || neutral) out.push({ name: neutral ? 'Bengali thali' : 'Veg Bengali thali', category: 'food', vegType: neutral ? 'unknown' : vegType, share: 0.55 })
    if (wantNonVeg) out.push({ name: 'Macher jhol / kosha mangsho', category: 'food', vegType: 'non_veg', share: 0.55 })
    out.push({ name: 'Rosogolla / mishti doi', category: 'dessert', vegType: 'veg', share: 0.2 })
    out.push({ name: 'Lassi / mishti', category: 'drink', vegType: 'veg', share: 0.25 })
    return out
  }
  if (region === 'south_indian') {
    const out: ItemTemplate[] = []
    if (wantVeg || neutral) out.push({ name: neutral ? 'South Indian thali / dosa' : 'Veg thali / dosa', category: 'food', vegType: neutral ? 'unknown' : vegType, share: 0.55 })
    if (wantNonVeg) out.push({ name: 'Chicken / fish curry rice', category: 'food', vegType: 'non_veg', share: 0.55 })
    out.push({ name: 'Sambhar / rasam', category: 'food', vegType: 'veg', share: 0.15 })
    out.push({ name: 'Filter coffee / buttermilk', category: 'drink', vegType: 'veg', share: 0.3 })
    return out
  }
  if (region === 'rajasthani') {
    const out: ItemTemplate[] = []
    if (wantVeg || neutral) out.push({ name: neutral ? 'Dal Baati Churma / thali' : 'Rajasthani veg thali', category: 'food', vegType: neutral ? 'unknown' : vegType, share: 0.55 })
    if (wantNonVeg) out.push({ name: 'Laal maas / non-veg curry', category: 'food', vegType: 'non_veg', share: 0.55 })
    out.push({ name: 'Churma / sweets', category: 'dessert', vegType: 'veg', share: 0.2 })
    out.push({ name: 'Lassi / chaas', category: 'drink', vegType: 'veg', share: 0.25 })
    return out
  }
  if (region === 'goan') {
    const out: ItemTemplate[] = []
    if (wantVeg || neutral) out.push({ name: neutral ? 'Goan thali / veg curry rice' : 'Veg Goan thali', category: 'food', vegType: neutral ? 'unknown' : vegType, share: 0.55 })
    if (wantNonVeg) out.push({ name: 'Fish curry rice / prawn curry', category: 'food', vegType: 'non_veg', share: 0.55 })
    out.push({ name: 'Sol kadhi / kokum drink', category: 'drink', vegType: 'veg', share: 0.25 })
    return out
  }
  // Generic North Indian / other
  const out: ItemTemplate[] = []
  if (wantVeg || neutral) out.push({ name: neutral ? 'Main course' : `${VEG_LABEL(vegan)} main course`, category: 'food', vegType: neutral ? 'unknown' : vegType, share: 0.55 })
  if (wantNonVeg) out.push({ name: 'Non-veg main course', category: 'food', vegType: 'non_veg', share: 0.55 })
  out.push({ name: 'Bread / roti / rice', category: 'food', vegType: neutral ? 'unknown' : 'veg', share: 0.2 })
  out.push({ name: 'Lassi / beverage', category: 'drink', vegType: neutral ? 'unknown' : 'veg', share: 0.25 })
  return out
}

// ── Meal composition (smart-meal hotfix PARTS 6/7/8) ─────────────────────────

type ItemRole = NonNullable<SuggestedFoodItem['role']>

/**
 * Infer a composition role from a dish name + its coarse category. Pure
 * bread/rice and pure sides are classified as accompaniments; everything else
 * in the 'food' category is treated as a `main`. This is what lets us detect
 * an incomplete meal like "Garlic Naan" on its own.
 */
function inferDishRole(name: string, category: SuggestedFoodItem['category']): ItemRole {
  if (category === 'drink') return 'drink'
  if (category === 'dessert') return 'dessert'
  if (category === 'snack') return 'snack'
  const n = name.trim().toLowerCase()
  // Pure bread/rice — only when the name is JUST a bread/rice word (optionally
  // prefixed). "Aloo paratha", "rajma chawal", "fish curry rice" stay mains.
  if (/^(garlic |butter |plain |tandoori |laccha |steamed |jeera )?(naan|roti|kulcha|rumali roti|paratha|rice|pulao)$/.test(n)) return 'bread_rice'
  if (/^(bread|roti|rice)(\s*\/\s*(roti|rice|naan|bread))*$/.test(n)) return 'bread_rice'
  if (/^(raita|papad|salad|green salad|pickle|curd|fries|french fries)$/.test(n)) return 'side'
  return 'main'
}

/** True for meals that must be a complete set (have a main): lunch/dinner/generic. */
function needsMainDish(mealType: string | undefined): boolean {
  return mealType === 'lunch' || mealType === 'dinner' || mealType == null
}

/** Restaurant looks like a Mughlai / biryani / kebab house (Arsalan-style). */
function isMughlaiBiryaniPlace(name: string): boolean {
  return /\b(biryani|mughlai|kebab|arsalan|aminia|shiraz|royal\s+indian|nawab|tandoor)\b/i.test(name)
}

function nonVegMainFor(region: CuisineRegion, mughlai: boolean): { name: string; vegType: 'non_veg' } {
  if (mughlai) return { name: 'Chicken / Mutton Biryani', vegType: 'non_veg' }
  switch (region) {
    case 'bengali': return { name: 'Kosha Mangsho / Macher Jhol with rice', vegType: 'non_veg' }
    case 'ne_india': return { name: 'Chicken thukpa / non-veg thali', vegType: 'non_veg' }
    case 'south_indian': return { name: 'Chicken / fish curry with rice', vegType: 'non_veg' }
    case 'rajasthani': return { name: 'Laal Maas with rice', vegType: 'non_veg' }
    case 'goan': return { name: 'Fish curry rice / prawn curry', vegType: 'non_veg' }
    case 'mumbai': return { name: 'Chicken curry / kebab', vegType: 'non_veg' }
    default: return { name: 'Butter Chicken / chicken curry', vegType: 'non_veg' }
  }
}

function vegMainFor(region: CuisineRegion, mughlai: boolean, vegan: boolean): { name: string; vegType: 'veg' | 'vegan' } {
  const vt: 'veg' | 'vegan' = vegan ? 'vegan' : 'veg'
  if (mughlai) return { name: vegan ? 'Veg biryani with dal' : 'Paneer dish / Veg Biryani', vegType: vt }
  switch (region) {
    case 'bengali': return { name: vegan ? 'Veg curry with rice' : 'Paneer / veg curry with rice', vegType: vt }
    case 'ne_india': return { name: 'Veg thali / veg momo', vegType: vt }
    case 'south_indian': return { name: 'Veg meals / dosa', vegType: vt }
    case 'rajasthani': return { name: 'Dal Baati / veg thali', vegType: vt }
    case 'goan': return { name: 'Veg Goan thali', vegType: vt }
    case 'mumbai': return { name: 'Veg thali / pav bhaji', vegType: vt }
    default: return { name: vegan ? 'Vegan main course with rice' : 'Paneer butter masala / dal with rice', vegType: vt }
  }
}

/**
 * Pick the main dish(es) to complete a meal. Veg+non-veg users get BOTH a veg
 * and a non-veg main (separate sets, never random isolated items).
 */
function chooseMains(
  region: CuisineRegion,
  restaurantName: string,
  wantVeg: boolean,
  wantNonVeg: boolean,
  vegan: boolean,
  dietaryProfile: DietaryProfile,
): Array<{ name: string; vegType: NonNullable<SuggestedFoodItem['vegType']> }> {
  const strictVeg = (wantVeg && !wantNonVeg) || dietaryProfile === 'pure_veg'
  const mughlai = isMughlaiBiryaniPlace(restaurantName)
  if (strictVeg) return [vegMainFor(region, mughlai, vegan)]
  if (wantNonVeg && !wantVeg) return [nonVegMainFor(region, mughlai)]
  if (wantVeg && wantNonVeg) return [vegMainFor(region, mughlai, vegan), nonVegMainFor(region, mughlai)]
  // No explicit preference — follow the restaurant's profile.
  if (dietaryProfile === 'non_veg_friendly') return [nonVegMainFor(region, mughlai)]
  return [vegMainFor(region, mughlai, vegan)]
}

/**
 * Guarantee a lunch/dinner suggestion is a complete meal. If the built items
 * contain no `main` (e.g. only "Garlic Naan"), prepend a compatible main dish
 * derived from cuisine region + restaurant type + dietary preference.
 */
function ensureCompleteMeal(
  items: SuggestedFoodItem[],
  mealType: string | undefined,
  region: CuisineRegion,
  restaurantName: string,
  foodPreferences: FoodPreference[],
  dietaryProfile: DietaryProfile,
  spend: SpendRange,
  currency: string,
): SuggestedFoodItem[] {
  if (!needsMainDish(mealType)) return items
  if (items.some((it) => it.role === 'main')) return items

  const wantVeg = foodPreferences.includes('vegetarian') || foodPreferences.includes('jain') || foodPreferences.includes('vegan')
  const wantNonVeg = foodPreferences.includes('non_vegetarian')
  const vegan = foodPreferences.includes('vegan') && !foodPreferences.includes('vegetarian')

  const mains = chooseMains(region, restaurantName, wantVeg, wantNonVeg, vegan, dietaryProfile)
  const share = 0.5
  const mainItems: SuggestedFoodItem[] = mains.map((m) => {
    const min = Math.max(1, Math.round(spend.perPersonMin * share))
    const max = Math.max(min + 1, Math.round(spend.perPersonMax * share))
    return {
      name: m.name,
      category: 'food',
      role: 'main',
      vegType: m.vegType,
      estimatedPriceMin: min,
      estimatedPriceMax: max,
      currency,
      confidence: spend.confidence,
      basis: 'restaurant_type_city_heuristic',
      sourceNote: 'Added to complete the meal — a main paired with the suggested side(s).',
    }
  })
  // Main(s) first so the set reads as a complete meal; cap total items.
  return [...mainItems, ...items].slice(0, 5)
}

const SOURCE_NOTE: Record<SuggestedFoodItemBasis, string> = {
  official_menu_or_website: 'Estimated from official menu/website where available.',
  google_review_item_mentions: 'Item mentioned in Google reviews; price is approximate.',
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
  cuisineRegion: CuisineRegion,
  dietaryProfile: DietaryProfile,
  reviewMentions: ReviewItemMention[],
  restaurantName: string,
): SuggestedFoodItem[] {
  const wantVeg = foodPreferences.includes('vegetarian') || foodPreferences.includes('jain') || foodPreferences.includes('vegan')
  const wantNonVeg = foodPreferences.includes('non_vegetarian')
  const vegan = foodPreferences.includes('vegan') && !foodPreferences.includes('vegetarian')

  // Enforce dietary correctness: pure_veg restaurants + veg preference → no non-veg items
  const strictVeg = wantVeg || dietaryProfile === 'pure_veg'

  const itemBasis = spendBasisToItemBasis(spend.basis)

  let items: SuggestedFoodItem[]

  // ── Build from review mentions when available ──
  if (reviewMentions.length >= 2) {
    items = reviewMentions
      .filter((m) => {
        if (strictVeg && m.vegType === 'non_veg') return false
        if (!wantNonVeg && !wantVeg && m.vegType === 'non_veg' && dietaryProfile === 'pure_veg') return false
        return true
      })
      .slice(0, 4)
      .map((m) => {
        const share = m.category === 'food' ? 0.5 : m.category === 'drink' ? 0.25 : m.category === 'snack' ? 0.35 : 0.2
        const min = Math.max(1, Math.round(spend.perPersonMin * share))
        const max = Math.max(min + 1, Math.round(spend.perPersonMax * share))
        return {
          name: m.name,
          category: m.category,
          role: inferDishRole(m.name, m.category),
          vegType: m.vegType,
          estimatedPriceMin: min,
          estimatedPriceMax: max,
          currency,
          confidence: spend.confidence,
          basis: 'google_review_item_mentions' as const,
          sourceNote: SOURCE_NOTE['google_review_item_mentions'],
          popularityHint: m.popularityHint,
        }
      })
  } else {
    // ── Fall back to locale-aware templates ──
    const templates = localeTemplatesFor(mealType, cuisineRegion, wantVeg, wantNonVeg, vegan)
    const note = SOURCE_NOTE[itemBasis]

    items = templates
      .filter((t) => {
        if (strictVeg && t.vegType === 'non_veg') return false
        return true
      })
      .map((t) => {
        const min = Math.max(1, Math.round(spend.perPersonMin * t.share))
        const max = Math.max(min + 1, Math.round(spend.perPersonMax * t.share))
        return {
          name: t.name,
          category: t.category,
          role: inferDishRole(t.name, t.category),
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

  // PARTS 6/7/8 — never show an incomplete lunch/dinner (e.g. only a bread/side).
  return ensureCompleteMeal(items, mealType, cuisineRegion, restaurantName, foodPreferences, dietaryProfile, spend, currency)
}

// ── Score-based candidate selection (PART 3) ─────────────────────────────────

/**
 * Score search result candidates by rating, review count, and dietary match.
 * Returns the best candidate for the user's preferences without fetching extra API calls.
 */
function selectBestCandidate(
  results: PlaceSearchResult[],
  foodPreferences: FoodPreference[],
  foodBudgetStyle: string | undefined,
): PlaceSearchResult {
  if (results.length <= 1) return results[0]!

  const wantVeg = foodPreferences.some((p) => ['vegetarian', 'jain', 'vegan'].includes(p))
  const wantNonVeg = foodPreferences.includes('non_vegetarian')
  const wantBoth = wantVeg && wantNonVeg

  const scored = results.map((r) => {
    let score = 0

    // Rating (0–40 pts)
    if (r.rating != null) {
      score += Math.max(0, ((r.rating - 3.0) / 2.0)) * 40
    }

    // Review count (0–15 pts, log scale)
    if (r.userRatingsTotal != null && r.userRatingsTotal > 0) {
      score += Math.min(15, Math.log10(r.userRatingsTotal) * 5)
    }

    // Dietary match (0–30 pts)
    const profile = detectDietaryProfile(r.name, r.types ?? [])
    if (wantBoth) {
      if (profile === 'mixed') score += 25
      else if (profile === 'non_veg_friendly') score += 20
      else if (profile === 'pure_veg') score += 10
    } else if (wantVeg && !wantNonVeg) {
      if (profile === 'pure_veg') score += 30
      else if (profile === 'cafe' || profile === 'dessert') score += 20
      else if (profile === 'mixed') score += 15
    } else if (wantNonVeg && !wantVeg) {
      if (profile === 'non_veg_friendly' || profile === 'mixed') score += 30
    } else {
      if (profile === 'mixed') score += 10
    }

    // Price level match (0–10 pts)
    const pl = r.priceLevel
    if (pl != null && foodBudgetStyle) {
      const mismatch =
        (foodBudgetStyle === 'budget' && pl > 2) ||
        (foodBudgetStyle === 'premium' && pl < 3) ||
        (foodBudgetStyle === 'mid_range' && (pl < 2 || pl > 3))
      if (!mismatch) score += 10
    }

    return { result: r, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored[0]!.result
}

// ── Reason tag builder ─────────────────────────────────────────────────────

function buildReasonTags(
  rating: number | undefined,
  priceLevel: number | undefined,
  types: string[] | undefined,
  basis: SpendBasis,
  dietaryProfile: DietaryProfile,
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
  if (dietaryProfile === 'pure_veg') tags.push('Pure veg')
  else if (types?.some((t) => t.includes('vegetarian'))) tags.push('Vegetarian-friendly')
  if (dietaryProfile === 'cafe' || types?.some((t) => t.includes('cafe') || t.includes('coffee'))) tags.push('Café')
  if (types?.some((t) => t.includes('fast_food'))) tags.push('Quick service')
  return tags
}

// ── Food search query builder ──────────────────────────────────────────────

function buildFoodSearchQuery(
  activityTitle: string,
  mealType: string | undefined,
  suggestedQuery: string | undefined,
  foodPreferences: FoodPreference[],
  destination: string,
  cuisineRegion: CuisineRegion,
): string {
  if (suggestedQuery && (suggestedQuery.toLowerCase().includes('restaurant') || suggestedQuery.toLowerCase().includes('café') || suggestedQuery.toLowerCase().includes('cafe'))) {
    return suggestedQuery
  }

  const isCafe = mealType === 'cafe' || activityTitle.toLowerCase().includes('café') || activityTitle.toLowerCase().includes('cafe')
  const isVeg = foodPreferences.includes('vegetarian') || foodPreferences.includes('vegan') || foodPreferences.includes('jain')

  if (isCafe) return `café ${destination}`

  if (cuisineRegion === 'ne_india') {
    return isVeg ? `vegetarian restaurant momo thukpa ${destination}` : `local restaurant momo ${destination}`
  }
  if (cuisineRegion === 'bengali') {
    return isVeg ? `vegetarian Bengali restaurant ${destination}` : `Bengali restaurant ${destination}`
  }
  if (cuisineRegion === 'south_indian') {
    return isVeg ? `vegetarian South Indian restaurant ${destination}` : `restaurant ${destination}`
  }
  if (cuisineRegion === 'goan') {
    return isVeg ? `vegetarian restaurant ${destination}` : `seafood fish curry restaurant ${destination}`
  }

  const foodType = isVeg ? 'vegetarian restaurant' : 'restaurant'
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
  suggestedItems: SuggestedFoodItem[]
  menuSourceUrl?: string
  menuSourceType?: 'google_place_website' | 'google_place_menu' | 'unknown'
  /** Set when the restaurant is a pure-veg establishment. */
  dietaryNote?: string
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

  const cuisineRegion = detectCuisineRegion(destination)
  const targets = foodActivities.slice(0, 12)
  const patches: FoodEnrichmentPatch[] = []
  const queryCache = new Map<string, Awaited<ReturnType<typeof searchPlaces>>>()
  const detailsCache = new Map<string, Awaited<ReturnType<typeof fetchPlaceDetails>>>()

  for (const fa of targets) {
    const query = buildFoodSearchQuery(fa.title, fa.mealType, fa.suggestedPlaceSearchQuery, foodPreferences, destination, cuisineRegion)

    let results = queryCache.get(query)
    if (!results) {
      try {
        results = await searchPlaces(query, { maxResults: 3 })
        queryCache.set(query, results)
      } catch {
        continue
      }
    }

    if (!results || results.length === 0) continue

    // Score candidates and pick the best match for user preferences
    const top = selectBestCandidate(results, foodPreferences, foodBudgetStyle)

    let details = detailsCache.get(top.placeId)
    if (details === undefined) {
      details = await fetchPlaceDetails(top.placeId)
      detailsCache.set(top.placeId, details)
    }

    const dietaryProfile = detectDietaryProfile(details?.name ?? top.name, details?.types ?? top.types)
    const reviewClue = scanReviewPriceClues(details?.reviews)
    const reviewMentions = scanReviewItemMentions(details?.reviews, cuisineRegion)
    const priceLevel = details?.priceLevel ?? top.priceLevel
    const spend = estimateSpend(priceLevel, foodBudgetStyle, travellerCount, currency, reviewClue)
    const tags = buildReasonTags(details?.rating ?? top.rating, priceLevel, details?.types ?? top.types, spend.basis, dietaryProfile)
    const suggestedItems = buildSuggestedItems(fa.mealType, foodPreferences, spend, currency, cuisineRegion, dietaryProfile, reviewMentions, details?.name ?? top.name)

    const menuSourceUrl = details?.websiteUri
    const menuSourceType: FoodEnrichmentPatch['menuSourceType'] | undefined = menuSourceUrl
      ? 'google_place_website'
      : undefined

    const dietaryNote =
      dietaryProfile === 'pure_veg'
        ? 'Pure veg restaurant — non-veg dishes not suggested here.'
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
      ...(dietaryNote ? { dietaryNote } : {}),
    })
  }

  return NextResponse.json({ available: true, patches }, { status: 200 })
}
