/**
 * Shared TripBrief type for the AI create-trip flow.
 *
 * Extracted verbatim from the AI generator page so the new-layout presentation
 * components (VyBriefForm, etc.) can consume exactly the same brief shape the
 * page builds and feeds to generation — no data-shape divergence.
 */

import type {
  TripType, TripGenerationPreferences, AccommodationDraft, BudgetInclusion,
  PlannedTransport, StructuredDestination, RailwayStationRef, AirportRef,
} from '@/types'

export interface TripBrief {
  tripName: string
  destination: string                  // canonical free-text (kept for back-compat)
  // Phase 16C — structured destination + nearest station/airport
  destinationStructured?: StructuredDestination
  destinationSource: 'dataset' | 'custom'
  /** Nearest station to the destination — used as geographic context in AI prompt. */
  railwayStation?: RailwayStationRef
  /** Nearest airport to the destination — used as geographic context in AI prompt. */
  airport?: AirportRef
  origin: string
  startDate: string
  endDate: string
  budget: number
  currency: string
  travellerCount: number
  tripType: TripType
  composition: { total: number; couples?: number; adults?: number; kids?: number; seniors?: number; notes?: string }
  preferences: TripGenerationPreferences
  // Phase 16B — single unified stay flow (replaces stayBaseMode/stayBase/stay)
  accommodation: AccommodationDraft
  budgetIncluded: BudgetInclusion
  transport: PlannedTransport
  // Hotfix transport improvements — structured from/to + round trip + train validation
  /** One-way or round-trip journey. */
  transportTravelType: 'one_way' | 'round_trip'
  // Train from/to structured selectors
  fromStation?: RailwayStationRef
  toStation?: RailwayStationRef
  // Train number/name (optional — user may just enter a number without selecting from seed)
  trainNumber?: string
  trainName?: string
  /** Route mismatch warning from local seed validation. Advisory only. */
  trainRouteWarning?: string
  // Flight from/to structured selectors
  fromAirport?: AirportRef
  toAirport?: AirportRef
  // Bus/car/other: free-text city names (reuses transport.origin/destination)
  // Return leg (round trip)
  returnFromStation?: RailwayStationRef
  returnToStation?: RailwayStationRef
  returnFromAirport?: AirportRef
  returnToAirport?: AirportRef
  returnFromCity?: string
  returnToCity?: string
  returnTrainNumber?: string
  returnTrainName?: string
}
