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
  /** Links this trip traveller to a registered user account. Used to route tag notifications. */
  userId?: string
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
  /**
   * Role map for Phase 8 collaboration (uid → TripRole). Absent on pre-Phase 8
   * trips (all have only the owner in members) — backward compatible.
   * The owner's role is always inferred from ownerId, not this map.
   */
  collaboratorRoles?: Record<string, TripRole>
  createdAt: string
  updatedAt: string
}

// ── Collaboration (Phase 8) ────────────────────────────────────────────────

/**
 * Member role within a trip.
 *   owner  — created the trip; can manage members, invites, and all data.
 *   editor — can view and edit itinerary, budget, expenses, memories, and routes.
 *   viewer — read-only; cannot edit (enforced at the UI layer; membership itself
 *            is enforced by Firestore rules via the members array).
 *
 * NOTE: Firestore security rules enforce membership (members array) but not
 * fine-grained per-role write access. viewer/editor distinction is enforced
 * in the client UI. Server-side per-role Firestore rules will be added in a
 * future phase via Firebase Admin SDK or Cloud Functions.
 */
export type TripRole = 'owner' | 'editor' | 'viewer'

export type TripInviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired'

/**
 * An invitation to join a trip. Stored in the top-level `invites` collection
 * as `invites/{token}` — the token IS the document ID, enabling O(1) lookup by
 * URL without knowing the tripId. The token is a 64-char cryptographically
 * random hex string; guessing it is infeasible.
 *
 * Only non-sensitive trip information is stored here (name snapshot, role) so
 * the accept page can display invite details before the user is authenticated.
 */
