export interface UserProfile {
  id: string
  name: string
  color: string
  email?: string
  photoURL?: string | null
  /** 'google.com' | 'password' | 'anonymous' */
  providerId?: string
  createdAt: string
  lastLoginAt?: string
}

export type TripType =
  | 'solo'
  | 'couple'
  | 'friends'
  | 'group'
  | 'family'
  | 'office'
  | 'pilgrimage'
  | 'wedding'

export interface Traveller {
  id: string
  name: string
  color: string
  initials: string
}

export interface Trip {
  id: string
  name: string
  destination: string
  type: TripType
  startDate: string
  endDate: string
  budget: number
  currency: string
  ownerId: string
  members: string[]
  coverColor: string
  notes: string
  travellers?: Traveller[]
  /** Token pointing at the current shares/{shareId} document, if sharing was ever set up. */
  shareId?: string
  createdAt: string
  updatedAt: string
}

export type ActivityType = 'hotel' | 'transport' | 'activity' | 'food' | 'other'

export type ActivityCategory =
  | 'sightseeing'
  | 'food'
  | 'hotel'
  | 'transport'
  | 'shopping'
  | 'adventure'
  | 'spiritual'
  | 'leisure'
  | 'emergency'
  | 'other'

export type BookingStatus = 'planned' | 'booked' | 'completed' | 'skipped' | 'cancelled'

export interface Activity {
  id: string
  type: ActivityType
  title: string
  notes: string
  time: string
  cost: number
  confirmed: boolean
  // Phase 4 additions (optional for backward compat):
  startTime?: string
  endTime?: string
  estimatedCost?: number
  category?: ActivityCategory
  locationName?: string
  bookingStatus?: BookingStatus
  updatedAt?: string
}

export interface ItineraryDay {
  id: string
  tripId: string
  date: string
  dayNumber: number
  activities: Activity[]
}

export type ExpenseCategory =
  | 'accommodation'
  | 'transport'
  | 'food'
  | 'activities'
  | 'shopping'
  | 'other'

export type VendorType =
  | 'restaurant'
  | 'hotel'
  | 'transport'
  | 'tickets'
  | 'shopping'
  | 'emergency'
  | 'miscellaneous'

export type SettlementStatus = 'pending' | 'partially_received' | 'received'

// Per-participant share of an expense. `receivedAmount` is reserved for partial
// settlement support (Phase 2B); the active per-person toggle in this phase uses
// Expense.settledParticipantIds. Stored in rupees.
export interface ParticipantShare {
  travellerId: string
  shareAmount: number
  receivedAmount: number
  status: SettlementStatus
}

export interface Expense {
  id: string
  tripId: string
  category: ExpenseCategory
  title: string
  amount: number
  // Optional integer-paise mirror of `amount`. Calculations always derive paise
  // from `amount` so this is informational/forward-compatible only.
  amountPaise?: number
  date: string
  notes: string
  paidByTravellerId?: string
  paidByName?: string
  splitType?: 'equal' | 'custom'
  // Traveller ids the expense is split among. Absent ⇒ split across all travellers.
  participants?: string[]
  // Reserved for custom/unequal splits (Phase 2B). Not yet written by the UI.
  participantShares?: ParticipantShare[]
  // Source of truth for the per-person "received" toggle this phase: the ids of
  // participants (other than the payer) who have settled their share.
  settledParticipantIds?: string[]
  vendorName?: string
  vendorType?: VendorType
  locationName?: string
  linkedActivityId?: string
  createdAt: string
}

// ── Trip sharing (Phase 3) ────────────────────────────────────────────────
//
// Sharing uses a *public snapshot* model. The shares/{shareId} document holds a
// pre-computed, read-only snapshot of ONLY the sections the owner chose to expose.
// Disabled sections are never written, so a public reader can never see hidden
// data even by reading the raw document. The live trip / expenses documents stay
// private to members.

export interface ShareVisibility {
  itinerary: boolean
  travellers: boolean
  budget: boolean
  expenseBreakdown: boolean
  settlement: boolean
  notes: boolean
}

export interface SharedActivity {
  type: ActivityType
  title: string
  time: string
  notes: string
  startTime?: string
  endTime?: string
}

export interface SharedDay {
  dayNumber: number
  date: string
  activities: SharedActivity[]
}

