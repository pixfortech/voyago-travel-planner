/**
 * Local cuisine food suggestions — pure, import-safe on client and server.
 *
 * Fills food/meal breaks with destination-appropriate dish ideas when there is
 * NO Google Places restaurant for the slot (mock mode, Maps not configured, or
 * no candidate found). Every item is explicitly labelled as local/AI inference
 * (`basis: 'local_cuisine_inference'`) so the UI never claims it is verified.
 *
 * No secrets, no API calls, no scraping — just curated regional knowledge. The
 * Google-backed enrich-food route remains the source of truth when a real place
 * exists; this only covers the gap so meals are never a bare "Break".
 */

import type { FoodPreference, SuggestedFoodItem } from '@/types'

export type CuisineRegion =
  | 'ne_india' | 'bengali' | 'south_indian' | 'north_indian'
  | 'rajasthani' | 'goan' | 'mumbai' | 'generic'

/** Mirror of the server's region detection so labels stay consistent. */
export function detectCuisineRegion(destination: string): CuisineRegion {
  const d = (destination || '').toLowerCase()
  if (/gangtok|sikkim|darjeeling|kalimpong|mirik|pelling|yuksom|lachung|lachen|namchi|ravangla|tashiling|kurseong|siliguri/.test(d)) return 'ne_india'
  if (/guwahati|shillong|kaziranga|cherrapunji|itanagar|imphal|aizawl|kohima|agartala/.test(d)) return 'ne_india'
  if (/kolkata|howrah|durgapur|asansol|bankura|shantiniketan|bishnupur|burdwan/.test(d)) return 'bengali'
  if (/bangalore|bengaluru|chennai|hyderabad|kochi|cochin|mysore|coimbatore|trivandrum|thiruvananthapuram|madurai|pondicherry|vijayawada/.test(d)) return 'south_indian'
  if (/kerala|karnataka|tamil\s*nadu|telangana|andhra/.test(d)) return 'south_indian'
  if (/\bgoa\b|panaji|panjim|mapusa|margao|vasco|calangute|anjuna|candolim|baga|colva|palolem/.test(d)) return 'goan'
  if (/jaipur|udaipur|jodhpur|jaisalmer|pushkar|ajmer|bikaner|kota|chittorgarh/.test(d)) return 'rajasthani'
  if (/delhi|agra|lucknow|amritsar|chandigarh|varanasi|banaras|kashi|mathura|vrindavan|rishikesh|haridwar|mussoorie|shimla|prayagraj|allahabad|kanpur/.test(d)) return 'north_indian'
  if (/mumbai|pune|nashik|aurangabad|lonavala|mahabaleshwar/.test(d)) return 'mumbai'
  return 'generic'
}

type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'cafe'
type VegType = NonNullable<SuggestedFoodItem['vegType']>

interface LocalDish {
  name: string
  category: SuggestedFoodItem['category']
  vegType: VegType
  role?: SuggestedFoodItem['role']
  meals: Meal[]
  recommendationTag?: NonNullable<SuggestedFoodItem['recommendationTag']>
  /** Portion of the per-person spend this item represents (0–1). */
  share: number
  /** True when the dish contains dairy (excluded for vegan unless it is the only main). */
  dairy?: boolean
  dietaryTags?: string[]
}

// ── Regional dish libraries ──────────────────────────────────────────────────

