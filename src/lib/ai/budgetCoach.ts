/**
 * AI Budget Coach — shared, pure helpers (Phase 5).
 *
 * This module is import-safe on BOTH the client and the server: it contains no
 * secrets and never imports `server-only`. The client uses `buildBudgetCoachInput`
 * to assemble a privacy-safe analysis payload; the server uses `buildCoachPrompt`,
 * `parseCoachResult`, and `mockBudgetCoachResult` to talk to (or stand in for) the
 * AI provider.
 *
 * Privacy: the payload carries only aggregate numbers and user-entered traveller
 * *display names*. It NEVER includes emails, Firebase uids, auth tokens, expense
 * ids, payer ids, free-text notes, or any hidden profile data.
 */

import type {
  Trip,
  Expense,
  ItineraryDay,
  BudgetCoachInput,
  BudgetCoachResult,
  BudgetHealth,
  OverspendRisk,
  BudgetCoachRouteSummary,
} from '@/types'
import { formatCurrency, getDayCount } from '@/lib/utils'
import {
  getTotalSpent,
  getRemainingBudget,
  getPerHeadBudget,
  getPerHeadActualCost,
  getCategoryTotals,
  getVendorTypeTotals,
  getDayWiseTotals,
  getTravellerBalances,
  getSettlementSummary,
} from '@/lib/calculations'

const BUDGET_HEALTHS: readonly BudgetHealth[] = [
  'excellent',
  'good',
  'caution',
  'risky',
  'over_budget',
]
const OVERSPEND_RISKS: readonly OverspendRisk[] = ['low', 'medium', 'high', 'critical']

function round(n: number): number {
  return Math.round((n || 0) * 100) / 100
}

/**
 * Assemble the privacy-safe analysis payload from existing trip data. `now` is
 * injected for testability; it defaults to the current date.
 */
export function buildBudgetCoachInput(
  trip: Trip,
  expenses: Expense[],
  days: ItineraryDay[],
  now: Date = new Date(),
  routeSummary?: BudgetCoachRouteSummary
): BudgetCoachInput {
  const travellers = trip.travellers ?? []
  const travellerCount = Math.max(travellers.length, 1)
  const totalDays = getDayCount(trip.startDate, trip.endDate)

  // Where are we in the trip? (uses date-only strings so timezones don't skew it)
  const todayStr = now.toISOString().split('T')[0]
  let daysElapsed: number
  let tripStatus: BudgetCoachInput['tripStatus']
  if (todayStr < trip.startDate) {
    daysElapsed = 0
    tripStatus = 'upcoming'
  } else if (todayStr > trip.endDate) {
    daysElapsed = totalDays
    tripStatus = 'completed'
  } else {
    daysElapsed = Math.min(getDayCount(trip.startDate, todayStr), totalDays)
    tripStatus = 'in_progress'
  }
  const daysLeft = Math.max(totalDays - daysElapsed, 0)

  const totalSpent = getTotalSpent(expenses)
  const remaining = trip.budget > 0 ? getRemainingBudget(trip.budget, expenses) : 0
  const perHeadBudget = trip.budget > 0 ? getPerHeadBudget(trip.budget, travellerCount) : 0
  const perHeadSpent = getPerHeadActualCost(expenses, travellerCount)

  const averageDailySpend = daysElapsed > 0 ? round(totalSpent / daysElapsed) : 0
  const suggestedDailyRemaining =
    daysLeft > 0 ? round(remaining / daysLeft) : round(remaining)

  // Itinerary estimates per day (estimatedCost falls back to legacy cost).
  const estimatedPerDay = days.map((d) => ({
    dayNumber: d.dayNumber,
    date: d.date,
    estimated: round(
      d.activities.reduce((s, a) => s + (a.estimatedCost ?? a.cost ?? 0), 0)
    ),
  }))
  const itineraryEstimatedTotal = round(
    estimatedPerDay.reduce((s, d) => s + d.estimated, 0)
  )
  const itineraryPerHead = round(itineraryEstimatedTotal / travellerCount)
  const activityCount = days.reduce((s, d) => s + d.activities.length, 0)

  // High-level settlement (display names only — no ids/emails).
  const tracked = expenses.filter((e) => e.paidByTravellerId)
  let settlementSummary: BudgetCoachInput['settlementSummary'] = []
  if (travellers.length > 1 && tracked.length > 0) {
    const balances = getTravellerBalances(tracked, travellers)
    settlementSummary = getSettlementSummary(balances).map((s) => ({
      fromName: s.fromName,
      toName: s.toName,
      amount: s.amount,
    }))
  }

  const input: BudgetCoachInput = {
    tripName: trip.name,
    destination: trip.destination,
    tripType: trip.type,
    currency: trip.currency,
    startDate: trip.startDate,
    endDate: trip.endDate,
    totalDays,
    daysElapsed,
    daysLeft,
    tripStatus,
    travellerCount,
    budget: trip.budget,
    totalSpent,
    remaining,
    perHeadBudget,
    perHeadSpent,
    averageDailySpend,
    suggestedDailyRemaining,
    itineraryEstimatedTotal,
    itineraryPerHead,
    estimatedPerDay,
    categoryBreakdown: getCategoryTotals(expenses).map((c) => ({
      category: c.category,
      total: c.total,
    })),
    vendorBreakdown: getVendorTypeTotals(expenses).map((v) => ({
      vendorType: v.vendorType,
      total: v.total,
    })),
    dayWiseSpend: getDayWiseTotals(expenses).map((d) => ({ date: d.date, total: d.total })),
    expenseCount: expenses.length,
    activityCount,
    settlementSummary,
    hasItinerary: activityCount > 0,
    hasExpenses: expenses.length > 0,
  }

  // Attach the optional high-level route summary when present.
  if (routeSummary && routeSummary.daysWithRoutes > 0) {
    input.routeSummary = routeSummary
  }

  return input
}

