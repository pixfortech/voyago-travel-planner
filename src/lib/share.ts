import type {
  Trip,
  Expense,
  ItineraryDay,
  ShareVisibility,
  SharedTripSnapshot,
  SharedDay,
  SharedTraveller,
  SharedMemory,
  TripMemory,
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
 * Budget, expense breakdown, settlement, traveller list, and memories stay OFF
 * until the owner explicitly enables them. Notes are also off by default.
 */
export const DEFAULT_VISIBILITY: ShareVisibility = {
  itinerary: true,
  travellers: false,
  budget: false,
  expenseBreakdown: false,
  settlement: false,
  notes: false,
  memories: false,
  memoryOptions: { titles: true, tags: true, dayGrouping: true },
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
  visibility: ShareVisibility,
  memories?: TripMemory[]
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
          .sort((a, b) =>
            (a.startTime ?? a.time ?? '').localeCompare(b.startTime ?? b.time ?? '')
          )
          .map((a) => {
            const shared: import('@/types').SharedActivity = {
              type: a.type,
              title: a.title,
              time: a.startTime ?? a.time,
              notes: a.notes,
            }
            if (a.startTime) shared.startTime = a.startTime
            if (a.endTime) shared.endTime = a.endTime
            return shared
          }),
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

  // ── Memories (safe public snapshot) ──
  // Only included when the owner explicitly opts in. Precise GPS coordinates
  // (location.latitude / location.longitude) are NEVER written to the snapshot.
  // Only safe fields are included: photoUrl (Firebase download URL), title,
  // description, uploadedAt, capturedAt, dayKey, placeName (user-entered label),
  // and tagged traveller display names / initials / colours.
  if (visibility.memories && memories && memories.length > 0) {
    const opts = visibility.memoryOptions ?? { titles: true, tags: true, dayGrouping: true }
    const sharedMemories: SharedMemory[] = memories.map((m) => {
      const shared: SharedMemory = { photoUrl: m.photoUrl, uploadedAt: m.uploadedAt }
      if (opts.titles && m.title) shared.title = m.title
      if (opts.titles && m.description) shared.description = m.description
      if (m.capturedAt) shared.capturedAt = m.capturedAt
      if (opts.dayGrouping && m.dayKey) shared.dayKey = m.dayKey
      // placeName is user-typed text — safe; never raw GPS lat/lng
      if (m.placeName) shared.placeName = m.placeName
      // Tagged travellers: strip to name/initials/color only — no uid, email, or GPS
      if (opts.tags && m.taggedTravellerIds && m.taggedTravellerIds.length > 0) {
        const tagged: SharedTraveller[] = []
        for (const tid of m.taggedTravellerIds) {
          const t = travellers.find((tv) => tv.id === tid)
          if (t) tagged.push({ name: t.name, initials: t.initials, color: t.color })
        }
        if (tagged.length > 0) shared.taggedTravellers = tagged
      }
      return shared
    })
    snapshot.memories = sharedMemories
    snapshot.memoryCount = sharedMemories.length
  }

  return snapshot
}
