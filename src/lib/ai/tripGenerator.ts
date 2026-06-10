/**
 * AI Trip Generator — shared helpers (Phase 15C).
 *
 * Import-safe on both client and server: no secrets, no `server-only`.
 * The server uses TRIP_GENERATOR_SYSTEM_PROMPT + buildTripGeneratorUserMessage
 * + parseTripGeneratorResult + mockTripGeneratorResult.
 *
 * Generates a complete day-by-day itinerary for an existing trip. Returns a
 * PREVIEW ONLY — the endpoint never mutates Firestore and the client must let
 * the user confirm before applying. All cost/time/route figures are approximate.
 */

import type {
  TripGeneratorInput,
  TripGeneratorResult,
  GeneratedActivity,
  GeneratedDay,
  ActivityCategory,
  ActivityPriority,
  BookingStatus,
  InsightConfidence,
} from '@/types'
import { getCuratedPlaces, genericCandidate, type CuratedPlace } from './curatedPlaces'

export const TRIP_GENERATOR_APPROXIMATE_LABEL =
  'This itinerary is AI-generated and approximate. Costs, timings, opening hours and routes are estimates — verify before booking and edit before applying.'

const MODE_LABEL: Record<TripGeneratorInput['mode'], string> = {
  append: 'Add new activities alongside existing ones (nothing is removed)',
  fill_empty: 'Only fill days that currently have no activities',
  replace_future: 'Replace future days only (completed/past days are protected)',
  replace_all_unprotected: 'Replace today and future days (completed/visited days are protected)',
}

export const TRIP_GENERATOR_SYSTEM_PROMPT = `You are Voyago's expert India-first travel itinerary generator.
You build complete, realistic, day-by-day trip plans tailored to the traveller group.

REAL PLACES — THE MOST IMPORTANT RULE:
- Every sightseeing/spiritual/adventure/leisure/shopping stop MUST be a REAL, named,
  existing place at or near the destination (e.g. for Gangtok: "Tashi View Point",
  "Ganesh Tok", "Enchey Monastery", "MG Marg", "Rumtek Monastery", "Tsomgo Lake").
- NEVER output generic placeholder titles such as "sightseeing highlight 1.1",
  "Point of interest", "Local attraction", "Day 1 activity" or numbered labels.
- The "title" must be the actual place name. "suggestedPlaceSearchQuery" must be a
  precise Google-searchable string like "Tashi View Point, Gangtok".
- If you are NOT confident a place really exists, set "needsVerification": true and
  make the title a clear, specific search intent (e.g. "Best momos restaurant near MG Marg")
  so it can be resolved against Google Places before use. Do this rarely.

Other hard rules:
- Plan ONLY within the given trip dates. Never invent days outside the range.
- Respect the traveller composition. If seniors or kids are present, reduce walking,
  add rest breaks, avoid very early starts / very late nights, and keep a gentler pace.
- Respect the pace: relaxed = 2–3 stops/day, balanced = 3–4, packed = 5–6.
- Respect food preferences strictly (e.g. vegetarian/Jain). Treat allergy/avoid lists as
  constraints but NEVER claim a place is medically safe — add a caveat instead.
- Keep total estimated cost within the budget when possible; warn clearly if it is tight or over.
- Order stops geographically to minimise back-and-forth travel within each day.
- If a "stay/base location" is given, START and END each day near that base.
- Include realistic meal breaks and rest breaks based on the group.
- Provide a tentative time-to-spend for each stop and brief travel notes between major stops.
- Do NOT claim exact opening hours, exact prices, or specific menu items unless clearly
  labelled as approximate. All numbers are estimates.
- Costs are in the trip's currency. estimatedCost is the TOTAL for the whole group;
  estimatedCostPerPerson is per traveller.
- Return ONLY valid JSON. No markdown, no code fences, no commentary.`