/**
 * Lightweight runtime validation of an untrusted request body. Confirms the
 * shape is a well-formed BudgetCoachInput with sane numbers before it reaches the
 * AI provider. Returns a typed value or null.
 */
export function validateBudgetCoachInput(value: unknown): BudgetCoachInput | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>

  const numbers = [
    'totalDays', 'daysElapsed', 'daysLeft', 'travellerCount', 'budget',
    'totalSpent', 'remaining', 'perHeadBudget', 'perHeadSpent', 'averageDailySpend',
    'suggestedDailyRemaining', 'itineraryEstimatedTotal', 'itineraryPerHead',
    'expenseCount', 'activityCount',
  ]
  for (const key of numbers) {
    if (typeof v[key] !== 'number' || !Number.isFinite(v[key] as number)) return null
  }
  const strings = ['tripName', 'destination', 'tripType', 'currency', 'startDate', 'endDate']
  for (const key of strings) {
    if (typeof v[key] !== 'string') return null
  }
  const arrays = [
    'estimatedPerDay', 'categoryBreakdown', 'vendorBreakdown', 'dayWiseSpend',
    'settlementSummary',
  ]
  for (const key of arrays) {
    if (!Array.isArray(v[key])) return null
  }
  // Guard against absurd sizes (basic abuse protection).
  if ((v.budget as number) < 0 || (v.travellerCount as number) < 1) return null

  return value as BudgetCoachInput
}

// ── Deterministic metrics (used by the mock and as a fallback) ───────────────

/**
 * Derive budget health and overspend risk from the numbers alone. Used by the
 * mock coach and as a safety net if a real model omits or returns invalid
 * enum values.
 */
