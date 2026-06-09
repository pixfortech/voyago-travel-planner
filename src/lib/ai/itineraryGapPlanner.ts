/**
 * AI Itinerary Gap Planner — shared helpers (Phase 15A).
 *
 * Import-safe on both client and server: no secrets, no `server-only`.
 * The server uses buildGapPlannerUserMessage + parseGapPlannerResult +
 * mockGapPlannerResult.
 *
 * The planner proposes how to spend the REMAINING trip given what has already
 * been visited. It returns a PREVIEW ONLY — the endpoint never mutates Firestore
 * and the client must let the user confirm before applying. All cost/time
 * figures are approximate.
 */

import type {
  GapPlannerInput,
  GapPlannerResult,
  GapPlannerMode,
  GapPlannerProposedDay,
} from '@/types'

const MODE_LABEL: Record<GapPlannerMode, string> = {
  complete_remaining: 'Complete the remaining trip',
  today_only: 'Plan today only',
  tomorrow_only: 'Plan tomorrow only',
  next_few_hours: 'Plan the next few hours',
  fill_free_time: 'Fill free time around existing plans',
  replace_missed: 'Replace missed / skipped places',
}

export function gapPlannerModeLabel(mode: GapPlannerMode): string {
  return MODE_LABEL[mode] ?? 'Plan the remaining trip'
}

export const GAP_PLANNER_SYSTEM_PROMPT = `You are Voyago's adaptive trip assistant for India-first travellers.
The traveller is MID-TRIP. You are given what they have already visited and what
remains in their itinerary, and you must plan only the requested remaining scope.

Rules:
- Respect the chosen planning mode strictly (e.g. "today only" must not plan other days).
- Do NOT repeat places already visited unless allowRevisits is true.
- Prefer places that already exist in the remaining itinerary; you may add sensible
  nearby alternatives when helpful, clearly as new suggestions.
- Order stops to minimise back-and-forth travel. If a current location is given, start from it.
- Build a realistic day: include food and rest breaks, and respect the pace
  (relaxed = fewer stops, packed = more).
- Keep estimated costs realistic for the destination and currency. All costs and
  times are APPROXIMATE.
- Never invent bookings, prices from menus, or specific review quotes.
- Stay within budgetRemaining when provided; warn if the plan is tight.
- Return ONLY valid JSON. No markdown, no code fences, no commentary.`

export function buildGapPlannerUserMessage(input: GapPlannerInput): string {
  const visited = input.visitedPlaces.length
    ? input.visitedPlaces.map((p) => `- ${p.title}${p.category ? ` (${p.category})` : ''}`).join('\n')
    : '(none recorded)'
  const remaining = input.remainingPlaces.length
    ? input.remainingPlaces
        .map(
          (p) =>
            `- ${p.title}${p.category ? ` (${p.category})` : ''}${p.date ? ` [planned ${p.date}]` : ''}`,
        )
        .join('\n')
    : '(none remaining)'

  return `Trip: "${input.tripName}" to ${input.destination}
Trip type: ${input.tripType}, ${input.travellerCount} traveller(s), currency ${input.currency}
Dates: ${input.startDate} → ${input.endDate}
Today: ${input.today}${input.nowTime ? `, current time ${input.nowTime}` : ''}
Planning mode: ${MODE_LABEL[input.mode]}
Pace: ${input.pace}
Allow revisiting already-visited places: ${input.allowRevisits ? 'yes' : 'no'}
Start point: ${
    input.hasCurrentLocation && input.currentLocation
      ? `current location (${input.currentLocation.lat.toFixed(4)}, ${input.currentLocation.lng.toFixed(4)})`
      : input.startPointName || 'not specified — assume a central start'
  }
${input.budgetRemaining != null ? `Budget remaining (${input.currency}): ${input.budgetRemaining}` : 'Budget remaining: not specified'}
${input.constraints ? `Constraints: ${input.constraints}` : ''}

Already visited:
${visited}

Remaining itinerary places:
${remaining}

Return a JSON object matching this shape:
{
  "summary": "1–2 sentence overview of the proposed remaining plan",
  "proposedDays": [
    {
      "date": "YYYY-MM-DD",
      "label": "Today | Tomorrow | <weekday>",
      "activities": [
        {
          "title": "...",
          "category": "sightseeing|food|hotel|transport|shopping|adventure|spiritual|leisure|emergency|other",
          "startTime": "HH:MM",
          "endTime": "HH:MM",
          "estimatedCost": 0,
          "locationName": "...",
          "notes": "...",
          "isBreak": false,
          "fromRemaining": true
        }
      ]
    }
  ],
  "routeOrderNote": "Brief note on the travel order/logic",
  "estimatedTotalCost": 0,
  "timingNotes": ["..."],
  "warnings": ["..."]
}`
}

const VALID_CATEGORIES = new Set([
  'sightseeing', 'food', 'hotel', 'transport', 'shopping',
  'adventure', 'spiritual', 'leisure', 'emergency', 'other',
])

function coerceStringArray(value: unknown, max = 8): string[] {
  if (!Array.isArray(value)) return []
  return value.map((v) => String(v)).filter(Boolean).slice(0, max)
}

