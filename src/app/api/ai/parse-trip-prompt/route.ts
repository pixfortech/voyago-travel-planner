/**
 * POST /api/ai/parse-trip-prompt (Phase 15D)
 *
 * Parses a free-text trip description into structured TripBrief fields.
 * Uses the 'light' tier for speed. Returns a partial brief — missing fields
 * are left for the user to fill in on the Review Trip Brief screen.
 *
 * Never writes to Firestore. No private data is sent to AI.
 */

import { NextResponse } from 'next/server'
import { resolveAiProvider } from '@/lib/ai/provider'
import { rateLimit, clientKey } from '@/lib/server/rateLimit'
import type { TripType, TravelPace, TripInterest, FoodPreference } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface ParsedBrief {
  tripName?: string
  destination?: string
  origin?: string
  startDate?: string
  endDate?: string
  dayCount?: number
  budget?: number
  currency?: string
  travellerCount?: number
  tripType?: TripType
  composition?: { couples?: number; adults?: number; kids?: number; seniors?: number; notes?: string }
  pace?: TravelPace
  interests?: TripInterest[]
  foodPreferences?: FoodPreference[]
  mustVisit?: string[]
  avoidPlaces?: string[]
  constraints?: string[]
  extraNotes?: string
}

const VALID_TRIP_TYPES: string[] = ['solo', 'couple', 'friends', 'family', 'group', 'office', 'pilgrimage', 'wedding']
const VALID_PACES: string[] = ['relaxed', 'balanced', 'packed']
const VALID_INTERESTS: string[] = [
  'sightseeing', 'food', 'shopping', 'adventure', 'spiritual', 'museums',
  'nature', 'nightlife', 'photography', 'kid_friendly', 'senior_friendly',
  'luxury', 'budget', 'local_culture',
]
const VALID_FOOD: string[] = [
  'vegetarian', 'non_vegetarian', 'jain', 'vegan',
  'local_food', 'cafe_hopping', 'fine_dining', 'street_food',
]

function buildSystemPrompt(today: string): string {
  return `You extract structured trip information from natural language descriptions.
Today is ${today}.

Return ONLY valid JSON with this exact shape (use null for fields not mentioned):
{
  "tripName": string or null,
  "destination": string or null,
  "origin": string or null,
  "startDate": "YYYY-MM-DD" or null,
  "endDate": "YYYY-MM-DD" or null,
  "dayCount": number or null,
  "budget": number or null,
  "currency": "INR"|"USD"|"EUR"|"GBP"|"JPY"|"AUD"|"CAD"|"SGD" or null,
  "travellerCount": number or null,
  "tripType": "solo"|"couple"|"friends"|"family"|"group"|"office"|"pilgrimage"|"wedding" or null,
  "composition": {"couples": number, "adults": number, "kids": number, "seniors": number, "notes": string} or null,
  "pace": "relaxed"|"balanced"|"packed" or null,
  "interests": array or null,
  "foodPreferences": array or null,
  "mustVisit": string[] or null,
  "avoidPlaces": string[] or null,
  "constraints": string[] or null,
  "extraNotes": string or null
}

Valid interests: sightseeing, food, shopping, adventure, spiritual, museums, nature, nightlife, photography, kid_friendly, senior_friendly, luxury, budget, local_culture
Valid foodPreferences: vegetarian, non_vegetarian, jain, vegan, local_food, cafe_hopping, fine_dining, street_food

Rules:
- For relative dates ("next weekend", "in 2 weeks", "next month"), compute from today ${today}
- If only day count mentioned (e.g. "5 days"), set startDate to tomorrow and compute endDate
- Budget should be a number in the mentioned currency; default currency to INR if destination is Indian
- Only return valid values from the allowed lists for interests/foodPreferences/pace/tripType
- Return ONLY the JSON object, no markdown fences, no explanation`
}

function clamp(raw: unknown, valid: string[]): string | undefined {
  return typeof raw === 'string' && valid.includes(raw) ? raw : undefined
}

function clampArr(raw: unknown, valid: string[]): string[] {
  if (!Array.isArray(raw)) return []
  return (raw as unknown[]).filter((v): v is string => typeof v === 'string' && valid.includes(v))
}

function strArr(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return (raw as unknown[]).filter((v): v is string => typeof v === 'string' && v.length > 0)
}

