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
  // Phase 14 — saved AI food/café intelligence (optional; only for food places).
  foodInsight?: FoodPlaceInsight
  // Phase 14 extra — smart category auto-selection from Google place types.
  suggestedCategorySource?: 'google_place_type' | 'manual'
  detectedGoogleTypes?: string[]
  // Phase 15A — Smart Visited Places Tracker (all optional; non-destructive).
  // Stored status always wins over live detection; user can override manually.
  visitedStatus?: VisitedStatus
  visitedAt?: string                 // ISO — when marked visited/skipped
  visitedConfidence?: VisitedConfidence
  visitedSource?: VisitedSource
  visitedLocationPointId?: string    // location/memory point that matched
  // Phase 16E — itinerary timing (optional, backward-compatible)
  estimatedDurationMinutes?: number
  travelToNextMinutes?: number
  travelToNextDistanceMeters?: number
  travelToNextDistanceText?: string
  travelToNextDurationText?: string
  routeMode?: string
  routeSource?: 'google_routes' | 'estimate' | 'unavailable'
  routeConfidence?: 'high' | 'medium' | 'low'
  // Phase 16F — location context (elevation / weather / AQI / time zone). Optional.
  activityContext?: ActivityContext
}

export interface ItineraryDay {
  id: string
  tripId: string
  date: string
  dayNumber: number
  activities: Activity[]
  // Phase 16F — day-level "what to carry" suggestions derived from context. Optional.
  essentialSuggestions?: EssentialSuggestion[]
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
  // ── Phase 14 — Bill attachment & spend analysis (all optional, backward-compatible) ──
  // Bills are PRIVATE to trip members and are NEVER included in public share
  // snapshots. We store only a Storage download URL + path, plus user-confirmed
  // draft analysis fields — never raw OCR output or payment card data.
  billImageUrl?: string
  billStoragePath?: string
  billOriginalFileName?: string
  billContentType?: string
  billSizeBytes?: number
  billUploadedAt?: string          // ISO
  billAnalysisStatus?: BillAnalysisStatus
  billAnalysisSummary?: string
  billExtractedVendor?: string
  billExtractedDate?: string       // YYYY-MM-DD
  billExtractedTotal?: number
  billExtractedTax?: number
  billExtractedItems?: BillExtractedItem[]
  billConfidence?: BillConfidence
}

export type BillAnalysisStatus =
  | 'none'        // no bill attached
  | 'attached'    // image attached, not analysed
  | 'draft'       // AI/manual draft created, awaiting confirmation
  | 'confirmed'   // user confirmed the draft into the expense

export type BillConfidence = 'low' | 'medium' | 'high'

