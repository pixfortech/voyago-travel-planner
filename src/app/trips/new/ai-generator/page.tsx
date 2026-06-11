'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sparkles, MessageSquare, HelpCircle, LayoutGrid,
  ChevronRight, AlertTriangle, Loader2, Home, Wallet, Upload, Check, Info,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { createTrip, updateItineraryDay, getItineraryDays } from '@/lib/firestore'
import AppShell from '@/components/layout/AppShell'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import PlacePicker, { type SelectedPlace } from '@/components/maps/PlacePicker'
import SearchableSelect from '@/components/ui/SearchableSelect'
import GeneratedItineraryPreview, {
  type EditableGeneratedDay, type PreviewBudgetContext,
} from '@/components/ai/GeneratedItineraryPreview'
import { useMapsStatus } from '@/lib/maps/useMapsStatus'
import { getDayCount } from '@/lib/utils'
import { categoryToActivityType } from '@/lib/maps/categoryMapping'
import { type IndiaCity, searchCities } from '@/data/indiaCities'
import { type IndiaRailwayStation, searchRailwayStations } from '@/data/indiaRailwayStations'
import { type IndiaAirport, searchAirports } from '@/data/indiaAirports'
import { type IndiaTrainData, validateTrainRoute, fetchTrainDetails, getSuggestedReturnTrain } from '@/data/indiaTrains'
import { searchTrains as trainServiceSearch, formatTrainLabel, getImportDataStatus, type TrainSearchResult } from '@/lib/trains/trainService'
import type {
  TripType, TripGenerationPreferences, TripInterest, FoodPreference,
  TravelPace, TripGeneratorInput, TripGeneratorResult, GeneratedActivity, Activity,
  BudgetInclusion, BudgetCategoryKey, PlannedTransport, PlannedStay,
  AccommodationDraft, StayType, StayMealPlan, StayCostMode, StayChoice,
  TripGeneratorAccommodation, StructuredDestination, RailwayStationRef, AirportRef,
  TripTransportContext,
} from '@/types'
import type { FoodEnrichmentPatch } from '@/app/api/ai/enrich-food/route'

// ── Types ─────────────────────────────────────────────────────────────────

type Stage =
  | 'mode-select'
  | 'full-prompt'
  | 'parsing'
  | 'guided'
  | 'smart-form'
  | 'review-brief'
  | 'generating'
  | 'preview'
  | 'creating'

type InputMode = 'full-prompt' | 'guided' | 'smart-form'

interface TripBrief {
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

const BUDGET_CATS: { key: BudgetCategoryKey; label: string }[] = [
  { key: 'stay', label: 'Stay / hotel' },
  { key: 'transport_to', label: 'Transport to destination' },
  { key: 'local_transport', label: 'Local transport' },
  { key: 'food', label: 'Food' },
  { key: 'activities', label: 'Activities / tickets' },
  { key: 'shopping', label: 'Shopping' },
  { key: 'buffer', label: 'Emergency buffer' },
]

const TRANSPORT_MODES: PlannedTransport['mode'][] = ['train', 'flight', 'bus', 'car', 'other']

const STAY_TYPES: { value: StayType; label: string }[] = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'homestay', label: 'Homestay' },
  { value: 'resort', label: 'Resort' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'relatives_home', label: "Relative's home" },
  { value: 'other', label: 'Other' },
]

const MEAL_PLANS: { value: StayMealPlan; label: string }[] = [
  { value: 'none', label: 'No meals' },
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'breakfast_dinner', label: 'Breakfast + dinner' },
  { value: 'all_meals', label: 'All meals' },
  { value: 'custom', label: 'Custom' },
]

/** Common stay-area suggestions offered when no exact stay is chosen. */
const AREA_PRESETS = ['MG Marg', 'Deorali', 'Near station', 'Near airport', 'Central', 'Quiet area']

// ── Constants ─────────────────────────────────────────────────────────────

const GUIDED_STEPS = 6
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'SGD']

const TRIP_TYPES: { value: TripType; label: string; emoji: string }[] = [
  { value: 'solo',       label: 'Solo',       emoji: '🧳' },
  { value: 'couple',     label: 'Couple',     emoji: '💑' },
  { value: 'friends',    label: 'Friends',    emoji: '🎉' },
  { value: 'family',     label: 'Family',     emoji: '👨‍👩‍👧' },
  { value: 'group',      label: 'Group',      emoji: '👥' },
  { value: 'office',     label: 'Office',     emoji: '💼' },
  { value: 'pilgrimage', label: 'Pilgrimage', emoji: '🛕' },
  { value: 'wedding',    label: 'Wedding',    emoji: '💍' },
]

const INTERESTS: { value: TripInterest; label: string }[] = [
  { value: 'sightseeing',    label: 'Sightseeing' },
  { value: 'food',           label: 'Food' },
  { value: 'shopping',       label: 'Shopping' },
  { value: 'adventure',      label: 'Adventure' },
  { value: 'spiritual',      label: 'Spiritual' },
  { value: 'museums',        label: 'Museums' },
  { value: 'nature',         label: 'Nature' },
  { value: 'nightlife',      label: 'Nightlife' },
  { value: 'photography',    label: 'Photography' },
  { value: 'kid_friendly',   label: 'Kid-friendly' },
  { value: 'senior_friendly',label: 'Senior-friendly' },
  { value: 'local_culture',  label: 'Local Culture' },
]

const FOOD_PREFS: { value: FoodPreference; label: string }[] = [
  { value: 'vegetarian',   label: 'Vegetarian' },
  { value: 'non_vegetarian',label: 'Non-Veg' },
  { value: 'jain',         label: 'Jain' },
  { value: 'vegan',        label: 'Vegan' },
  { value: 'local_food',   label: 'Local Food' },
  { value: 'cafe_hopping', label: 'Café Hopping' },
  { value: 'fine_dining',  label: 'Fine Dining' },
  { value: 'street_food',  label: 'Street Food' },
]

const FOOD_BUDGET_STYLES: { value: NonNullable<TripGenerationPreferences['foodBudgetStyle']>; label: string }[] = [
  { value: 'budget',    label: 'Budget / street food' },
  { value: 'mid_range', label: 'Mid-range' },
  { value: 'premium',   label: 'Premium / fine dining' },
]

const PACES: { value: TravelPace; label: string; desc: string }[] = [
  { value: 'relaxed',  label: 'Relaxed',  desc: '2–3 stops/day' },
  { value: 'balanced', label: 'Balanced', desc: '3–4 stops/day' },
  { value: 'packed',   label: 'Packed',   desc: '5–6 stops/day' },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function defaultBrief(): TripBrief {
  return {
    tripName: '',
    destination: '',
    destinationSource: 'custom',
    origin: '',
    startDate: '',
    endDate: '',
    budget: 0,
    currency: 'INR',
    travellerCount: 2,
    tripType: 'friends',
    composition: { total: 2 },
    preferences: {
      pace: 'balanced',
      interests: [],
      foodPreferences: [],
      constraints: [],
      mustVisit: [],
      avoidPlaces: [],
    },
    accommodation: {
      mode: 'later',
      chosen: false,
      costMode: 'unknown',
      mealsIncluded: 'none',
      rooms: 1,
    },
    // Default: budget covers on-ground costs, not long-haul transport (common case).
    budgetIncluded: {
      stay: true, transport_to: false, local_transport: true,
      food: true, activities: true, shopping: true, buffer: true,
    },
    transport: { mode: 'train' },
    transportTravelType: 'one_way',
  }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function tomorrowISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v
  }
  return out as T
}

/**
 * Recursively drop `undefined` values from nested objects/arrays — Firestore
 * rejects `undefined` at any depth (the app does not set ignoreUndefinedProperties).
 * Returns `undefined` when the result is empty so callers can omit the field.
 */
function pruneDeep<T>(value: T): T | undefined {
  if (Array.isArray(value)) {
    const arr = value.map((v) => pruneDeep(v)).filter((v) => v !== undefined)
    return arr as unknown as T
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const pruned = pruneDeep(v)
      if (pruned !== undefined) out[k] = pruned
    }
    return (Object.keys(out).length > 0 ? out : undefined) as T | undefined
  }
  return value
}

function toggle<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]
}

/** Map the unified accommodation draft to the preview's budget PlannedStay shape. */
function accommodationToPlannedStay(acc: AccommodationDraft): PlannedStay | undefined {
  const hasData = acc.name || acc.areaPreference || acc.costAmount || acc.address
  if (acc.mode === 'later' || !hasData) return undefined
  return {
    name: acc.name,
    area: acc.areaPreference,
    checkIn: acc.checkInDate,
    checkOut: acc.checkOutDate,
    totalCost: acc.costMode === 'total' ? acc.costAmount : undefined,
    perNightCost: acc.costMode === 'per_night' ? acc.costAmount : undefined,
    rooms: acc.rooms,
    lat: acc.lat,
    lng: acc.lng,
    placeId: acc.placeId,
  }
}

// ── Parts 5 & 6 — deterministic transport anchor injection ─────────────────

const _ARR_RE = /\b(arrival|arrive|arriving|reach(?:ing)?|land(?:ing)?|deboard)\b/i
const _DEP_RE = /\b(departure|depart(?:ing)?|board(?:ing)?|catch(?: the)?|onward train|onward flight|leave for (?:the )?(?:station|airport))\b/i
const _XFER_RE = /\b(transfer|drive to|cab to|taxi to|pick-?up|drop-?off|en route to|head to.*station|head to.*airport)\b/i

/**
 * Deterministically inject arrival/departure anchors based on the user's
 * transport form. Overrides any AI-generated guess for timing.
 *
 * PART 6 — Day 1: prepend/fix arrival anchor at `trainArrivalTime`.
 * PART 5 — Last day: append/fix departure chain at `returnTrainDepartureTime`.
 */
function injectTransportAnchors(
  result: TripGeneratorResult,
  ctx: TripTransportContext,
  destinationLabel: string,
): TripGeneratorResult {
  if (!result.dayPlans.length) return result
  const days = result.dayPlans.map((d) => ({ ...d, activities: [...d.activities] }))

  // PART 6 — first-day arrival anchor (train mode only; flight times not tracked)
  const arrivalTime = ctx.mode === 'train' ? (ctx.trainArrivalTime ?? undefined) : undefined
  if (arrivalTime) {
    const day = days[0]!
    const stationLabel = ctx.toStation
      ? `${ctx.toStation.name || ctx.toStation.city}${ctx.toStation.code ? ` (${ctx.toStation.code})` : ''}`
      : destinationLabel

    const existingIdx = day.activities.findIndex((a) =>
      _ARR_RE.test(a.title) ||
      (a.category === 'transport' && /station|railway/i.test(a.title) && _ARR_RE.test(a.title))
    )
    if (existingIdx >= 0) {
      day.activities[existingIdx] = { ...day.activities[existingIdx]!, startTime: arrivalTime }
    } else {
      const anchor: GeneratedActivity = {
        title: `Arrive at ${stationLabel}`,
        category: 'transport',
        estimatedCost: 0,
        bookingStatus: 'planned',
        startTime: arrivalTime,
        routeNotes: ctx.trainNumber
          ? `Train ${ctx.trainNumber}${ctx.trainName ? ` — ${ctx.trainName}` : ''}`
          : undefined,
      }
      day.activities.unshift(anchor)
    }
  }

  // PART 5 — last-day departure chain (round-trip train only)
  const returnDepTime =
    ctx.travelType === 'round_trip' && ctx.mode === 'train'
      ? (ctx.returnTrainDepartureTime ?? undefined)
      : undefined

  if (returnDepTime) {
    const day = days[days.length - 1]!
    const stationLabel = ctx.returnFromStation
      ? `${ctx.returnFromStation.name || ctx.returnFromStation.city}${ctx.returnFromStation.code ? ` (${ctx.returnFromStation.code})` : ''}`
      : ctx.toStation
        ? `${ctx.toStation.name || ctx.toStation.city}${ctx.toStation.code ? ` (${ctx.toStation.code})` : ''}`
        : destinationLabel

    // Compute "leave by" = departure − 90 min
    const dParts = returnDepTime.split(':')
    const dH = parseInt(dParts[0] ?? '0')
    const dM = parseInt(dParts[1] ?? '0')
    const depMins = dH * 60 + dM
    const leaveMins = depMins - 90
    const leaveTime = leaveMins > 0
      ? `${Math.floor(leaveMins / 60).toString().padStart(2, '0')}:${(leaveMins % 60).toString().padStart(2, '0')}`
      : null

    // Fix or append the departure anchor
    const existingDepIdx = day.activities.findIndex((a) =>
      _DEP_RE.test(a.title) ||
      (a.category === 'transport' && /station|railway/i.test(a.title) && _DEP_RE.test(a.title))
    )
    if (existingDepIdx >= 0) {
      day.activities[existingDepIdx] = { ...day.activities[existingDepIdx]!, startTime: returnDepTime }
    } else {
      const depAnchor: GeneratedActivity = {
        title: `Depart from ${stationLabel}`,
        category: 'transport',
        estimatedCost: 0,
        bookingStatus: 'planned',
        startTime: returnDepTime,
        routeNotes: ctx.returnTrainNumber
          ? `Train ${ctx.returnTrainNumber}${ctx.returnTrainName ? ` — ${ctx.returnTrainName}` : ''}`
          : undefined,
      }
      day.activities.push(depAnchor)
    }

    // Add "Head to station" transfer if none exists
    if (leaveTime) {
      const existingXferIdx = day.activities.findIndex((a) =>
        _XFER_RE.test(a.title) || /head to.*station|cab to.*station/i.test(a.title)
      )
      if (existingXferIdx < 0) {
        const curDepIdx = day.activities.findIndex((a) =>
          _DEP_RE.test(a.title) || /depart from/i.test(a.title)
        )
        const xferAct: GeneratedActivity = {
          title: `Head to ${stationLabel}`,
          category: 'transport',
          estimatedCost: 150,
          bookingStatus: 'planned',
          startTime: leaveTime,
          timeToSpend: '30–45 min',
          routeNotes: `Leave by ${leaveTime} to reach the station before departure at ${returnDepTime}`,
        }
        if (curDepIdx >= 0) {
          day.activities.splice(curDepIdx, 0, xferAct)
        } else {
          day.activities.push(xferAct)
        }
      }
    }
  }

  return { ...result, dayPlans: days }
}

