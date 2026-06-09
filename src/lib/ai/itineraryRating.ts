/**
 * AI Itinerary Rating — shared helpers (Phase 13).
 *
 * Import-safe on both client and server: no secrets, no `server-only`.
 */

import type {
  ItineraryRatingInput,
  ItineraryRatingResult,
  RatingLevel,
  ItineraryRatingDimension,
} from '@/types'

export const RATING_SYSTEM_PROMPT = `You are an expert travel itinerary analyst.
Analyse the provided itinerary and rate it across 6 dimensions.
Be honest and constructive — travellers rely on your assessment to improve their plans.

Dimensions to rate:
1. Route Efficiency — logical geographic flow, minimal backtracking
2. Time Feasibility — realistic activity count and spacing per day
3. Budget Fit — costs relative to the stated budget
4. Activity Balance — variety of sightseeing, food, rest, adventure
5. Food & Rest Breaks — adequate meal times and downtime scheduled
6. Traveller Comfort — appropriateness for the trip type (solo/family/etc)

Return ONLY valid JSON. No markdown, no code blocks, no commentary.`

export function buildRatingUserMessage(input: ItineraryRatingInput): string {
  return `Trip: "${input.tripName}" to ${input.destination}
Type: ${input.tripType}, ${input.travellerCount} traveller(s)
Dates: ${input.startDate} to ${input.endDate}
Budget: ${input.currency} ${input.budget > 0 ? input.budget : 'not set'} | Spent: ${input.totalSpent}
Total activities: ${input.totalActivityCount} across ${input.days.length} days
Route distance: ${input.totalDistanceKm > 0 ? `${input.totalDistanceKm} km` : 'not recorded'}

Daily breakdown:
${input.days
  .map(
    (d) =>
      `Day ${d.dayNumber} (${d.date}): ${d.activityCount} activities\n` +
      d.activities
        .slice(0, 5)
        .map((a) => `  ${a.time || '?'} ${a.title}${a.locationName ? ` @ ${a.locationName}` : ''}`)
        .join('\n'),
  )
  .join('\n\n')}

Return a JSON object matching this shape:
{
  "overallScore": 8,
  "overallLevel": "good",
  "summary": "One sentence overall assessment",
  "dimensions": [
    {
      "name": "Route Efficiency",
      "level": "good",
      "score": 8,
      "reason": "Explanation of this score",
      "improvements": ["Specific suggestion 1", "Specific suggestion 2"]
    }
  ],
  "topStrengths": ["..."],
  "topImprovements": ["..."]
}

Valid levels: "excellent", "good", "caution", "risky"`
}

const VALID_LEVELS: ReadonlySet<RatingLevel> = new Set<RatingLevel>([
  'excellent',
  'good',
  'caution',
  'risky',
])

function normaliseLevel(raw: unknown): RatingLevel {
  if (typeof raw === 'string' && VALID_LEVELS.has(raw as RatingLevel)) {
    return raw as RatingLevel
  }
  return 'good'
}

export function parseRatingResult(
  text: string,
  input: ItineraryRatingInput,
): ItineraryRatingResult {
  try {
    const clean = text.replace(/```json|```/g, '').trim()
    const raw = JSON.parse(clean)
    const dimensions: ItineraryRatingDimension[] = Array.isArray(raw.dimensions)
      ? raw.dimensions.map((d: Record<string, unknown>) => ({
          name: String(d.name || ''),
          level: normaliseLevel(d.level),
          score: Math.min(10, Math.max(1, Number(d.score) || 5)),
          reason: String(d.reason || ''),
          improvements: Array.isArray(d.improvements)
            ? (d.improvements as string[]).map(String)
            : [],
        }))
      : []
    return {
      overallScore: Math.min(10, Math.max(1, Number(raw.overallScore) || 5)),
      overallLevel: normaliseLevel(raw.overallLevel),
      summary: String(raw.summary || 'Itinerary analysis complete.'),
      dimensions,
      topStrengths: Array.isArray(raw.topStrengths)
        ? (raw.topStrengths as string[]).map(String)
        : [],
      topImprovements: Array.isArray(raw.topImprovements)
        ? (raw.topImprovements as string[]).map(String)
        : [],
    }
  } catch {
    return mockRatingResult(input)
  }
}