function compositionLine(input: TripGeneratorInput): string {
  const c = input.composition
  const parts: string[] = []
  if (c.couples) parts.push(`${c.couples} couple(s)`)
  if (c.adults) parts.push(`${c.adults} adult(s)`)
  if (c.kids) parts.push(`${c.kids} kid(s)`)
  if (c.seniors) parts.push(`${c.seniors} senior(s)`)
  if (c.friends) parts.push(`${c.friends} friend(s)`)
  if (c.family) parts.push('family group')
  if (c.office) parts.push('office group')
  if (c.pilgrimage) parts.push('pilgrimage group')
  const base = parts.length ? parts.join(', ') : `${c.total} traveller(s)`
  return c.notes ? `${base}. Notes: ${c.notes}` : base
}

export function buildTripGeneratorUserMessage(input: TripGeneratorInput): string {
  const p = input.preferences
  const existing = input.existingDays?.length
    ? input.existingDays
        .map(
          (d) =>
            `- ${d.date} (Day ${d.dayNumber})${d.isPast ? ' [PAST]' : ''}${d.isProtected ? ' [PROTECTED]' : ''}${d.isEmpty ? ' [EMPTY]' : `: ${d.activityTitles.join(', ')}`}`,
        )
        .join('\n')
    : '(no existing activities)'

  return `Destination: ${input.destination}
Dates: ${input.startDate} → ${input.endDate} (${input.dayCount} day(s))
Today: ${input.today}
Trip type: ${input.tripType}
Travellers: ${input.travellerCount} total — ${compositionLine(input)}
Budget: ${input.currency} ${input.budget > 0 ? input.budget : 'not specified'} (total for the group)
${input.stayBase ? `Stay / base location (start & end each day near here): ${input.stayBase}` : ''}
Pace: ${p.pace}
Interests: ${p.interests.length ? p.interests.join(', ') : 'general sightseeing'}
Food preferences: ${p.foodPreferences.length ? p.foodPreferences.join(', ') : 'no specific preference'}
${p.foodAvoid ? `Food to avoid / allergies (constraint, not a safety guarantee): ${p.foodAvoid}` : ''}
Accommodation style: ${p.accommodationStyle ?? 'not specified'}
Route preference: ${p.routePreference ?? 'balanced'}
Constraints: ${p.constraints.length ? p.constraints.join('; ') : 'none'}
Must-visit places: ${p.mustVisit.length ? p.mustVisit.join(', ') : 'none specified'}
Avoid places: ${p.avoidPlaces.length ? p.avoidPlaces.join(', ') : 'none specified'}
${p.extraNotes ? `Extra notes: ${p.extraNotes}` : ''}

Generation mode: ${MODE_LABEL[input.mode]}
Existing itinerary days:
${existing}

When the mode is "fill empty" or "append", do not duplicate places already listed above
unless a revisit clearly makes sense. When replacing, only plan the non-protected days.

Return a JSON object exactly matching this shape:
{
  "tripSummary": "2–3 sentence overview of the plan",
  "assumptions": ["assumptions you made"],
  "dayPlans": [
    {
      "date": "YYYY-MM-DD",
      "dayNumber": 1,
      "theme": "short day theme",
      "estimatedDayCost": 0,
      "mealPlan": "brief meal plan",
      "restBreaks": "brief rest-break note",
      "notes": "optional day note",
      "activities": [
        {
          "title": "REAL place name (e.g. Tashi View Point)",
          "description": "1 sentence",
          "category": "sightseeing|food|hotel|transport|shopping|adventure|spiritual|leisure|emergency|other",
          "startTime": "HH:MM",
          "endTime": "HH:MM",
          "estimatedCost": 0,
          "estimatedCostPerPerson": 0,
          "locationName": "REAL place name",
          "suggestedPlaceSearchQuery": "Real place name, City",
          "bookingStatus": "planned",
          "priority": "must|recommended|optional",
          "needsVerification": false,
          "foodInsightNotes": "for food stops only",
          "routeNotes": "travel note to next stop",
          "whyRecommended": "why this fits the group",
          "timeToSpend": "e.g. 1–2 hrs",
          "isBreak": false
        }
      ]
    }
  ],
  "budgetSummary": {
    "totalEstimatedCost": 0,
    "perHeadEstimate": 0,
    "remainingBuffer": 0,
    "highCostRisks": ["..."],
    "withinBudget": true
  },
  "comfortSummary": {
    "walkingIntensity": "low|moderate|high",
    "elderlyFriendly": true,
    "kidFriendly": true,
    "paceRisk": "low|medium|high",
    "notes": ["..."]
  },
  "routeSummary": {
    "logic": "how stops were ordered",
    "backtrackingRisk": "low|medium|high",
    "notes": ["..."]
  },
  "warnings": ["over budget / too packed / long travel / comfort risks"],
  "confidence": "low|medium|high"
}`
}