export interface TripInvite {
  id: string              // same as the Firestore doc ID (= token)
  tripId: string
  tripName: string        // denormalized snapshot; shown on accept page
  ownerId: string
  inviterName: string     // denormalized snapshot
  email: string           // invitee email, lowercase
  role: 'editor' | 'viewer'  // cannot invite as 'owner'
  status: TripInviteStatus
  createdAt: string       // ISO
  expiresAt: string       // ISO, 7 days after createdAt
  acceptedAt?: string
  acceptedByUid?: string
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

/**
 * Fine-grained control over which memory data is visible in the public share.
 * Precise GPS coordinates are NEVER exposed regardless of these settings.
 */
export interface ShareMemoryVisibility {
  titles: boolean      // include title + description text
  tags: boolean        // include tagged traveller name/initials/color (no uid/email)
  dayGrouping: boolean // group photos by day in the public gallery
}

export interface ShareVisibility {
  itinerary: boolean
  travellers: boolean
  budget: boolean
  expenseBreakdown: boolean
  settlement: boolean
  notes: boolean
  /** Opt-in: false by default. When true, safe photo snapshots are included in the public share. */
  memories: boolean
  /** Sub-options controlling which memory metadata is shown publicly. */
  memoryOptions?: ShareMemoryVisibility
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

/**
 * Public-safe memory snapshot. Contains ONLY safe fields — never storagePath,
 * userId, or precise GPS coordinates. photoUrl is a Firebase Storage download URL
 * which is already public (required to display the image in a browser).
 */
export interface SharedMemory {
  photoUrl: string
  title?: string
  description?: string
  uploadedAt: string
  capturedAt?: string
  dayKey?: string
  /** User-entered place label — safe to share; never raw GPS coordinates. */
  placeName?: string
  /** Tagged travellers: name/initials/color only. No uid or email. */
  taggedTravellers?: SharedTraveller[]
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
  /** Public memory gallery — only present when owner opts in via share settings. */
  memories?: SharedMemory[]
  memoryCount?: number
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
// Smart AI Route Optimiser orders stops by REAL road cost (distance/time) using
// Google Routes API. The primary method builds a traffic-aware road-cost matrix
// (Compute Route Matrix) and solves the visit order with a TSP heuristic
// (nearest-neighbour + 2-opt); straight-line Haversine is used only as a no-key
// / API-failure fallback. The exact road polyline + totals come from a single
// Compute Routes call for the chosen order. All optimisation calls are
// user-triggered — never automatic. Returns 503 when Maps is not configured.

export type RouteOptimiseMode = 'fastest' | 'shortest' | 'balanced'

/**
 * How the optimised visit order was derived. Surfaced in dev debug + a UI badge
 * so it is always clear whether the order is real-road-aware or an estimate.
 *   • route_matrix_tsp        — Routes API road-cost matrix + TSP (best)
 *   • routes_optimize_waypoints — Routes API optimizeWaypointOrder (road-aware)
 *   • haversine_fallback      — straight-line estimate (no key / API failure)
 */
export type RouteOptimisationMethod =
  | 'route_matrix_tsp'
  | 'routes_optimize_waypoints'
  | 'haversine_fallback'

/** A single point to include in an optimisation request. */
export interface OptimiseRoutePoint {
  id: string
  name: string
  lat: number
  lng: number
}

// ── In-app notifications (Phase 9) ───────────────────────────────────────────
//
// Lightweight notification model stored in users/{uid}/notifications/{id}.
// Only the recipient can read/update their own notifications (Firestore rules).
// Trip members may create notifications for other members via the tag flow.
// No push notifications or email in this phase — in-app bell only.

export type NotificationType = 'memory_tagged' | 'comment_mention'

export interface InAppNotification {
  id: string
  userId: string        // recipient uid — matches the Firestore subcollection path
  tripId: string
  memoryId?: string
  /** Phase 11: comment that triggered this mention notification */
  commentId?: string
  /** Phase 11: where the comment lives — used to route the notification tap */
  targetType?: CommentTargetType
  targetId?: string
  type: NotificationType
  title: string
  message: string
  read: boolean
  createdAt: string     // ISO
  actorUid?: string     // who triggered the notification (uploader uid)
  actorName?: string    // uploader display name (denormalised)
  tripName?: string     // trip name (denormalised for display without extra fetch)
}

// ── Comments & Reactions (Phase 11) ──────────────────────────────────────────
//
// Comments are stored as trips/{tripId}/comments/{commentId}.
// Reactions are stored as trips/{tripId}/reactions/{reactionId}.
// Both inherit trip membership via the existing wildcard rule:
//   match /{sub=**} { allow read, write: if isTripMember(tripId); }
// Comments and reactions are NEVER exposed on public share pages.

/** Which item type a comment or reaction is attached to. */
export type CommentTargetType = 'trip' | 'activity' | 'memory' | 'expense' | 'route'

/** A discussion comment left by a trip member on an activity, memory, expense, or the trip itself. */
export interface TripComment {
  id: string
  tripId: string
  targetType: CommentTargetType
  targetId: string
  authorUid: string
  authorName: string
  /** Colour resolved from the author's traveller entry (or a palette fallback). */
  authorColor: string
  body: string
  /** UIDs of members mentioned with @name in this comment body. */
  mentions: string[]
  createdAt: string     // ISO
  updatedAt?: string    // ISO — set on edit
  edited?: boolean
  deleted?: boolean     // soft-delete: body is cleared but document is kept
}

/** A quick emoji reaction from a trip member on any commentable target. */
export interface TripReaction {
  id: string
  tripId: string
  targetType: CommentTargetType
  targetId: string
  userId: string
  /** One of the six supported emoji: 👍 ❤️ 😂 😮 ✅ ❓ */
  emoji: string
  createdAt: string     // ISO
}

/** Result returned by POST /api/maps/route/optimise. */
export interface OptimiseRouteResult {
  mode: RouteOptimiseMode
  travelMode: TravelMode
  /** How the optimised order was computed (drives the UI method badge). */
  optimisationMethod: RouteOptimisationMethod
  /** Whether real-time traffic was factored into road costs (DRIVE only). */
  trafficAware: boolean
  /** Whether the first point was held fixed as the start of the day. */
  keepFirstFixed: boolean
  /** Whether the last point was held fixed as the end of the day. */
  keepLastFixed: boolean
  /** Point IDs in the caller-supplied (original) order. */
  originalOrder: string[]
  /** Point IDs in the optimised road order. */
  optimisedOrder: string[]
  /** Straight-line Haversine distance for the original order (approx, metres). */
  originalHaversineMeters: number
  /** Straight-line Haversine distance for the optimised order (approx, metres). */
  optimisedHaversineMeters: number
  /** Exact road distance for the ORIGINAL order (metres). 0 when unavailable. */
  originalRouteDistanceMeters: number
  /** Exact road travel time for the ORIGINAL order (seconds). 0 when unavailable. */
  originalRouteDurationSeconds: number
  /** Exact road distance for the optimised order via Google Routes API (metres). */
  optimisedRouteDistanceMeters: number
  /** Exact road travel time for the optimised order via Google Routes API (seconds). */
  optimisedRouteDurationSeconds: number
  /** Road distance saved vs the original order (metres; may be negative). */
  distanceSavedMeters: number
  /** Road travel time saved vs the original order (seconds; may be negative). */
  durationSavedSeconds: number
  /**
   * Encoded polyline (Google's algorithm) of the exact road route for the
   * optimised order, when the Routes API returned one. Decoded client-side and
   * drawn on the Google Maps canvas (Phase 7E). Absent when unavailable.
   */
  routePolyline?: string
  warnings: string[]
}