export async function POST(request: Request) {
  const limit = rateLimit(`ai-parse-prompt:${clientKey(request)}`, 12, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const { prompt, today } = body as Record<string, unknown>
  if (typeof prompt !== 'string' || prompt.trim().length < 5) {
    return NextResponse.json({ error: 'invalid_prompt' }, { status: 400 })
  }
  const todayStr = typeof today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(today)
    ? today
    : new Date().toISOString().slice(0, 10)

  const provider = resolveAiProvider()

  // Mock path: simple regex extraction so the UI still works in dev without AI key.
  if (provider.isMock) {
    const destMatch = prompt.match(/\bto\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i)
      || prompt.match(/\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i)
    const destination = destMatch?.[1] ?? ''
    const brief: ParsedBrief = {}
    if (destination) { brief.destination = destination; brief.tripName = `${destination} Trip` }
    return NextResponse.json({ brief })
  }

  try {
    const completion = await provider.complete({
      tier: 'light',
      system: buildSystemPrompt(todayStr),
      maxTokens: 900,
      messages: [{ role: 'user', content: prompt.trim() }],
    })

    let parsed: Record<string, unknown> = {}
    try {
      const text = completion.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
      parsed = JSON.parse(text)
    } catch {
      return NextResponse.json({ brief: {} })
    }

    const brief: ParsedBrief = {}

    if (typeof parsed.tripName === 'string' && parsed.tripName) brief.tripName = parsed.tripName
    if (typeof parsed.destination === 'string' && parsed.destination) brief.destination = parsed.destination
    if (typeof parsed.origin === 'string' && parsed.origin) brief.origin = parsed.origin
    if (typeof parsed.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.startDate)) brief.startDate = parsed.startDate
    if (typeof parsed.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.endDate)) brief.endDate = parsed.endDate
    if (typeof parsed.dayCount === 'number' && parsed.dayCount > 0) brief.dayCount = Math.floor(parsed.dayCount)
    if (typeof parsed.budget === 'number' && parsed.budget > 0) brief.budget = parsed.budget
    if (typeof parsed.currency === 'string' && parsed.currency.length === 3) brief.currency = parsed.currency.toUpperCase()
    if (typeof parsed.travellerCount === 'number' && parsed.travellerCount > 0) brief.travellerCount = Math.min(30, Math.floor(parsed.travellerCount))

    const tt = clamp(parsed.tripType, VALID_TRIP_TYPES)
    if (tt) brief.tripType = tt as TripType
    const pace = clamp(parsed.pace, VALID_PACES)
    if (pace) brief.pace = pace as TravelPace

    const interests = clampArr(parsed.interests, VALID_INTERESTS)
    if (interests.length) brief.interests = interests as TripInterest[]
    const foodPrefs = clampArr(parsed.foodPreferences, VALID_FOOD)
    if (foodPrefs.length) brief.foodPreferences = foodPrefs as FoodPreference[]

    const mustVisit = strArr(parsed.mustVisit)
    if (mustVisit.length) brief.mustVisit = mustVisit
    const avoidPlaces = strArr(parsed.avoidPlaces)
    if (avoidPlaces.length) brief.avoidPlaces = avoidPlaces
    const constraints = strArr(parsed.constraints)
    if (constraints.length) brief.constraints = constraints

    if (typeof parsed.extraNotes === 'string' && parsed.extraNotes) brief.extraNotes = parsed.extraNotes

    if (parsed.composition && typeof parsed.composition === 'object') {
      const c = parsed.composition as Record<string, unknown>
      const comp: ParsedBrief['composition'] = {}
      if (typeof c.couples === 'number' && c.couples > 0) comp.couples = c.couples
      if (typeof c.adults === 'number' && c.adults > 0) comp.adults = c.adults
      if (typeof c.kids === 'number' && c.kids > 0) comp.kids = c.kids
      if (typeof c.seniors === 'number' && c.seniors > 0) comp.seniors = c.seniors
      if (typeof c.notes === 'string' && c.notes) comp.notes = c.notes
      if (Object.keys(comp).length > 0) brief.composition = comp
    }

    // Derive endDate from startDate + dayCount when only one is present.
    if (brief.startDate && brief.dayCount && !brief.endDate) {
      const start = new Date(brief.startDate)
      start.setDate(start.getDate() + brief.dayCount - 1)
      brief.endDate = start.toISOString().slice(0, 10)
    }

    return NextResponse.json({ brief })
  } catch {
    return NextResponse.json({ brief: {} })
  }
}