// ── Parsing / validation ─────────────────────────────────────────────────────

const VALID_CATEGORIES = new Set<ActivityCategory>([
  'sightseeing', 'food', 'hotel', 'transport', 'shopping',
  'adventure', 'spiritual', 'leisure', 'emergency', 'other',
])
const VALID_PRIORITIES = new Set<ActivityPriority>(['must', 'recommended', 'optional'])
const VALID_CONFIDENCE = new Set<InsightConfidence>(['low', 'medium', 'high'])

function str(v: unknown, fallback = ''): string {
  return v == null ? fallback : String(v)
}
function num(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}
function strArray(v: unknown, max = 10): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => String(x)).filter(Boolean).slice(0, max)
}

function coerceActivity(raw: unknown): GeneratedActivity {
  const a = (raw ?? {}) as Record<string, unknown>
  const category = typeof a.category === 'string' && VALID_CATEGORIES.has(a.category as ActivityCategory)
    ? (a.category as ActivityCategory)
    : 'other'
  const priority = typeof a.priority === 'string' && VALID_PRIORITIES.has(a.priority as ActivityPriority)
    ? (a.priority as ActivityPriority)
    : undefined
  const bookingStatus: BookingStatus = 'planned'
  return {
    title: str(a.title, 'Untitled activity'),
    description: a.description ? str(a.description) : undefined,
    category,
    startTime: a.startTime ? str(a.startTime) : undefined,
    endTime: a.endTime ? str(a.endTime) : undefined,
    estimatedCost: Math.max(0, num(a.estimatedCost)),
    estimatedCostPerPerson: a.estimatedCostPerPerson != null ? Math.max(0, num(a.estimatedCostPerPerson)) : undefined,
    locationName: a.locationName ? str(a.locationName) : undefined,
    suggestedPlaceSearchQuery: a.suggestedPlaceSearchQuery ? str(a.suggestedPlaceSearchQuery) : undefined,
    bookingStatus,
    priority,
    foodInsightNotes: a.foodInsightNotes ? str(a.foodInsightNotes) : undefined,
    routeNotes: a.routeNotes ? str(a.routeNotes) : undefined,
    whyRecommended: a.whyRecommended ? str(a.whyRecommended) : undefined,
    timeToSpend: a.timeToSpend ? str(a.timeToSpend) : undefined,
    isBreak: Boolean(a.isBreak),
    needsVerification: a.needsVerification === true ? true : undefined,
  }
}

function coerceDays(raw: unknown): GeneratedDay[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 30).map((d, i) => {
    const day = (d ?? {}) as Record<string, unknown>
    const acts = Array.isArray(day.activities) ? day.activities : []
    return {
      date: str(day.date),
      dayNumber: num(day.dayNumber, i + 1),
      theme: day.theme ? str(day.theme) : undefined,
      estimatedDayCost: Math.max(0, num(day.estimatedDayCost)),
      mealPlan: day.mealPlan ? str(day.mealPlan) : undefined,
      restBreaks: day.restBreaks ? str(day.restBreaks) : undefined,
      notes: day.notes ? str(day.notes) : undefined,
      activities: acts.slice(0, 20).map(coerceActivity),
    }
  })
}