// ── Small reusable chip ────────────────────────────────────────────────────

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
        active
          ? 'bg-violet-500 text-white border-violet-500'
          : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300'
      }`}
    >
      {label}
    </button>
  )
}

// ── Pace selector (used in review + guided) ────────────────────────────────

function PaceSelector({ value, onChange }: { value: TravelPace; onChange: (v: TravelPace) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {PACES.map((p) => (
        <button
          key={p.value}
          type="button"
          onClick={() => onChange(p.value)}
          className={`p-2.5 rounded-xl border-2 text-center transition-all ${
            value === p.value ? 'border-violet-500 bg-violet-50' : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <p className={`text-xs font-bold ${value === p.value ? 'text-violet-700' : 'text-gray-700'}`}>{p.label}</p>
          <p className="text-[10px] text-gray-400">{p.desc}</p>
        </button>
      ))}
    </div>
  )
}

// ── Accommodation section (single unified stay flow — Phase 16B) ─────────────

function AccommodationSection({
  acc, currency, travellerCount, startDate, endDate, mapsAvailable, onChange,
}: {
  acc: AccommodationDraft
  currency: string
  travellerCount: number
  startDate: string
  endDate: string
  mapsAvailable: boolean
  onChange: (patch: Partial<AccommodationDraft>) => void
}) {
  const fieldCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400'

  function setMode(mode: StayChoice) {
    // chosen mirrors mode === 'chosen'; pre-fill traveller count + check-in/out dates.
    onChange({
      mode,
      chosen: mode === 'chosen',
      travellers: acc.travellers ?? travellerCount,
      checkInDate: acc.checkInDate || (mode === 'chosen' ? startDate : acc.checkInDate),
      checkOutDate: acc.checkOutDate || (mode === 'chosen' ? endDate : acc.checkOutDate),
    })
  }

  // PlacePicker selected-place shape (only when a Google match exists).
  const selectedPlace: SelectedPlace | null = acc.placeId
    ? {
        placeId: acc.placeId,
        placeName: acc.name || '',
        placeAddress: acc.address || '',
        placeRating: acc.rating,
        placeUserRatingsTotal: acc.userRatingsTotal,
        lat: acc.lat ?? 0,
        lng: acc.lng ?? 0,
        placeTypes: acc.types,
      }
    : null

  function handleSelectPlace(p: SelectedPlace) {
    onChange({
      placeId: p.placeId,
      name: p.placeName,
      address: p.placeAddress,
      rating: p.placeRating,
      userRatingsTotal: p.placeUserRatingsTotal,
      types: p.placeTypes,
      lat: p.lat,
      lng: p.lng,
      googleVerified: true,
    })
  }

  function handleClearPlace() {
    // Keep the typed name; drop the Google match so the user can re-search/edit.
    onChange({
      placeId: undefined,
      address: undefined,
      rating: undefined,
      userRatingsTotal: undefined,
      types: undefined,
      lat: undefined,
      lng: undefined,
      googleVerified: false,
    })
  }

  return (
    <div className="rounded-2xl border border-gray-100 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Home size={15} className="text-violet-500" />
        <p className="text-sm font-bold text-gray-800">Where are you staying?</p>
      </div>
      <p className="text-xs text-gray-500">Asked once. A chosen stay becomes the daily route base — start &amp; end each day there.</p>

      {/* Tri-state selector */}
      <div className="space-y-2">
        {([
          { v: 'chosen' as StayChoice, label: 'Yes, I have chosen my stay' },
          { v: 'suggest' as StayChoice, label: 'No — suggest a good stay area' },
          { v: 'later' as StayChoice, label: "I'll decide later" },
        ]).map((o) => (
          <button key={o.v} type="button" onClick={() => setMode(o.v)}
            className={`w-full text-left px-3 py-2.5 rounded-xl border-2 text-sm transition-all ${acc.mode === o.v ? 'border-violet-500 bg-violet-50 text-violet-700 font-semibold' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
            {o.label}
          </button>
        ))}
      </div>

      {/* CHOSEN — full stay details */}
      {acc.mode === 'chosen' && (
        <div className="space-y-3 pt-1">
          {/* Google Places search / selected summary card */}
          <PlacePicker
            available={mapsAvailable}
            locationName={acc.name || ''}
            onLocationNameChange={(v) => onChange({ name: v })}
            selectedPlace={selectedPlace}
            onSelectPlace={handleSelectPlace}
            onClearPlace={handleClearPlace}
          />
          {acc.googleVerified && acc.name && (
            <p className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
              <Check size={12} /> Stay selected: {acc.name}{acc.address ? ` · ${acc.address.split(',')[0]}` : ''} (Google-verified base)
            </p>
          )}
          {!mapsAvailable && (
            <p className="text-[11px] text-amber-600">Google Maps not configured — enter the stay name manually; routes can&apos;t be exact.</p>
          )}

          {/* Stay type */}
          <div>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Stay type</p>
            <div className="flex flex-wrap gap-2">
              {STAY_TYPES.map((t) => (
                <Chip key={t.value} label={t.label} active={acc.type === t.value} onClick={() => onChange({ type: t.value })} />
              ))}
            </div>
          </div>

          {/* Check-in / check-out */}
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] font-medium text-gray-600">Check-in date
              <input type="date" value={acc.checkInDate || ''} onChange={(e) => onChange({ checkInDate: e.target.value })} className={`mt-1 ${fieldCls}`} />
            </label>
            <label className="text-[11px] font-medium text-gray-600">Check-in time
              <input type="time" value={acc.checkInTime || ''} onChange={(e) => onChange({ checkInTime: e.target.value })} className={`mt-1 ${fieldCls}`} />
            </label>
            <label className="text-[11px] font-medium text-gray-600">Check-out date
              <input type="date" value={acc.checkOutDate || ''} onChange={(e) => onChange({ checkOutDate: e.target.value })} className={`mt-1 ${fieldCls}`} />
            </label>
            <label className="text-[11px] font-medium text-gray-600">Check-out time
              <input type="time" value={acc.checkOutTime || ''} onChange={(e) => onChange({ checkOutTime: e.target.value })} className={`mt-1 ${fieldCls}`} />
            </label>
          </div>

          {/* Cost mode + amount, rooms, travellers */}
          <div className="flex gap-2">
            {(['total', 'per_night'] as StayCostMode[]).map((m) => (
              <Chip key={m} label={m === 'total' ? 'Total cost' : 'Per night'} active={acc.costMode === m} onClick={() => onChange({ costMode: m })} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Input label={`Cost (${currency})`} type="number" min="0" placeholder="0" value={acc.costAmount ? String(acc.costAmount) : ''} onChange={(e) => onChange({ costAmount: parseFloat(e.target.value) || undefined })} />
            <Input label="Rooms" type="number" min="1" placeholder="1" value={acc.rooms ? String(acc.rooms) : ''} onChange={(e) => onChange({ rooms: parseInt(e.target.value) || undefined })} />
            <Input label="Travellers" type="number" min="1" placeholder={String(travellerCount)} value={acc.travellers ? String(acc.travellers) : ''} onChange={(e) => onChange({ travellers: parseInt(e.target.value) || undefined })} />
          </div>

          {/* Meals included */}
          <div>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Meals included</p>
            <div className="flex flex-wrap gap-2">
              {MEAL_PLANS.map((m) => (
                <Chip key={m.value} label={m.label} active={acc.mealsIncluded === m.value} onClick={() => onChange({ mealsIncluded: m.value })} />
              ))}
            </div>
            {acc.mealsIncluded === 'custom' && (
              <Input label="" placeholder="Describe the meal plan" value={acc.mealsCustomNote || ''} onChange={(e) => onChange({ mealsCustomNote: e.target.value })} />
            )}
          </div>

          <Input label="Notes (optional)" placeholder="Any stay notes" value={acc.notes || ''} onChange={(e) => onChange({ notes: e.target.value })} />
        </div>
      )}

      {/* SUGGEST — area preference, no confirmed hotel */}
      {acc.mode === 'suggest' && (
        <div className="space-y-3 pt-1">
          <p className="text-xs text-violet-600">AI will suggest a stay area — it won&apos;t claim any specific hotel is booked or priced.</p>
          <div>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Preferred area</p>
            <div className="flex flex-wrap gap-2">
              {AREA_PRESETS.map((a) => (
                <Chip key={a} label={a} active={acc.areaPreference === a} onClick={() => onChange({ areaPreference: a })} />
              ))}
            </div>
            <Input label="" placeholder="Or type a custom area" value={AREA_PRESETS.includes(acc.areaPreference || '') ? '' : (acc.areaPreference || '')} onChange={(e) => onChange({ areaPreference: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Input label={`Budget/night (${currency})`} type="number" min="0" placeholder="0" value={acc.costAmount ? String(acc.costAmount) : ''} onChange={(e) => onChange({ costAmount: parseFloat(e.target.value) || undefined, costMode: 'per_night' })} />
            <Input label="Rooms" type="number" min="1" placeholder="1" value={acc.rooms ? String(acc.rooms) : ''} onChange={(e) => onChange({ rooms: parseInt(e.target.value) || undefined })} />
            <Input label="Travellers" type="number" min="1" placeholder={String(travellerCount)} value={acc.travellers ? String(acc.travellers) : ''} onChange={(e) => onChange({ travellers: parseInt(e.target.value) || undefined })} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Meal preference</p>
            <div className="flex flex-wrap gap-2">
              {MEAL_PLANS.map((m) => (
                <Chip key={m.value} label={m.label} active={acc.mealsIncluded === m.value} onClick={() => onChange({ mealsIncluded: m.value })} />
              ))}
            </div>
          </div>
          <Input label="Notes (optional)" placeholder="Any stay notes" value={acc.notes || ''} onChange={(e) => onChange({ notes: e.target.value })} />
        </div>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function NewTripAiGeneratorPage() {
  const router = useRouter()
  const { user, loading } = useApp()
  const { status: mapsStatus } = useMapsStatus()

  const [stage, setStage] = useState<Stage>('mode-select')
  const [inputMode, setInputMode] = useState<InputMode>('full-prompt')
  const [brief, setBrief] = useState<TripBrief>(defaultBrief)
  const [guidedStep, setGuidedStep] = useState(0)

  const [promptText, setPromptText] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)

  const [genError, setGenError] = useState<string | null>(null)
  const [result, setResult] = useState<TripGeneratorResult | null>(null)
  const [isMock, setIsMock] = useState(false)
  const [enrichingFood, setEnrichingFood] = useState(false)

  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [briefErrors, setBriefErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!loading && !user) router.push('/dashboard')
  }, [user, loading, router])

  const today = todayISO()

  // ── Patch helpers ──────────────────────────────────────────────────────

  function setPrefs(patch: Partial<TripGenerationPreferences>) {
    setBrief((p) => ({ ...p, preferences: { ...p.preferences, ...patch } }))
  }

  function setCount(n: number) {
    const count = Math.max(1, Math.min(30, n))
    setBrief((p) => ({ ...p, travellerCount: count, composition: { ...p.composition, total: count } }))
  }

  function toggleBudgetCat(key: BudgetCategoryKey) {
    setBrief((p) => ({ ...p, budgetIncluded: { ...p.budgetIncluded, [key]: !p.budgetIncluded[key] } }))
  }
  function setTransport(patch: Partial<PlannedTransport>) {
    setBrief((p) => ({ ...p, transport: { ...p.transport, ...patch } }))
  }
  function setAcc(patch: Partial<AccommodationDraft>) {
    setBrief((p) => ({ ...p, accommodation: { ...p.accommodation, ...patch } }))
  }

  // ── Phase 16C — structured destination / station / airport selection ─────
  function selectCity(c: IndiaCity) {
    setBrief((p) => ({
      ...p,
      destination: `${c.city}, ${c.state}`,
      destinationStructured: { city: c.city, state: c.state, country: 'India', lat: c.lat, lng: c.lng, aliases: c.aliases },
      destinationSource: 'dataset',
    }))
    setBriefErrors((e) => ({ ...e, destination: '' }))
  }
  function setCustomDestination(text: string) {
    const t = text.trim()
    setBrief((p) => ({
      ...p,
      destination: t,
      destinationStructured: t ? { city: t, state: '', country: 'India' } : undefined,
      destinationSource: 'custom',
    }))
    setBriefErrors((e) => ({ ...e, destination: '' }))
  }
  function clearDestination() {
    setBrief((p) => ({ ...p, destination: '', destinationStructured: undefined, destinationSource: 'custom' }))
  }
  function selectStation(s: IndiaRailwayStation) {
    setBrief((p) => ({ ...p, railwayStation: { ...s, source: 'dataset' } }))
  }
  function selectAirport(a: IndiaAirport) {
    setBrief((p) => ({ ...p, airport: { ...a, source: 'dataset' } }))
  }

  // ── Transport structured selectors ─────────────────────────────────────

  function revalidateTrainRoute(
    p: TripBrief,
    fromStation?: RailwayStationRef,
    toStation?: RailwayStationRef,
    trainNumber?: string,
  ): string | undefined {
    const fs = fromStation ?? p.fromStation
    const ts = toStation ?? p.toStation
    const tn = trainNumber ?? p.trainNumber
    if (!fs || !ts || !tn) return undefined
    return validateTrainRoute(tn, fs.code, fs.city, ts.code, ts.city) ?? undefined
  }

  function setFromStation(s: IndiaRailwayStation | null) {
    setBrief((p) => {
      const fs: RailwayStationRef | undefined = s ? { ...s, source: 'dataset' } : undefined
      const warning = revalidateTrainRoute(p, fs, p.toStation, p.trainNumber)
      return {
        ...p,
        fromStation: fs,
        transport: { ...p.transport, origin: s ? s.city : p.transport.origin },
        trainRouteWarning: warning,
      }
    })
  }
  function setFromStationCustom(name: string) {
    setBrief((p) => ({
      ...p,
      fromStation: { name, code: '', city: name, state: '', source: 'custom' },
      transport: { ...p.transport, origin: name },
      trainRouteWarning: undefined,
    }))
  }
  function clearFromStation() {
    setBrief((p) => ({ ...p, fromStation: undefined, trainRouteWarning: undefined }))
  }

  function setToStation(s: IndiaRailwayStation | null) {
    setBrief((p) => {
      const ts: RailwayStationRef | undefined = s ? { ...s, source: 'dataset' } : undefined
      const warning = revalidateTrainRoute(p, p.fromStation, ts, p.trainNumber)
      return {
        ...p,
        toStation: ts,
        // Also update nearestRailwayStation for AI geographic context.
        railwayStation: ts ?? p.railwayStation,
        transport: { ...p.transport, destination: s ? s.city : p.transport.destination },
        trainRouteWarning: warning,
      }
    })
  }
  function setToStationCustom(name: string) {
    setBrief((p) => ({
      ...p,
      toStation: { name, code: '', city: name, state: '', source: 'custom' },
      transport: { ...p.transport, destination: name },
      trainRouteWarning: undefined,
    }))
  }
  function clearToStation() {
    setBrief((p) => ({ ...p, toStation: undefined, trainRouteWarning: undefined }))
  }

  function selectTrain(t: IndiaTrainData) {
    setBrief((p) => {
      const warning = revalidateTrainRoute(p, p.fromStation, p.toStation, t.trainNumber)
      return { ...p, trainNumber: t.trainNumber, trainName: t.trainName, trainRouteWarning: warning }
    })
  }
  function setTrainNumberCustom(text: string) {
    const num = text.trim()
    setBrief((p) => {
      const warning = revalidateTrainRoute(p, p.fromStation, p.toStation, num)
      return { ...p, trainNumber: num, trainName: undefined, trainRouteWarning: warning }
    })
  }
  function clearTrain() {
    setBrief((p) => ({ ...p, trainNumber: undefined, trainName: undefined, trainRouteWarning: undefined }))
  }

  function setFromAirport(a: IndiaAirport | null) {
    setBrief((p) => ({
      ...p,
      fromAirport: a ? { ...a, source: 'dataset' } : undefined,
      transport: { ...p.transport, origin: a ? a.city : p.transport.origin },
    }))
  }
  function setToAirport(a: IndiaAirport | null) {
    setBrief((p) => ({
      ...p,
      toAirport: a ? { ...a, source: 'dataset' } : undefined,
      airport: a ? { ...a, source: 'dataset' } : p.airport,
      transport: { ...p.transport, destination: a ? a.city : p.transport.destination },
    }))
  }

  function applyReverseReturn() {
    setBrief((p) => {
      if (p.transport.mode === 'train') {
        // Auto-suggest the paired reverse train from the seed if available
        const reverseTrain = p.trainNumber ? getSuggestedReturnTrain(p.trainNumber) : null
        return {
          ...p,
          returnFromStation: p.toStation,
          returnToStation: p.fromStation,
          returnTrainNumber: reverseTrain?.trainNumber || undefined,
          returnTrainName: reverseTrain?.trainName || undefined,
        }
      }
      if (p.transport.mode === 'flight') {
        return {
          ...p,
          returnFromAirport: p.toAirport,
          returnToAirport: p.fromAirport,
        }
      }
      return {
        ...p,
        returnFromCity: p.transport.destination,
        returnToCity: p.transport.origin,
      }
    })
  }

  // ── Parse NL prompt → brief ────────────────────────────────────────────

  async function handleParsePrompt() {
    if (!promptText.trim()) return
    setStage('parsing')
    setParseError(null)
    try {
      const res = await fetch('/api/ai/parse-trip-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText.trim(), today }),
      })
      const data = await res.json() as { brief?: Record<string, unknown> }
      const p = data.brief ?? {}
      setBrief((prev) => {
        const next = { ...prev, preferences: { ...prev.preferences } }
        if (typeof p.tripName === 'string' && p.tripName) next.tripName = p.tripName
        if (typeof p.destination === 'string' && p.destination) next.destination = p.destination
        if (typeof p.origin === 'string') next.origin = p.origin as string
        if (typeof p.startDate === 'string') next.startDate = p.startDate as string
        if (typeof p.endDate === 'string') next.endDate = p.endDate as string
        if (typeof p.budget === 'number' && (p.budget as number) > 0) next.budget = p.budget as number
        if (typeof p.currency === 'string') next.currency = p.currency as string
        if (typeof p.travellerCount === 'number' && (p.travellerCount as number) > 0) {
          const n = p.travellerCount as number
          next.travellerCount = n
          next.composition = { ...next.composition, total: n }
        }
        if (typeof p.tripType === 'string') next.tripType = p.tripType as TripType
        if (p.composition && typeof p.composition === 'object') {
          const c = p.composition as Record<string, unknown>
          next.composition = {
            total: next.travellerCount,
            ...(typeof c.couples === 'number' && c.couples > 0 ? { couples: c.couples as number } : {}),
            ...(typeof c.adults === 'number' && c.adults > 0 ? { adults: c.adults as number } : {}),
            ...(typeof c.kids === 'number' && c.kids > 0 ? { kids: c.kids as number } : {}),
            ...(typeof c.seniors === 'number' && c.seniors > 0 ? { seniors: c.seniors as number } : {}),
            ...(typeof c.notes === 'string' && c.notes ? { notes: c.notes as string } : {}),
          }
        }
        if (typeof p.pace === 'string') next.preferences.pace = p.pace as TravelPace
        if (Array.isArray(p.interests) && (p.interests as unknown[]).length) next.preferences.interests = p.interests as TripInterest[]
        if (Array.isArray(p.foodPreferences) && (p.foodPreferences as unknown[]).length) next.preferences.foodPreferences = p.foodPreferences as FoodPreference[]
        if (Array.isArray(p.mustVisit)) next.preferences.mustVisit = (p.mustVisit as unknown[]).filter((v): v is string => typeof v === 'string')
        if (Array.isArray(p.avoidPlaces)) next.preferences.avoidPlaces = (p.avoidPlaces as unknown[]).filter((v): v is string => typeof v === 'string')
        if (Array.isArray(p.constraints)) next.preferences.constraints = (p.constraints as unknown[]).filter((v): v is string => typeof v === 'string')
        if (typeof p.extraNotes === 'string') next.preferences.extraNotes = p.extraNotes as string
        return next
      })
    } catch {
      setParseError('Could not parse your prompt. Please fill in the fields below.')
    } finally {
      setStage('review-brief')
    }
  }

  // ── Generate ────────────────────────────────────────────────────────────

  async function handleGenerate() {
    const errors: Record<string, string> = {}
    if (!brief.destination.trim()) errors.destination = 'Destination is required'
    if (!brief.startDate) errors.startDate = 'Start date is required'
    if (!brief.endDate) errors.endDate = 'End date is required'
    if (brief.startDate && brief.endDate && brief.endDate < brief.startDate) errors.endDate = 'End date must be after start date'
    if (brief.travellerCount < 1) errors.travellerCount = 'At least 1 traveller required'
    if (Object.keys(errors).length > 0) {
      setBriefErrors(errors)
      setStage('review-brief')
      return
    }
    setBriefErrors({})

    const dayCount = getDayCount(brief.startDate, brief.endDate)

    // Feed structured stay context to the AI (Phase 16B). A chosen + Google-verified
    // stay anchors every day's start/end; "suggest" lets the model recommend an
    // area; "later" leaves the base open. The prompt builder enforces the rules.
    const acc = brief.accommodation
    const stayBase = acc.mode === 'chosen' && acc.name?.trim() ? acc.name.trim() : undefined
    const accommodation: TripGeneratorAccommodation =
      acc.mode === 'chosen'
        ? {
            chosen: true,
            name: acc.name?.trim() || undefined,
            type: acc.type,
            address: acc.address,
            lat: acc.lat,
            lng: acc.lng,
            googleVerified: acc.googleVerified,
          }
        : acc.mode === 'suggest'
          ? { chosen: false, areaPreference: acc.areaPreference?.trim() || undefined }
          : { chosen: false }

    // Phase 16C — structured destination + nearest station/airport (context only).
    const ds = brief.destinationStructured
    const destinationStructured = ds?.city
      ? { city: ds.city, state: ds.state, country: 'India' as const, lat: ds.lat, lng: ds.lng }
      : undefined
    const nearestRailwayStation = brief.railwayStation
      ? { name: brief.railwayStation.name, code: brief.railwayStation.code, city: brief.railwayStation.city, state: brief.railwayStation.state }
      : undefined
    const nearestAirport = brief.airport
      ? { name: brief.airport.name, iataCode: brief.airport.iataCode, city: brief.airport.city, state: brief.airport.state }
      : undefined

    // Build structured transport context for AI (PART 6).
    const t = brief.transport
    let transportContext: TripTransportContext | undefined
    if (t.mode && t.mode !== 'other') {
      const hasAny =
        brief.fromStation || brief.toStation ||
        brief.fromAirport || brief.toAirport ||
        t.origin || t.destination
      if (hasAny) {
        transportContext = {
          mode: t.mode,
          travelType: brief.transportTravelType,
          fromStation: brief.fromStation
            ? { name: brief.fromStation.name, code: brief.fromStation.code, city: brief.fromStation.city, state: brief.fromStation.state }
            : undefined,
          toStation: brief.toStation
            ? { name: brief.toStation.name, code: brief.toStation.code, city: brief.toStation.city, state: brief.toStation.state }
            : undefined,
          fromAirport: brief.fromAirport
            ? { name: brief.fromAirport.name, iataCode: brief.fromAirport.iataCode, city: brief.fromAirport.city, state: brief.fromAirport.state }
            : undefined,
          toAirport: brief.toAirport
            ? { name: brief.toAirport.name, iataCode: brief.toAirport.iataCode, city: brief.toAirport.city, state: brief.toAirport.state }
            : undefined,
          fromCity: t.mode === 'bus' || t.mode === 'car' ? (t.origin || undefined) : undefined,
          toCity: t.mode === 'bus' || t.mode === 'car' ? (t.destination || undefined) : undefined,
          trainNumber: brief.trainNumber || undefined,
          trainName: brief.trainName || undefined,
          trainRouteWarning: brief.trainRouteWarning || undefined,
          // Look up timing from local seed — advisory only, never claimed as confirmed
          ...(brief.trainNumber ? (() => {
            const td = fetchTrainDetails(brief.trainNumber)
            return td ? {
              trainDepartureTime: td.departureTime || undefined,
              trainArrivalTime: td.arrivalTime || undefined,
              trainDaysOfRun: td.daysOfRun || undefined,
            } : {}
          })() : {}),
          ...(brief.transportTravelType === 'round_trip' ? {
            returnFromStation: brief.returnFromStation
              ? { name: brief.returnFromStation.name, code: brief.returnFromStation.code, city: brief.returnFromStation.city, state: brief.returnFromStation.state }
              : undefined,
            returnToStation: brief.returnToStation
              ? { name: brief.returnToStation.name, code: brief.returnToStation.code, city: brief.returnToStation.city, state: brief.returnToStation.state }
              : undefined,
            returnFromAirport: brief.returnFromAirport
              ? { name: brief.returnFromAirport.name, iataCode: brief.returnFromAirport.iataCode, city: brief.returnFromAirport.city, state: brief.returnFromAirport.state }
              : undefined,
            returnToAirport: brief.returnToAirport
              ? { name: brief.returnToAirport.name, iataCode: brief.returnToAirport.iataCode, city: brief.returnToAirport.city, state: brief.returnToAirport.state }
              : undefined,
            returnFromCity: brief.returnFromCity || undefined,
            returnToCity: brief.returnToCity || undefined,
            returnTrainNumber: brief.returnTrainNumber || undefined,
            returnTrainName: brief.returnTrainName || undefined,
            // Return train timing from seed
            ...(brief.returnTrainNumber ? (() => {
              const rtd = fetchTrainDetails(brief.returnTrainNumber)
              return rtd ? {
                returnTrainDepartureTime: rtd.departureTime || undefined,
                returnTrainArrivalTime: rtd.arrivalTime || undefined,
                returnTrainDaysOfRun: rtd.daysOfRun || undefined,
              } : {}
            })() : {}),
          } : {}),
        }
      }
    }

    const input: TripGeneratorInput = {
      destination: brief.destination.trim(),
      startDate: brief.startDate,
      endDate: brief.endDate,
      dayCount,
      budget: brief.budget,
      currency: brief.currency,
      travellerCount: brief.travellerCount,
      composition: { ...brief.composition, total: brief.travellerCount },
      tripType: brief.tripType,
      preferences: { ...brief.preferences, extraNotes: brief.preferences.extraNotes },
      mode: 'fill_empty',
      today,
      existingDays: [],
      stayBase,
      accommodation,
      destinationStructured,
      destinationSource: brief.destinationSource,
      nearestRailwayStation,
      nearestAirport,
      transportContext,
    }

    setGenError(null)
    setResult(null)
    setStage('generating')
    try {
      const res = await fetch('/api/ai/trip-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      })
      if (!res.ok) {
        // Read the server's structured error for a useful message.
        const errBody = await res.json().catch(() => ({})) as { error?: string; message?: string }
        const serverMsg = errBody.message ?? errBody.error ?? null
        if (res.status === 429) {
          setGenError('You are generating too quickly. Please wait a moment and try again.')
        } else if (serverMsg) {
          setGenError(serverMsg)
        } else {
          setGenError('Could not generate an itinerary right now. Please try again.')
        }
        setStage('review-brief')
        return
      }
      const data = await res.json() as { result: TripGeneratorResult; isMock: boolean }
      let enrichedResult = data.result

      // Phase 16D — enrich food breaks with Google Places suggestions.
      // Only runs when Maps is available and it's not a mock result.
      if (mapsStatus.available && !data.isMock) {
        setEnrichingFood(true)
        try {
          const foodActivities: Array<{ dayIdx: number; actIdx: number; title: string; mealType?: string; suggestedPlaceSearchQuery?: string; isBreak?: boolean }> = []
          for (let di = 0; di < data.result.dayPlans.length; di++) {
            const day = data.result.dayPlans[di]!
            for (let ai = 0; ai < day.activities.length; ai++) {
              const a = day.activities[ai]!
              if (a.category === 'food') {
                foodActivities.push({ dayIdx: di, actIdx: ai, title: a.title, mealType: a.mealType, suggestedPlaceSearchQuery: a.suggestedPlaceSearchQuery ?? undefined, isBreak: a.isBreak })
              }
            }
          }
          if (foodActivities.length > 0) {
            const efRes = await fetch('/api/ai/enrich-food', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                destination: brief.destination.trim(),
                travellerCount: brief.travellerCount,
                currency: brief.currency,
                foodPreferences: brief.preferences.foodPreferences,
                foodBudgetStyle: brief.preferences.foodBudgetStyle,
                foodActivities,
              }),
            })
            if (efRes.ok) {
              const efData = await efRes.json() as { available: boolean; patches: FoodEnrichmentPatch[] }
              if (efData.available && efData.patches.length > 0) {
                enrichedResult = applyFoodEnrichmentPatches(data.result, efData.patches)
              }
            }
          }
        } catch {
          // Food enrichment is best-effort; don't block the preview on failure.
        } finally {
          setEnrichingFood(false)
        }
      }

      // Parts 5 & 6 — deterministically fix arrival/departure times from form.
      const finalResult = transportContext
        ? injectTransportAnchors(enrichedResult, transportContext, brief.destination)
        : enrichedResult
      setResult(finalResult)
      setIsMock(data.isMock)
      setStage('preview')
    } catch {
      setGenError('Could not reach the server. Check your connection and try again.')
      setStage('review-brief')
    }
  }

  /** Apply food enrichment patches from the server onto a TripGeneratorResult. */
  function applyFoodEnrichmentPatches(result: TripGeneratorResult, patches: FoodEnrichmentPatch[]): TripGeneratorResult {
    const dayPlans = result.dayPlans.map((day, di) => ({
      ...day,
      activities: day.activities.map((act, ai) => {
        const patch = patches.find((p) => p.dayIdx === di && p.actIdx === ai)
        if (!patch) return act
        const enriched: GeneratedActivity = {
          ...act,
          restaurantSuggestion: patch.restaurantSuggestion,
          estimatedSpendRange: patch.estimatedSpendRange,
          spendConfidence: patch.spendConfidence,
          spendBasis: patch.spendBasis,
          reasonTags: patch.reasonTags,
          suggestedItems: patch.suggestedItems,
          menuSourceUrl: patch.menuSourceUrl,
          menuSourceType: patch.menuSourceType,
          // Append dietary note to foodInsightNotes when present
          foodInsightNotes: patch.dietaryNote
            ? [act.foodInsightNotes, patch.dietaryNote].filter(Boolean).join(' ')
            : act.foodInsightNotes,
          // Keep the AI cost estimate unless we have a better range-based figure.
          estimatedCost: patch.estimatedSpendRange.min > 0 ? Math.round((patch.estimatedSpendRange.min + patch.estimatedSpendRange.max) / 2) : act.estimatedCost,
          estimatedCostPerPerson: patch.estimatedSpendRange.perPersonMin > 0
            ? Math.round((patch.estimatedSpendRange.perPersonMin + patch.estimatedSpendRange.perPersonMax) / 2)
            : act.estimatedCostPerPerson,
        }
        return enriched
      }),
    }))
    return { ...result, dayPlans }
  }

  // ── Create Trip ────────────────────────────────────────────────────────

  async function handleCreateTrip(editDays: EditableGeneratedDay[]) {
    if (!user) return
    setCreating(true)
    setCreateError(null)
    setStage('creating')
    try {
      const tripName = brief.tripName.trim() || `${brief.destination.trim()} Trip`
      const tripId = await createTrip(user.uid, {
        name: tripName,
        destination: brief.destination.trim(),
        type: brief.tripType,
        startDate: brief.startDate,
        endDate: brief.endDate,
        budget: brief.budget,
        currency: brief.currency,
        notes: brief.preferences.extraNotes?.trim() || '',
      })

      const days = await getItineraryDays(tripId)
      const dayByDate = new Map(days.map((d) => [d.date, d]))
      const firstDay = days[0]
      let verified = 0, unverified = 0

      for (const ed of editDays) {
        const day = dayByDate.get(ed.date)
        if (!day) continue
        const activities: Activity[] = ed.activities
          .filter((a) => !a._removed)
          .map((a) => {
            const cost = a.estimatedCost || 0
            const noteParts: string[] = []
            if (a.description) noteParts.push(a.description)
            if (a.whyRecommended) noteParts.push(`Why: ${a.whyRecommended}`)
            if (a.routeNotes) noteParts.push(a.routeNotes)
            noteParts.push('(AI Trip Generator)')
            if (a._placeId) verified++; else unverified++
            // Phase 16D — persist restaurant suggestion as foodInsight so it
            // shows up in the food intelligence panel without extra Firestore fields.
            const foodInsightFromSuggestion = a.restaurantSuggestion && a.category === 'food'
              ? {
                  placeId: a.restaurantSuggestion.placeId,
                  placeName: a.restaurantSuggestion.name,
                  placeAddress: a.restaurantSuggestion.address,
                  rating: a.restaurantSuggestion.rating,
                  priceLevel: a.restaurantSuggestion.priceLevel,
                  estimatedCostPerPersonMin: a.estimatedSpendRange?.perPersonMin,
                  estimatedCostPerPersonMax: a.estimatedSpendRange?.perPersonMax,
                  confidence: (a.spendConfidence ?? 'low') as 'low' | 'medium' | 'high',
                  source: 'google_places' as const,
                  updatedAt: new Date().toISOString(),
                }
              : undefined
            return stripUndefined({
              id: `ai-${day.id}-${Math.random().toString(36).slice(2, 9)}`,
              type: categoryToActivityType(a.category),
              category: a.category,
              title: a.title,
              notes: noteParts.join(' · '),
              time: a.startTime ?? '',
              startTime: a._plannedStart || a.startTime || undefined,
              endTime: a._plannedEnd || a.endTime || undefined,
              // Phase 16E — persist timing/route fields
              estimatedDurationMinutes: a._durationMins || undefined,
              travelToNextMinutes: a._travelToNextMins || undefined,
              travelToNextDistanceMeters: a._travelToNextMeters || undefined,
              travelToNextDistanceText: a._travelToNextDistKm || undefined,
              travelToNextDurationText: a._travelToNextDistText || undefined,
              routeMode: a._travelRouteSource ? 'driving' : undefined,
              routeSource: a._travelRouteSource || undefined,
              routeConfidence: a._travelRouteSource === 'google_routes' ? 'high' : a._travelRouteSource === 'estimate' ? 'low' : undefined,
              cost,
              estimatedCost: cost,
              locationName: a.locationName || undefined,
              confirmed: false,
              bookingStatus: 'planned' as const,
              // Persist Google place metadata when the place was verified.
              placeId: a._placeId || undefined,
              placeName: a._placeId ? (a.locationName || a.title) : undefined,
              placeAddress: a._placeAddress || undefined,
              placeRating: a._placeRating,
              placeUserRatingsTotal: a._placeUserRatings,
              priceLevel: a._priceLevel,
              lat: a._lat,
              lng: a._lng,
              suggestedCategorySource: a._autoCategory ? ('google_place_type' as const) : undefined,
              foodInsight: foodInsightFromSuggestion,
              // Phase 16F — persist location context (elevation/weather/AQI/time zone).
              activityContext: a._activityContext ? pruneDeep(a._activityContext) : undefined,
              updatedAt: new Date().toISOString(),
            }) as Activity
          })

        // On the first day, prepend planned transport + stay as planned estimates
        // (never actual expenses — these are editable planned activities).
        if (firstDay && day.id === firstDay.id) {
          const extras: Activity[] = []
          const t = brief.transport
          if (t.totalCost || t.origin || t.destination) {
            const tParts = [`${t.mode}`, t.origin && t.destination ? `${t.origin} → ${t.destination}` : '', t.bookingRef ? `Ref: ${t.bookingRef}` : '', '(AI Trip Generator · planned transport)'].filter(Boolean)
            extras.push(stripUndefined({
              id: `ai-transport-${Math.random().toString(36).slice(2, 9)}`,
              type: 'transport',
              category: 'transport',
              title: `Travel to ${brief.destination.trim()} (${t.mode})`,
              notes: tParts.join(' · '),
              time: '',
              startTime: t.departure || undefined,
              endTime: t.arrival || undefined,
              cost: t.totalCost || 0,
              estimatedCost: t.totalCost || 0,
              confirmed: false,
              bookingStatus: 'planned' as const,
              updatedAt: new Date().toISOString(),
            }) as Activity)
          }
          // Phase 16B — persist the chosen stay as a fully-geocoded day-1 hotel
          // activity. The placeId/lat/lng make it reusable as the trip's daily
          // route base (Phase 16E/16H) without any extra schema.
          const acc = brief.accommodation
          if (acc.mode === 'chosen' && (acc.name || acc.placeId)) {
            const stayCost = acc.costMode === 'total' ? (acc.costAmount || 0) : 0
            const noteBits = [
              acc.type ? acc.type.replace('_', ' ') : '',
              acc.rooms ? `${acc.rooms} room(s)` : '',
              acc.checkInDate ? `In: ${acc.checkInDate}${acc.checkInTime ? ` ${acc.checkInTime}` : ''}` : '',
              acc.checkOutDate ? `Out: ${acc.checkOutDate}${acc.checkOutTime ? ` ${acc.checkOutTime}` : ''}` : '',
              acc.costMode === 'per_night' && acc.costAmount ? `${brief.currency} ${acc.costAmount}/night` : '',
              acc.mealsIncluded && acc.mealsIncluded !== 'none' ? `Meals: ${acc.mealsIncluded.replace('_', ' + ')}${acc.mealsIncluded === 'custom' && acc.mealsCustomNote ? ` (${acc.mealsCustomNote})` : ''}` : '',
              acc.notes || '',
              acc.googleVerified ? '(AI Trip Generator · base · Google-verified)' : '(AI Trip Generator · base)',
            ].filter(Boolean)
            extras.push(stripUndefined({
              id: `ai-stay-${Math.random().toString(36).slice(2, 9)}`,
              type: 'hotel',
              category: 'hotel',
              title: acc.name ? `Stay: ${acc.name}` : `Stay in ${brief.destination.trim()}`,
              notes: noteBits.join(' · '),
              time: acc.checkInTime || '',
              cost: stayCost,
              estimatedCost: stayCost,
              locationName: acc.name || acc.address || undefined,
              confirmed: false,
              bookingStatus: 'planned' as const,
              // Google place metadata — the trip base for future route work.
              placeId: acc.placeId || undefined,
              placeName: acc.placeId ? (acc.name || undefined) : undefined,
              placeAddress: acc.address || undefined,
              placeRating: acc.rating,
              placeUserRatingsTotal: acc.userRatingsTotal,
              lat: acc.lat,
              lng: acc.lng,
              updatedAt: new Date().toISOString(),
            }) as Activity)
          }
          if (extras.length > 0) activities.unshift(...extras)
        }

        if (activities.length > 0) {
          // Phase 16F — persist day-level "what to carry" suggestions alongside activities.
          const essentialSuggestions = ed._essentials?.length
            ? (pruneDeep(ed._essentials) as typeof ed._essentials)
            : undefined
          await updateItineraryDay(tripId, day.id, stripUndefined({ activities, essentialSuggestions }))
        }
      }

      try {
        sessionStorage.setItem(`voyago:gen-summary:${tripId}`, JSON.stringify({ verified, unverified }))
      } catch { /* non-critical */ }
      router.push(`/trips/${tripId}/itinerary`)
    } catch (err) {
      console.error('[Phase 15D] createTrip error:', err)
      setCreateError('Could not create the trip. Please try again.')
      setCreating(false)
      setStage('preview')
    }
  }

  // ── Guided navigation ──────────────────────────────────────────────────

  function guidedNext() {
    if (guidedStep < GUIDED_STEPS - 1) setGuidedStep((s) => s + 1)
    else setStage('review-brief')
  }

  function guidedBack() {
    if (guidedStep > 0) setGuidedStep((s) => s - 1)
    else setStage('mode-select')
  }

  function backToInput() {
    if (inputMode === 'full-prompt') setStage('full-prompt')
    else if (inputMode === 'guided') setStage('guided')
    else setStage('smart-form')
  }

  // ── Shared textarea style ──────────────────────────────────────────────

  const taClass = 'w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none'

  if (loading) {
    return (
      <AppShell title="Create Trip with AI" back="/trips/new" hideNav>
        <div className="space-y-4">
          <div className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
          <div className="h-64 bg-gray-100 rounded-2xl animate-pulse" />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title="Create Trip with AI" back="/trips/new" hideNav>
      <div className="space-y-5 pb-6">

        {/* ── Mode Select ─────────────────────────────────────────────── */}
        {stage === 'mode-select' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-black text-gray-900 mb-1">Plan with AI</h2>
              <p className="text-sm text-gray-500">Choose how you want to describe your trip.</p>
            </div>
            <div className="space-y-3">
              {([
                {
                  mode: 'full-prompt' as InputMode,
                  icon: <MessageSquare size={20} className="text-violet-500" />,
                  title: 'Write a full prompt',
                  desc: 'Describe your trip in your own words — AI extracts the details.',
                  hint: '"5 days in Goa with 3 friends, beach + nightlife, ₹25k budget"',
                },
                {
                  mode: 'guided' as InputMode,
                  icon: <HelpCircle size={20} className="text-violet-500" />,
                  title: 'Answer guided questions',
                  desc: 'One question at a time — quick and conversational.',
                  hint: 'Best when you\'re not sure where to start.',
                },
                {
                  mode: 'smart-form' as InputMode,
                  icon: <LayoutGrid size={20} className="text-violet-500" />,
                  title: 'Fill a smart form',
                  desc: 'All fields in one place — great if you have the details ready.',
                  hint: 'Fastest when you know exactly what you want.',
                },
              ] as { mode: InputMode; icon: React.ReactNode; title: string; desc: string; hint: string }[]).map(({ mode, icon, title, desc, hint }) => (
                <button
                  key={mode}
                  onClick={() => {
                    setInputMode(mode)
                    if (mode === 'guided') { setGuidedStep(0); setStage('guided') }
                    else setStage(mode)
                  }}
                  className="w-full text-left rounded-2xl border-2 border-gray-100 hover:border-violet-200 bg-white p-4 flex items-start gap-3 transition-all hover:shadow-sm"
                >
                  <div className="w-9 h-9 bg-violet-50 rounded-xl flex items-center justify-center flex-shrink-0">{icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm">{title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                    <p className="text-[11px] text-gray-400 mt-1 italic">{hint}</p>
                  </div>
                  <ChevronRight size={16} className="text-gray-400 mt-1 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Full Prompt Input ────────────────────────────────────────── */}
        {stage === 'full-prompt' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-black text-gray-900 mb-1">Describe your trip</h2>
              <p className="text-sm text-gray-500">Write as much or as little as you like. AI will extract the details.</p>
            </div>
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              rows={7}
              placeholder={"e.g. \"Plan a 5-day family trip to Jaipur from Delhi in January 2027, 4 adults + 2 kids, total budget ₹50,000, vegetarian food, interested in forts and local culture, avoid very hot outdoor activities\""}
              className={`${taClass} rows-7`}
              autoFocus
            />
            <p className="text-xs text-gray-400">
              Include: destination, dates or duration, number of people, budget, food preferences, interests, must-visit places.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStage('mode-select')} className="flex-1">← Back</Button>
              <Button
                onClick={handleParsePrompt}
                disabled={promptText.trim().length < 5}
                className="flex-1"
              >
                <Sparkles size={15} /> Parse with AI
              </Button>
            </div>
            <button
              onClick={() => { setStage('review-brief') }}
              className="w-full text-xs text-gray-400 hover:text-gray-600 text-center transition-colors"
            >
              Skip parsing — fill in fields manually →
            </button>
          </div>
        )}

        {/* ── Parsing Spinner ──────────────────────────────────────────── */}
        {stage === 'parsing' && (
          <div className="flex flex-col items-center gap-4 py-16">
            <div className="w-12 h-12 bg-violet-100 rounded-2xl flex items-center justify-center">
              <Loader2 size={24} className="text-violet-500 animate-spin" />
            </div>
            <p className="text-sm font-semibold text-gray-700">Reading your prompt…</p>
            <p className="text-xs text-gray-400">Extracting trip details with AI</p>
          </div>
        )}

        {/* ── Guided Q&A ───────────────────────────────────────────────── */}
        {stage === 'guided' && (
          <div className="space-y-5">
            {/* Progress bar */}
            <div className="flex gap-1">
              {Array.from({ length: GUIDED_STEPS }).map((_, i) => (
                <div
                  key={i}
                  className={`flex-1 h-1 rounded-full transition-all ${i <= guidedStep ? 'bg-violet-500' : 'bg-gray-200'}`}
                />
              ))}
            </div>

            {/* Step 0: Destination */}
            {guidedStep === 0 && (
              <div className="space-y-4">
                <h2 className="text-xl font-black text-gray-900">Where are you going?</h2>
                <Input label="Destination *" placeholder="e.g. Goa, India" value={brief.destination} onChange={(e) => setBrief((p) => ({ ...p, destination: e.target.value }))} autoFocus />
                <Input label="Starting from (optional)" placeholder="e.g. Mumbai" value={brief.origin} onChange={(e) => setBrief((p) => ({ ...p, origin: e.target.value }))} />
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={guidedBack} className="flex-1">← Back</Button>
                  <Button onClick={guidedNext} disabled={!brief.destination.trim()} className="flex-1">Next →</Button>
                </div>
              </div>
            )}

            {/* Step 1: Dates */}
            {guidedStep === 1 && (
              <div className="space-y-4">
                <h2 className="text-xl font-black text-gray-900">When are you going?</h2>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Start date *" type="date" min={today} value={brief.startDate} onChange={(e) => setBrief((p) => ({ ...p, startDate: e.target.value }))} />
                  <Input label="End date *" type="date" min={brief.startDate || today} value={brief.endDate} onChange={(e) => setBrief((p) => ({ ...p, endDate: e.target.value }))} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-2">Quick duration</p>
                  <div className="flex gap-2 flex-wrap">
                    {[3, 5, 7, 10, 14].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => { const s = tomorrowISO(); setBrief((p) => ({ ...p, startDate: s, endDate: addDays(s, n - 1) })) }}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 bg-white text-gray-600 hover:border-violet-300 transition-all"
                      >
                        {n} days
                      </button>
                    ))}
                  </div>
                </div>
                {brief.startDate && brief.endDate && brief.startDate <= brief.endDate && (
                  <p className="text-xs text-gray-400">{getDayCount(brief.startDate, brief.endDate)} day(s)</p>
                )}
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={guidedBack} className="flex-1">← Back</Button>
                  <Button onClick={guidedNext} disabled={!brief.startDate || !brief.endDate} className="flex-1">Next →</Button>
                </div>
              </div>
            )}

            {/* Step 2: People & type */}
            {guidedStep === 2 && (
              <div className="space-y-4">
                <h2 className="text-xl font-black text-gray-900">How many people?</h2>
                <div className="flex items-center gap-4">
                  <button type="button" onClick={() => setCount(brief.travellerCount - 1)} className="w-10 h-10 rounded-full border-2 border-gray-200 flex items-center justify-center text-xl font-bold text-gray-600 hover:border-violet-300 transition-all">−</button>
                  <span className="text-3xl font-black text-gray-900 w-12 text-center">{brief.travellerCount}</span>
                  <button type="button" onClick={() => setCount(brief.travellerCount + 1)} className="w-10 h-10 rounded-full border-2 border-gray-200 flex items-center justify-center text-xl font-bold text-gray-600 hover:border-violet-300 transition-all">+</button>
                  <span className="text-sm text-gray-500">traveller{brief.travellerCount !== 1 ? 's' : ''}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Group type</p>
                  <div className="grid grid-cols-4 gap-2">
                    {TRIP_TYPES.map((t) => (
                      <button key={t.value} type="button" onClick={() => setBrief((p) => ({ ...p, tripType: t.value }))}
                        className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${brief.tripType === t.value ? 'border-violet-500 bg-violet-50' : 'border-gray-200 hover:border-gray-300'}`}
                      >
                        <span className="text-xl">{t.emoji}</span>
                        <span className={`text-[10px] font-semibold ${brief.tripType === t.value ? 'text-violet-700' : 'text-gray-500'}`}>{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={guidedBack} className="flex-1">← Back</Button>
                  <Button onClick={guidedNext} className="flex-1">Next →</Button>
                </div>
              </div>
            )}

            {/* Step 3: Budget */}
            {guidedStep === 3 && (
              <div className="space-y-4">
                <h2 className="text-xl font-black text-gray-900">What&apos;s your budget?</h2>
                <p className="text-sm text-gray-500">Total for the whole group · Enter 0 if no fixed budget.</p>
                <div className="flex gap-3">
                  <div className="w-28 flex-shrink-0">
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Currency</label>
                    <select value={brief.currency} onChange={(e) => setBrief((p) => ({ ...p, currency: e.target.value }))} className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <Input label="Amount" type="number" placeholder="e.g. 50000" min="0" value={brief.budget > 0 ? String(brief.budget) : ''} onChange={(e) => setBrief((p) => ({ ...p, budget: parseFloat(e.target.value) || 0 }))} />
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={guidedBack} className="flex-1">← Back</Button>
                  <Button onClick={guidedNext} className="flex-1">Next →</Button>
                </div>
              </div>
            )}

            {/* Step 4: Pace & Interests */}
            {guidedStep === 4 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-black text-gray-900">Travel style</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Optional — skip to continue</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Pace</p>
                  <PaceSelector value={brief.preferences.pace} onChange={(v) => setPrefs({ pace: v })} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Interests</p>
                  <div className="flex flex-wrap gap-2">
                    {INTERESTS.map((i) => (
                      <Chip key={i.value} label={i.label} active={brief.preferences.interests.includes(i.value)} onClick={() => setPrefs({ interests: toggle(brief.preferences.interests, i.value) })} />
                    ))}
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={guidedBack} className="flex-1">← Back</Button>
                  <Button onClick={guidedNext} className="flex-1">Next →</Button>
                </div>
              </div>
            )}

            {/* Step 5: Food & Extras */}
            {guidedStep === 5 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-black text-gray-900">Food &amp; extras</h2>
                  <p className="text-xs text-gray-400 mt-0.5">All optional — skip to review</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Food preferences</p>
                  <div className="flex flex-wrap gap-2">
                    {FOOD_PREFS.map((f) => (
                      <Chip key={f.value} label={f.label} active={brief.preferences.foodPreferences.includes(f.value)} onClick={() => setPrefs({ foodPreferences: toggle(brief.preferences.foodPreferences, f.value) })} />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Must-visit places</label>
                  <textarea rows={2} placeholder="e.g. Amber Fort, City Palace" value={brief.preferences.mustVisit.join(', ')} onChange={(e) => setPrefs({ mustVisit: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} className={taClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Things to avoid</label>
                  <textarea rows={2} placeholder="e.g. crowded markets, late nights" value={brief.preferences.avoidPlaces.join(', ')} onChange={(e) => setPrefs({ avoidPlaces: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} className={taClass} />
                </div>
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={guidedBack} className="flex-1">← Back</Button>
                  <Button onClick={() => setStage('review-brief')} className="flex-1">Review Brief →</Button>
                </div>
                <button onClick={() => setStage('review-brief')} className="w-full text-xs text-gray-400 hover:text-gray-600 text-center transition-colors">
                  Skip — go to review
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Smart Form ───────────────────────────────────────────────── */}
        {stage === 'smart-form' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-black text-gray-900 mb-1">Trip details</h2>
              <p className="text-sm text-gray-500">Fill in what you know — optional fields can be skipped.</p>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Required</p>
              <Input label="Destination *" placeholder="e.g. Goa, India" value={brief.destination} onChange={(e) => setBrief((p) => ({ ...p, destination: e.target.value }))} autoFocus />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Start date *" type="date" min={today} value={brief.startDate} onChange={(e) => setBrief((p) => ({ ...p, startDate: e.target.value }))} />
                <Input label="End date *" type="date" min={brief.startDate || today} value={brief.endDate} onChange={(e) => setBrief((p) => ({ ...p, endDate: e.target.value }))} />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">People *</label>
                  <input type="number" min={1} max={30} value={brief.travellerCount}
                    onChange={(e) => setCount(parseInt(e.target.value) || 1)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Group type</label>
                  <select value={brief.tripType} onChange={(e) => setBrief((p) => ({ ...p, tripType: e.target.value as TripType }))} className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
                    {TRIP_TYPES.map((t) => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-28 flex-shrink-0">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Currency</label>
                  <select value={brief.currency} onChange={(e) => setBrief((p) => ({ ...p, currency: e.target.value }))} className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <Input label="Budget (optional)" type="number" placeholder="Total for group" min="0" value={brief.budget > 0 ? String(brief.budget) : ''} onChange={(e) => setBrief((p) => ({ ...p, budget: parseFloat(e.target.value) || 0 }))} />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Optional</p>
              <Input label="Trip name" placeholder={brief.destination ? `${brief.destination} Trip 2027` : 'e.g. Summer Goa Trip'} value={brief.tripName} onChange={(e) => setBrief((p) => ({ ...p, tripName: e.target.value }))} />
              <Input label="Starting from" placeholder="e.g. Mumbai" value={brief.origin} onChange={(e) => setBrief((p) => ({ ...p, origin: e.target.value }))} />
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Travel pace</p>
                <PaceSelector value={brief.preferences.pace} onChange={(v) => setPrefs({ pace: v })} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Interests</p>
                <div className="flex flex-wrap gap-2">
                  {INTERESTS.map((i) => <Chip key={i.value} label={i.label} active={brief.preferences.interests.includes(i.value)} onClick={() => setPrefs({ interests: toggle(brief.preferences.interests, i.value) })} />)}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Food preferences</p>
                <div className="flex flex-wrap gap-2">
                  {FOOD_PREFS.map((f) => <Chip key={f.value} label={f.label} active={brief.preferences.foodPreferences.includes(f.value)} onClick={() => setPrefs({ foodPreferences: toggle(brief.preferences.foodPreferences, f.value) })} />)}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Must-visit places</label>
                <textarea rows={2} placeholder="e.g. Amber Fort, City Palace" value={brief.preferences.mustVisit.join(', ')} onChange={(e) => setPrefs({ mustVisit: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} className={taClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Things to avoid</label>
                <textarea rows={2} placeholder="e.g. very crowded spots" value={brief.preferences.avoidPlaces.join(', ')} onChange={(e) => setPrefs({ avoidPlaces: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} className={taClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Extra notes</label>
                <textarea rows={2} placeholder="Any other preferences or constraints" value={brief.preferences.extraNotes || ''} onChange={(e) => setPrefs({ extraNotes: e.target.value })} className={taClass} />
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStage('mode-select')} className="flex-1">← Back</Button>
              <Button onClick={() => setStage('review-brief')} disabled={!brief.destination.trim()} className="flex-1">Review Brief →</Button>
            </div>
          </div>
        )}

        {/* ── Review Brief ─────────────────────────────────────────────── */}
        {stage === 'review-brief' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-black text-gray-900 mb-1">Review trip brief</h2>
              <p className="text-sm text-gray-500">Check and edit before AI generates your itinerary.</p>
            </div>

            {parseError && (
              <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 p-3">
                <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">{parseError} Fill in any missing fields below.</p>
              </div>
            )}

            {genError && (
              <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 p-3">
                <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{genError}</p>
              </div>
            )}

            <div className="space-y-3">
              <Input label="Trip name (optional)" placeholder={brief.destination ? `${brief.destination} Trip` : 'e.g. Summer Goa Trip'} value={brief.tripName} onChange={(e) => setBrief((p) => ({ ...p, tripName: e.target.value }))} />
              {/* Phase 16C — structured city/state destination with custom fallback */}
              <SearchableSelect<IndiaCity>
                label="Destination *"
                placeholder="Search a city — e.g. Gangtok, Darjeeling, Puri"
                search={(q) => searchCities(q)}
                getKey={(c) => `${c.city}-${c.state}`}
                renderPrimary={(c) => `${c.city}, ${c.state}`}
                renderSecondary={(c) => c.country}
                onSelect={selectCity}
                selectedPrimary={brief.destination || null}
                selectedSecondary={brief.destinationStructured?.state ? `${brief.destinationStructured.country}` : undefined}
                selectedBadge={brief.destinationSource === 'dataset' ? 'Dataset' : 'Custom'}
                onClear={clearDestination}
                allowCustom
                onCustom={setCustomDestination}
                error={briefErrors.destination}
              />
              <Input label="Starting from (optional)" placeholder="e.g. Mumbai" value={brief.origin} onChange={(e) => setBrief((p) => ({ ...p, origin: e.target.value }))} />

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Start date *"
                  type="date"
                  min={today}
                  value={brief.startDate}
                  onChange={(e) => { setBrief((p) => ({ ...p, startDate: e.target.value })); setBriefErrors((e2) => ({ ...e2, startDate: '' })) }}
                  error={briefErrors.startDate}
                />
                <Input
                  label="End date *"
                  type="date"
                  min={brief.startDate || today}
                  value={brief.endDate}
                  onChange={(e) => { setBrief((p) => ({ ...p, endDate: e.target.value })); setBriefErrors((e2) => ({ ...e2, endDate: '' })) }}
                  error={briefErrors.endDate}
                />
              </div>
              {brief.startDate && brief.endDate && brief.startDate <= brief.endDate && (
                <p className="text-xs text-gray-400">{getDayCount(brief.startDate, brief.endDate)} day(s) planned</p>
              )}

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Travellers *</label>
                  <input
                    type="number" min={1} max={30}
                    value={brief.travellerCount}
                    onChange={(e) => { setCount(parseInt(e.target.value) || 1); setBriefErrors((e2) => ({ ...e2, travellerCount: '' })) }}
                    className={`w-full px-4 py-3 rounded-xl border bg-gray-50 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 ${briefErrors.travellerCount ? 'border-red-300' : 'border-gray-200'}`}
                  />
                  {briefErrors.travellerCount && <p className="mt-1 text-xs text-red-500">{briefErrors.travellerCount}</p>}
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Group type</label>
                  <select value={brief.tripType} onChange={(e) => setBrief((p) => ({ ...p, tripType: e.target.value as TripType }))} className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
                    {TRIP_TYPES.map((t) => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="w-28 flex-shrink-0">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Currency</label>
                  <select value={brief.currency} onChange={(e) => setBrief((p) => ({ ...p, currency: e.target.value }))} className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <Input label="Budget (optional)" type="number" placeholder="Total for group" min="0" value={brief.budget > 0 ? String(brief.budget) : ''} onChange={(e) => setBrief((p) => ({ ...p, budget: parseFloat(e.target.value) || 0 }))} />
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Travel pace</p>
                <PaceSelector value={brief.preferences.pace} onChange={(v) => setPrefs({ pace: v })} />
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Interests</p>
                <div className="flex flex-wrap gap-2">
                  {INTERESTS.map((i) => <Chip key={i.value} label={i.label} active={brief.preferences.interests.includes(i.value)} onClick={() => setPrefs({ interests: toggle(brief.preferences.interests, i.value) })} />)}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Food preferences</p>
                <div className="flex flex-wrap gap-2">
                  {FOOD_PREFS.map((f) => <Chip key={f.value} label={f.label} active={brief.preferences.foodPreferences.includes(f.value)} onClick={() => setPrefs({ foodPreferences: toggle(brief.preferences.foodPreferences, f.value) })} />)}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Food budget style</p>
                <p className="text-xs text-gray-400 mb-2">Used to find matching restaurant suggestions from Google</p>
                <div className="flex flex-wrap gap-2">
                  {FOOD_BUDGET_STYLES.map((s) => (
                    <Chip
                      key={s.value}
                      label={s.label}
                      active={brief.preferences.foodBudgetStyle === s.value}
                      onClick={() => setPrefs({ foodBudgetStyle: brief.preferences.foodBudgetStyle === s.value ? undefined : s.value })}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Must-visit places (comma-separated)</label>
                <textarea rows={2} placeholder="e.g. Amber Fort, Jantar Mantar" value={brief.preferences.mustVisit.join(', ')} onChange={(e) => setPrefs({ mustVisit: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} className={taClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Things to avoid</label>
                <textarea rows={2} placeholder="e.g. very touristy spots, late nights" value={brief.preferences.avoidPlaces.join(', ')} onChange={(e) => setPrefs({ avoidPlaces: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} className={taClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Extra notes (optional)</label>
                <textarea rows={2} placeholder="Any other preferences or constraints" value={brief.preferences.extraNotes || ''} onChange={(e) => setPrefs({ extraNotes: e.target.value })} className={taClass} />
              </div>
            </div>

            {/* ── Accommodation (single unified stay flow — Phase 16B) ───── */}
            <AccommodationSection
              acc={brief.accommodation}
              currency={brief.currency}
              travellerCount={brief.travellerCount}
              startDate={brief.startDate}
              endDate={brief.endDate}
              mapsAvailable={mapsStatus.available}
              onChange={setAcc}
            />

            {/* ── Budget breakdown ──────────────────────────────────────── */}
            <div className="rounded-2xl border border-gray-100 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Wallet size={15} className="text-violet-500" />
                <p className="text-sm font-bold text-gray-800">What does your budget include?</p>
              </div>
              <p className="text-xs text-gray-500">
                {brief.budget > 0
                  ? `Your ${brief.currency} ${brief.budget.toLocaleString()} budget — tick what it covers. Excluded categories aren't compared against it.`
                  : 'Tick which categories your budget is meant to cover. (No total budget entered yet.)'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {BUDGET_CATS.map((cat) => {
                  const on = !!brief.budgetIncluded[cat.key]
                  return (
                    <button key={cat.key} type="button" onClick={() => toggleBudgetCat(cat.key)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${on ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-gray-200 bg-white text-gray-400'}`}>
                      <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${on ? 'bg-violet-500 text-white' : 'border border-gray-300'}`}>
                        {on && <Check size={11} />}
                      </span>
                      {cat.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Transport estimate (optional) ─────────────────────────── */}
            <div className="rounded-2xl border border-gray-100 p-4 space-y-4">
              <p className="text-sm font-bold text-gray-800">Transport to destination (optional)</p>
              <p className="text-xs text-gray-500 -mt-2">Add transport you&apos;ve already arranged. Saved as a planned estimate — never as an actual expense.</p>

              {/* Mode */}
              <div className="space-y-2">
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">How are you getting there?</p>
                <div className="flex gap-2 flex-wrap">
                  {TRANSPORT_MODES.map((m) => (
                    <button key={m} type="button" onClick={() => setTransport({ mode: m })}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all capitalize ${brief.transport.mode === m ? 'bg-violet-500 text-white border-violet-500' : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300'}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Travel type: one-way / round-trip */}
              <div className="flex gap-2">
                {(['one_way', 'round_trip'] as const).map((tt) => (
                  <button key={tt} type="button"
                    onClick={() => setBrief((p) => ({ ...p, transportTravelType: tt }))}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${brief.transportTravelType === tt ? 'bg-violet-500 text-white border-violet-500' : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300'}`}>
                    {tt === 'one_way' ? 'One-way' : 'Round trip'}
                  </button>
                ))}
              </div>

              {/* Train from/to + train selector */}
              {brief.transport.mode === 'train' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <SearchableSelect<IndiaRailwayStation>
                      label="From station"
                      placeholder="e.g. Howrah, SDAH, Kolkata"
                      search={(q) => searchRailwayStations(q)}
                      getKey={(s) => s.code || s.name}
                      renderPrimary={(s) => `${s.name}${s.code ? ` (${s.code})` : ''}`}
                      renderSecondary={(s) => `${s.city}, ${s.state}`}
                      onSelect={(s) => setFromStation(s)}
                      selectedPrimary={brief.fromStation ? `${brief.fromStation.name}${brief.fromStation.code ? ` (${brief.fromStation.code})` : ''}` : null}
                      selectedSecondary={brief.fromStation ? `${brief.fromStation.city}, ${brief.fromStation.state}` : undefined}
                      selectedBadge={brief.fromStation?.source === 'dataset' ? 'Dataset' : brief.fromStation ? 'Custom' : undefined}
                      onClear={clearFromStation}
                      allowCustom
                      onCustom={setFromStationCustom}
                    />
                    <SearchableSelect<IndiaRailwayStation>
                      label="To station (arrival)"
                      placeholder="e.g. NJP, New Jalpaiguri"
                      search={(q) => searchRailwayStations(q)}
                      getKey={(s) => s.code || s.name}
                      renderPrimary={(s) => `${s.name}${s.code ? ` (${s.code})` : ''}`}
                      renderSecondary={(s) => `${s.city}, ${s.state}`}
                      onSelect={(s) => setToStation(s)}
                      selectedPrimary={brief.toStation ? `${brief.toStation.name}${brief.toStation.code ? ` (${brief.toStation.code})` : ''}` : null}
                      selectedSecondary={brief.toStation ? `${brief.toStation.city}, ${brief.toStation.state}` : undefined}
                      selectedBadge={brief.toStation?.source === 'dataset' ? 'Dataset' : brief.toStation ? 'Custom' : undefined}
                      onClear={clearToStation}
                      allowCustom
                      onCustom={setToStationCustom}
                    />
                  </div>
                  {/* Part 2: Limited-data banner when only local seed is loaded */}
                  {(() => {
                    const status = getImportDataStatus()
                    return status.limitedDataMessage ? (
                      <p className="text-[11px] text-gray-400 flex items-center gap-1">
                        <Info size={11} /> {status.limitedDataMessage}
                      </p>
                    ) : null
                  })()}
                  <SearchableSelect<TrainSearchResult>
                    label="Train (optional)"
                    placeholder="Search by number, name or type — e.g. 12314, Rajdhani"
                    search={(q) => trainServiceSearch(q, { fromCode: brief.fromStation?.code, toCode: brief.toStation?.code })}
                    getKey={(r) => r.train.trainNumber}
                    renderPrimary={(r) => formatTrainLabel(r.train)}
                    renderSecondary={(r) => {
                      if (r.routeMatch === 'reverse') return '⚠ Opposite direction'
                      if (r.routeMatch === 'mismatch') return '⚠ Route mismatch — verify before booking'
                      return r.train.daysOfRun ? `Runs: ${r.train.daysOfRun}` : r.train.routeDescription
                    }}
                    onSelect={(r) => selectTrain(r.train)}
                    selectedPrimary={brief.trainNumber ? `${brief.trainNumber}${brief.trainName ? ` · ${brief.trainName}` : ''}` : null}
                    selectedSecondary={undefined}
                    selectedBadge={brief.trainNumber ? 'Seed' : undefined}
                    onClear={clearTrain}
                    allowCustom
                    onCustom={setTrainNumberCustom}
                  />
                  {brief.trainRouteWarning && (
                    <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-3">
                      <AlertTriangle size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] text-amber-700 leading-relaxed">{brief.trainRouteWarning}</p>
                    </div>
                  )}
                  {/* Train timing display — approximate, from local seed */}
                  {brief.trainNumber && (() => {
                    const td = fetchTrainDetails(brief.trainNumber)
                    if (!td) return (
                      <p className="text-[11px] text-gray-400">Train not in local seed — timing not available. Verify at IRCTC.</p>
                    )
                    const timing = td.departureTime && td.arrivalTime
                      ? `Dep ${td.departureTime} → Arr ${td.arrivalTime}`
                      : td.departureTime
                        ? `Dep ${td.departureTime}`
                        : 'Timing not available in seed'
                    return (
                      <p className="text-[11px] text-gray-500">
                        <span className="font-semibold">{td.trainName} ({td.trainNumber})</span>
                        {' · '}{td.routeDescription}
                        {' · '}{timing}
                        {td.daysOfRun ? ` · Runs: ${td.daysOfRun}` : ''}
                        <span className="text-gray-400"> — approx.; verify at IRCTC</span>
                      </p>
                    )
                  })()}
                </div>
              )}

              {/* Flight from/to */}
              {brief.transport.mode === 'flight' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <SearchableSelect<IndiaAirport>
                    label="From airport"
                    placeholder="e.g. CCU, Kolkata, Netaji"
                    search={(q) => searchAirports(q)}
                    getKey={(a) => a.iataCode}
                    renderPrimary={(a) => `${a.name} (${a.iataCode})`}
                    renderSecondary={(a) => `${a.city}, ${a.state}`}
                    onSelect={(a) => setFromAirport(a)}
                    selectedPrimary={brief.fromAirport ? `${brief.fromAirport.name} (${brief.fromAirport.iataCode})` : null}
                    selectedSecondary={brief.fromAirport ? `${brief.fromAirport.city}, ${brief.fromAirport.state}` : undefined}
                    selectedBadge={brief.fromAirport?.source === 'dataset' ? 'Dataset' : brief.fromAirport ? 'Custom' : undefined}
                    onClear={() => setBrief((p) => ({ ...p, fromAirport: undefined }))}
                    allowCustom
                    onCustom={(text) => setBrief((p) => ({ ...p, fromAirport: { name: text, iataCode: '', city: text, state: '', source: 'custom' }, transport: { ...p.transport, origin: text } }))}
                  />
                  <SearchableSelect<IndiaAirport>
                    label="To airport (arrival)"
                    placeholder="e.g. IXB, Bagdogra"
                    search={(q) => searchAirports(q)}
                    getKey={(a) => a.iataCode}
                    renderPrimary={(a) => `${a.name} (${a.iataCode})`}
                    renderSecondary={(a) => `${a.city}, ${a.state}`}
                    onSelect={(a) => setToAirport(a)}
                    selectedPrimary={brief.toAirport ? `${brief.toAirport.name} (${brief.toAirport.iataCode})` : null}
                    selectedSecondary={brief.toAirport ? `${brief.toAirport.city}, ${brief.toAirport.state}` : undefined}
                    selectedBadge={brief.toAirport?.source === 'dataset' ? 'Dataset' : brief.toAirport ? 'Custom' : undefined}
                    onClear={() => setBrief((p) => ({ ...p, toAirport: undefined }))}
                    allowCustom
                    onCustom={(text) => setBrief((p) => ({ ...p, toAirport: { name: text, iataCode: '', city: text, state: '', source: 'custom' }, airport: { name: text, iataCode: '', city: text, state: '', source: 'custom' }, transport: { ...p.transport, destination: text } }))}
                  />
                </div>
              )}

              {/* Bus/car/other: free-text */}
              {(brief.transport.mode === 'bus' || brief.transport.mode === 'car' || brief.transport.mode === 'other') && (
                <div className="grid grid-cols-2 gap-2">
                  <Input label="From" placeholder="Origin city" value={brief.transport.origin || ''} onChange={(e) => setTransport({ origin: e.target.value })} />
                  <Input label="To" placeholder="Destination city" value={brief.transport.destination || ''} onChange={(e) => setTransport({ destination: e.target.value })} />
                </div>
              )}

              {/* Round-trip return leg */}
              {brief.transportTravelType === 'round_trip' && (
                <div className="space-y-3 pt-1 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Return journey</p>
                    <button type="button" onClick={applyReverseReturn}
                      className="text-[11px] font-semibold text-violet-600 hover:text-violet-700 transition-colors">
                      ↔ Same route, reversed
                    </button>
                  </div>
                  {brief.transport.mode === 'train' && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <SearchableSelect<IndiaRailwayStation>
                          label="Return from"
                          placeholder="e.g. NJP"
                          search={(q) => searchRailwayStations(q)}
                          getKey={(s) => s.code || s.name}
                          renderPrimary={(s) => `${s.name}${s.code ? ` (${s.code})` : ''}`}
                          renderSecondary={(s) => `${s.city}, ${s.state}`}
                          onSelect={(s) => setBrief((p) => ({ ...p, returnFromStation: s ? { ...s, source: 'dataset' } : undefined }))}
                          selectedPrimary={brief.returnFromStation ? `${brief.returnFromStation.name}${brief.returnFromStation.code ? ` (${brief.returnFromStation.code})` : ''}` : null}
                          selectedSecondary={brief.returnFromStation ? `${brief.returnFromStation.city}, ${brief.returnFromStation.state}` : undefined}
                          selectedBadge={brief.returnFromStation?.source === 'dataset' ? 'Dataset' : brief.returnFromStation ? 'Custom' : undefined}
                          onClear={() => setBrief((p) => ({ ...p, returnFromStation: undefined }))}
                          allowCustom
                          onCustom={(t) => setBrief((p) => ({ ...p, returnFromStation: { name: t, code: '', city: t, state: '', source: 'custom' } }))}
                        />
                        <SearchableSelect<IndiaRailwayStation>
                          label="Return to"
                          placeholder="e.g. Howrah"
                          search={(q) => searchRailwayStations(q)}
                          getKey={(s) => s.code || s.name}
                          renderPrimary={(s) => `${s.name}${s.code ? ` (${s.code})` : ''}`}
                          renderSecondary={(s) => `${s.city}, ${s.state}`}
                          onSelect={(s) => setBrief((p) => ({ ...p, returnToStation: s ? { ...s, source: 'dataset' } : undefined }))}
                          selectedPrimary={brief.returnToStation ? `${brief.returnToStation.name}${brief.returnToStation.code ? ` (${brief.returnToStation.code})` : ''}` : null}
                          selectedSecondary={brief.returnToStation ? `${brief.returnToStation.city}, ${brief.returnToStation.state}` : undefined}
                          selectedBadge={brief.returnToStation?.source === 'dataset' ? 'Dataset' : brief.returnToStation ? 'Custom' : undefined}
                          onClear={() => setBrief((p) => ({ ...p, returnToStation: undefined }))}
                          allowCustom
                          onCustom={(t) => setBrief((p) => ({ ...p, returnToStation: { name: t, code: '', city: t, state: '', source: 'custom' } }))}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input label="Return train no. (optional)" placeholder="e.g. 12378" value={brief.returnTrainNumber || ''} onChange={(e) => setBrief((p) => ({ ...p, returnTrainNumber: e.target.value }))} />
                        <Input label="Return train name" placeholder="e.g. Padatik Express" value={brief.returnTrainName || ''} onChange={(e) => setBrief((p) => ({ ...p, returnTrainName: e.target.value }))} />
                      </div>
                      {/* Return train timing — from local seed */}
                      {brief.returnTrainNumber && (() => {
                        const rtd = fetchTrainDetails(brief.returnTrainNumber)
                        if (!rtd) return (
                          <p className="text-[11px] text-gray-400">Return train not in local seed — verify timing at IRCTC.</p>
                        )
                        const timing = rtd.departureTime && rtd.arrivalTime
                          ? `Dep ${rtd.departureTime} → Arr ${rtd.arrivalTime}`
                          : rtd.departureTime ? `Dep ${rtd.departureTime}` : 'Timing not available in seed'
                        return (
                          <p className="text-[11px] text-gray-500">
                            <span className="font-semibold">{rtd.trainName} ({rtd.trainNumber})</span>
                            {' · '}{rtd.routeDescription}
                            {' · '}{timing}
                            {rtd.daysOfRun ? ` · Runs: ${rtd.daysOfRun}` : ''}
                            <span className="text-gray-400"> — approx.; verify at IRCTC</span>
                          </p>
                        )
                      })()}
                    </div>
                  )}
                  {brief.transport.mode === 'flight' && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <SearchableSelect<IndiaAirport>
                        label="Return from"
                        placeholder="e.g. IXB, Bagdogra"
                        search={(q) => searchAirports(q)}
                        getKey={(a) => a.iataCode}
                        renderPrimary={(a) => `${a.name} (${a.iataCode})`}
                        renderSecondary={(a) => `${a.city}, ${a.state}`}
                        onSelect={(a) => setBrief((p) => ({ ...p, returnFromAirport: a ? { ...a, source: 'dataset' } : undefined }))}
                        selectedPrimary={brief.returnFromAirport ? `${brief.returnFromAirport.name} (${brief.returnFromAirport.iataCode})` : null}
                        selectedSecondary={brief.returnFromAirport ? `${brief.returnFromAirport.city}, ${brief.returnFromAirport.state}` : undefined}
                        selectedBadge={brief.returnFromAirport?.source === 'dataset' ? 'Dataset' : brief.returnFromAirport ? 'Custom' : undefined}
                        onClear={() => setBrief((p) => ({ ...p, returnFromAirport: undefined }))}
                        allowCustom
                        onCustom={(t) => setBrief((p) => ({ ...p, returnFromAirport: { name: t, iataCode: '', city: t, state: '', source: 'custom' } }))}
                      />
                      <SearchableSelect<IndiaAirport>
                        label="Return to"
                        placeholder="e.g. CCU, Kolkata"
                        search={(q) => searchAirports(q)}
                        getKey={(a) => a.iataCode}
                        renderPrimary={(a) => `${a.name} (${a.iataCode})`}
                        renderSecondary={(a) => `${a.city}, ${a.state}`}
                        onSelect={(a) => setBrief((p) => ({ ...p, returnToAirport: a ? { ...a, source: 'dataset' } : undefined }))}
                        selectedPrimary={brief.returnToAirport ? `${brief.returnToAirport.name} (${brief.returnToAirport.iataCode})` : null}
                        selectedSecondary={brief.returnToAirport ? `${brief.returnToAirport.city}, ${brief.returnToAirport.state}` : undefined}
                        selectedBadge={brief.returnToAirport?.source === 'dataset' ? 'Dataset' : brief.returnToAirport ? 'Custom' : undefined}
                        onClear={() => setBrief((p) => ({ ...p, returnToAirport: undefined }))}
                        allowCustom
                        onCustom={(t) => setBrief((p) => ({ ...p, returnToAirport: { name: t, iataCode: '', city: t, state: '', source: 'custom' } }))}
                      />
                    </div>
                  )}
                  {(brief.transport.mode === 'bus' || brief.transport.mode === 'car' || brief.transport.mode === 'other') && (
                    <div className="grid grid-cols-2 gap-2">
                      <Input label="Return from" placeholder="City" value={brief.returnFromCity || ''} onChange={(e) => setBrief((p) => ({ ...p, returnFromCity: e.target.value }))} />
                      <Input label="Return to" placeholder="City" value={brief.returnToCity || ''} onChange={(e) => setBrief((p) => ({ ...p, returnToCity: e.target.value }))} />
                    </div>
                  )}
                </div>
              )}

              {/* Cost + booking ref */}
              <div className="grid grid-cols-2 gap-2">
                <Input label="Total cost (optional)" type="number" min="0" placeholder="0" value={brief.transport.totalCost ? String(brief.transport.totalCost) : ''} onChange={(e) => setTransport({ totalCost: parseFloat(e.target.value) || undefined })} />
                <Input label="Booking ref (optional)" placeholder="PNR / ref" value={brief.transport.bookingRef || ''} onChange={(e) => setTransport({ bookingRef: e.target.value })} />
              </div>

              {/* Ticket upload foundation — Coming Soon */}
              <div className="flex items-start gap-2 rounded-xl bg-gray-50 border border-gray-100 p-3">
                <Upload size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-gray-600">Upload tickets &amp; booking PDFs <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500 ml-1">Coming soon</span></p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Attach train/flight/bus tickets &amp; hotel confirmations (kept private to trip members). For now, enter details manually above.</p>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-2xl bg-violet-50/70 border border-violet-100 p-3">
              <Sparkles size={14} className="text-violet-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-gray-600 leading-relaxed">
                You&apos;ll get a fully editable preview before the trip is created.{' '}
                <strong>Nothing is saved until you click &ldquo;Create Trip&rdquo;.</strong>{' '}
                All costs and timings are approximate estimates — not bookings.
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="secondary" onClick={backToInput} className="flex-1">← Back</Button>
              <Button
                onClick={handleGenerate}
                disabled={!brief.destination.trim() || !brief.startDate || !brief.endDate}
                className="flex-1"
              >
                <Sparkles size={15} /> Generate Itinerary
              </Button>
            </div>
          </div>
        )}

        {/* ── Generating Spinner ───────────────────────────────────────── */}
        {stage === 'generating' && (
          <div className="flex flex-col items-center gap-4 py-16">
            <div className="w-14 h-14 bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Loader2 size={28} className="text-white animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-base font-bold text-gray-900">
                {enrichingFood ? 'Finding restaurant suggestions…' : 'Generating your itinerary…'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {enrichingFood
                  ? 'Matching food breaks with Google Places'
                  : `Creating a ${brief.startDate && brief.endDate ? getDayCount(brief.startDate, brief.endDate) : '?'}-day plan${brief.destination ? ` for ${brief.destination}` : ''}`}
              </p>
            </div>
            <p className="text-xs text-gray-400">This usually takes 10–25 seconds</p>
          </div>
        )}

        {/* ── Preview ──────────────────────────────────────────────────── */}
        {stage === 'preview' && result && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-2xl bg-violet-50/70 border border-violet-100 p-3">
              <Sparkles size={14} className="text-violet-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-gray-600 leading-relaxed">
                Review your AI-generated itinerary for <strong>{brief.tripName || brief.destination}</strong>.
                Edit anything, then click <strong>Create Trip</strong> to save — nothing is written until then.
              </p>
            </div>
            {createError && (
              <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 p-3">
                <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{createError}</p>
              </div>
            )}
            <GeneratedItineraryPreview
              result={result}
              currency={brief.currency}
              travellerCount={brief.travellerCount}
              isMock={isMock}
              applying={creating}
              applyNote={null}
              mapsAvailable={mapsStatus.available}
              applyLabel="Create Trip"
              applyingLabel="Creating trip…"
              transportMode={brief.transport.mode}
              autoEnrich
              budgetContext={{
                budget: brief.budget,
                included: brief.budgetIncluded,
                plannedTransport: (brief.transport.totalCost || brief.transport.origin || brief.transport.destination) ? [brief.transport] : undefined,
                plannedStay: accommodationToPlannedStay(brief.accommodation),
                stayBaseLabel: brief.accommodation.mode === 'chosen' && brief.accommodation.name?.trim() ? brief.accommodation.name.trim() : undefined,
              }}
              destinationContext={{
                city: brief.destinationStructured?.city ?? brief.destination,
                lat: brief.destinationStructured?.lat,
                lng: brief.destinationStructured?.lng,
              }}
              onApply={handleCreateTrip}
              onDiscard={() => { setStage('review-brief'); setResult(null) }}
              onRegenerate={handleGenerate}
            />
          </div>
        )}

        {/* ── Creating Spinner ─────────────────────────────────────────── */}
        {stage === 'creating' && (
          <div className="flex flex-col items-center gap-4 py-16">
            <div className="w-14 h-14 bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Loader2 size={28} className="text-white animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-base font-bold text-gray-900">Creating your trip…</p>
              <p className="text-sm text-gray-500 mt-1">Saving {brief.tripName || brief.destination || 'your trip'} to Voyago</p>
            </div>
          </div>
        )}

      </div>
    </AppShell>
  )
}