// Public-safe traveller: name, initials, colour only. No id or email.
export interface SharedTraveller {
  name: string
  initials: string
  color: string
}

export interface SharedCategoryTotal {
  category: ExpenseCategory
  total: number
}

export interface SharedVendorTotal {
  vendorType: VendorType
  total: number
}

export interface SharedSettlement {
  fromName: string
  fromColor: string
  toName: string
  toColor: string
  amount: number
}

export interface SharedBudget {
  budget: number
  spent: number
  remaining: number
  perHeadBudget: number
  perHeadSpent: number
}

// The denormalised, read-only public view. Optional sections are present ONLY
// when the owner enabled the matching visibility flag.
export interface SharedTripSnapshot {
  name: string
  destination: string
  type: TripType
  startDate: string
  endDate: string
  coverColor: string
  currency: string
  dayCount: number
  activityCount: number
  itinerary?: SharedDay[]
  travellers?: SharedTraveller[]
  travellerCount?: number
  budget?: SharedBudget
  categoryBreakdown?: SharedCategoryTotal[]
  vendorBreakdown?: SharedVendorTotal[]
  settlement?: SharedSettlement[]
  notes?: string
}

export interface Share {
  id: string
  tripId: string
  ownerId: string
  enabled: boolean
  visibility: ShareVisibility
  snapshot: SharedTripSnapshot
  createdAt: string
  updatedAt: string
}

// ── AI Budget Coach (Phase 5) ─────────────────────────────────────────────
//
// The Budget Coach analyses a trip's budget, itinerary estimates, and actual
// expenses, then returns practical, India-first advice to help travellers stay
// on budget. The analysis INPUT is built entirely from existing trip data and is
// privacy-safe: it carries only aggregate numbers and user-entered display names
// — never emails, Firebase uids, auth tokens, or hidden profile data.

export type BudgetHealth = 'excellent' | 'good' | 'caution' | 'risky' | 'over_budget'
export type OverspendRisk = 'low' | 'medium' | 'high' | 'critical'

export interface BudgetCoachDayEstimate {
  dayNumber: number
  date: string
  estimated: number
}

export interface BudgetCoachCategoryTotal {
  category: ExpenseCategory
  total: number
}

export interface BudgetCoachVendorTotal {
  vendorType: VendorType
  total: number
}

export interface BudgetCoachDaySpend {
  date: string
  total: number
}

// High-level settlement line — display names only, no ids or emails.
export interface BudgetCoachSettlement {
  fromName: string
  toName: string
  amount: number
}

/**
 * Privacy-safe analysis payload sent to the AI Budget Coach endpoint. Built on
 * the client from data the owner already has; the server re-validates its shape.
 * Contains NO emails, uids, tokens, or hidden profile data.
 */
export interface BudgetCoachInput {
  tripName: string
  destination: string
  tripType: TripType
  currency: string
  startDate: string
  endDate: string
  totalDays: number
  daysElapsed: number
  daysLeft: number
  tripStatus: 'upcoming' | 'in_progress' | 'completed'
  travellerCount: number
  budget: number
  totalSpent: number
  remaining: number
  perHeadBudget: number
  perHeadSpent: number
  averageDailySpend: number
  suggestedDailyRemaining: number
  itineraryEstimatedTotal: number
  itineraryPerHead: number
  estimatedPerDay: BudgetCoachDayEstimate[]
  categoryBreakdown: BudgetCoachCategoryTotal[]
  vendorBreakdown: BudgetCoachVendorTotal[]
  dayWiseSpend: BudgetCoachDaySpend[]
  expenseCount: number
  activityCount: number
  settlementSummary: BudgetCoachSettlement[]
  hasItinerary: boolean
  hasExpenses: boolean
}

/** Structured advice returned to the client. */
export interface BudgetCoachResult {
  summary: string
  budgetHealth: BudgetHealth
  overspendRisk: OverspendRisk
  keyFindings: string[]
  recommendedActions: string[]
  categoryWarnings: string[]
  itinerarySuggestions: string[]
  dailySpendAdvice: string
  perHeadAdvice: string
  nextBestSteps: string[]
  dataGaps: string[]
}

/** API response envelope for POST /api/ai/budget-coach. */
export interface BudgetCoachResponse {
  result: BudgetCoachResult
  isMock: boolean
  provider: 'anthropic' | 'mock'
  model: string
}