export function parseTripGeneratorResult(
  text: string,
  input: TripGeneratorInput,
): TripGeneratorResult {
  try {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end < 0) throw new Error('no_json')
    const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
    const dayPlans = coerceDays(raw.dayPlans)
    if (dayPlans.length === 0) throw new Error('empty')

    const bs = (raw.budgetSummary ?? {}) as Record<string, unknown>
    const cs = (raw.comfortSummary ?? {}) as Record<string, unknown>
    const rs = (raw.routeSummary ?? {}) as Record<string, unknown>

    const total = num(bs.totalEstimatedCost) ||
      dayPlans.reduce((s, d) => s + d.activities.reduce((t, a) => t + a.estimatedCost, 0), 0)
    const perHead = num(bs.perHeadEstimate) || (input.travellerCount > 0 ? Math.round(total / input.travellerCount) : total)
    const buffer = input.budget > 0 ? input.budget - total : 0

    const confidence = typeof raw.confidence === 'string' && VALID_CONFIDENCE.has(raw.confidence as InsightConfidence)
      ? (raw.confidence as InsightConfidence)
      : 'medium'

    return {
      tripSummary: str(raw.tripSummary, 'Generated trip plan.'),
      assumptions: strArray(raw.assumptions),
      dayPlans,
      budgetSummary: {
        totalEstimatedCost: total,
        perHeadEstimate: perHead,
        remainingBuffer: typeof bs.remainingBuffer === 'number' ? bs.remainingBuffer : buffer,
        highCostRisks: strArray(bs.highCostRisks),
        withinBudget: typeof bs.withinBudget === 'boolean' ? bs.withinBudget : (input.budget <= 0 || total <= input.budget),
      },
      comfortSummary: {
        walkingIntensity: ['low', 'moderate', 'high'].includes(str(cs.walkingIntensity)) ? (cs.walkingIntensity as 'low' | 'moderate' | 'high') : 'moderate',
        elderlyFriendly: cs.elderlyFriendly !== false,
        kidFriendly: cs.kidFriendly !== false,
        paceRisk: ['low', 'medium', 'high'].includes(str(cs.paceRisk)) ? (cs.paceRisk as 'low' | 'medium' | 'high') : 'low',
        notes: strArray(cs.notes),
      },
      routeSummary: {
        logic: str(rs.logic, 'Stops grouped by area to limit travel.'),
        backtrackingRisk: ['low', 'medium', 'high'].includes(str(rs.backtrackingRisk)) ? (rs.backtrackingRisk as 'low' | 'medium' | 'high') : 'low',
        notes: strArray(rs.notes),
      },
      warnings: strArray(raw.warnings),
      confidence,
      approximateLabel: TRIP_GENERATOR_APPROXIMATE_LABEL,
    }
  } catch (err) {
    // Never fall back to mock data here — that would silently inject [DEV MOCK]
    // content into a real-AI response path and mislead the user. Throw so the
    // route handler can return a clear error and log the raw response for diagnosis.
    const reason = err instanceof Error ? err.message : String(err)
    console.error('[Voyago AI] parseTripGeneratorResult: failed to extract JSON from Claude response', {
      reason,
      responseLength: text.length,
      // First 300 chars without newlines — enough to diagnose truncation/fencing.
      responsePreview: text.slice(0, 300).replace(/\n/g, ' '),
    })
    throw new Error(`trip_parse_failed:${reason}`)
  }
}

// ── Deterministic dev mock (AI_PROVIDER=mock only) ────────────────────────────

