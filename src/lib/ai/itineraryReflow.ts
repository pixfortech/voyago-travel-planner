/**
 * AI Itinerary Reflow — shared helpers (Phase 13).
 *
 * Import-safe on both client and server: no secrets, no `server-only`.
 * The server uses buildReflowPrompt + parseReflowResult + mockReflowResult.
 */

import type { ItineraryReflowInput, ItineraryReflowResult, ReflowWarning } from '@/types'

export const REFLOW_SYSTEM_PROMPT = `You are an expert travel itinerary planner.
When a trip's date range changes, some itinerary days may fall outside the new range.
Your job is to propose a smart redistribution: move activities from out-of-range days into
valid days in the new range, balancing the schedule sensibly.

Rules:
- Never remove activities unless there are absolutely no valid days remaining.
- If a day is completed (date < today) and protectCompleted is true, skip it entirely.
- Balance activities across the available valid days — don't pile everything onto one day.
- Maintain the logical flow of the trip (early check-in first, late checkout last, etc.).
- Return ONLY valid JSON. No markdown, no code blocks, no commentary.`

export function buildReflowUserMessage(input: ItineraryReflowInput): string {
  return `Trip: "${input.tripName}" to ${input.destination}
Date change: ${input.oldStartDate}–${input.oldEndDate} → ${input.newStartDate}–${input.newEndDate}
Today: ${input.today}
Protect completed days: ${input.protectCompleted}

Out-of-range days (${input.outOfRangeDays.length}):
${input.outOfRangeDays
  .map(
    (d) =>
      `Day ${d.dayNumber} (${d.date})${d.isCompleted ? ' [COMPLETED — SKIP]' : ''}:\n` +
      d.activities.map((a) => `  - ${a.time || '?'} ${a.title}`).join('\n'),
  )
  .join('\n\n')}

Valid dates available in new range:
${input.validDates.join(', ')}

Return a JSON object matching this shape:
{
  "summary": "One-sentence overview of what was done",
  "movedActivities": [
    { "activityId": "...", "activityTitle": "...", "fromDayDate": "YYYY-MM-DD", "toDayDate": "YYYY-MM-DD", "reason": "..." }
  ],
  "removedDays": [
    { "date": "YYYY-MM-DD", "dayNumber": 1, "reason": "..." }
  ],
  "proposedDays": [
    { "date": "YYYY-MM-DD", "dayNumber": 1, "activities": [{ "id": "...", "title": "...", "time": "...", "notes": "..." }] }
  ],
  "timingNotes": ["..."],
  "costImpact": "Brief note on cost implications",
  "routeImpact": "Brief note on route/travel implications",
  "warnings": [{ "type": "activity_removed", "message": "..." }]
}`
}

const VALID_WARNING_TYPES = new Set([
  'completed_day_skipped',
  'activity_removed',
  'day_gap',
  'timing_conflict',
  'general',
])

export function parseReflowResult(
  text: string,
  input: ItineraryReflowInput,
): ItineraryReflowResult {
  try {
    const clean = text.replace(/```json|```/g, '').trim()
    const raw = JSON.parse(clean)
    return {
      summary: String(raw.summary || 'Itinerary reflow complete.'),
      movedActivities: Array.isArray(raw.movedActivities) ? raw.movedActivities : [],
      removedDays: Array.isArray(raw.removedDays) ? raw.removedDays : [],
      proposedDays: Array.isArray(raw.proposedDays) ? raw.proposedDays : [],
      timingNotes: Array.isArray(raw.timingNotes) ? raw.timingNotes : [],
      costImpact: String(raw.costImpact || ''),
      routeImpact: String(raw.routeImpact || ''),
      warnings: Array.isArray(raw.warnings)
        ? (raw.warnings as ReflowWarning[]).filter((w) =>
            VALID_WARNING_TYPES.has(w.type),
          )
        : [],
    }
  } catch {
    return mockReflowResult(input)
  }
}

export function mockReflowResult(input: ItineraryReflowInput): ItineraryReflowResult {
  const movedActivities: ItineraryReflowResult['movedActivities'] = []
  const removedDays: ItineraryReflowResult['removedDays'] = []
  const warnings: ReflowWarning[] = []
  let activityIndex = 0

  for (const day of input.outOfRangeDays) {
    if (day.isCompleted && input.protectCompleted) {
      warnings.push({
        type: 'completed_day_skipped',
        message: `Day ${day.dayNumber} (${day.date}) is completed and was skipped.`,
      })
      continue
    }
    if (day.activities.length === 0) {
      removedDays.push({
        date: day.date,
        dayNumber: day.dayNumber,
        reason: 'Empty day removed — no activities to relocate.',
      })
      continue
    }
    for (const act of day.activities) {
      const targetDate =
        input.validDates[activityIndex % Math.max(input.validDates.length, 1)]
      movedActivities.push({
        activityId: act.id,
        activityTitle: act.title,
        fromDayDate: day.date,
        toDayDate: targetDate,
        reason: `Redistributed from out-of-range Day ${day.dayNumber} into new range.`,
      })
      activityIndex++
    }
  }

  return {
    summary: `${movedActivities.length} activit${movedActivities.length === 1 ? 'y' : 'ies'} redistributed across the new date range. ${removedDays.length} empty day${removedDays.length === 1 ? '' : 's'} removed.`,
    movedActivities,
    removedDays,
    proposedDays: [],
    timingNotes: [
      'Review timing for relocated activities — adjust start/end times as needed.',
    ],
    costImpact: 'No cost impact expected from the reflow.',
    routeImpact: 'Review the itinerary map after applying — order of stops may have changed.',
    warnings,
  }
}