const DISHES: Record<CuisineRegion, LocalDish[]> = {
  goan: [
    { name: 'Prawn curry rice', category: 'food', vegType: 'non_veg', role: 'main', meals: ['lunch', 'dinner'], recommendationTag: 'local_speciality', share: 0.5, dietaryTags: ['contains-shellfish'] },
    { name: 'Goan fish thali', category: 'food', vegType: 'non_veg', role: 'main', meals: ['lunch', 'dinner'], recommendationTag: 'must_try', share: 0.55, dietaryTags: ['contains-fish'] },
    { name: 'Chicken cafreal', category: 'food', vegType: 'non_veg', role: 'main', meals: ['lunch', 'dinner'], share: 0.5 },
    { name: 'Veg Goan thali', category: 'food', vegType: 'veg', role: 'main', meals: ['lunch', 'dinner'], recommendationTag: 'safe_pick', share: 0.5 },
    { name: 'Mushroom / veg xacuti', category: 'food', vegType: 'veg', role: 'main', meals: ['dinner'], share: 0.45 },
    { name: 'Poi (Goan bread)', category: 'food', vegType: 'veg', role: 'bread_rice', meals: ['lunch', 'dinner', 'breakfast'], recommendationTag: 'kid_friendly', share: 0.12, dairy: false },
    { name: 'Bhaji-pão', category: 'food', vegType: 'veg', role: 'main', meals: ['breakfast'], recommendationTag: 'kid_friendly', share: 0.4 },
    { name: 'Goan pork sausage pão', category: 'food', vegType: 'non_veg', role: 'main', meals: ['breakfast'], share: 0.45 },
    { name: 'Sol kadhi / kokum cooler', category: 'drink', vegType: 'veg', role: 'drink', meals: ['lunch', 'dinner', 'snack', 'cafe'], recommendationTag: 'local_speciality', share: 0.18 },
    { name: 'Bebinca', category: 'dessert', vegType: 'veg', role: 'dessert', meals: ['lunch', 'dinner', 'cafe'], recommendationTag: 'local_speciality', share: 0.22, dairy: true },
  ],
  bengali: [
    { name: 'Kosha mangsho', category: 'food', vegType: 'non_veg', role: 'main', meals: ['lunch', 'dinner'], recommendationTag: 'local_speciality', share: 0.5 },
    { name: 'Macher jhol (fish curry)', category: 'food', vegType: 'non_veg', role: 'main', meals: ['lunch', 'dinner'], recommendationTag: 'must_try', share: 0.5, dietaryTags: ['contains-fish'] },
    { name: 'Luchi alur dom', category: 'food', vegType: 'veg', role: 'main', meals: ['breakfast', 'lunch'], recommendationTag: 'must_try', share: 0.45 },
    { name: 'Veg Bengali thali (shukto, dal, rice)', category: 'food', vegType: 'veg', role: 'main', meals: ['lunch', 'dinner'], recommendationTag: 'safe_pick', share: 0.5 },
    { name: 'Kathi roll', category: 'food', vegType: 'non_veg', role: 'main', meals: ['snack', 'lunch'], recommendationTag: 'must_try', share: 0.4 },
    { name: 'Veg kathi roll', category: 'food', vegType: 'veg', role: 'main', meals: ['snack', 'lunch'], recommendationTag: 'kid_friendly', share: 0.35 },
    { name: 'Mishti doi', category: 'dessert', vegType: 'veg', role: 'dessert', meals: ['lunch', 'dinner', 'snack'], recommendationTag: 'local_speciality', share: 0.2, dairy: true },
    { name: 'Sandesh', category: 'dessert', vegType: 'veg', role: 'dessert', meals: ['snack', 'cafe', 'dinner'], recommendationTag: 'kid_friendly', share: 0.18, dairy: true },
    { name: 'Masala cha', category: 'drink', vegType: 'veg', role: 'drink', meals: ['breakfast', 'snack', 'cafe'], share: 0.12, dairy: true },
  ],
  north_indian: [
    { name: 'Kachori sabzi', category: 'food', vegType: 'veg', role: 'main', meals: ['breakfast', 'snack'], recommendationTag: 'local_speciality', share: 0.4 },
    { name: 'Tamatar chaat', category: 'snack', vegType: 'veg', role: 'snack', meals: ['snack'], recommendationTag: 'local_speciality', share: 0.3 },
    { name: 'Banarasi / North-Indian veg thali', category: 'food', vegType: 'veg', role: 'main', meals: ['lunch', 'dinner'], recommendationTag: 'safe_pick', share: 0.55 },
    { name: 'Chole bhature', category: 'food', vegType: 'veg', role: 'main', meals: ['breakfast', 'lunch'], recommendationTag: 'must_try', share: 0.45 },
    { name: 'Dal makhani with naan', category: 'food', vegType: 'veg', role: 'main', meals: ['lunch', 'dinner'], recommendationTag: 'kid_friendly', share: 0.5, dairy: true },
    { name: 'Butter chicken with naan', category: 'food', vegType: 'non_veg', role: 'main', meals: ['lunch', 'dinner'], recommendationTag: 'must_try', share: 0.55, dairy: true },
    { name: 'Banarasi lassi', category: 'drink', vegType: 'veg', role: 'drink', meals: ['breakfast', 'snack', 'lunch'], recommendationTag: 'local_speciality', share: 0.2, dairy: true },
    { name: 'Malaiyo (seasonal, winter mornings)', category: 'dessert', vegType: 'veg', role: 'dessert', meals: ['breakfast', 'snack'], recommendationTag: 'local_speciality', share: 0.2, dairy: true },
    { name: 'Jalebi', category: 'dessert', vegType: 'veg', role: 'dessert', meals: ['breakfast', 'snack', 'dinner'], recommendationTag: 'kid_friendly', share: 0.18 },
  ],
  ne_india: [
    { name: 'Veg momos', category: 'snack', vegType: 'veg', role: 'snack', meals: ['snack', 'lunch', 'breakfast'], recommendationTag: 'must_try', share: 0.4 },
    { name: 'Pork / chicken momos', category: 'snack', vegType: 'non_veg', role: 'snack', meals: ['snack', 'lunch'], recommendationTag: 'local_speciality', share: 0.42 },
    { name: 'Veg thukpa', category: 'food', vegType: 'veg', role: 'main', meals: ['lunch', 'dinner'], recommendationTag: 'safe_pick', share: 0.5 },
    { name: 'Chicken thukpa', category: 'food', vegType: 'non_veg', role: 'main', meals: ['lunch', 'dinner'], share: 0.52 },
    { name: 'Chhurpi soup / chhurpi snack', category: 'food', vegType: 'veg', role: 'side', meals: ['lunch', 'dinner', 'snack'], recommendationTag: 'local_speciality', share: 0.25, dairy: true },
    { name: 'Sel roti', category: 'food', vegType: 'veg', role: 'bread_rice', meals: ['breakfast', 'snack'], recommendationTag: 'kid_friendly', share: 0.3 },
    { name: 'Aloo dum with puri', category: 'food', vegType: 'veg', role: 'main', meals: ['breakfast'], recommendationTag: 'safe_pick', share: 0.42 },
    { name: 'Butter tea / masala chai', category: 'drink', vegType: 'veg', role: 'drink', meals: ['breakfast', 'snack', 'cafe'], recommendationTag: 'local_speciality', share: 0.15, dairy: true },
  ],
  south_indian: [
    { name: 'Masala dosa', category: 'food', vegType: 'veg', role: 'main', meals: ['breakfast', 'lunch'], recommendationTag: 'must_try', share: 0.45 },
    { name: 'Idli sambar', category: 'food', vegType: 'veg', role: 'main', meals: ['breakfast'], recommendationTag: 'kid_friendly', share: 0.4 },
    { name: 'South-Indian veg meals (thali)', category: 'food', vegType: 'veg', role: 'main', meals: ['lunch', 'dinner'], recommendationTag: 'safe_pick', share: 0.55 },
    { name: 'Chettinad chicken / fish curry rice', category: 'food', vegType: 'non_veg', role: 'main', meals: ['lunch', 'dinner'], recommendationTag: 'local_speciality', share: 0.55, dietaryTags: ['contains-fish'] },
    { name: 'Pongal', category: 'food', vegType: 'veg', role: 'main', meals: ['breakfast'], share: 0.4 },
    { name: 'Filter coffee', category: 'drink', vegType: 'veg', role: 'drink', meals: ['breakfast', 'snack', 'cafe'], recommendationTag: 'local_speciality', share: 0.15, dairy: true },
    { name: 'Payasam', category: 'dessert', vegType: 'veg', role: 'dessert', meals: ['lunch', 'dinner'], recommendationTag: 'kid_friendly', share: 0.2, dairy: true },
  ],
  rajasthani: [
    { name: 'Dal baati churma', category: 'food', vegType: 'veg', role: 'main', meals: ['lunch', 'dinner'], recommendationTag: 'must_try', share: 0.55, dairy: true },
    { name: 'Gatte ki sabzi with rice', category: 'food', vegType: 'veg', role: 'main', meals: ['lunch', 'dinner'], recommendationTag: 'safe_pick', share: 0.5 },
    { name: 'Laal maas', category: 'food', vegType: 'non_veg', role: 'main', meals: ['lunch', 'dinner'], recommendationTag: 'local_speciality', share: 0.55 },
    { name: 'Pyaaz kachori', category: 'snack', vegType: 'veg', role: 'snack', meals: ['breakfast', 'snack'], recommendationTag: 'local_speciality', share: 0.35 },
    { name: 'Ghevar / churma', category: 'dessert', vegType: 'veg', role: 'dessert', meals: ['snack', 'lunch', 'dinner'], recommendationTag: 'kid_friendly', share: 0.2, dairy: true },
    { name: 'Chaas / lassi', category: 'drink', vegType: 'veg', role: 'drink', meals: ['lunch', 'snack'], share: 0.15, dairy: true },
  ],
  mumbai: [
    { name: 'Vada pav', category: 'snack', vegType: 'veg', role: 'snack', meals: ['snack', 'breakfast'], recommendationTag: 'must_try', share: 0.3 },
    { name: 'Pav bhaji', category: 'food', vegType: 'veg', role: 'main', meals: ['lunch', 'dinner', 'snack'], recommendationTag: 'kid_friendly', share: 0.45, dairy: true },
    { name: 'Misal pav', category: 'food', vegType: 'veg', role: 'main', meals: ['breakfast', 'lunch'], recommendationTag: 'local_speciality', share: 0.42 },
    { name: 'Bombay grilled sandwich', category: 'food', vegType: 'veg', role: 'main', meals: ['snack', 'breakfast', 'cafe'], recommendationTag: 'kid_friendly', share: 0.35 },
    { name: 'Koliwada seafood / fish thali', category: 'food', vegType: 'non_veg', role: 'main', meals: ['lunch', 'dinner'], recommendationTag: 'local_speciality', share: 0.55, dietaryTags: ['contains-fish'] },
    { name: 'Cutting chai', category: 'drink', vegType: 'veg', role: 'drink', meals: ['breakfast', 'snack', 'cafe'], share: 0.1, dairy: true },
    { name: 'Falooda', category: 'dessert', vegType: 'veg', role: 'dessert', meals: ['snack', 'cafe', 'dinner'], recommendationTag: 'kid_friendly', share: 0.2, dairy: true },
  ],
  generic: [
    { name: 'Local veg thali', category: 'food', vegType: 'veg', role: 'main', meals: ['lunch', 'dinner'], recommendationTag: 'safe_pick', share: 0.55 },
    { name: 'Local non-veg curry with rice/roti', category: 'food', vegType: 'non_veg', role: 'main', meals: ['lunch', 'dinner'], recommendationTag: 'local_speciality', share: 0.55 },
    { name: 'Regional breakfast plate', category: 'food', vegType: 'veg', role: 'main', meals: ['breakfast'], share: 0.4 },
    { name: 'Local snack plate', category: 'snack', vegType: 'veg', role: 'snack', meals: ['snack'], share: 0.35 },
    { name: 'Tea / coffee', category: 'drink', vegType: 'veg', role: 'drink', meals: ['breakfast', 'snack', 'cafe'], share: 0.12, dairy: true },
    { name: 'Local sweet', category: 'dessert', vegType: 'veg', role: 'dessert', meals: ['lunch', 'dinner', 'snack'], recommendationTag: 'kid_friendly', share: 0.18, dairy: true },
  ],
}