/** A single line item extracted (or manually entered) from a bill. */
export interface BillExtractedItem {
  name: string
  quantity?: number
  amount?: number
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
  /** Google place types (e.g. 'restaurant', 'tourist_attraction') for category auto-suggestion. */
  types?: string[]
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

export type NotificationType = 'memory_tagged' | 'comment_mention' | 'task_assigned'

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
  /** Phase 12: task that triggered this assignment notification */
  taskId?: string
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

// ── Tasks, Polls & Voting (Phase 12) ─────────────────────────────────────────
//
// Tasks are stored as trips/{tripId}/tasks/{taskId}.
// Polls are stored as trips/{tripId}/polls/{pollId} (options embedded in the doc).
// Both inherit trip membership via the existing wildcard rule:
//   match /{sub=**} { allow read, write: if isTripMember(tripId); }
// Planning data is NEVER exposed on public share pages.

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskCategory =
  | 'booking'
  | 'payment'
  | 'packing'
  | 'documents'
  | 'transport'
  | 'food'
  | 'shopping'
  | 'route'
  | 'memories'
  | 'general'

/** A trip task / responsibility, optionally assigned to a member and linked to trip data. */
export interface TripTask {
  id: string
  tripId: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  category: TaskCategory
  /** Assigned member uid + denormalised name (null when unassigned). */
  assignedToUid?: string | null
  assignedToName?: string | null
  createdByUid: string
  createdByName: string
  linkedActivityId?: string
  linkedExpenseId?: string
  linkedMemoryId?: string
  dueDate?: string       // YYYY-MM-DD
  createdAt: string      // ISO
  updatedAt?: string     // ISO
  completedAt?: string   // ISO — set when status → done
}

export type PollType =
  | 'place'
  | 'activity'
  | 'restaurant'
  | 'hotel'
  | 'route'
  | 'budget'
  | 'date_time'
  | 'general'

export type PollStatus = 'open' | 'closed' | 'finalised'

/** A single voteable option within a poll. Votes are stored as an array of voter uids. */
export interface PollOption {
  id: string
  label: string
  description?: string
  placeName?: string
  estimatedCost?: number
  linkedActivityId?: string
  /** Voter uids — never emails. Resolved to member names client-side. */
  votes: string[]
  createdAt: string      // ISO
}

/** A group decision poll. Options are embedded so a single read renders the whole poll. */
export interface TripPoll {
  id: string
  tripId: string
  title: string
  description?: string
  type: PollType
  status: PollStatus
  options: PollOption[]
  createdByUid: string
  createdByName: string
  allowMultipleVotes: boolean
  closesAt?: string      // ISO — optional deadline (informational)
  linkedActivityId?: string
  linkedRouteDayKey?: string
  /** Set when the poll is finalised — the winning option id. */
  finalisedOptionId?: string
  createdAt: string      // ISO
  updatedAt?: string     // ISO
}

// ── AI Itinerary Reflow (Phase 13) ───────────────────────────────────────────
//
// When a trip's date range changes, any itinerary days that fall outside the new
// range are "out-of-range". The user can choose from 5 reflow options. The AI
// option calls POST /api/ai/itinerary-reflow which returns a structured preview
// the user must confirm before any data is mutated.

/** A single activity being moved or removed in a proposed reflow. */
export interface ActivityReflowItem {
  activityId: string
  activityTitle: string
  fromDayDate: string   // YYYY-MM-DD (original day date)
  toDayDate?: string    // YYYY-MM-DD (target day date); absent = removed
  reason?: string
}

/** A warning produced by the reflow analysis. */
export interface ReflowWarning {
  type: 'completed_day_skipped' | 'activity_removed' | 'day_gap' | 'timing_conflict' | 'general'
  message: string
}

/** Input sent to the AI reflow endpoint. Contains no secrets. */
export interface ItineraryReflowInput {
  tripName: string
  destination: string
  oldStartDate: string
  oldEndDate: string
  newStartDate: string
  newEndDate: string
  today: string   // YYYY-MM-DD (to identify completed days)
  protectCompleted: boolean
  outOfRangeDays: Array<{
    dayNumber: number
    date: string
    isCompleted: boolean
    activities: Array<{ id: string; title: string; time: string; notes: string }>
  }>
  validDates: string[]   // dates in new range that can receive activities
}

/** A proposed day in the reflow result. */
export interface ReflowProposedDay {
  date: string
  dayNumber: number
  activities: Array<{ id: string; title: string; time: string; notes: string }>
}

/** Structured preview returned to the client from the AI reflow endpoint. */
export interface ItineraryReflowResult {
  summary: string
  movedActivities: ActivityReflowItem[]
  removedDays: Array<{ date: string; dayNumber: number; reason: string }>
  proposedDays: ReflowProposedDay[]
  timingNotes: string[]
  costImpact: string
  routeImpact: string
  warnings: ReflowWarning[]
}

/** API response envelope for POST /api/ai/itinerary-reflow. */
export interface ItineraryReflowResponse {
  result: ItineraryReflowResult
  isMock: boolean
  provider: 'anthropic' | 'mock'
  model: string
}

// ── AI Itinerary Rating (Phase 13) ───────────────────────────────────────────
//
// Rates the current itinerary on multiple dimensions. Called from the reports
// page (itinerary report). Result is shown as a card for the user to review.

export type RatingLevel = 'excellent' | 'good' | 'caution' | 'risky'

/** A single dimension score in the rating result. */
export interface ItineraryRatingDimension {
  name: string
  level: RatingLevel
  score: number   // 1–10
  reason: string
  improvements: string[]
}

/** Input sent to the AI rating endpoint. Contains no secrets. */
export interface ItineraryRatingInput {
  tripName: string
  destination: string
  tripType: TripType
  startDate: string
  endDate: string
  currency: string
  budget: number
  totalSpent: number
  travellerCount: number
  days: Array<{
    dayNumber: number
    date: string
    activityCount: number
    activities: Array<{
      title: string
      type: ActivityType
      time: string
      estimatedCost?: number
      locationName?: string
    }>
  }>
  totalActivityCount: number
  hasRouteData: boolean
  totalDistanceKm: number
}

/** Structured rating returned to the client. */
export interface ItineraryRatingResult {
  overallScore: number   // 1–10
  overallLevel: RatingLevel
  summary: string
  dimensions: ItineraryRatingDimension[]
  topStrengths: string[]
  topImprovements: string[]
}

/** API response envelope for POST /api/ai/itinerary-rating. */
export interface ItineraryRatingResponse {
  result: ItineraryRatingResult
  isMock: boolean
  provider: 'anthropic' | 'mock'
  model: string
}

// ── Restaurant / Café Intelligence (Phase 14) ────────────────────────────────
//
// A safe, AI-derived insight for a single food place. Built from place METADATA
// only (rating, price level, type) plus trip/budget context — never scraped menus
// or review text. Recommended dishes are GENERIC unless the user supplies a real
// menu/bill. All cost figures are approximate and clearly labelled as such.

export type InsightConfidence = 'low' | 'medium' | 'high'

/** Source of the metadata an insight was derived from. */
export type FoodInsightSource = 'google_places' | 'manual' | 'mixed'

export interface FoodPlaceInsight {
  placeId?: string
  placeName: string
  placeAddress?: string
  rating?: number
  userRatingsTotal?: number
  priceLevel?: number          // 0–4 (Google scale)
  googleMapsUri?: string
  businessStatus?: string
  cuisineTags?: string[]
  vibeSummary?: string
  /** Clearly states it is based on available metadata, not full review text. */
  reviewSummary?: string
  /** Generic dish ideas unless a real menu/bill was provided. */
  recommendedDishes?: string[]
  budgetFit?: string
  suitableGroupType?: string
  orderingStrategy?: string
  spendControlAdvice?: string
  estimatedCostPerPersonMin?: number
  estimatedCostPerPersonMax?: number
  caveats?: string[]
  confidence?: InsightConfidence
  source?: FoodInsightSource
  updatedAt?: string           // ISO — when the insight was generated
}

/** Privacy-safe input sent to POST /api/ai/food-place-insight. */
export interface FoodPlaceInsightInput {
  placeName: string
  placeAddress?: string
  rating?: number
  userRatingsTotal?: number
  priceLevel?: number
  businessStatus?: string
  placeTypes?: string[]
  googleMapsUri?: string
  tripName: string
  destination: string
  tripType: TripType
  currency: string
  travellerCount: number
  /** Optional user-entered cuisine/preference notes. */
  preferenceNotes?: string
  /** Optional user-supplied dish/menu list — enables specific dish suggestions. */
  providedMenuItems?: string[]
}

/** API response envelope for POST /api/ai/food-place-insight. */
export interface FoodPlaceInsightResponse {
  result: FoodPlaceInsight
  isMock: boolean
  provider: 'anthropic' | 'mock'
  model: string
}

// ── Bill Spend Analysis (Phase 14) ───────────────────────────────────────────
//
// Analyses MANUALLY-ENTERED bill fields (image OCR/vision is Coming Soon) and
// returns a structured DRAFT the user must confirm before any expense is
// created/updated. Never silently overwrites an expense. Card numbers, phone
// numbers and other sensitive payment data must be ignored/redacted.

/** Privacy-safe input sent to POST /api/ai/bill-analysis. */
export interface BillAnalysisInput {
  tripName: string
  destination: string
  currency: string
  travellerCount: number
  /** Manually-entered bill fields. */
  vendorName?: string
  date?: string                // YYYY-MM-DD
  total?: number
  tax?: number
  serviceCharge?: number
  items?: BillExtractedItem[]
  notes?: string
}

/** Structured draft returned to the client for confirmation. */
export interface BillAnalysisResult {
  summary: string
  detectedVendor?: string
  detectedDate?: string
  detectedTotal?: number
  detectedTax?: number
  detectedItems: BillExtractedItem[]
  suggestedCategory: ExpenseCategory
  suggestedVendorType: VendorType
  perPersonSplit?: number
  confidence: BillConfidence
  warnings: string[]
}

/** API response envelope for POST /api/ai/bill-analysis. */
export interface BillAnalysisResponse {
  result: BillAnalysisResult
  isMock: boolean
  provider: 'anthropic' | 'mock'
  model: string
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

// ── Smart Visited Places Tracker + Gap Planner (Phase 15A) ───────────────────
//
// Detects which planned itinerary places have likely been visited by comparing
// Travel History / live-tracking / memory GPS points against activity coords.
// Detection is APPROXIMATE and never auto-confirms — the user confirms or skips.
// Visited data is private to trip members and never written to public shares.

/** Lifecycle of a planned place's visit state. */
export type VisitedStatus =
  | 'not_visited'
  | 'likely_visited'      // detected from location data, awaiting user confirmation
  | 'confirmed_visited'   // user confirmed
  | 'skipped'             // user marked as skipped

/** How confident the detection is, based on distance + GPS accuracy. */
export type VisitedConfidence = 'high' | 'medium' | 'low'

/** Where a visited signal came from. */
export type VisitedSource =
  | 'location_history'    // manual check-in
  | 'live_tracking'       // foreground live tracking point
  | 'memory'              // GPS attached to a photo memory
  | 'current_location'    // user's one-shot current-location check
  | 'manual'              // user set it by hand with no GPS match

/** A computed (not stored) detection that an activity was likely visited. */
export interface VisitedDetection {
  activityId: string
  dayId: string
  status: 'likely_visited'   // detection only ever yields likely_visited
  confidence: VisitedConfidence
  source: VisitedSource
  nearestDistanceMeters: number
  matchedLocationPointId?: string
  matchedAt?: string         // ISO timestamp of the closest matching point
}

/** A single planned place in the gap analysis, with its effective status. */
export interface GapAnalysisPlace {
  activityId: string
  dayId: string
  dayNumber: number
  date: string
  title: string
  category?: ActivityCategory
  lat?: number
  lng?: number
  status: VisitedStatus
  confidence?: VisitedConfidence
  /** Straight-line metres from the user's current location, when provided. */
  distanceFromCurrentMeters?: number
}

/** Trip-level progress snapshot derived from itinerary + location data. */
export interface GapAnalysis {
  totalPlanned: number
  withCoordinates: number
  confirmedVisited: number
  likelyVisited: number
  skipped: number
  notVisited: number
  /** (confirmed + likely + skipped) / totalPlanned, 0–100. */
  completionPercent: number
  unplannedVisitedCount: number
  visitedPlaces: GapAnalysisPlace[]
  remainingPlaces: GapAnalysisPlace[]
  skippedPlaces: GapAnalysisPlace[]
  distanceTravelledKm: number
  tripDaysTotal: number
  tripDaysElapsed: number
  tripDaysRemaining: number
  budgetTotal: number
  budgetSpent: number
  budgetRemaining: number
  /** Remaining places ordered by nearness to current location (when provided). */
  nextBestPlaces: GapAnalysisPlace[]
}

/** Planning scopes the AI Gap Planner can target. */
export type GapPlannerMode =
  | 'complete_remaining'
  | 'today_only'
  | 'tomorrow_only'
  | 'next_few_hours'
  | 'fill_free_time'
  | 'replace_missed'

/** A compact place reference sent to the AI (no IDs, no secrets). */
export interface GapPlannerPlaceRef {
  title: string
  category?: ActivityCategory
  lat?: number
  lng?: number
  date?: string
}

/** Input sent to POST /api/ai/itinerary-gap-planner. Privacy-safe. */
export interface GapPlannerInput {
  tripName: string
  destination: string
  tripType: string
  travellerCount: number
  currency: string
  startDate: string
  endDate: string
  today: string                 // YYYY-MM-DD
  nowTime?: string              // HH:MM local, optional
  mode: GapPlannerMode
  pace: 'relaxed' | 'balanced' | 'packed'
  allowRevisits: boolean
  hasCurrentLocation: boolean
  /** Only included when the user explicitly ran with current location. */
  currentLocation?: { lat: number; lng: number }
  startPointName?: string       // hotel / last check-in label
  budgetRemaining?: number
  visitedPlaces: GapPlannerPlaceRef[]
  remainingPlaces: GapPlannerPlaceRef[]
  constraints?: string
  /** Phase 15B: route summary when the user has run route optimisation. */
  routeSummary?: GapPlanRouteSummary
}

/** A single AI-proposed activity in a preview (never auto-applied). */
export interface GapPlannerProposedActivity {
  title: string
  category?: ActivityCategory
  startTime?: string
  endTime?: string
  estimatedCost?: number
  locationName?: string
  notes?: string
  isBreak?: boolean             // food / rest break
  fromRemaining?: boolean       // maps to an existing remaining place
}

/** A proposed day in the gap-planner preview. */
export interface GapPlannerProposedDay {
  date: string                  // YYYY-MM-DD
  label: string                 // e.g. "Today", "Tomorrow"
  activities: GapPlannerProposedActivity[]
}

/** Structured preview returned by the gap planner. */
export interface GapPlannerResult {
  summary: string
  mode: GapPlannerMode
  proposedDays: GapPlannerProposedDay[]
  routeOrderNote: string
  estimatedTotalCost: number
  timingNotes: string[]
  warnings: string[]
  /** Always present — reminds the user the plan is approximate. */
  approximateLabel: string
}

/** API response envelope for POST /api/ai/itinerary-gap-planner. */
export interface GapPlannerResponse {
  result: GapPlannerResult
  isMock: boolean
  provider: 'anthropic' | 'mock'
  model: string
}

// ── Route-aware Gap Planner (Phase 15B) ──────────────────────────────────────
//
// Route optimisation for the Smart Planner remaining places. Aggregates the
// OptimiseRouteResult into a compact, AI-safe summary so the gap planner can
// factor travel distance/time into its suggestions.

/**
 * Compact route summary attached to GapPlannerInput when the user has run
 * "Optimise remaining plan". Contains no precise GPS coordinates — only
 * aggregate distance/duration figures safe to include in an AI prompt.
 */
export interface GapPlanRouteSummary {
  stopCount: number
  totalDistanceKm: number
  totalDurationText: string
  optimisationMethod: RouteOptimisationMethod
  warnings: string[]
}

// ── AI Trip Generator + Auto-Fill Itinerary (Phase 15C) ──────────────────────
//
// Generates a complete day-by-day itinerary for an EXISTING trip from
// destination, dates, budget, traveller composition, and preferences. The
// generated plan is a PREVIEW ONLY — the endpoint never writes Firestore, the
// user edits the preview, and nothing is saved until they tap Apply. All cost,
// timing and route figures are APPROXIMATE. Input is privacy-safe: no emails,
// uids, tokens, private GPS history, comments, bills, or memories.

export type TravelPace = 'relaxed' | 'balanced' | 'packed'

/** How a generated plan is merged into an existing trip's itinerary. */
export type GeneratorMode =
  | 'append'                  // add generated activities, keep everything existing
  | 'fill_empty'              // only write to days that currently have no activities
  | 'replace_future'          // clear + replace days strictly after today (protects completed)
  | 'replace_all_unprotected' // clear + replace today and future days (protects completed/visited)

/** Group-level traveller make-up. No per-person personal data is required. */
export interface TravellerComposition {
  total: number
  couples?: number
  adults?: number
  kids?: number
  seniors?: number
  friends?: number
  family?: boolean
  office?: boolean
  pilgrimage?: boolean
  /** Free-text, e.g. "two senior citizens, avoid stairs, prefer vegetarian". */
  notes?: string
}

export type TripInterest =
  | 'sightseeing' | 'food' | 'shopping' | 'adventure' | 'spiritual'
  | 'museums' | 'nature' | 'nightlife' | 'photography'
  | 'kid_friendly' | 'senior_friendly' | 'luxury' | 'budget' | 'local_culture'

export type FoodPreference =
  | 'vegetarian' | 'non_vegetarian' | 'jain' | 'vegan'
  | 'local_food' | 'cafe_hopping' | 'fine_dining' | 'street_food'

export type AccommodationStyle = 'budget' | 'mid_range' | 'premium' | 'luxury'

export type RoutePreferenceStyle =
  | 'shortest' | 'fastest' | 'scenic' | 'less_walking' | 'senior_friendly' | 'child_friendly'

/** Preference bundle collected by the generator wizard. */
export interface TripGenerationPreferences {
  pace: TravelPace
  interests: TripInterest[]
  foodPreferences: FoodPreference[]
  /** Allergies / avoid list — treated as a constraint, never a safety guarantee. */
  foodAvoid?: string
  accommodationStyle?: AccommodationStyle
  routePreference?: RoutePreferenceStyle
  /** Constraint toggles, e.g. "avoid early mornings", "low walking", "rest breaks". */
  constraints: string[]
  mustVisit: string[]
  avoidPlaces: string[]
  extraNotes?: string
  /** Phase 16D — food budget style for restaurant suggestions (budget/mid_range/premium). */
  foodBudgetStyle?: 'budget' | 'mid_range' | 'premium'
}

/** A compact summary of one existing itinerary day, for generator context. */
export interface GeneratorExistingDay {
  date: string
  dayNumber: number
  activityTitles: string[]
  isPast: boolean
  isEmpty: boolean
  /** True when the day has a confirmed-visited or completed activity (protected). */
  isProtected: boolean
}

/** Privacy-safe input sent to POST /api/ai/trip-generator. */
export interface TripGeneratorInput {
  destination: string
  startDate: string
  endDate: string
  dayCount: number
  budget: number
  currency: string
  travellerCount: number
  composition: TravellerComposition
  tripType: TripType
  preferences: TripGenerationPreferences
  mode: GeneratorMode
  today: string                 // YYYY-MM-DD
  existingDays?: GeneratorExistingDay[]
  /**
   * Phase 15D — known hotel/homestay/area the group is staying at, used as the
   * daily route base. Free text (never personal data). Optional.
   * Superseded by `accommodation` in Phase 16B but kept for backward compat.
   */
  stayBase?: string
  /**
   * Phase 16B — structured stay context for base-aware planning. When
   * `chosen` + `googleVerified`, the AI must anchor each day's start/end to the
   * stay's lat/lng and must not ask for stay again.
   */
  accommodation?: TripGeneratorAccommodation
  /**
   * Phase 16C — structured destination so the AI uses the exact city/state and
   * avoids same-name confusion. `destination` (string) stays canonical.
   */
  destinationStructured?: StructuredDestination
  destinationSource?: 'dataset' | 'custom'
  /** Nearest known station/airport — geographic context only (not bookings). */
  nearestRailwayStation?: Pick<RailwayStationRef, 'name' | 'code' | 'city' | 'state'>
  nearestAirport?: Pick<AirportRef, 'name' | 'iataCode' | 'city' | 'state'>
  /**
   * Structured transport-to-destination context. AI uses for geographic planning
   * only — must NOT invent bookings, PNR, or confirmed ticket status.
   */
  transportContext?: TripTransportContext
}

export type ActivityPriority = 'must' | 'recommended' | 'optional'

// ── Phase 16D refinement — menu/review-aware suggested food items ────────────

/** Where a suggested item's price estimate came from (most → least reliable). */
export type SuggestedFoodItemBasis =
  | 'official_menu_or_website'
  | 'google_review_item_mentions'   // dish name found in review text
  | 'google_review_price_clues'
  | 'google_price_level'
  | 'restaurant_type_city_heuristic'
  | 'local_cuisine_inference'        // AI/local-knowledge dish for the destination's cuisine (no place data)
  | 'user_entered'
  | 'unknown'

/**
 * A single suggested food/drink item with a price estimate. Prices are
 * approximate — `confidence` and `basis` make the source explicit so the UI
 * never overstates accuracy. Item names are generic dish ideas (never scraped
 * menu text); restaurant names remain Google-backed.
 */
export interface SuggestedFoodItem {
  name: string
  category: 'food' | 'drink' | 'dessert' | 'snack'
  /**
   * Composition role within a meal set. Used to validate that a lunch/dinner
   * suggestion is a complete meal (has a `main`) and not only a bread/side.
   */
  role?: 'main' | 'bread_rice' | 'side' | 'drink' | 'dessert' | 'snack'
  vegType?: 'veg' | 'non_veg' | 'vegan' | 'unknown'
  estimatedPriceMin: number
  estimatedPriceMax: number
  /** Trip currency code (India-first; usually 'INR'). */
  currency: string
  confidence: 'high' | 'medium' | 'low'
  basis: SuggestedFoodItemBasis
  /** Short plain-language note, e.g. "Estimated from Google price level and restaurant type." */
  sourceNote?: string
  /** Popularity signal inferred from review text. */
  popularityHint?: 'best_seller' | 'popular' | 'often_mentioned' | 'recommended' | 'unknown'
  /**
   * Recommendation framing for the dish — drives the small chip on the item.
   * Optional and additive. Never implies sales/order data (use `popularityHint`
   * for review-derived popularity).
   */
  recommendationTag?: 'must_try' | 'safe_pick' | 'local_speciality' | 'kid_friendly'
  /** Dietary flags, e.g. ['veg'], ['contains-nuts'], ['vegan'] — advisory, never a safety guarantee. */
  dietaryTags?: string[]
}


// ── Phase 16F — location context enrichment (elevation / weather / AQI / time zone) ──

/** Weather context for a place at a planned date/time. All numbers optional. */
export interface WeatherSnapshot {
  temperatureC?: number
  feelsLikeC?: number
  condition?: string
  precipitationProbability?: number
  humidity?: number
  windKph?: number
  source: 'google_weather' | 'unavailable'
  /** high = exact forecast day matched; low = closest available day used. */
  confidence: 'high' | 'low' | 'unavailable'
  /** The date/time the snapshot was fetched for (ISO date or date-time). */
  fetchedForDateTime?: string
}

/** Air-quality context for a place. */
export interface AqiSnapshot {
  aqi?: number
  category?: string
  dominantPollutant?: string
  healthNote?: string
  source: 'google_air_quality' | 'unavailable'
  confidence: 'high' | 'unavailable'
  /** Which AQI scale the value uses: 'local' (e.g. India CPCB 0–500) or 'universal' (Google UAQI 0–100, higher is better). */
  scale?: 'local' | 'universal'
}

/** Time-zone context for the destination / a place. */
export interface TimeZoneContext {
  timeZoneId?: string
  timeZoneName?: string
  utcOffsetMinutes?: number
  source: 'google_time_zone' | 'destination_default' | 'unavailable'
}

/**
 * Aggregated location context for one activity. Optional and additive — old
 * trips without it keep working.
 */
export interface ActivityContext {
  elevationMeters?: number
  elevationFeet?: number
  elevationSource?: 'google_elevation' | 'unavailable'
  elevationConfidence?: 'high' | 'unavailable'
  weatherSnapshot?: WeatherSnapshot
  aqiSnapshot?: AqiSnapshot
  timeZoneContext?: TimeZoneContext
  /** Short, plain-language cautions (rain, AQI, altitude, heat, cold). */
  contextWarnings?: string[]
  /** ISO timestamp the context enrichment ran. */
  enrichedAt?: string
}

/**
 * Phase 16F — practical "what to carry" suggestion derived from the location
 * context. Advisory only; never prescribes medicine or casual oxygen use.
 */
export interface EssentialSuggestion {
  category: 'air_quality' | 'altitude' | 'weather' | 'rain' | 'cold' | 'heat' | 'general'
  priority: 'must_carry' | 'recommended' | 'optional'
  item: string
  reason: string
  basedOn: {
    aqi?: number
    elevationFeet?: number
    temperatureC?: number
    rainProbability?: number
  }
  medicalDisclaimer?: string
}

/** A single AI-proposed activity in the generated plan (never auto-applied). */
export interface GeneratedActivity {
  title: string
  description?: string
  category: ActivityCategory
  startTime?: string
  endTime?: string
  /** Approx total cost for the whole group, in the trip currency. */
  estimatedCost: number
  estimatedCostPerPerson?: number
  locationName?: string
  /** A query the user can run against Google Places to enrich this place. */
  suggestedPlaceSearchQuery?: string
  bookingStatus: BookingStatus
  priority?: ActivityPriority
  foodInsightNotes?: string
  routeNotes?: string
  whyRecommended?: string
  /** Tentative time to spend, e.g. "1–2 hrs". */
  timeToSpend?: string
  isBreak?: boolean
  /**
   * Phase 15D — true when the AI could not confidently name a real, existing
   * place and the candidate must be resolved via Google Places before applying.
   */
  needsVerification?: boolean
  // Phase 16E — duration hints from AI (optional; timing engine validates/overrides)
  estimatedDurationMinutes?: number
  durationConfidence?: 'high' | 'medium' | 'low'
  durationReason?: string
  // ── Phase 16D — Google-backed food suggestions (optional, food activities only) ──
  /** Meal type — helps the enrichment step pick the right search query. */
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'cafe'
  /** Top Google-verified restaurant/café suggestion for this food break. */
  restaurantSuggestion?: {
    placeId: string
    name: string
    address?: string
    rating?: number
    /** Total Google review count — shown alongside the rating for trust. */
    userRatingsTotal?: number
    priceLevel?: number
    /** Cuisine/type labels derived from Google place types (e.g. ['Seafood', 'Goan']). */
    cuisineTypes?: string[]
    /** Whether Google reports the place open at fetch time (advisory only). */
    openNow?: boolean
    lat: number
    lng: number
  }
  /** Estimated spend for this food break (approximate; based on Google price level or heuristic). */
  estimatedSpendRange?: { min: number; max: number; perPersonMin: number; perPersonMax: number }
  spendConfidence?: 'low' | 'medium' | 'high'
  spendBasis?: 'google_price_level' | 'heuristic' | 'google_review_price_clues' | 'official_menu_or_website'
  /** Short reason tags explaining the suggestion (e.g. "Google-verified", "Budget-friendly"). */
  reasonTags?: string[]
  /** Phase 16D refinement — per-item price estimates with explicit source + confidence. */
  suggestedItems?: SuggestedFoodItem[]
  /** Menu/website URL from Google Place Details (never scraped — shown as a link only). */
  menuSourceUrl?: string
  menuSourceType?: 'google_place_website' | 'google_place_menu' | 'unknown'
  /**
   * Where the food suggestion came from: a real Google place ('google') or local
   * cuisine inference ('ai'). Drives whether a "Verified" badge may be shown — an
   * AI-only suggestion must never claim verification.
   */
  foodSuggestionSource?: 'google' | 'ai'
  /** Short "why this meal here" note (route/timing/local-cuisine rationale). */
  foodWhyHere?: string
  /** Smart pairing line (cuisine + meal time + local speciality), e.g. "Pair prawn curry rice with a kokum cooler." */
  foodPairingNote?: string
  // Phase 16F — location context (elevation / weather / AQI / time zone). Optional.
  activityContext?: ActivityContext
}

/** A proposed day in the generated plan. */
export interface GeneratedDay {
  date: string
  dayNumber: number
  theme?: string
  estimatedDayCost: number
  mealPlan?: string
  restBreaks?: string
  notes?: string
  activities: GeneratedActivity[]
}

export interface GeneratedBudgetSummary {
  totalEstimatedCost: number
  perHeadEstimate: number
  /** budget − totalEstimatedCost (may be negative). */
  remainingBuffer: number
  highCostRisks: string[]
  withinBudget: boolean
}

export interface GeneratedComfortSummary {
  walkingIntensity: 'low' | 'moderate' | 'high'
  elderlyFriendly: boolean
  kidFriendly: boolean
  paceRisk: 'low' | 'medium' | 'high'
  notes: string[]
}

export interface GeneratedRouteSummary {
  logic: string
  backtrackingRisk: 'low' | 'medium' | 'high'
  notes: string[]
}

/** Structured preview returned by the trip generator. */
export interface TripGeneratorResult {
  tripSummary: string
  assumptions: string[]
  dayPlans: GeneratedDay[]
  budgetSummary: GeneratedBudgetSummary
  comfortSummary: GeneratedComfortSummary
  routeSummary: GeneratedRouteSummary
  warnings: string[]
  confidence: InsightConfidence
  /** Always present — reminds the user the plan is approximate. */
  approximateLabel: string
}

/** API response envelope for POST /api/ai/trip-generator. */
export interface TripGeneratorResponse {
  result: TripGeneratorResult
  isMock: boolean
  provider: 'anthropic' | 'mock'
  model: string
  /** Which path produced the result: real AI, explicit dev mock, or unavailable. */
  generationSource?: 'anthropic' | 'dev_mock' | 'unavailable'
}

// ── Phase 15D — New-Trip AI Draft Generator: budget split, stay base,
// planned transport / accommodation entries, ticket-upload foundation. ───────

/** Budget categories the user can mark as included in / excluded from the trip budget. */
export type BudgetCategoryKey =
  | 'stay'             // hotel / homestay / Airbnb
  | 'transport_to'     // train / flight / bus / car to the destination
  | 'local_transport'  // taxis / cabs / local travel
  | 'food'
  | 'activities'       // tickets / entry fees
  | 'shopping'
  | 'buffer'           // emergency buffer

/** Which budget categories the entered total budget is meant to cover. */
export type BudgetInclusion = Partial<Record<BudgetCategoryKey, boolean>>

/** Where the group is staying — drives daily route base + budget. */
export type StayBaseMode = 'known' | 'suggest' | 'later'

/** Optional planned long-haul transport to/from the destination (estimate, not an expense). */
export interface PlannedTransport {
  mode: 'train' | 'flight' | 'bus' | 'car' | 'other'
  origin?: string
  destination?: string
  departure?: string        // ISO date-time or free text
  arrival?: string
  totalCost?: number
  perPersonCost?: number
  bookingRef?: string
}

/** Optional planned accommodation (estimate, not an expense). Doubles as route base. */
export interface PlannedStay {
  name?: string
  area?: string
  checkIn?: string
  checkOut?: string
  totalCost?: number
  perNightCost?: number
  rooms?: number
  /** Resolved coordinates when the stay area/name was matched via Google Places. */
  lat?: number
  lng?: number
  placeId?: string
}

// ── Phase 16B — unified accommodation intake (single stay flow) ──────────────

export type StayType = 'hotel' | 'homestay' | 'resort' | 'apartment' | 'relatives_home' | 'other'
export type StayMealPlan = 'none' | 'breakfast' | 'breakfast_dinner' | 'all_meals' | 'custom'
export type StayCostMode = 'total' | 'per_night' | 'unknown'
/** How the user answered the single stay question. */
export type StayChoice = 'chosen' | 'suggest' | 'later'

/**
 * Full accommodation draft collected ONCE in the new-trip AI generator.
 * When `mode === 'chosen'` the user has booked a stay; a Google Places match
 * (googleVerified) gives an exact lat/lng used as the trip's daily route base.
 * When `mode === 'suggest'` they want the AI to recommend a stay area.
 * When `mode === 'later'` no base is fixed.
 */
export interface AccommodationDraft {
  /** Tri-state UI selection; `chosen` mirrors `mode === 'chosen'`. */
  mode: StayChoice
  chosen: boolean
  name?: string
  type?: StayType
  placeId?: string
  address?: string
  lat?: number
  lng?: number
  rating?: number
  userRatingsTotal?: number
  types?: string[]
  googleVerified?: boolean
  checkInDate?: string
  checkInTime?: string
  checkOutDate?: string
  checkOutTime?: string
  costMode?: StayCostMode
  costAmount?: number
  rooms?: number
  travellers?: number
  mealsIncluded?: StayMealPlan
  mealsCustomNote?: string
  notes?: string
  /** Preferred area when no exact stay is chosen (suggest mode). */
  areaPreference?: string
}

// ── Phase 16C — structured destination / station / airport references ────────

/** Structured city + state destination (backed by the local cities dataset). */
export interface StructuredDestination {
  city: string
  state: string
  country: 'India'
  lat?: number
  lng?: number
  aliases?: string[]
}

/** A selected railway station (dataset match or custom free-text). */
export interface RailwayStationRef {
  name: string
  code: string
  city: string
  state: string
  lat?: number
  lng?: number
  source: 'dataset' | 'custom'
}

/** A selected airport (dataset match or custom free-text). */
export interface AirportRef {
  name: string
  iataCode: string
  city: string
  state: string
  lat?: number
  lng?: number
  source: 'dataset' | 'custom'
}

/** Privacy-safe accommodation context sent to the AI generator. */
export interface TripGeneratorAccommodation {
  chosen: boolean
  name?: string
  type?: StayType
  address?: string
  lat?: number
  lng?: number
  googleVerified?: boolean
  /** Preferred stay area when no exact stay is chosen. */
  areaPreference?: string
}

/**
 * Structured transport context sent to the AI generator (Phase hotfix / 16G prep).
 * Context only — the AI must NOT invent PNR, ticket status, or confirmed bookings.
 * All fields are optional so existing callers without transport details still work.
 */
export interface TripTransportContext {
  mode?: 'train' | 'flight' | 'bus' | 'car' | 'other'
  travelType?: 'one_way' | 'round_trip'
  fromStation?: Pick<RailwayStationRef, 'name' | 'code' | 'city' | 'state'>
  toStation?: Pick<RailwayStationRef, 'name' | 'code' | 'city' | 'state'>
  fromAirport?: Pick<AirportRef, 'name' | 'iataCode' | 'city' | 'state'>
  toAirport?: Pick<AirportRef, 'name' | 'iataCode' | 'city' | 'state'>
  fromCity?: string
  toCity?: string
  /** Selected train number, if known. */
  trainNumber?: string
  trainName?: string
  /** Departure time from origin station (HH:MM, approximate from local seed). */
  trainDepartureTime?: string
  /** Arrival time at destination station (HH:MM, approximate from local seed). */
  trainArrivalTime?: string
  /** Days the train runs (e.g. "Daily except Thu"). Approximate from local seed. */
  trainDaysOfRun?: string
  /**
   * Route mismatch warning from local seed validation. When present, AI should
   * advise the user to verify the train selection before booking.
   */
  trainRouteWarning?: string
  /** Return leg present when travelType === 'round_trip'. */
  returnFromStation?: Pick<RailwayStationRef, 'name' | 'code' | 'city' | 'state'>
  returnToStation?: Pick<RailwayStationRef, 'name' | 'code' | 'city' | 'state'>
  returnFromAirport?: Pick<AirportRef, 'name' | 'iataCode' | 'city' | 'state'>
  returnToAirport?: Pick<AirportRef, 'name' | 'iataCode' | 'city' | 'state'>
  returnFromCity?: string
  returnToCity?: string
  returnTrainNumber?: string
  returnTrainName?: string
  /** Return train departure time (HH:MM, approximate from local seed). */
  returnTrainDepartureTime?: string
  /** Return train arrival time (HH:MM, approximate from local seed). */
  returnTrainArrivalTime?: string
  returnTrainDaysOfRun?: string
}

/** Compact per-day road-route summary shown in the generated preview. */
export interface GeneratedDayRoute {
  /** Number of geocoded stops used for the route. */
  stops: number
  distanceKm: number
  durationText: string
  method: 'road' | 'haversine'
  /** True when the day's activities changed after this route was computed. */
  stale?: boolean
  /**
   * Outcome of the optimisation pass (Phase 16G PART 11):
   *   optimised — real road-aware order, timings recalculated
   *   fallback  — straight-line order used (live road data unavailable)
   *   failed    — optimisation could not run; original order kept
   */
  optimiseStatus?: 'optimised' | 'fallback' | 'failed'
  /** True once planned timings were recalculated for the optimised order. */
  timingsUpdated?: boolean
}