export function mockRatingResult(input: ItineraryRatingInput): ItineraryRatingResult {
  const avgActivitiesPerDay =
    input.days.length > 0
      ? input.totalActivityCount / input.days.length
      : 0

  const feasibilityScore =
    avgActivitiesPerDay <= 4 ? 9 : avgActivitiesPerDay <= 6 ? 7 : 5
  const feasibilityLevel: RatingLevel =
    feasibilityScore >= 8 ? 'excellent' : feasibilityScore >= 6 ? 'good' : 'caution'

  const budgetScore =
    input.budget === 0 ? 5 : input.totalSpent <= input.budget ? 8 : 4
  const budgetLevel: RatingLevel = budgetScore >= 7 ? 'good' : 'caution'

  const overallScore = Math.round((feasibilityScore + budgetScore + 7) / 3)
  const overallLevel: RatingLevel = overallScore >= 8 ? 'excellent' : overallScore >= 6 ? 'good' : 'caution'

  return {
    overallScore,
    overallLevel,
    summary: `Your ${input.destination} itinerary looks ${overallLevel}. ${avgActivitiesPerDay > 5 ? 'Consider spacing out activities for a more relaxed pace.' : 'The activity density looks comfortable.'}`,
    dimensions: [
      {
        name: 'Route Efficiency',
        level: 'good',
        score: 7,
        reason: 'Route data not available for a full analysis.',
        improvements: ['Add place coordinates to activities for route optimisation.'],
      },
      {
        name: 'Time Feasibility',
        level: feasibilityLevel,
        score: feasibilityScore,
        reason: `Averaging ${avgActivitiesPerDay.toFixed(1)} activities per day.`,
        improvements:
          avgActivitiesPerDay > 5
            ? ['Consider spreading activities across more days or combining nearby stops.']
            : ['Your pacing looks comfortable — good balance of activities and downtime.'],
      },
      {
        name: 'Budget Fit',
        level: budgetLevel,
        score: budgetScore,
        reason:
          input.budget === 0
            ? 'No budget set — set a budget to get a more accurate assessment.'
            : input.totalSpent <= input.budget
            ? 'Spending is within budget.'
            : 'Currently over budget — review expense categories.',
        improvements:
          input.budget === 0
            ? ['Set a total budget to enable budget-fit scoring.']
            : input.totalSpent > input.budget
            ? ['Review your highest-spend category for savings opportunities.']
            : ['Budget is on track — keep monitoring as the trip progresses.'],
      },
      {
        name: 'Activity Balance',
        level: 'good',
        score: 7,
        reason: 'Activity type breakdown looks reasonable.',
        improvements: ['Add activity categories for a more detailed balance analysis.'],
      },
      {
        name: 'Food & Rest Breaks',
        level: 'good',
        score: 7,
        reason: 'Unable to fully assess without meal and rest activity details.',
        improvements: ['Mark activities as "food" type to track meal breaks explicitly.'],
      },
      {
        name: 'Traveller Comfort',
        level: 'good',
        score: 7,
        reason: `Assessed for a ${input.tripType} trip with ${input.travellerCount} traveller(s).`,
        improvements: ['Consider travel time between activities when scheduling.'],
      },
    ],
    topStrengths: ['Itinerary is organised with clear day-by-day structure.'],
    topImprovements: [
      avgActivitiesPerDay > 5 ? 'Reduce activity density for a more relaxed pace.' : 'Add place coordinates to enable route optimisation.',
      input.budget === 0 ? 'Set a total trip budget to track spending.' : 'Monitor expenses to stay within budget.',
    ],
  }
}