// Café slots are cuisine-agnostic — a light, friendly default everywhere.
const CAFE_ITEMS: LocalDish[] = [
  { name: 'Coffee / beverage', category: 'drink', vegType: 'veg', role: 'drink', meals: ['cafe'], share: 0.4, dairy: true },
  { name: 'Cake / pastry', category: 'dessert', vegType: 'veg', role: 'dessert', meals: ['cafe'], recommendationTag: 'kid_friendly', share: 0.35, dairy: true },
  { name: 'Sandwich / light bite', category: 'food', vegType: 'veg', role: 'main', meals: ['cafe'], share: 0.3 },
]

// ── Price model (per person, INR) ────────────────────────────────────────────

const STYLE_RANGES: Record<string, [number, number]> = {
  budget: [80, 250],
  mid_range: [200, 600],
  premium: [550, 2000],
}
const NON_INR_FACTOR = 0.012

// ── Pairing notes ────────────────────────────────────────────────────────────

const PAIRING: Partial<Record<CuisineRegion, string>> = {
  goan: 'Pair a seafood or veg curry-rice with a chilled kokum cooler (sol kadhi), and finish with bebinca.',
  bengali: 'A Bengali meal pairs beautifully with mishti doi or sandesh to finish — and cha to round it off.',
  north_indian: 'Cool a rich North-Indian meal with a thick lassi; save room for jalebi (or seasonal malaiyo on winter mornings).',
  ne_india: 'Momos go best with a hot bowl of thukpa and butter tea — warming for hill weather.',
  south_indian: 'Filter coffee is the classic close to a South-Indian meal; payasam if you want something sweet.',
  rajasthani: 'Balance the rich Rajasthani spread with chaas (buttermilk); ghevar makes a festive finish.',
  mumbai: 'Wash down street-style bites with cutting chai, and try a falooda for dessert.',
}