export function deriveBudgetMetrics(input: BudgetCoachInput): {
  budgetHealth: BudgetHealth
  overspendRisk: OverspendRisk
  spendRatio: number
  projectedTotal: number
} {
  const { budget, totalSpent, averageDailySpend, totalDays } = input
  const spendRatio = budget > 0 ? totalSpent / budget : 0
  // Project final spend if the current daily pace continues for the whole trip.
  const projectedTotal =
    input.tripStatus === 'in_progress' && averageDailySpend > 0
      ? round(averageDailySpend * totalDays)
      : totalSpent

  let budgetHealth: BudgetHealth
  if (budget <= 0) {
    budgetHealth = 'caution'
  } else if (totalSpent > budget) {
    budgetHealth = 'over_budget'
  } else if (spendRatio > 0.9 || projectedTotal > budget) {
    budgetHealth = 'risky'
  } else if (spendRatio > 0.7) {
    budgetHealth = 'caution'
  } else if (spendRatio > 0.4) {
    budgetHealth = 'good'
  } else {
    budgetHealth = 'excellent'
  }

  let overspendRisk: OverspendRisk
  if (budget <= 0) {
    overspendRisk = 'medium'
  } else if (totalSpent > budget) {
    overspendRisk = 'critical'
  } else if (projectedTotal > budget * 1.1 || spendRatio > 0.85) {
    overspendRisk = 'high'
  } else if (projectedTotal > budget || spendRatio > 0.6) {
    overspendRisk = 'medium'
  } else {
    overspendRisk = 'low'
  }

  return { budgetHealth, overspendRisk, spendRatio: round(spendRatio), projectedTotal }
}

/**
 * Produce a structured, useful Budget Coach result WITHOUT any AI model, derived
 * directly from the real numbers. Returned when no ANTHROPIC_API_KEY is set so
 * the feature works locally. The caller flags this as a mock and the UI shows a
 * clear "Development mock response" note — it is never presented as real AI.
 */
