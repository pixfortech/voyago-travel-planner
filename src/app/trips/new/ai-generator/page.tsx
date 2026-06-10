'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sparkles, MessageSquare, HelpCircle, LayoutGrid,
  ChevronRight, AlertTriangle, Loader2, Home, Wallet, Upload, Check,
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
import type {
  TripType, TripGenerationPreferences, TripInterest, FoodPreference,
  TravelPace, TripGeneratorInput, TripGeneratorResult, GeneratedActivity, Activity,
  BudgetInclusion, BudgetCategoryKey, PlannedTransport, PlannedStay,
  AccommodationDraft, StayType, StayMealPlan, StayCostMode, StayChoice,
  TripGeneratorAccommodation, StructuredDestination, RailwayStationRef, AirportRef,
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
  railwayStation?: RailwayStationRef
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

      setResult(enrichedResult)
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
              startTime: a.startTime || undefined,
              endTime: a.endTime || undefined,
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
          await updateItineraryDay(tripId, day.id, { activities })
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
                <div className="grid grid-cols-2 gap-2">
                  <Input label="From" placeholder="Origin" value={brief.transport.origin || ''} onChange={(e) => setTransport({ origin: e.target.value })} />
                  <Input label="To" placeholder="Destination" value={brief.transport.destination || ''} onChange={(e) => setTransport({ destination: e.target.value })} />
                </div>

                {/* Phase 16C — arrival station/airport selector (geographic context;
                    full transport budget arrives in Phase 16H). */}
                {brief.transport.mode === 'train' && (
                  <SearchableSelect<IndiaRailwayStation>
                    label="Arrival railway station (optional)"
                    placeholder="Search by name, code or city — e.g. NJP, Howrah"
                    search={(q) => searchRailwayStations(q)}
                    getKey={(s) => s.code}
                    renderPrimary={(s) => `${s.name} (${s.code})`}
                    renderSecondary={(s) => `${s.city}, ${s.state}`}
                    onSelect={selectStation}
                    selectedPrimary={brief.railwayStation ? `${brief.railwayStation.name} (${brief.railwayStation.code})` : null}
                    selectedSecondary={brief.railwayStation ? `${brief.railwayStation.city}, ${brief.railwayStation.state}` : undefined}
                    selectedBadge={brief.railwayStation?.source === 'dataset' ? 'Dataset' : 'Custom'}
                    onClear={() => setBrief((p) => ({ ...p, railwayStation: undefined }))}
                    allowCustom
                    onCustom={(text) => setBrief((p) => ({ ...p, railwayStation: { name: text, code: '', city: '', state: '', source: 'custom' } }))}
                  />
                )}
                {brief.transport.mode === 'flight' && (
                  <SearchableSelect<IndiaAirport>
                    label="Arrival airport (optional)"
                    placeholder="Search by name, IATA or city — e.g. CCU, Bagdogra"
                    search={(q) => searchAirports(q)}
                    getKey={(a) => a.iataCode}
                    renderPrimary={(a) => `${a.name} (${a.iataCode})`}
                    renderSecondary={(a) => `${a.city}, ${a.state}`}
                    onSelect={selectAirport}
                    selectedPrimary={brief.airport ? `${brief.airport.name} (${brief.airport.iataCode})` : null}
                    selectedSecondary={brief.airport ? `${brief.airport.city}, ${brief.airport.state}` : undefined}
                    selectedBadge={brief.airport?.source === 'dataset' ? 'Dataset' : 'Custom'}
                    onClear={() => setBrief((p) => ({ ...p, airport: undefined }))}
                    allowCustom
                    onCustom={(text) => setBrief((p) => ({ ...p, airport: { name: text, iataCode: '', city: '', state: '', source: 'custom' } }))}
                  />
                )}

                <div className="grid grid-cols-2 gap-2">
                  <Input label="Total cost (optional)" type="number" min="0" placeholder="0" value={brief.transport.totalCost ? String(brief.transport.totalCost) : ''} onChange={(e) => setTransport({ totalCost: parseFloat(e.target.value) || undefined })} />
                  <Input label="Booking ref (optional)" placeholder="PNR / ref" value={brief.transport.bookingRef || ''} onChange={(e) => setTransport({ bookingRef: e.target.value })} />
                </div>
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
              autoEnrich
              budgetContext={{
                budget: brief.budget,
                included: brief.budgetIncluded,
                plannedTransport: (brief.transport.totalCost || brief.transport.origin || brief.transport.destination) ? [brief.transport] : undefined,
                plannedStay: accommodationToPlannedStay(brief.accommodation),
                stayBaseLabel: brief.accommodation.mode === 'chosen' && brief.accommodation.name?.trim() ? brief.accommodation.name.trim() : undefined,
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