const MEAL_LABEL: Record<Meal, string> = {
  breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', snack: 'snack', cafe: 'café stop',
}

/** Reusable smart-pairing line for a destination + meal (shared with the server route). */
export function localPairingNote(destination: string, mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'cafe'): string {
  if (mealType === 'cafe') return 'A coffee with a light bite or cake makes a good mid-route café break.'
  const region = detectCuisineRegion(destination)
  return PAIRING[region] ?? 'Pair a regional main with a local drink, and a sweet to finish.'
}

export interface LocalFoodSuggestion {
  items: SuggestedFoodItem[]
  whyHere: string
  pairingNote: string
}

/**
 * Build a small set of local, dietary-correct dish ideas for one meal slot.
 * Returns null when nothing sensible can be produced (caller keeps the plain
 * break). All items are labelled `local_cuisine_inference` and never "verified".
 */
export function buildLocalFoodSuggestion(opts: {
  destination: string
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'cafe'
  foodPreferences?: FoodPreference[]
  currency: string
  foodBudgetStyle?: 'budget' | 'mid_range' | 'premium'
  /** Locality/area for the "why here" note when known (from route/stay). */
  localityHint?: string
}): LocalFoodSuggestion | null {
  const region = detectCuisineRegion(opts.destination)
  const meal: Meal = opts.mealType ?? 'lunch'
  const prefs = opts.foodPreferences ?? []

  const wantVeg = prefs.some((p) => p === 'vegetarian' || p === 'jain' || p === 'vegan')
  const wantNonVeg = prefs.includes('non_vegetarian')
  const vegan = prefs.includes('vegan')
  const jain = prefs.includes('jain')

  // Strict dietary rule: a vegetarian/jain/vegan traveller NEVER sees non-veg.
  // Everyone else (explicit non-veg OR no preference set) may see regional
  // non-veg specialities like Goan seafood — always clearly labelled.
  const allowNonVeg = !wantVeg

  const pool = meal === 'cafe' ? CAFE_ITEMS : (DISHES[region] ?? DISHES.generic)
  let candidates = pool.filter((d) => d.meals.includes(meal))
  if (candidates.length === 0) candidates = pool.filter((d) => d.meals.includes('lunch'))

  candidates = candidates.filter((d) => {
    if (d.vegType === 'non_veg' && !allowNonVeg) return false
    // Vegan: drop dairy items unless it is the only available main.
    if (vegan && d.dairy && d.role !== 'main') return false
    return true
  })

  if (candidates.length === 0) return null

  // Ensure a complete meal: lunch/dinner must include a main.
  const needsMain = meal === 'lunch' || meal === 'dinner'
  const hasMain = candidates.some((d) => d.role === 'main')
  if (needsMain && !hasMain) {
    const main = (DISHES[region] ?? DISHES.generic).find((d) => d.role === 'main' && (d.vegType !== 'non_veg' || allowNonVeg))
    if (main) candidates.unshift(main)
  }

  // Order: mains first, then sides/snacks, then drinks/desserts. Cap at 5.
  const order: Record<string, number> = { main: 0, bread_rice: 1, side: 2, snack: 3, drink: 4, dessert: 5 }
  candidates = candidates
    .slice()
    .sort((a, b) => (order[a.role ?? 'side'] ?? 3) - (order[b.role ?? 'side'] ?? 3))
    .slice(0, 5)

  const [loBase, hiBase] = STYLE_RANGES[opts.foodBudgetStyle ?? 'mid_range'] ?? STYLE_RANGES.mid_range!
  const factor = opts.currency !== 'INR' ? NON_INR_FACTOR : 1

  const items: SuggestedFoodItem[] = candidates.map((d) => {
    const min = Math.max(1, Math.round(loBase * d.share * factor))
    const max = Math.max(min + 1, Math.round(hiBase * d.share * factor))
    const dietaryTags = [
      ...(d.vegType === 'veg' ? ['veg'] : d.vegType === 'vegan' ? ['vegan'] : d.vegType === 'non_veg' ? ['non-veg'] : []),
      ...(d.dietaryTags ?? []),
    ]
    const item: SuggestedFoodItem = {
      name: d.name,
      category: d.category,
      role: d.role,
      vegType: d.vegType,
      estimatedPriceMin: min,
      estimatedPriceMax: max,
      currency: opts.currency,
      confidence: 'low',
      basis: 'local_cuisine_inference',
      sourceNote: 'Local cuisine suggestion (AI inference) — not from a specific restaurant menu. Verify in person.',
    }
    if (d.recommendationTag) item.recommendationTag = d.recommendationTag
    if (dietaryTags.length) item.dietaryTags = dietaryTags
    return item
  })

  if (items.length === 0) return null

  const where = opts.localityHint ? `around ${opts.localityHint}` : `in ${opts.destination}`
  const dietWord = vegan ? 'vegan-friendly ' : jain ? 'Jain-friendly ' : wantVeg ? 'vegetarian ' : ''
  const whyHere = `${dietWord ? dietWord : ''}Local ${MEAL_LABEL[meal]} ideas ${where}, picked to match the region's cuisine and your ${dietWord ? 'dietary preference' : 'plan'}. No specific restaurant is locked in yet — confirm a place on the spot.`

  const pairingNote = meal === 'cafe'
    ? 'A coffee with a light bite or cake makes a good mid-route café break.'
    : (PAIRING[region] ?? 'Pair a regional main with a local drink, and a sweet to finish.')

  return { items, whyHere, pairingNote }
}