export function mockBudgetCoachResult(input: BudgetCoachInput): BudgetCoachResult {
  const cur = input.currency
  const fmt = (n: number) => formatCurrency(n, cur)
  const { budgetHealth, overspendRisk, projectedTotal } = deriveBudgetMetrics(input)

  const dataGaps: string[] = []
  if (!input.hasItinerary) dataGaps.push('No itinerary activities yet — add them with estimated costs to get day-wise planning advice.')
  if (!input.hasExpenses) dataGaps.push('No expenses logged yet — add a few so spending pace and category advice become accurate.')
  if (input.budget <= 0) dataGaps.push('No budget set — add a trip budget so health and remaining-per-day figures can be calculated.')

  const summary =
    input.budget <= 0
      ? `You haven't set a budget for ${input.tripName} yet. Add one to unlock spend tracking and pace advice. So far ${fmt(input.totalSpent)} has been logged across ${input.expenseCount} expense(s).`
      : `For ${input.tripName} (${input.destination}), you've spent ${fmt(input.totalSpent)} of your ${fmt(input.budget)} budget — about ${Math.round((input.totalSpent / input.budget) * 100)}%. ${input.tripStatus === 'in_progress' ? `With ${input.daysLeft} day(s) left, ` : ''}budget health looks ${budgetHealth.replace('_', ' ')} and overspend risk is ${overspendRisk}.`

  const keyFindings: string[] = []
  if (input.budget > 0) {
    keyFindings.push(`Spent ${fmt(input.totalSpent)} of ${fmt(input.budget)} (${fmt(input.remaining)} remaining).`)
  }
  if (input.perHeadBudget > 0) {
    keyFindings.push(`Per head: ${fmt(input.perHeadSpent)} spent vs ${fmt(input.perHeadBudget)} budgeted.`)
  }
  if (input.tripStatus === 'in_progress' && input.averageDailySpend > 0) {
    keyFindings.push(`Averaging ${fmt(input.averageDailySpend)}/day so far; at this pace the trip projects to ${fmt(projectedTotal)}.`)
  }
  if (input.itineraryEstimatedTotal > 0) {
    keyFindings.push(`Planned itinerary cost is ${fmt(input.itineraryEstimatedTotal)} (${fmt(input.itineraryPerHead)}/head).`)
  }
  const topCat = input.categoryBreakdown[0]
  if (topCat) {
    keyFindings.push(`Biggest category so far: ${topCat.category} at ${fmt(topCat.total)}.`)
  }

  const recommendedActions: string[] = []
  if (input.budget > 0 && input.daysLeft > 0) {
    recommendedActions.push(`Cap daily spend at about ${fmt(input.suggestedDailyRemaining)} for the remaining ${input.daysLeft} day(s).`)
  }
  if (overspendRisk === 'high' || overspendRisk === 'critical') {
    recommendedActions.push('Prefer local eateries and pre-paid/UPI transport (autos, metro) over on-demand cabs to claw back margin.')
    recommendedActions.push('Move one paid attraction to a free alternative (temple, beach, market walk) on at least one day.')
  } else {
    recommendedActions.push('Keep logging expenses the same day so the pace estimate stays accurate.')
  }
  if (input.settlementSummary.length > 0) {
    recommendedActions.push('Settle pending group balances via UPI before the trip ends to avoid awkward follow-ups.')
  }

  const categoryWarnings: string[] = []
  if (input.budget > 0) {
    for (const c of input.categoryBreakdown) {
      const share = c.total / input.totalSpent
      if (input.totalSpent > 0 && share > 0.45) {
        categoryWarnings.push(`${c.category} is ${Math.round(share * 100)}% of all spending (${fmt(c.total)}) — watch this category.`)
      }
    }
  }

  const itinerarySuggestions: string[] = []
  if (input.itineraryEstimatedTotal > 0 && input.budget > 0) {
    if (input.itineraryEstimatedTotal > input.remaining && input.tripStatus !== 'completed') {
      itinerarySuggestions.push(`Planned activities (${fmt(input.itineraryEstimatedTotal)}) exceed your remaining budget (${fmt(input.remaining)}). Consider trimming or rescheduling the priciest day.`)
    }
    const priciest = [...input.estimatedPerDay].sort((a, b) => b.estimated - a.estimated)[0]
    if (priciest && priciest.estimated > 0) {
      itinerarySuggestions.push(`Day ${priciest.dayNumber} is your most expensive plan (${fmt(priciest.estimated)}) — look for combo tickets or off-peak timings.`)
    }
  } else if (!input.hasItinerary) {
    itinerarySuggestions.push('Add itinerary activities with estimated costs to compare your plan against the budget.')
  }
  // Route-aware tip when day routes have been calculated.
  const route = input.routeSummary
  if (route && route.totalTravelMinutes > 0) {
    itinerarySuggestions.push(
      `Across ${route.daysWithRoutes} planned day(s) you have about ${route.totalDistanceKm} km / ${route.totalTravelMinutes} min of travel${route.busiestDayNumber ? `, heaviest on Day ${route.busiestDayNumber} (${route.busiestDayTravelMinutes} min)` : ''}. Group nearby stops to cut transport time and cost.`
    )
  }

  const dailySpendAdvice =
    input.budget > 0 && input.daysLeft > 0
      ? `You have ${fmt(input.remaining)} left for ${input.daysLeft} day(s) — roughly ${fmt(input.suggestedDailyRemaining)} per day${input.averageDailySpend > 0 ? `, vs your current ${fmt(input.averageDailySpend)}/day average` : ''}.`
      : input.tripStatus === 'completed'
      ? 'The trip is complete — review the final category breakdown to plan better next time.'
      : 'Set a budget and log expenses to get a suggested daily spending limit.'

  const perHeadAdvice =
    input.travellerCount > 1
      ? `Across ${input.travellerCount} travellers, each person's share is about ${fmt(input.perHeadSpent)} spent so far${input.perHeadBudget > 0 ? ` against ${fmt(input.perHeadBudget)} budgeted` : ''}.${input.settlementSummary.length > 0 ? ` ${input.settlementSummary.length} settlement(s) are pending.` : ''}`
      : 'This is a solo budget, so the full amount is yours to manage.'

  const nextBestSteps: string[] = []
  if (!input.hasExpenses) nextBestSteps.push('Log your first expense to start tracking.')
  if (!input.hasItinerary) nextBestSteps.push('Add a few itinerary activities with estimated costs.')
  if (input.budget <= 0) nextBestSteps.push('Set a realistic total budget for the trip.')
  if (nextBestSteps.length === 0) {
    nextBestSteps.push('Re-run this analysis after your next few expenses to keep advice current.')
  }

  return {
    summary,
    budgetHealth,
    overspendRisk,
    keyFindings,
    recommendedActions,
    categoryWarnings,
    itinerarySuggestions,
    dailySpendAdvice,
    perHeadAdvice,
    nextBestSteps,
    dataGaps,
  }
}

// ── Real-provider prompt + response parsing ──────────────────────────────────

