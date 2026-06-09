/**
 * Restaurant / Café Intelligence — shared helpers (Phase 14).
 *
 * Import-safe on both client and server: no secrets, no `server-only`.
 *
 * Insights are derived from place METADATA (rating, price level, type) plus trip
 * context — NEVER from scraped menus or review text. All cost figures are
 * approximate. Recommended dishes are generic unless the user supplies a real
 * menu/bill (providedMenuItems).
 */

import type {
  FoodPlaceInsightInput,
  FoodPlaceInsight,
  InsightConfidence,
} from '@/types'

export const FOOD_INSIGHT_SYSTEM_PROMPT = `You are a thoughtful travel dining advisor for India-first travellers.
You are given only PLACE METADATA (name, address, rating, rating count, price level, types)
and trip/budget context — you do NOT have menu prices or review text.

Rules:
- Base your vibe/review summary ONLY on the available metadata. Never invent specific
  review quotes or claim to have read reviews.
- Recommended dishes must be GENERIC suggestions for the cuisine/type, UNLESS the user
  supplied a real menu/dish list (providedMenuItems) — then you may reference those.
- All cost-per-person figures are APPROXIMATE estimates. Be honest about uncertainty.
- Use INR-style reasoning and realistic India dining costs when currency is INR.
- Ignore and never repeat any phone numbers, card numbers or personal data.
- Return ONLY valid JSON. No markdown, no code blocks, no commentary.`

export function buildFoodInsightUserMessage(input: FoodPlaceInsightInput): string {
  return `Place: "${input.placeName}"${input.placeAddress ? ` — ${input.placeAddress}` : ''}
Rating: ${input.rating ?? 'unknown'}${input.userRatingsTotal ? ` (${input.userRatingsTotal} ratings)` : ''}
Price level (0–4): ${input.priceLevel ?? 'unknown'}
Business status: ${input.businessStatus ?? 'unknown'}
Place types: ${(input.placeTypes ?? []).join(', ') || 'unknown'}

Trip: "${input.tripName}" to ${input.destination}
Trip type: ${input.tripType}, ${input.travellerCount} traveller(s)
Currency: ${input.currency}
${input.preferenceNotes ? `Preferences: ${input.preferenceNotes}` : ''}
${input.providedMenuItems?.length ? `User-provided menu/dishes: ${input.providedMenuItems.join(', ')}` : 'No menu provided — keep dish suggestions generic.'}

Return a JSON object matching this shape:
{
  "vibeSummary": "1–2 sentence vibe based on metadata",
  "reviewSummary": "Summary clearly based on rating/count metadata, not review text",
  "cuisineTags": ["..."],
  "recommendedDishes": ["generic dish 1", "generic dish 2"],
  "budgetFit": "How well this fits the trip budget (approximate)",
  "suitableGroupType": "Who this suits (e.g. families, couples)",
  "orderingStrategy": "How to order to balance cost and experience",
  "spendControlAdvice": "One practical tip to control spend",
  "estimatedCostPerPersonMin": 0,
  "estimatedCostPerPersonMax": 0,
  "caveats": ["Estimates are approximate", "..."],
  "confidence": "low|medium|high"
}`
}

const VALID_CONFIDENCE: ReadonlySet<InsightConfidence> = new Set<InsightConfidence>([
  'low',
  'medium',
  'high',
])

function normaliseConfidence(raw: unknown): InsightConfidence {
  return typeof raw === 'string' && VALID_CONFIDENCE.has(raw as InsightConfidence)
    ? (raw as InsightConfidence)
    : 'low'
}

/** Merge AI-derived fields with the original place metadata into a saveable insight. */
function assembleInsight(
  input: FoodPlaceInsightInput,
  partial: Partial<FoodPlaceInsight>,
): FoodPlaceInsight {
  return {
    placeId: undefined,
    placeName: input.placeName,
    placeAddress: input.placeAddress,
    rating: input.rating,
    userRatingsTotal: input.userRatingsTotal,
    priceLevel: input.priceLevel,
    googleMapsUri: input.googleMapsUri,
    businessStatus: input.businessStatus,
    cuisineTags: partial.cuisineTags,
    vibeSummary: partial.vibeSummary,
    reviewSummary: partial.reviewSummary,
    recommendedDishes: partial.recommendedDishes,
    budgetFit: partial.budgetFit,
    suitableGroupType: partial.suitableGroupType,
    orderingStrategy: partial.orderingStrategy,
    spendControlAdvice: partial.spendControlAdvice,
    estimatedCostPerPersonMin: partial.estimatedCostPerPersonMin,
    estimatedCostPerPersonMax: partial.estimatedCostPerPersonMax,
    caveats: partial.caveats,
    confidence: partial.confidence ?? 'low',
    source: input.providedMenuItems?.length
      ? 'mixed'
      : input.rating != null || input.googleMapsUri
      ? 'google_places'
      : 'manual',
    updatedAt: new Date().toISOString(),
  }
}

