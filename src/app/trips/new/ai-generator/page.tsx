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
import GeneratedItineraryPreview, {
  type EditableGeneratedDay, type PreviewBudgetContext,
} from '@/components/ai/GeneratedItineraryPreview'
import { useMapsStatus } from '@/lib/maps/useMapsStatus'
import { getDayCount } from '@/lib/utils'
import { categoryToActivityType } from '@/lib/maps/categoryMapping'
import type {
  TripType, TripGenerationPreferences, TripInterest, FoodPreference,
  TravelPace, TripGeneratorInput, TripGeneratorResult, Activity,
  BudgetInclusion, BudgetCategoryKey, StayBaseMode, PlannedTransport, PlannedStay,
} from '@/types'

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
  destination: string
  origin: string
  startDate: string
  endDate: string
  budget: number
  currency: string
  travellerCount: number
  tripType: TripType
  composition: { total: number; couples?: number; adults?: number; kids?: number; seniors?: number; notes?: string }
  preferences: TripGenerationPreferences
  // Phase 15D
  stayBaseMode: StayBaseMode
  stayBase: string                 // known hotel/area (when stayBaseMode === 'known')
  budgetIncluded: BudgetInclusion
  transport: PlannedTransport
  stay: PlannedStay
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
    stayBaseMode: 'later',
    stayBase: '',
    // Default: budget covers on-ground costs, not long-haul transport (common case).
    budgetIncluded: {
      stay: true, transport_to: false, local_transport: true,
      food: true, activities: true, shopping: true, buffer: true,
    },
    transport: { mode: 'train' },
    stay: {},
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
  function setStay(patch: Partial<PlannedStay>) {
    setBrief((p) => ({ ...p, stay: { ...p.stay, ...patch } }))
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

    // Feed stay intent to the AI: a known base anchors daily routes; "suggest"
    // asks the model to recommend a stay area within budget.
    const stayBase = brief.stayBaseMode === 'known' && brief.stayBase.trim() ? brief.stayBase.trim() : undefined
    const extraNotes = brief.stayBaseMode === 'suggest'
      ? [brief.preferences.extraNotes, `Suggest a suitable stay area/neighbourhood in ${brief.destination.trim()} within budget for this group (search queries only — do not claim availability or prices).`].filter(Boolean).join(' ')
      : brief.preferences.extraNotes

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
      preferences: { ...brief.preferences, extraNotes },
      mode: 'fill_empty',
      today,
      existingDays: [],
      stayBase,
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
      setResult(data.result)
      setIsMock(data.isMock)
      setStage('preview')
    } catch {
      setGenError('Could not reach the server. Check your connection and try again.')
      setStage('review-brief')
    }
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
          const s = brief.stay
          if (s.totalCost || s.name || s.area) {
            extras.push(stripUndefined({
              id: `ai-stay-${Math.random().toString(36).slice(2, 9)}`,
              type: 'hotel',
              category: 'hotel',
              title: s.name ? `Stay: ${s.name}` : `Stay in ${s.area || brief.destination.trim()}`,
              notes: [s.area, s.rooms ? `${s.rooms} room(s)` : '', '(AI Trip Generator · planned stay)'].filter(Boolean).join(' · '),
              time: '',
              cost: s.totalCost || 0,
              estimatedCost: s.totalCost || 0,
              locationName: s.name || s.area || undefined,
              confirmed: false,
              bookingStatus: 'planned' as const,
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
              <Input
                label="Destination *"
                placeholder="e.g. Goa, India"
                value={brief.destination}
                onChange={(e) => { setBrief((p) => ({ ...p, destination: e.target.value })); setBriefErrors((e2) => ({ ...e2, destination: '' })) }}
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

            {/* ── Stay base ─────────────────────────────────────────────── */}
            <div className="rounded-2xl border border-gray-100 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Home size={15} className="text-violet-500" />
                <p className="text-sm font-bold text-gray-800">Where are you staying?</p>
              </div>
              <p className="text-xs text-gray-500">Used as the daily route base when planning your itinerary.</p>
              <div className="space-y-2">
                {([
                  { v: 'known' as StayBaseMode, label: 'I know my hotel / stay location' },
                  { v: 'suggest' as StayBaseMode, label: 'Suggest a good stay area within budget' },
                  { v: 'later' as StayBaseMode, label: 'I\'ll decide later' },
                ]).map((o) => (
                  <button key={o.v} type="button" onClick={() => setBrief((p) => ({ ...p, stayBaseMode: o.v }))}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border-2 text-sm transition-all ${brief.stayBaseMode === o.v ? 'border-violet-500 bg-violet-50 text-violet-700 font-semibold' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    {o.label}
                  </button>
                ))}
              </div>
              {brief.stayBaseMode === 'known' && (
                <Input label="Hotel / homestay / area name" placeholder="e.g. Hotel Sonam Delek, MG Marg" value={brief.stayBase} onChange={(e) => setBrief((p) => ({ ...p, stayBase: e.target.value }))} />
              )}
              {brief.stayBaseMode === 'suggest' && (
                <p className="text-xs text-violet-600">AI will suggest a stay area — we don&apos;t guarantee availability or prices.</p>
              )}
            </div>

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

            {/* ── Transport & stay estimates (optional) ─────────────────── */}
            <div className="rounded-2xl border border-gray-100 p-4 space-y-4">
              <p className="text-sm font-bold text-gray-800">Known bookings (optional)</p>
              <p className="text-xs text-gray-500 -mt-2">Add transport/stay you&apos;ve already arranged. Saved as planned estimates — never as actual expenses.</p>

              <div className="space-y-2">
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Transport to destination</p>
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
                <div className="grid grid-cols-2 gap-2">
                  <Input label="Total cost (optional)" type="number" min="0" placeholder="0" value={brief.transport.totalCost ? String(brief.transport.totalCost) : ''} onChange={(e) => setTransport({ totalCost: parseFloat(e.target.value) || undefined })} />
                  <Input label="Booking ref (optional)" placeholder="PNR / ref" value={brief.transport.bookingRef || ''} onChange={(e) => setTransport({ bookingRef: e.target.value })} />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Accommodation</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input label="Hotel / stay name" placeholder="e.g. Hotel Sonam Delek" value={brief.stay.name || ''} onChange={(e) => setStay({ name: e.target.value })} />
                  <Input label="Area" placeholder="e.g. MG Marg" value={brief.stay.area || ''} onChange={(e) => setStay({ area: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input label="Total stay cost (optional)" type="number" min="0" placeholder="0" value={brief.stay.totalCost ? String(brief.stay.totalCost) : ''} onChange={(e) => setStay({ totalCost: parseFloat(e.target.value) || undefined })} />
                  <Input label="Rooms (optional)" type="number" min="1" placeholder="1" value={brief.stay.rooms ? String(brief.stay.rooms) : ''} onChange={(e) => setStay({ rooms: parseInt(e.target.value) || undefined })} />
                </div>
                {brief.stay.name && brief.stayBaseMode !== 'known' && (
                  <button type="button" onClick={() => setBrief((p) => ({ ...p, stayBaseMode: 'known', stayBase: p.stay.name || p.stay.area || '' }))}
                    className="text-[11px] font-semibold text-violet-600 hover:text-violet-700">
                    Use this stay as the daily route base →
                  </button>
                )}
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
              <p className="text-base font-bold text-gray-900">Generating your itinerary…</p>
              <p className="text-sm text-gray-500 mt-1">
                Creating a {brief.startDate && brief.endDate ? getDayCount(brief.startDate, brief.endDate) : '?'}-day plan
                {brief.destination ? ` for ${brief.destination}` : ''}
              </p>
            </div>
            <p className="text-xs text-gray-400">This usually takes 10–20 seconds</p>
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
                plannedStay: (brief.stay.totalCost || brief.stay.name || brief.stay.area) ? brief.stay : undefined,
                stayBaseLabel: brief.stayBaseMode === 'known' && brief.stayBase.trim() ? brief.stayBase.trim() : undefined,
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