const RESULT_SHAPE = `{
  "summary": string,
  "budgetHealth": "excellent" | "good" | "caution" | "risky" | "over_budget",
  "overspendRisk": "low" | "medium" | "high" | "critical",
  "keyFindings": string[],
  "recommendedActions": string[],
  "categoryWarnings": string[],
  "itinerarySuggestions": string[],
  "dailySpendAdvice": string,
  "perHeadAdvice": string,
  "nextBestSteps": string[],
  "dataGaps": string[]
}`

export const COACH_SYSTEM_PROMPT = `You are Voyago's AI Budget Coach for travellers in India.
You analyse a single trip's budget, itinerary cost estimates, and actual expenses, then give practical, specific, India-first money advice.

Rules:
- Respond with ONLY a single JSON object — no prose, no markdown fences, no commentary.
- Match this exact shape (all keys required; use empty arrays/strings when nothing applies):
${RESULT_SHAPE}
- All money figures are in the trip's currency (provided in the input). Refer to amounts using that currency.
- Be concrete: cite the actual numbers from the input. Tailor advice to the destination, trip type, travellers, days left, and spending pace.
- India-first tips where relevant (UPI, local transport like metro/autos, street food vs fine dining, combo tickets, off-season pricing).
- If important data is missing (no budget, no expenses, no itinerary), say so in dataGaps and suggest what to add.
- Advice is approximate guidance only — never guarantee savings or outcomes.
- Keep each list to at most 5 short, scannable items.`

export function buildCoachUserMessage(input: BudgetCoachInput): string {
  return `Analyse this trip and return the JSON object.\n\nTRIP DATA (JSON):\n${JSON.stringify(input, null, 2)}`
}

function coerceStringArray(value: unknown, max = 6): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim())
    .slice(0, max)
}

/**
 * Parse a model's text into a BudgetCoachResult. Tolerant of stray prose or
 * markdown fences around the JSON. Any missing/invalid enums fall back to
 * deterministically-derived values so the result is always well-formed.
 */
export function parseCoachResult(text: string, input: BudgetCoachInput): BudgetCoachResult {
  const derived = deriveBudgetMetrics(input)
  let parsed: Record<string, unknown> = {}
  try {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start !== -1 && end > start) {
      parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
    }
  } catch {
    parsed = {}
  }

  const health = BUDGET_HEALTHS.includes(parsed.budgetHealth as BudgetHealth)
    ? (parsed.budgetHealth as BudgetHealth)
    : derived.budgetHealth
  const risk = OVERSPEND_RISKS.includes(parsed.overspendRisk as OverspendRisk)
    ? (parsed.overspendRisk as OverspendRisk)
    : derived.overspendRisk

  const fallback = mockBudgetCoachResult(input)
  const summary =
    typeof parsed.summary === 'string' && parsed.summary.trim().length > 0
      ? parsed.summary.trim()
      : fallback.summary

  return {
    summary,
    budgetHealth: health,
    overspendRisk: risk,
    keyFindings: coerceStringArray(parsed.keyFindings).length
      ? coerceStringArray(parsed.keyFindings)
      : fallback.keyFindings,
    recommendedActions: coerceStringArray(parsed.recommendedActions).length
      ? coerceStringArray(parsed.recommendedActions)
      : fallback.recommendedActions,
    categoryWarnings: coerceStringArray(parsed.categoryWarnings),
    itinerarySuggestions: coerceStringArray(parsed.itinerarySuggestions),
    dailySpendAdvice:
      typeof parsed.dailySpendAdvice === 'string' && parsed.dailySpendAdvice.trim()
        ? parsed.dailySpendAdvice.trim()
        : fallback.dailySpendAdvice,
    perHeadAdvice:
      typeof parsed.perHeadAdvice === 'string' && parsed.perHeadAdvice.trim()
        ? parsed.perHeadAdvice.trim()
        : fallback.perHeadAdvice,
    nextBestSteps: coerceStringArray(parsed.nextBestSteps).length
      ? coerceStringArray(parsed.nextBestSteps)
      : fallback.nextBestSteps,
    dataGaps: coerceStringArray(parsed.dataGaps).length
      ? coerceStringArray(parsed.dataGaps)
      : fallback.dataGaps,
  }
}