/** Dates the mock should plan, honouring the mode + existing-day protections. */
function targetDates(input: TripGeneratorInput): { date: string; dayNumber: number }[] {
  if (input.existingDays?.length) {
    return input.existingDays
      .filter((d) => {
        if (d.isProtected) return false
        switch (input.mode) {
          case 'fill_empty': return d.isEmpty && !d.isPast
          case 'replace_future': return d.date > input.today
          case 'replace_all_unprotected': return d.date >= input.today
          case 'append':
          default: return !d.isPast
        }
      })
      .map((d) => ({ date: d.date, dayNumber: d.dayNumber }))
  }
  // Fallback: derive from range.
  const out: { date: string; dayNumber: number }[] = []
  const start = new Date(input.startDate + 'T00:00:00Z')
  for (let i = 0; i < input.dayCount && i < 30; i++) {
    const d = new Date(start)
    d.setUTCDate(d.getUTCDate() + i)
    out.push({ date: d.toISOString().slice(0, 10), dayNumber: i + 1 })
  }
  return out
}

export function mockTripGeneratorResult(input: TripGeneratorInput): TripGeneratorResult {
  const perDay = input.preferences.pace === 'relaxed' ? 2 : input.preferences.pace === 'packed' ? 5 : 3
  const dates = targetDates(input)
  const isINR = input.currency === 'INR'
  const sightCost = isINR ? 500 : 12
  const mealCost = isINR ? 400 : 10

  // Real curated places for known destinations; otherwise a generic, clearly
  // unverified pool that the UI must resolve via Google Places before applying.
  const curated = getCuratedPlaces(input.destination)
  const interestCats: ActivityCategory[] = []
  for (const it of input.preferences.interests) {
    if (it === 'food') interestCats.push('food')
    else if (it === 'shopping') interestCats.push('shopping')
    else if (it === 'adventure') interestCats.push('adventure')
    else if (it === 'spiritual') interestCats.push('spiritual')
    else if (it === 'nature') interestCats.push('sightseeing')
    else interestCats.push('sightseeing')
  }
  if (interestCats.length === 0) interestCats.push('sightseeing')

  // Pool of real places. Must-visits are prepended (treated as real, verified by the user).
  const mustVisits: CuratedPlace[] = input.preferences.mustVisit.map((m) => ({ name: m, category: 'sightseeing' as ActivityCategory }))
  const placePool: CuratedPlace[] = [...mustVisits, ...(curated ?? [])]
  let poolIdx = 0
  let genericIdx = 0
  let usedGeneric = false

  const dayPlans: GeneratedDay[] = []
  let total = 0

  for (let di = 0; di < dates.length; di++) {
    const { date, dayNumber } = dates[di]!
    const activities: GeneratedActivity[] = []
    let clock = 9 * 60

    for (let k = 0; k < perDay; k++) {
      const start = `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`
      clock += 120
      const end = `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`

      let title: string
      let cat: ActivityCategory
      let query: string
      let needsVerification: boolean

      const seed = placePool[poolIdx]
      if (seed) {
        title = seed.name
        cat = seed.category
        query = `${seed.name}, ${input.destination}`
        needsVerification = false
        poolIdx++
      } else {
        // Out of curated/must-visit places — emit a real-sounding, verifiable
        // search intent (never a "highlight 1.1" placeholder).
        const cand = genericCandidate(input.destination, interestCats[(di + k) % interestCats.length]!, genericIdx++)
        title = cand.title
        cat = interestCats[(di + k) % interestCats.length]!
        query = cand.searchQuery
        needsVerification = true
        usedGeneric = true
      }

      const cost = cat === 'food' ? mealCost : sightCost
      total += cost
      activities.push({
        title,
        description: needsVerification ? 'AI suggestion — verify with Google Places before applying.' : 'Popular stop matched to your interests.',
        category: cat,
        startTime: start,
        endTime: end,
        estimatedCost: cost,
        estimatedCostPerPerson: input.travellerCount > 0 ? Math.round(cost / input.travellerCount) : cost,
        locationName: title,
        suggestedPlaceSearchQuery: query,
        bookingStatus: 'planned',
        priority: k === 0 ? 'must' : 'recommended',
        whyRecommended: `Fits a ${input.preferences.pace} pace for your group.`,
        timeToSpend: seed?.timeToSpend ?? '1–2 hrs',
        routeNotes: 'Short hop to the next stop.',
        needsVerification: needsVerification || undefined,
      })

      if (k === 0) {
        const ls = `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`
        clock += 60
        const le = `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`
        total += mealCost
        activities.push({
          title: input.preferences.foodPreferences.includes('vegetarian') ? 'Vegetarian lunch break' : 'Lunch break',
          category: 'food',
          startTime: ls,
          endTime: le,
          estimatedCost: mealCost,
          estimatedCostPerPerson: input.travellerCount > 0 ? Math.round(mealCost / input.travellerCount) : mealCost,
          bookingStatus: 'planned',
          isBreak: true,
          foodInsightNotes: 'Rest and refuel; pick a place matching your food preferences.',
          timeToSpend: '45–60 min',
        })
      }
    }

    dayPlans.push({
      date,
      dayNumber,
      theme: `Day ${dayNumber} in ${input.destination}`,
      estimatedDayCost: activities.reduce((s, a) => s + a.estimatedCost, 0),
      mealPlan: 'One sit-down meal plus a light snack.',
      restBreaks: input.composition.seniors || input.composition.kids ? 'Extra rest breaks added for comfort.' : 'Standard breaks.',
      activities,
    })
  }

  const perHead = input.travellerCount > 0 ? Math.round(total / input.travellerCount) : total
  const warnings: string[] = []
  if (input.budget > 0 && total > input.budget) {
    warnings.push('Estimated cost exceeds the budget — trim optional stops or pick cheaper options.')
  }
  if (input.preferences.pace === 'packed' && (input.composition.seniors || input.composition.kids)) {
    warnings.push('A packed pace may be tiring for seniors/kids — consider a relaxed pace.')
  }
  if (dates.length === 0) {
    warnings.push('No eligible days to plan for the selected mode — all days may be protected or in the past.')
  }
  if (usedGeneric) {
    warnings.push('Some stops are AI suggestions that need Google Places verification before applying.')
  }

  // isMock=true (set by the route) is what the UI uses to show the "Development Mock" badge.
  // These content strings must not say "[DEV MOCK]" — that text shows as raw UI content.
  const assumptions = [
    'Costs and timings are estimates — edit before applying.',
  ]
  if (curated) assumptions.push(`Place suggestions drawn from a curated set for ${input.destination}.`)
  if (usedGeneric) assumptions.push('Some stops are generic suggestions that need verification.')

  return {
    tripSummary: curated
      ? `A ${input.preferences.pace} ${dates.length}-day plan for ${input.destination} built from well-known local places for ${input.travellerCount} traveller(s).`
      : `A ${input.preferences.pace} ${dates.length}-day plan for ${input.destination} for ${input.travellerCount} traveller(s) — verify locations with Google Places before applying.`,
    assumptions,
    dayPlans,
    budgetSummary: {
      totalEstimatedCost: total,
      perHeadEstimate: perHead,
      remainingBuffer: input.budget > 0 ? input.budget - total : 0,
      highCostRisks: [],
      withinBudget: input.budget <= 0 || total <= input.budget,
    },
    comfortSummary: {
      walkingIntensity: input.preferences.pace === 'packed' ? 'high' : 'moderate',
      elderlyFriendly: !!input.composition.seniors === false || input.preferences.pace !== 'packed',
      kidFriendly: !!input.composition.kids === false || input.preferences.pace !== 'packed',
      paceRisk: input.preferences.pace === 'packed' ? 'high' : input.preferences.pace === 'balanced' ? 'medium' : 'low',
      notes: ['Comfort estimates are approximate — review for your group before applying.'],
    },
    routeSummary: {
      logic: 'Stops are ordered day by day; use "Optimise routes" for road-efficient order.',
      backtrackingRisk: 'low',
      notes: [],
    },
    warnings,
    confidence: 'low',
    approximateLabel: TRIP_GENERATOR_APPROXIMATE_LABEL,
  }
}