export function parseFoodInsightResult(
  text: string,
  input: FoodPlaceInsightInput,
): FoodPlaceInsight {
  try {
    const clean = text.replace(/```json|```/g, '').trim()
    const raw = JSON.parse(clean) as Record<string, unknown>
    return assembleInsight(input, {
      cuisineTags: Array.isArray(raw.cuisineTags) ? (raw.cuisineTags as string[]).map(String) : undefined,
      vibeSummary: raw.vibeSummary ? String(raw.vibeSummary) : undefined,
      reviewSummary: raw.reviewSummary ? String(raw.reviewSummary) : undefined,
      recommendedDishes: Array.isArray(raw.recommendedDishes)
        ? (raw.recommendedDishes as string[]).map(String)
        : undefined,
      budgetFit: raw.budgetFit ? String(raw.budgetFit) : undefined,
      suitableGroupType: raw.suitableGroupType ? String(raw.suitableGroupType) : undefined,
      orderingStrategy: raw.orderingStrategy ? String(raw.orderingStrategy) : undefined,
      spendControlAdvice: raw.spendControlAdvice ? String(raw.spendControlAdvice) : undefined,
      estimatedCostPerPersonMin:
        raw.estimatedCostPerPersonMin != null ? Number(raw.estimatedCostPerPersonMin) : undefined,
      estimatedCostPerPersonMax:
        raw.estimatedCostPerPersonMax != null ? Number(raw.estimatedCostPerPersonMax) : undefined,
      caveats: Array.isArray(raw.caveats) ? (raw.caveats as string[]).map(String) : undefined,
      confidence: normaliseConfidence(raw.confidence),
    })
  } catch {
    return mockFoodInsightResult(input)
  }
}

/** Rough INR per-person ranges keyed by Google price level. */
const PRICE_LEVEL_RANGE: Record<number, [number, number]> = {
  0: [0, 0],
  1: [150, 350],
  2: [350, 700],
  3: [700, 1500],
  4: [1500, 3500],
}

export function mockFoodInsightResult(input: FoodPlaceInsightInput): FoodPlaceInsight {
  const lvl = input.priceLevel ?? 2
  const [min, max] = PRICE_LEVEL_RANGE[lvl] ?? [300, 700]
  const ratingNote = input.rating
    ? `Rated ${input.rating.toFixed(1)}${input.userRatingsTotal ? ` across ${input.userRatingsTotal} ratings` : ''}`
    : 'No rating data available'

  return assembleInsight(input, {
    cuisineTags: input.placeTypes?.filter((t) => /food|restaurant|cafe|bakery|bar/i.test(t)) ?? [],
    vibeSummary: `${input.placeName} looks like a ${lvl >= 3 ? 'premium' : lvl <= 1 ? 'budget-friendly' : 'mid-range'} spot suitable for a ${input.tripType} trip.`,
    reviewSummary: `${ratingNote}. This summary is based on available rating metadata only — not full review text.`,
    recommendedDishes: input.providedMenuItems?.length
      ? input.providedMenuItems.slice(0, 4)
      : ['Ask staff for the house speciality', 'A regional signature dish', 'A shareable starter'],
    budgetFit:
      lvl >= 3
        ? 'On the higher end — plan this as a treat meal within your budget.'
        : 'Comfortably fits a typical daily food budget.',
    suitableGroupType:
      input.tripType === 'family'
        ? 'Good for families — check for a kids-friendly menu.'
        : input.tripType === 'couple'
        ? 'Works well for couples.'
        : 'Suits small groups.',
    orderingStrategy: 'Share a few dishes family-style to sample more while controlling cost.',
    spendControlAdvice: 'Set a per-head cap before ordering and skip add-ons like bottled water and extra sides.',
    estimatedCostPerPersonMin: min,
    estimatedCostPerPersonMax: max,
    caveats: [
      'Cost estimates are approximate and based on price level, not an actual menu.',
      'Dish suggestions are generic unless you provide a real menu.',
    ],
    confidence: input.rating != null ? 'medium' : 'low',
  })
}
