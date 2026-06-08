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
  // Phase 6 — Google Maps place metadata (all optional; manual entry still works):
  placeId?: string
  placeName?: string
  placeAddress?: string
  placeRating?: number
  placeUserRatingsTotal?: number
  /** 0 (free) – 4 (very expensive), per Google price levels. */
  priceLevel?: number
  lat?: number
  lng?: number
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
  // Phase 6 — optional, high-level route summary (present only when the user has
  // calculated day routes). The coach works fine without it.
  routeSummary?: BudgetCoachRouteSummary
}

/** High-level, aggregate route info safe to share with the AI coach. */
export interface BudgetCoachRouteSummary {
  daysWithRoutes: number
  totalDistanceKm: number
  totalTravelMinutes: number
  busiestDayNumber: number | null
  busiestDayTravelMinutes: number
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

// ── Google Maps planning (Phase 6) ─────────────────────────────────────────
//
// Maps features are optional and gated. All Google calls go through server API
// routes so the API key stays server-side. If the feature flag is off or no key
// is configured, the UI degrades to manual location entry and "Setup required"
// states — the core itinerary never depends on Google Maps. We persist only the
// small set of place fields we need on an Activity, never raw Google responses.

export type TravelMode = 'driving' | 'walking' | 'transit'

/** Whether maps features are usable in the current environment. */
export interface MapsStatus {
  featureEnabled: boolean
  configured: boolean
  available: boolean
}

/** A single place returned by text search (trimmed to the fields we store/use). */
export interface PlaceSearchResult {
  placeId: string
  name: string
  address: string
  rating?: number
  userRatingsTotal?: number
  priceLevel?: number
  lat: number
  lng: number
}

/** One ordered leg between two routed activities. */
export interface RouteLeg {
  originActivityId: string
  destinationActivityId: string
  originName: string
  destinationName: string
  travelMode: TravelMode
  distanceText: string
  durationText: string
  distanceMeters: number
  durationSeconds: number
  /** False when Google could not return a route for this leg (e.g. no transit). */
  ok: boolean
}

/** Computed, in-memory route plan for a single day (never persisted). */
export interface DayRouteSummary {
  dayId: string
  travelMode: TravelMode
  legs: RouteLeg[]
  totalDistanceText: string
  totalDurationText: string
  totalDistanceMeters: number
  totalDurationSeconds: number
  warnings: string[]
}

/** Request body for POST /api/maps/route. */
export interface RouteRequestPoint {
  activityId: string
  name: string
  lat: number
  lng: number
}

// ── Location Check-in & Travel History (Phase 7A) ────────────────────────
//
// TripLocationPoint stores a single GPS check-in or foreground live-tracking
// point. Saved to trips/{tripId}/locations subcollection. Trip membership rules
// protect reads/writes. Location permission is NEVER requested silently — only
// when the user explicitly taps "Use current location" or "Start live tracking".

export type LocationSource =
  | 'manual_checkin'    // user tapped "Save check-in" after viewing current GPS
  | 'live_tracking'     // saved automatically during active foreground tracking

export interface TripLocationPoint {
  id: string
  tripId: string
  userId: string
  latitude: number
  longitude: number
  accuracy?: number           // metres, from GeolocationCoordinates.accuracy
  altitude?: number | null
  heading?: number | null
  speed?: number | null
  capturedAt: string          // ISO timestamp of when the GPS fix was taken
  timezone?: string           // e.g. "Asia/Kolkata"
  source: LocationSource
  label?: string              // user-typed label, e.g. "Taj Mahal gate"
  note?: string               // free-text note
  dayKey?: string             // YYYY-MM-DD — set at write time for day grouping
  createdAt: string           // ISO timestamp of Firestore write
}

// ── Photos & Trip Memories (Phase 7B) ────────────────────────────────────
//
// A TripMemory is a single uploaded photo plus its metadata. The image binary
// lives in Firebase Storage (trips/{tripId}/memories/{memoryId}/{file}); the
// metadata document lives in Firestore (trips/{tripId}/memories/{memoryId}).
// Both are private to trip members — never public. We persist only a small,
// curated set of fields; no raw EXIF and no raw browser File objects.

/** Compact, optional GPS metadata attached to a memory (Phase 7A style). */
export interface MemoryLocation {
  latitude: number
  longitude: number
  accuracy?: number
  capturedAt?: string
  source: LocationSource
}

export interface TripMemory {
  id: string
  tripId: string
  userId: string
  title?: string
  description?: string
  // Storage download URL + the path we need to delete the underlying object.
  photoUrl: string
  storagePath: string
  originalFileName?: string
  contentType?: string
  sizeBytes?: number
  createdAt: string           // ISO — Firestore write time
  uploadedAt: string          // ISO — upload completion time
  capturedAt?: string         // ISO — when the photo was taken, if known
  dayKey?: string             // YYYY-MM-DD for day grouping
  location?: MemoryLocation
  placeName?: string          // user-entered place label
  taggedTravellerIds?: string[]
  tags?: string[]
  linkedActivityId?: string
  linkedLocationPointId?: string
}

// ── Route Playback (Phase 7C) ─────────────────────────────────────────────
//
// A unified, in-memory view built from all location-tagged data: Travel History
// check-ins, itinerary activities with place coordinates (Phase 6), and photo
// memories with GPS (Phase 7B). Never persisted — derived client-side only.
// Not included in public share snapshots.

export type PlaybackPointType = 'checkin' | 'live_tracking' | 'activity' | 'memory'

export interface PlaybackPointActivityContext {
  title: string
  category?: ActivityCategory
  startTime?: string
  locationName?: string
  placeName?: string
}

export interface PlaybackPointMemoryContext {
  title?: string
  photoUrl: string
  placeName?: string
  capturedAt?: string
}

export interface PlaybackPointLocationContext {
  label?: string
  note?: string
  accuracy?: number
  source: LocationSource
  capturedAt: string
}

/** Normalised, type-safe point on the route playback timeline. */
export interface PlaybackPoint {
  id: string
  type: PlaybackPointType
  label: string
  timestamp: string                           // ISO — sort key and display
  latitude: number
  longitude: number
  accuracy?: number
  dayKey: string                              // YYYY-MM-DD
  linkedActivityId?: string
  linkedMemoryId?: string
  linkedLocationPointId?: string
  activityCtx?: PlaybackPointActivityContext
  memoryCtx?: PlaybackPointMemoryContext
  locationCtx?: PlaybackPointLocationContext
}

// ── Route Optimiser (Phase 7D) ────────────────────────────────────────────
//
// Smart AI Route Optimiser uses a nearest-neighbour heuristic (Haversine) for
// ordering then calls Google Routes API for exact road distances and durations.
// All optimisation calls are user-triggered — never automatic. Returns 503 when
// Maps is not configured so the UI degrades to Haversine-only mode.

export type RouteOptimiseMode = 'fastest' | 'shortest' | 'balanced'

/** A single point to include in an optimisation request. */
export interface OptimiseRoutePoint {
  id: string
  name: string
  lat: number
  lng: number
}

/** Result returned by POST /api/maps/route/optimise. */
export interface OptimiseRouteResult {
  mode: RouteOptimiseMode
  travelMode: TravelMode
  /** Point IDs in the caller-supplied (original) order. */
  originalOrder: string[]
  /** Point IDs in the optimised order (nearest-neighbour from start). */
  optimisedOrder: string[]
  /** Straight-line Haversine distance for the original order (approx, metres). */
  originalHaversineMeters: number
  /** Straight-line Haversine distance for the optimised order (approx, metres). */
  optimisedHaversineMeters: number
  /** Exact road distance for the optimised order via Google Routes API (metres). */
  optimisedRouteDistanceMeters: number
  /** Exact road travel time for the optimised order via Google Routes API (seconds). */
  optimisedRouteDurationSeconds: number
  /**
   * Encoded polyline (Google's algorithm) of the exact road route for the
   * optimised order, when the Routes API returned one. Decoded client-side and
   * drawn on the Google Maps canvas (Phase 7E). Absent when unavailable.
   */
  routePolyline?: string
  warnings: string[]
}