function coerceProposedDays(value: unknown): GapPlannerProposedDay[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 10).map((d) => {
    const day = d as Record<string, unknown>
    const acts = Array.isArray(day.activities) ? day.activities : []
    return {
      date: String(day.date ?? ''),
      label: String(day.label ?? ''),
      activities: acts.slice(0, 20).map((a) => {
        const act = a as Record<string, unknown>
        const cat = typeof act.category === 'string' && VALID_CATEGORIES.has(act.category)
          ? (act.category as GapPlannerProposedDay['activities'][number]['category'])
          : undefined
        return {
          title: String(act.title ?? 'Untitled'),
          category: cat,
          startTime: act.startTime ? String(act.startTime) : undefined,
          endTime: act.endTime ? String(act.endTime) : undefined,
          estimatedCost: act.estimatedCost != null ? Number(act.estimatedCost) || 0 : undefined,
          locationName: act.locationName ? String(act.locationName) : undefined,
          notes: act.notes ? String(act.notes) : undefined,
          isBreak: Boolean(act.isBreak),
          fromRemaining: Boolean(act.fromRemaining),
        }
      }),
    }
  })
}

export const GAP_PLANNER_APPROXIMATE_LABEL =
  'This plan is AI-generated and approximate. Review and edit before applying.'

export function parseGapPlannerResult(
  text: string,
  input: GapPlannerInput,
): GapPlannerResult {
  try {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end < 0) throw new Error('no_json')
    const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
    const proposedDays = coerceProposedDays(raw.proposedDays)
    if (proposedDays.length === 0) throw new Error('empty')
    return {
      summary: String(raw.summary || 'Proposed plan for the remaining trip.'),
      mode: input.mode,
      proposedDays,
      routeOrderNote: String(raw.routeOrderNote || ''),
      estimatedTotalCost: Number(raw.estimatedTotalCost) || 0,
      timingNotes: coerceStringArray(raw.timingNotes),
      warnings: coerceStringArray(raw.warnings),
      approximateLabel: GAP_PLANNER_APPROXIMATE_LABEL,
    }
  } catch {
    return mockGapPlannerResult(input)
  }
}

/** Pick the target dates a mode should plan, from the remaining trip range. */
function targetDatesForMode(input: GapPlannerInput): string[] {
  const { today, endDate, mode } = input
  const addDays = (iso: string, n: number) => {
    const d = new Date(iso + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }
  const tomorrow = addDays(today, 1)
  switch (mode) {
    case 'today_only':
    case 'next_few_hours':
    case 'fill_free_time':
      return [today]
    case 'tomorrow_only':
      return tomorrow <= endDate ? [tomorrow] : [today]
    case 'replace_missed':
    case 'complete_remaining':
    default: {
      const dates: string[] = []
      let cur = today
      let guard = 0
      while (cur <= endDate && guard < 60) {
        dates.push(cur)
        cur = addDays(cur, 1)
        guard++
      }
      return dates.length ? dates : [today]
    }
  }
}

export function mockGapPlannerResult(input: GapPlannerInput): GapPlannerResult {
  const dates = targetDatesForMode(input)
  const perDay = input.pace === 'relaxed' ? 2 : input.pace === 'packed' ? 5 : 3

  // Pool of places to schedule: remaining first; skipped/visited only if revisits allowed.
  const pool = [...input.remainingPlaces]
  if (input.allowRevisits) pool.push(...input.visitedPlaces)

  const proposedDays: GapPlannerProposedDay[] = []
  let poolIdx = 0
  let estimatedTotalCost = 0

  for (let di = 0; di < dates.length; di++) {
    const date = dates[di]!
    const label = di === 0 ? 'Today' : di === 1 ? 'Tomorrow' : `Day ${input.startDate <= date ? '' : ''}${date}`
    const activities: GapPlannerProposedDay['activities'] = []
    let clock = 9 * 60 // 09:00 in minutes

    for (let k = 0; k < perDay && poolIdx < pool.length; k++) {
      const place = pool[poolIdx++]!
      const startTime = `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`
      clock += 120
      const endTime = `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`
      activities.push({
        title: place.title,
        category: place.category,
        startTime,
        endTime,
        estimatedCost: 0,
        locationName: place.title,
        notes: 'Suggested from your remaining itinerary.',
        fromRemaining: true,
      })
      // Add a food break mid-day after the first stop.
      if (k === 0) {
        const lunchStart = `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`
        clock += 60
        const lunchEnd = `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`
        const mealCost = input.currency === 'INR' ? 400 : 10
        estimatedTotalCost += mealCost
        activities.push({
          title: 'Lunch / food break',
          category: 'food',
          startTime: lunchStart,
          endTime: lunchEnd,
          estimatedCost: mealCost,
          notes: 'Rest and refuel before the next stop.',
          isBreak: true,
          fromRemaining: false,
        })
      }
    }

    if (activities.length > 0) proposedDays.push({ date, label, activities })
    if (poolIdx >= pool.length && input.mode !== 'complete_remaining') break
  }

  const warnings: string[] = []
  if (input.remainingPlaces.length === 0 && !input.allowRevisits) {
    warnings.push('No remaining places with details were available — enable revisits or add places.')
  }
  if (input.budgetRemaining != null && estimatedTotalCost > input.budgetRemaining) {
    warnings.push('Estimated cost may exceed your remaining budget — review before applying.')
  }
  if (!input.hasCurrentLocation) {
    warnings.push('No current location provided — travel order is based on itinerary order only.')
  }

  return {
    summary: `[DEV MOCK] Proposed ${MODE_LABEL[input.mode].toLowerCase()} across ${proposedDays.length} day(s) from your remaining places.`,
    mode: input.mode,
    proposedDays,
    routeOrderNote: input.hasCurrentLocation
      ? 'Stops ordered starting from your current location (approximate).'
      : 'Stops follow your existing itinerary order — provide current location for nearer-first ordering.',
    estimatedTotalCost,
    timingNotes: [
      'Times are suggestions — adjust to your actual pace.',
      'A food break is included; add more rest if travelling with family or elders.',
    ],
    warnings,
    approximateLabel: GAP_PLANNER_APPROXIMATE_LABEL,
  }
}
