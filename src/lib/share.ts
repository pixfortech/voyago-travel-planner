import type {
  Trip,
  Expense,
  ItineraryDay,
  ShareVisibility,
  SharedTripSnapshot,
  SharedDay,
  SharedTraveller,
} from '@/types'
import { getDayCount } from './utils'
import {
  getTotalSpent,
  getRemainingBudget,
  getPerHeadBudget,
  getPerHeadActualCost,
  getCategoryTotals,
  getVendorTypeTotals,
  getTravellerBalances,
  getSettlementSummary,
} from './calculations'

/**
 * Privacy-safe defaults: only the basic summary and itinerary are shown.
 * Budget, expense breakdown, settlement, and traveller list stay OFF until the
 * owner explicitly enables them. Notes are also off by default.
 */
export const DEFAULT_VISIBILITY: ShareVisibility = {
  itinerary: true,
  travellers: false,
  budget: false,
  expenseBreakdown: false,
  settlement: false,
  notes: false,
}

/** Generate an unguessable URL-safe share token (~22 chars of entropy). */
export function generateShareToken(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const len = 22
  // Prefer crypto for real randomness; fall back to Math.random if unavailable.
  const cryptoObj =
    typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(len)
    cryptoObj.getRandomValues(bytes)
    let out = ''
    for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length]
    return out
  }
  let out = ''
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

/**
 * Build the public snapshot for a trip given the owner's visibility settings.
 *
 * Only enabled sections are included — disabled keys are omitted entirely (never
 * set to `undefined`, which Firestore rejects). Travellers are stripped to
 * name/initials/colour; itinerary activities drop ids and costs; only aggregate
 * money figures are exposed.
 */
export function buildSnapshot(
  trip: Trip,
  expenses: Expense[],
  days: ItineraryDay[],
  visibility: ShareVisibility
): SharedTripSnapshot {
  const travellers = trip.travellers ?? []
  const travellerCount = Math.max(travellers.length, 1)
  const totalActivities = days.reduce((s, d) => s + d.activities.length, 0)

  const snapshot: SharedTripSnapshot = {
    name: trip.name,
    destination: trip.destination,
    type: trip.type,
    startDate: trip.startDate,
    endDate: trip.endDate,
    coverColor: trip.coverColor,
    currency: trip.currency,
    dayCount: getDayCount(trip.startDate, trip.endDate),
    activityCount: totalActivities,
  }

  // ── Itinerary ──
  if (visibility.itinerary) {
    const sharedDays: SharedDay[] = days
      .filter((d) => d.activities.length > 0)
      .map((d) => ({
        dayNumber: d.dayNumber,
        date: d.date,
        activities: [...d.activities]
          .sort((a, b) => a.time.localeCompare(b.time))
          .map((a) => ({
            type: a.type,
            title: a.title,
            time: a.time,
            notes: a.notes,
          })),
      }))
    snapshot.itinerary = sharedDays
  }

  // ── Travellers (name / initials / colour only) ──
  if (visibility.travellers && travellers.length > 0) {
    const sharedTravellers: SharedTraveller[] = travellers.map((t) => ({
      name: t.name,
      initials: t.initials,
      color: t.color,
    }))
    snapshot.travellers = sharedTravellers
  }
  // Traveller count is part of the basic summary when travellers exist.
  if (travellers.length > 0) {
    snapshot.travellerCount = travellers.length
  }

  // ── Budget summary (aggregates only) ──
  if (visibility.budget && trip.budget > 0) {
    const spent = getTotalSpent(expenses)
    snapshot.budget = {
      budget: trip.budget,
      spent,
      remaining: getRemainingBudget(trip.budget, expenses),
      perHeadBudget: getPerHeadBudget(trip.budget, travellerCount),
      perHeadSpent: getPerHeadActualCost(expenses, travellerCount),
    }
  }

  // ── Expense breakdown (category + vendor aggregates) ──
  if (visibility.expenseBreakdown && expenses.length > 0) {
    const cats = getCategoryTotals(expenses)
    if (cats.length > 0) {
      snapshot.categoryBreakdown = cats.map((c) => ({ category: c.category, total: c.total }))
    }
    const vendors = getVendorTypeTotals(expenses)
    if (vendors.length > 0) {
      snapshot.vendorBreakdown = vendors.map((v) => ({ vendorType: v.vendorType, total: v.total }))
    }
  }

  // ── Settlement summary (who pays whom, by name) ──
  if (visibility.settlement && travellers.length > 1) {
    const tracked = expenses.filter((e) => e.paidByTravellerId)
    if (tracked.length > 0) {
      const balances = getTravellerBalances(tracked, travellers)
      const settlements = getSettlementSummary(balances)
      if (settlements.length > 0) {
        snapshot.settlement = settlements.map((s) => ({
          fromName: s.fromName,
          fromColor: s.fromColor,
          toName: s.toName,
          toColor: s.toColor,
          amount: s.amount,
        }))
      }
    }
  }

  // ── Notes ──
  if (visibility.notes && trip.notes) {
    snapshot.notes = trip.notes
  }

  return snapshot
}
