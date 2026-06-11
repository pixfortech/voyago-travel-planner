'use client'

/**
 * GeneratedItineraryPreview — Phase 15C, upgraded in Phase 15D.
 *
 * Renders the AI-generated plan as an editable preview. Phase 15D additions:
 *  - Optional `autoEnrich`: on mount (when Maps is configured) it resolves every
 *    place against Google Places and route-optimises each day BEFORE the user
 *    sees the final preview — so the preview is real + route-aware by default.
 *  - Per-activity badges: Verified by Google / Unverified / Auto-category.
 *  - Per-day route summary (road distance + travel time + stops + day cost).
 *  - Stale-route tracking: editing a day marks its route stale with a per-day
 *    "Re-optimise" button (we never call Google Routes on every render).
 *  - "Resolve unverified places" button.
 *  - Optional budget split (stay / transport / food / activities / local / buffer)
 *    honouring which categories the user marked as included in the budget.
 *
 * Nothing is saved until the parent's onApply runs.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Sparkles, AlertTriangle, Trash2, RotateCcw, Check, Loader2, MapPin,
  Wallet, Route, Info, ArrowRightLeft, ShieldCheck, ShieldAlert, Home,
  Clock, Navigation2, Mountain, Cloud, Wind, Backpack,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import { formatCurrency, formatDate } from '@/lib/utils'
import { mapPlaceTypesToCategory } from '@/lib/maps/categoryMapping'
import type {
  TripGeneratorResult, GeneratedActivity, ActivityCategory,
  PlaceSearchResult, OptimiseRouteResult, GeneratedDayRoute,
  BudgetInclusion, BudgetCategoryKey, PlannedTransport, PlannedStay,
  ActivityContext, EssentialSuggestion, TimeZoneContext, SuggestedFoodItem,
} from '@/types'
import { getDurationEstimate, buildDayTiming, fmtMins, parseHHMM } from '@/lib/ai/activityDuration'
import type { TimingLeg } from '@/app/api/maps/itinerary-timing/route'
import type { PlaceContextResponse } from '@/app/api/maps/place-context/route'
import { buildContextWarnings, buildEssentialSuggestions, isOutdoorCategory } from '@/lib/context/essentials'
import {
  partitionForOptimise, applyFlexibleOrder, transitionBuffer, isDepartureAnchor,
  validateChronology, anchorKind,
} from '@/lib/ai/routePlanning'
import {
  checkElevationSanity, validateItinerary,
  type ValidationActivity, type DestinationRef,
} from '@/lib/ai/itineraryValidation'
import { validateMealTime, repairMealCategory } from '@/lib/ai/mealTimeSanity'

export interface EditableGeneratedActivity extends GeneratedActivity {
  _key: string
  _removed: boolean
  _lat?: number
  _lng?: number
  _placeId?: string
  _placeAddress?: string
  _placeRating?: number
  _placeUserRatings?: number
  _priceLevel?: number
  _enriched?: boolean        // an enrichment attempt completed
  _autoCategory?: boolean    // category was set from Google place types
  // Phase 16E — timing
  _durationMins?: number
  _plannedStart?: string     // HH:MM computed by timing engine
  _plannedEnd?: string       // HH:MM computed by timing engine
  _travelToNextMins?: number
  _travelToNextMeters?: number
  _travelToNextDistText?: string  // "22 min"
  _travelToNextDistKm?: string    // "8.4 km"
  _travelRouteSource?: 'google_routes' | 'estimate'
  // Phase 16G — group/weather travel buffer (PART 4)
  _travelBufferMins?: number
  _travelBufferNote?: string
  // Phase 16F — location context (elevation / weather / AQI) + derived warnings
  _activityContext?: ActivityContext
  // Phase 16D refinement — keys of suggested food items the user removed (excluded from budget)
  _removedItemKeys?: string[]
  // Hotfix Part 8 — locality/area extracted from Google place address
  _locationContext?: {
    locality?: string   // neighbourhood / area (e.g. "Maidan", "Belur")
    city?: string       // city name (e.g. "Kolkata", "Howrah")
    state?: string      // state abbreviation (e.g. "WB")
  }
  // Hotfix Part 7 — meal-time mismatch warning
  _mealTimeIssue?: string
}
export interface EditableGeneratedDay {
  date: string
  dayNumber: number
  theme?: string
  activities: EditableGeneratedActivity[]
  // Phase 16E — day timing summary
  _timingSummary?: {
    dayStart: string
    dayEnd: string
    activityMins: number
    travelMins: number
    paceWarning?: string
    /** Phase 16G PART 2 — chronology validity + warning. */
    chronoWarning?: string
  }
  // Phase 16F — day-level "what to carry" suggestions
  _essentials?: EssentialSuggestion[]
}

export interface PreviewBudgetContext {
  budget: number
  included: BudgetInclusion
  plannedTransport?: PlannedTransport[]
  plannedStay?: PlannedStay
  stayBaseLabel?: string
}

interface PreviewProps {
  result: TripGeneratorResult
  currency: string
  travellerCount: number
  isMock: boolean
  applying: boolean
  applyNote: string | null
  mapsAvailable: boolean
  applyLabel?: string
  applyingLabel?: string
  /** When true (and Maps configured), enrich + route-optimise before showing the plan. */
  autoEnrich?: boolean
  /** Optional budget split context (new-trip generator). */
  budgetContext?: PreviewBudgetContext
  /** Phase 16G PART 12A — destination centre for boundary/elevation sanity checks. */
  destinationContext?: { city?: string; lat?: number; lng?: number }
  onApply: (days: EditableGeneratedDay[]) => void
  onDiscard: () => void
  onRegenerate: () => void
}

const CATEGORIES: ActivityCategory[] = [
  'sightseeing', 'food', 'hotel', 'transport', 'shopping',
  'adventure', 'spiritual', 'leisure', 'emergency', 'other',
]

const BUDGET_LABELS: Record<BudgetCategoryKey, string> = {
  stay: 'Stay',
  transport_to: 'Transport (to/from)',
  local_transport: 'Local transport',
  food: 'Food',
  activities: 'Activities / tickets',
  shopping: 'Shopping',
  buffer: 'Buffer',
}

function fmtDuration(seconds: number): string {
  const mins = Math.round(seconds / 60)
  if (mins < 1) return '—'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`
}

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000, r = (x: number) => (x * Math.PI) / 180
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

// ── Part 8: locality extraction from Google formattedAddress ─────────────────

const INDIA_STATES = new Set([
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Delhi',
  'Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala',
  'Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland',
  'Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura',
  'Uttar Pradesh','Uttarakhand','West Bengal','Chandigarh','J&K','Jammu and Kashmir',
  'Ladakh',
])

function extractLocality(address?: string): EditableGeneratedActivity['_locationContext'] {
  if (!address) return undefined
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean)
  // Remove India, postcodes (6-digit), and state names from the back.
  const meaningful = parts.filter(
    (p) =>
      !/^India$/i.test(p) &&
      !/^\d{4,}/.test(p) &&
      !INDIA_STATES.has(p) &&
      !p.match(/\d{6}/),
  )
  if (meaningful.length === 0) return undefined
  // Last element is the city; second-to-last is the locality/area.
  const city = meaningful[meaningful.length - 1]
  const locality =
    meaningful.length >= 2 ? meaningful[meaningful.length - 2] : undefined
  // Don't show locality when it repeats the city.
  const area = locality && locality !== city ? locality : undefined
  return { city, locality: area }
}

/** Verification state for a single activity (drives badges + apply gating). */
function verifyState(a: EditableGeneratedActivity): 'verified' | 'unverified' | 'neutral' {
  if (a._enriched && a._placeId) return 'verified'
  if (a.needsVerification || (a._enriched && !a._placeId)) return 'unverified'
  return 'neutral'
}

// ── Phase 16F — compact location-context display ────────────────────────────

/** Colour-band the AQI chip from its category text (scale-agnostic). */
function aqiChipColor(category: string | undefined): string {
  const c = (category ?? '').toLowerCase()
  if (/(severe|hazardous|very poor|bad|unhealthy|poor)/.test(c)) return 'text-red-600'
  if (/(moderate|satisfactory|low|acceptable)/.test(c)) return 'text-amber-600'
  if (/(good|excellent|clean)/.test(c)) return 'text-emerald-600'
  return 'text-gray-500'
}

/** Renders elevation / weather / AQI lines + any context warnings for one activity. */
function ActivityContextLines({ ctx }: { ctx?: ActivityContext }) {
  if (!ctx) return null
  const hasElevation = ctx.elevationMeters != null
  const w = ctx.weatherSnapshot
  const hasWeather = w && w.source !== 'unavailable' && (w.temperatureC != null || w.condition || w.precipitationProbability != null)
  const aqi = ctx.aqiSnapshot
  const hasAqi = aqi && aqi.source !== 'unavailable' && aqi.aqi != null
  const warnings = ctx.contextWarnings ?? []
  if (!hasElevation && !hasWeather && !hasAqi && warnings.length === 0) return null

  return (
    <div className="mt-0.5 space-y-0.5">
      {(hasElevation || hasWeather || hasAqi) && (
        <div className="flex items-center flex-wrap gap-x-2.5 gap-y-0.5 text-[10px] text-gray-500">
          {hasElevation && (
            <span className="inline-flex items-center gap-1">
              <Mountain size={9} className="flex-shrink-0 text-stone-400" />
              {ctx.elevationMeters!.toLocaleString()} m / {ctx.elevationFeet!.toLocaleString()} ft
            </span>
          )}
          {hasWeather && (
            <span className="inline-flex items-center gap-1">
              <Cloud size={9} className="flex-shrink-0 text-sky-400" />
              {w!.temperatureC != null ? `${w!.temperatureC}°C` : ''}
              {w!.temperatureC != null && w!.condition ? ', ' : ''}
              {w!.condition ?? ''}
              {w!.confidence === 'low' ? ' (approx.)' : ''}
            </span>
          )}
          {hasWeather && w!.precipitationProbability != null && w!.precipitationProbability >= 40 && (
            <span className="inline-flex items-center gap-1 text-sky-600">
              <Wind size={9} className="flex-shrink-0" />
              Rain risk: {Math.round(w!.precipitationProbability)}%
            </span>
          )}
          {hasAqi && (
            <span className={`inline-flex items-center gap-1 ${aqiChipColor(aqi!.category)}`}>
              AQI: {aqi!.aqi}{aqi!.category ? ` — ${aqi!.category}` : ''}
            </span>
          )}
        </div>
      )}
      {warnings.map((wn, i) => (
        <div key={i} className="flex items-start gap-1 text-[10px] text-amber-600">
          <AlertTriangle size={9} className="flex-shrink-0 mt-0.5" />
          <span>{wn}</span>
        </div>
      ))}
    </div>
  )
}

/** Day-level "what to carry" suggestions. */
function EssentialsBlock({ essentials }: { essentials?: EssentialSuggestion[] }) {
  if (!essentials || essentials.length === 0) return null
  const priorityColor: Record<EssentialSuggestion['priority'], string> = {
    must_carry: 'text-red-600',
    recommended: 'text-amber-600',
    optional: 'text-gray-500',
  }
  const priorityLabel: Record<EssentialSuggestion['priority'], string> = {
    must_carry: 'Must carry',
    recommended: 'Recommended',
    optional: 'Optional',
  }
  return (
    <div className="mb-2 rounded-lg bg-amber-50/60 border border-amber-100 px-2.5 py-1.5">
      <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 mb-1">
        <Backpack size={11} /> Carry suggestions
      </div>
      <ul className="space-y-0.5">
        {essentials.map((e, i) => (
          <li key={i} className="text-[10px] text-gray-600 leading-snug">
            <span className={`font-semibold ${priorityColor[e.priority]}`}>
              {priorityLabel[e.priority]}:
            </span>{' '}
            <span className="font-medium text-gray-700">{e.item}</span>
            {' — '}{e.reason}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function GeneratedItineraryPreview({
  result, currency, travellerCount, isMock, applying, applyNote, mapsAvailable,
  applyLabel = 'Apply to trip', applyingLabel = 'Applying…',
  autoEnrich = false, budgetContext, destinationContext,
  onApply, onDiscard, onRegenerate,
}: PreviewProps) {
  const [editDays, setEditDays] = useState<EditableGeneratedDay[]>([])
  // Authoritative mirror of editDays, updated synchronously by commitDays so async
  // enrich/optimise loops (and back-to-back edits) always read the latest state.
  const editDaysRef = useRef<EditableGeneratedDay[]>([])

  function commitDays(next: EditableGeneratedDay[]) {
    editDaysRef.current = next
    setEditDays(next)
  }

  const [enriching, setEnriching] = useState(false)
  const [enrichNote, setEnrichNote] = useState<string | null>(null)

  // Per-day road route summaries, keyed by day date.
  const [dayRoutes, setDayRoutes] = useState<Record<string, GeneratedDayRoute>>({})
  const [optimisingDay, setOptimisingDay] = useState<string | null>(null)
  const [optimisingAll, setOptimisingAll] = useState(false)

  // Auto-run guard (enrich + optimise once per result).
  const autoRanForRef = useRef<TripGeneratorResult | null>(null)
  const [autoRunning, setAutoRunning] = useState(false)
  const [timingDone, setTimingDone] = useState(false)
  // Phase 16F — location context enrichment
  const [contextDone, setContextDone] = useState(false)
  const [timeZone, setTimeZone] = useState<TimeZoneContext | null>(null)
  // Phase 16G PART 12A — destination is low-altitude (suppress impossible altitude advice)
  const [lowAltitude, setLowAltitude] = useState(false)
  // Two-step confirm when the itinerary has sanity issues before saving.
  const [confirmSave, setConfirmSave] = useState(false)

  // Rebuild editable state whenever a new result arrives. commitDays keeps the
  // ref in sync synchronously so the auto-run effect sees fresh data.
  useEffect(() => {
    commitDays(result.dayPlans.map((d) => ({
      date: d.date,
      dayNumber: d.dayNumber,
      theme: d.theme,
      activities: d.activities.map((a, i) => ({
        ...a,
        _key: `${d.dayNumber}-${i}-${a.title.slice(0, 6)}`,
        _removed: false,
      })),
    })))
    setDayRoutes({})
    setEnrichNote(null)
    // Phase 16E/16F — reset enrichment flags so a regenerate re-runs cleanly.
    setTimingDone(false)
    setContextDone(false)
    setTimeZone(null)
    setLowAltitude(false)
    setConfirmSave(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  const stats = useMemo(() => {
    let total = 0, count = 0, verified = 0, unverified = 0, withQuery = 0
    for (const d of editDays) {
      for (const a of d.activities) {
        if (a._removed) continue
        total += a.estimatedCost || 0
        count++
        const v = verifyState(a)
        if (v === 'verified') verified++
        else if (v === 'unverified') unverified++
        if (a.suggestedPlaceSearchQuery) withQuery++
      }
    }
    return { total, count, verified, unverified, withQuery, perHead: travellerCount > 0 ? Math.round(total / travellerCount) : total }
  }, [editDays, travellerCount])

  const geocodedCount = useMemo(
    () => editDays.reduce((n, d) => n + d.activities.filter((a) => !a._removed && a._lat != null).length, 0),
    [editDays],
  )

  // ── Editing (marks the affected day's route stale) ────────────────────────

  function markStale(date: string) {
    setDayRoutes((prev) => (prev[date] ? { ...prev, [date]: { ...prev[date]!, stale: true } } : prev))
  }

  function patch(dayDate: string, key: string, updates: Partial<EditableGeneratedActivity>) {
    const next = editDaysRef.current.map((d) => d.date === dayDate ? {
      ...d,
      activities: d.activities.map((a) => a._key === key ? { ...a, ...updates } : a),
    } : d)
    commitDays(next)
    // Coordinate / removal / location changes invalidate the route.
    if ('_lat' in updates || '_lng' in updates || 'locationName' in updates) markStale(dayDate)
  }
  function toggleRemove(dayDate: string, key: string) {
    const next = editDaysRef.current.map((d) => d.date === dayDate ? {
      ...d,
      activities: d.activities.map((a) => a._key === key ? { ...a, _removed: !a._removed } : a),
    } : d)
    commitDays(next)
    markStale(dayDate)
  }
  function moveToDay(fromDate: string, key: string, toDate: string) {
    if (fromDate === toDate) return
    let moving: EditableGeneratedActivity | undefined
    const stripped = editDaysRef.current.map((d) => {
      if (d.date !== fromDate) return d
      moving = d.activities.find((a) => a._key === key)
      return { ...d, activities: d.activities.filter((a) => a._key !== key) }
    })
    if (!moving) return
    const next = stripped.map((d) => d.date === toDate ? { ...d, activities: [...d.activities, moving!] } : d)
    commitDays(next)
    markStale(fromDate)
    markStale(toDate)
  }

  // ── Google Places enrichment ──────────────────────────────────────────────

  /**
   * Enrich activities with Google Places. `onlyUnresolved` limits work to places
   * not yet resolved (used by auto-run and "Resolve unverified"). Returns counts.
   * Operates on the latest state via a functional snapshot.
   */
  async function enrichPlaces(onlyUnresolved: boolean): Promise<{ done: number; failed: number; unavailable: boolean }> {
    const base = editDaysRef.current
    const targets: { date: string; key: string; query: string }[] = []
    for (const d of base) {
      for (const a of d.activities) {
        if (a._removed || !a.suggestedPlaceSearchQuery) continue
        if (onlyUnresolved && a._placeId) continue       // already verified
        if (onlyUnresolved && a._enriched && !a.needsVerification) continue
        targets.push({ date: d.date, key: a._key, query: a.suggestedPlaceSearchQuery })
      }
    }

    // Accumulate updates into a map and commit once at the end.
    const updates = new Map<string, Partial<EditableGeneratedActivity>>()
    let done = 0, failed = 0, unavailable = false
    const MAX = 26
    let processed = 0
    for (const t of targets) {
      if (processed >= MAX) break
      processed++
      try {
        const res = await fetch('/api/maps/places/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: t.query }),
        })
        if (res.status === 503) { unavailable = true; break }
        if (!res.ok) { failed++; continue }
        const data = await res.json() as { results: PlaceSearchResult[] }
        const top = data.results?.[0]
        if (top) {
          const refinedCat = top.types?.length ? mapPlaceTypesToCategory(top.types) : undefined
          const update: Partial<EditableGeneratedActivity> = {
            _lat: top.lat,
            _lng: top.lng,
            _placeId: top.placeId,
            _placeAddress: top.address || undefined,
            _placeRating: top.rating,
            _placeUserRatings: top.userRatingsTotal,
            _priceLevel: top.priceLevel,
            _enriched: true,
            needsVerification: undefined,   // resolved
            locationName: top.name,
            // Part 8: extract locality/city from the formatted address.
            _locationContext: extractLocality(top.address),
          }
          if (refinedCat && refinedCat !== 'other') { update.category = refinedCat; update._autoCategory = true }
          updates.set(t.key, update)
          done++
        } else {
          updates.set(t.key, { _enriched: true }) // attempted, unmatched → stays unverified
        }
      } catch {
        failed++
      }
    }

    if (updates.size > 0) {
      const next = editDaysRef.current.map((d) => ({
        ...d,
        activities: d.activities.map((a) => updates.has(a._key) ? { ...a, ...updates.get(a._key)! } : a),
      }))
      commitDays(next)
    }
    return { done, failed, unavailable }
  }

  async function handleEnrich(onlyUnverified = false) {
    setEnriching(true)
    setEnrichNote(null)
    const { done, failed, unavailable } = await enrichPlaces(onlyUnverified)
    setEnriching(false)
    if (unavailable) {
      setEnrichNote('Google Places is not configured — places shown are AI suggestions and remain unverified.')
    } else {
      setEnrichNote(
        done > 0
          ? `Verified ${done} place${done === 1 ? '' : 's'} with Google.${failed ? ` ${failed} could not be matched.` : ''}`
          : 'No new places could be matched right now.',
      )
    }
  }

  // ── Per-day route optimisation ────────────────────────────────────────────

  /**
   * Optimise ONE day (PART 1). Splits the day into fixed anchors (arrival /
   * departure / transfer / hotel) and flexible stops; only the flexible stops
   * are reordered, routed FROM the bounding arrival/hotel anchor and TO the
   * bounding departure/hotel anchor. After reordering, timing is recalculated
   * (PART 11 — never leave stale timing). Returns the day's optimise status.
   */
  async function optimiseDay(date: string, silent = false): Promise<void> {
    if (!silent) setOptimisingDay(date)
    const day = editDaysRef.current.find((d) => d.date === date)
    if (!day) { if (!silent) setOptimisingDay(null); return }

    const active = day.activities.filter((a) => !a._removed)
    const part = partitionForOptimise(active)
    const byKey = new Map(active.map((a) => [a._key, a]))

    // Fewer than 2 flexible stops — nothing to reorder, but still (re)compute
    // timing so planned times stay correct and chronological.
    if (part.flexibleKeys.length < 2) {
      const geocoded = active.filter((a) => a._lat != null && a._lng != null).length
      setDayRoutes((prev) => ({
        ...prev,
        [date]: { stops: geocoded, distanceKm: prev[date]?.distanceKm ?? 0, durationText: prev[date]?.durationText ?? '—', method: prev[date]?.method ?? 'road', stale: false, optimiseStatus: 'optimised', timingsUpdated: true },
      }))
      if (!silent) { await enrichTiming(); setOptimisingDay(null) }
      return
    }

    // Build the point list: bounding start anchor + flexible stops + bounding end anchor.
    const points: Array<{ id: string; name: string; lat: number; lng: number }> = []
    if (part.boundaryStart) points.push({ id: '__start__', name: part.boundaryStart.title, lat: part.boundaryStart._lat!, lng: part.boundaryStart._lng! })
    for (const k of part.flexibleKeys) {
      const a = byKey.get(k)!
      points.push({ id: a._key, name: a.title, lat: a._lat!, lng: a._lng! })
    }
    if (part.boundaryEnd) points.push({ id: '__end__', name: part.boundaryEnd.title, lat: part.boundaryEnd._lat!, lng: part.boundaryEnd._lng! })

    const keepLastFixed = !!part.boundaryEnd

    let summary: GeneratedDayRoute
    try {
      const res = await fetch('/api/maps/route/optimise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points, travelMode: 'driving', mode: 'fastest', keepFirstFixed: true, keepLastFixed }),
      })

      let rankedFlexible: string[]

      if (res.status === 503 || !res.ok) {
        // Haversine nearest-neighbour fallback over the flexible stops only.
        rankedFlexible = haversineOrderFlexible(points, part.flexibleKeys)
        let optM = 0
        const seq = rankedFlexible.map((k) => points.find((p) => p.id === k)!)
        for (let i = 0; i < seq.length - 1; i++) optM += haversine(seq[i]!, seq[i + 1]!)
        summary = { stops: part.flexibleKeys.length, distanceKm: Math.round(optM / 100) / 10, durationText: '—', method: 'haversine', stale: false, optimiseStatus: 'fallback', timingsUpdated: true }
      } else {
        const data = await res.json() as OptimiseRouteResult
        rankedFlexible = data.optimisedOrder.filter((id) => id !== '__start__' && id !== '__end__')
        summary = {
          stops: part.flexibleKeys.length,
          distanceKm: Math.round(data.optimisedRouteDistanceMeters / 100) / 10,
          durationText: fmtDuration(data.optimisedRouteDurationSeconds),
          method: 'road',
          stale: false,
          optimiseStatus: 'optimised',
          timingsUpdated: true,
        }
      }

      // Apply the new flexible order, leaving anchors in their fixed positions.
      const next = editDaysRef.current.map((d) =>
        d.date === date ? { ...d, activities: applyFlexibleOrder(d.activities, rankedFlexible) } : d,
      )
      commitDays(next)
      setDayRoutes((prev) => ({ ...prev, [date]: summary }))
      // PART 11 — recompute timing so the new order's times are correct, never stale.
      if (!silent) await enrichTiming()
    } catch {
      // Optimisation could not run — keep the original order and say so (PART 11).
      setDayRoutes((prev) => ({
        ...prev,
        [date]: { stops: part.flexibleKeys.length, distanceKm: prev[date]?.distanceKm ?? 0, durationText: prev[date]?.durationText ?? '—', method: 'haversine', stale: false, optimiseStatus: 'failed', timingsUpdated: false },
      }))
    } finally {
      if (!silent) setOptimisingDay(null)
    }
  }

  /** Nearest-neighbour order of flexible keys starting after the bounding start. */
  function haversineOrderFlexible(
    points: Array<{ id: string; lat: number; lng: number }>,
    flexibleKeys: string[],
  ): string[] {
    const flex = flexibleKeys.map((k) => points.find((p) => p.id === k)!).filter(Boolean)
    const start = points.find((p) => p.id === '__start__') ?? flex[0]!
    const order: typeof flex = []
    const used = new Set<string>()
    let cur = start
    while (order.length < flex.length) {
      let best: (typeof flex)[number] | null = null
      let bestD = Infinity
      for (const p of flex) {
        if (used.has(p.id)) continue
        const d = haversine(cur, p)
        if (d < bestD) { bestD = d; best = p }
      }
      if (!best) break
      order.push(best); used.add(best.id); cur = best
    }
    return order.map((p) => p.id)
  }

  async function optimiseAllDays() {
    setOptimisingAll(true)
    const dates = editDaysRef.current
      .filter((d) => d.activities.filter((a) => !a._removed && a._lat != null).length >= 2)
      .map((d) => d.date)
    for (const date of dates) await optimiseDay(date, true)
    setOptimisingAll(false)
  }

  // ── Phase 16E: timing enrichment ─────────────────────────────────────────────

  /**
   * For each day, compute: (a) duration per activity via category defaults +
   * AI timeToSpend, and (b) travel time to the next geocoded stop via
   * /api/maps/itinerary-timing (Google Routes) or haversine fallback.
   * Then thread start/end times through buildDayTiming().
   */
  async function enrichTiming(): Promise<void> {
    const base = editDaysRef.current

    // Build per-day point lists for the server (geocoded activities only).
    const dayInputs: Array<{ date: string; points: Array<{ key: string; name: string; lat: number; lng: number }> }> = []
    for (const d of base) {
      const pts = d.activities
        .filter((a) => !a._removed && a._lat != null && a._lng != null)
        .map((a) => ({ key: a._key, name: a.title, lat: a._lat!, lng: a._lng! }))
      if (pts.length >= 2) dayInputs.push({ date: d.date, points: pts })
    }

    // Fetch Google leg timings; fall back to haversine if unavailable.
    let serverLegs: TimingLeg[] = []
    let usedGoogle = false
    if (mapsAvailable && dayInputs.length > 0) {
      try {
        const res = await fetch('/api/maps/itinerary-timing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days: dayInputs, travelMode: 'driving' }),
        })
        if (res.ok) {
          const data = await res.json() as { available: boolean; legs: TimingLeg[] }
          if (data.available) { serverLegs = data.legs; usedGoogle = true }
        }
      } catch { /* fall through to haversine */ }
    }

    // Build a leg lookup: key = "fromKey" → travel info.
    // For missing legs (server didn't return or not enough points), use haversine.
    const legLookup = new Map<string, { travelMins: number; distMeters: number; distText: string; durationText: string; source: 'google_routes' | 'estimate' }>()
    for (const l of serverLegs) {
      legLookup.set(l.fromKey, {
        travelMins: Math.round(l.durationSeconds / 60),
        distMeters: l.distanceMeters,
        distText: l.distanceText,
        durationText: l.durationText,
        source: 'google_routes',
      })
    }

    // Haversine fallback for pairs that Google didn't return.
    // India urban average speed: 25 km/h for mountain/city.
    const URBAN_KMH = 25
    for (const d of base) {
      const geocoded = d.activities.filter((a) => !a._removed && a._lat != null && a._lng != null)
      for (let i = 0; i < geocoded.length - 1; i++) {
        const a = geocoded[i]!
        if (legLookup.has(a._key)) continue  // already have Google data
        const b = geocoded[i + 1]!
        const distM = haversine({ lat: a._lat!, lng: a._lng! }, { lat: b._lat!, lng: b._lng! })
        const distKm = distM / 1000
        const mins = Math.max(1, Math.round(distKm / URBAN_KMH * 60))
        const distText = distKm >= 1 ? `${distKm.toFixed(1)} km` : `${Math.round(distM)} m`
        legLookup.set(a._key, {
          travelMins: mins,
          distMeters: Math.round(distM),
          distText,
          durationText: fmtMins(mins),
          source: 'estimate',
        })
      }
    }

    // Now build per-day timing and patch all activities.
    const next = base.map((d) => {
      const active = d.activities.filter((a) => !a._removed)
      if (active.length === 0) return d

      // Day start (stable under re-optimisation): if the day opens with a fixed
      // anchor that has a time (e.g. an arrival), start there; otherwise 09:00.
      // Using a stable anchor avoids the start time drifting each re-optimise.
      const firstActive = active[0]
      const leadAnchorMins = firstActive && anchorKind(firstActive) !== null
        ? parseHHMM(firstActive.startTime)
        : null
      const dayStartMins = leadAnchorMins ?? 9 * 60

      // Compute duration for each activity.
      const withDuration = active.map((a) => ({
        key: a._key,
        durationMins: getDurationEstimate(a.category, a.title, a.timeToSpend, a.mealType).minutes,
        isBase: a.category === 'hotel',
      }))

      // PART 4 — apply group-size / weather buffers per transition. The buffer is
      // threaded into the timing so planned times are realistic, and surfaced for
      // display. Rain risk is read from the activity's already-fetched context.
      const bufferByKey = new Map<string, { mins: number; note: string | null }>()
      for (let i = 0; i < active.length - 1; i++) {
        const a = active[i]!
        const nextAct = active[i + 1]!
        const leg = legLookup.get(a._key)
        if (!leg) continue
        const rain = a._activityContext?.weatherSnapshot?.precipitationProbability
          ?? nextAct._activityContext?.weatherSnapshot?.precipitationProbability
        const buf = transitionBuffer({
          travellerCount,
          rainProbability: rain,
          toDeparture: isDepartureAnchor(nextAct),
        })
        const inflated = Math.round(leg.travelMins * buf.weatherMultiplier) + buf.groupBufferMins
        const bufferMins = Math.max(0, inflated - leg.travelMins)
        bufferByKey.set(a._key, { mins: bufferMins, note: buf.note })
      }

      // Build leg list for the timing engine (base travel + buffer).
      const legList = active.map((a) => {
        const l = legLookup.get(a._key)
        const buf = bufferByKey.get(a._key)?.mins ?? 0
        return { fromKey: a._key, travelMins: (l?.travelMins ?? 0) + buf }
      })

      const { timings, summary } = buildDayTiming(withDuration, legList, dayStartMins)
      const timingByKey = new Map(timings.map((t) => [t.key, t]))

      // Patch activities. Sync the editable startTime/endTime to the COMPUTED
      // schedule so the visible order can never show a later card with an
      // earlier time (PART 2).
      const patchedActivities = d.activities.map((a) => {
        const t = timingByKey.get(a._key)
        const leg = legLookup.get(a._key)
        const buf = bufferByKey.get(a._key)
        const totalTravel = leg ? leg.travelMins + (buf?.mins ?? 0) : undefined
        return {
          ...a,
          _durationMins: t?.durationMins,
          _plannedStart: t?.plannedStart,
          _plannedEnd: t?.plannedEnd,
          // Keep the editable fields consistent with the computed timeline.
          startTime: !a._removed && t?.plannedStart ? t.plannedStart : a.startTime,
          endTime: !a._removed && t?.plannedEnd ? t.plannedEnd : a.endTime,
          _travelToNextMins: totalTravel,
          _travelToNextMeters: leg?.distMeters,
          _travelToNextDistText: totalTravel != null ? fmtMins(totalTravel) : leg?.durationText,
          _travelToNextDistKm: leg?.distText,
          _travelRouteSource: leg?.source,
          _travelBufferMins: buf?.mins,
          _travelBufferNote: buf?.note ?? undefined,
        }
      })

      // PART 2 — validate chronology of the computed schedule.
      const chrono = validateChronology(patchedActivities)
      const chronoWarning = chrono.ok ? undefined : 'Timing needs review — route order may be inaccurate.'

      // Part 7 — meal-time sanity: annotate mismatches and auto-repair the label.
      const repairedActivities = patchedActivities.map((a) => {
        if (a._removed || a.category !== 'food' || !a.mealType) return a
        const time = a._plannedStart ?? a.startTime
        const issue = validateMealTime(a.mealType, time)
        if (!issue) return { ...a, _mealTimeIssue: undefined }
        // Auto-repair: update the mealType so the title label is correct.
        const repairedMeal = repairMealCategory(a.mealType, time)
        return {
          ...a,
          mealType: repairedMeal as typeof a.mealType,
          _mealTimeIssue: issue.message,
        }
      })

      return {
        ...d,
        activities: repairedActivities,
        _timingSummary: {
          dayStart: summary.dayStart,
          dayEnd: summary.dayEnd,
          activityMins: summary.activityMins,
          travelMins: summary.travelMins,
          paceWarning: summary.paceWarning,
          chronoWarning,
        },
      }
    })

    commitDays(next)
    setTimingDone(true)
    void usedGoogle // suppress unused warning
  }

  // ── Phase 16F: location context enrichment ───────────────────────────────────

  /**
   * For each geocoded activity, fetch elevation / weather (for the day's date) /
   * AQI via /api/maps/place-context, then derive per-activity warnings and a
   * per-day "what to carry" list. Fails soft: any unavailable field is simply
   * not shown, and a total failure leaves the plan untouched.
   */
  async function enrichContext(): Promise<void> {
    if (!mapsAvailable) { setContextDone(true); return }
    const base = editDaysRef.current

    // Collect geocoded points with their planned date (for weather matching).
    const points: Array<{ key: string; lat: number; lng: number; date?: string }> = []
    let destination: { lat: number; lng: number } | undefined
    for (const d of base) {
      for (const a of d.activities) {
        if (a._removed || a._lat == null || a._lng == null) continue
        points.push({ key: a._key, lat: a._lat, lng: a._lng, date: d.date })
        if (!destination) destination = { lat: a._lat, lng: a._lng }
      }
    }
    if (points.length === 0) { setContextDone(true); return }

    let data: PlaceContextResponse | null = null
    try {
      const res = await fetch('/api/maps/place-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points, destination }),
      })
      if (res.ok) data = await res.json() as PlaceContextResponse
    } catch { /* leave plan untouched on failure */ }

    if (!data || !data.available) { setContextDone(true); return }
    if (data.timeZone) setTimeZone(data.timeZone)

    const ctxByKey = new Map(data.contexts.map((c) => [c.key, c]))
    const enrichedAt = new Date().toISOString()

    // PART 12A — elevation sanity across the whole itinerary. A low-altitude
    // destination (e.g. Kolkata) must not carry high-altitude warnings; outlier
    // elevations are suspect bad geocodes.
    const validationActs: ValidationActivity[] = []
    for (const d of base) {
      for (const a of d.activities) {
        const c = ctxByKey.get(a._key)
        validationActs.push({
          _key: a._key, title: a.title, category: a.category, _removed: a._removed,
          _lat: a._lat, _lng: a._lng, _elevationFeet: c?.elevationFeet,
        })
      }
    }
    const elev = checkElevationSanity(validationActs)
    setLowAltitude(elev.lowAltitude)

    const next = base.map((d) => {
      const dayContexts: ActivityContext[] = []
      const activities = d.activities.map((a) => {
        const c = ctxByKey.get(a._key)
        if (!c) return a
        const context: ActivityContext = {
          elevationMeters: c.elevationMeters,
          elevationFeet: c.elevationFeet,
          elevationSource: c.elevationSource,
          elevationConfidence: c.elevationConfidence,
          weatherSnapshot: c.weatherSnapshot,
          aqiSnapshot: c.aqiSnapshot,
          timeZoneContext: data!.timeZone,
          enrichedAt,
        }
        let warnings = buildContextWarnings(context, isOutdoorCategory(a.category))
        // Suppress impossible high-altitude warnings for a low-altitude city.
        if (elev.lowAltitude) warnings = warnings.filter((w) => !/elevation|altitude/i.test(w))
        if (warnings.length > 0) context.contextWarnings = warnings
        if (!a._removed) dayContexts.push(context)
        return { ...a, _activityContext: context }
      })
      let essentials = buildEssentialSuggestions(dayContexts)
      if (elev.lowAltitude) essentials = essentials.filter((e) => e.category !== 'altitude')
      return {
        ...d,
        activities,
        ...(essentials.length > 0 ? { _essentials: essentials } : {}),
      }
    })

    commitDays(next)
    setContextDone(true)
  }

  // ── Auto-run: enrich + optimise before the final preview ──────────────────
  //
  // React 18 Strict Mode double-invokes effects: cleanup fires between run 1
  // and run 2. Run 2 exits via the autoRanForRef guard. Run 1's async must
  // still clear loading state — so all setX(false) calls go in a finally
  // block that is never gated on `cancelled`. `cancelled` is only used to
  // skip expensive follow-on network work (route optimisation).

  useEffect(() => {
    if (!autoEnrich || !mapsAvailable) return
    if (autoRanForRef.current === result) return
    autoRanForRef.current = result
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const clearLoading = () => {
      setAutoRunning(false)
      setEnriching(false)
      setOptimisingAll(false)
    }

    // Safety net: clear loading state after 30 s no matter what.
    timeoutId = setTimeout(clearLoading, 30_000)

    ;(async () => {
      try {
        setAutoRunning(true)
        setEnriching(true)
        const r = await enrichPlaces(true)
        setEnriching(false)
        if (r.unavailable) {
          setEnrichNote('Google Places is not configured — places shown are AI suggestions and remain unverified.')
          return
        }
        setEnrichNote(r.done > 0 ? `Auto-verified ${r.done} place${r.done === 1 ? '' : 's'} with Google.` : 'Could not match places automatically — try “Resolve unverified”.')
        // Skip route optimisation if the effect was already cleaned up.
        // Order: optimise → context (weather/elevation) → timing. Timing runs
        // last so its buffers can use the fetched rain risk (PART 4).
        if (!cancelled) await optimiseAllDays()
        if (!cancelled) await enrichContext()
        if (!cancelled) await enrichTiming()
      } catch {
        // swallow; loading state is cleared in finally regardless
      } finally {
        if (timeoutId != null) clearTimeout(timeoutId)
        clearLoading()
      }
    })()

    return () => {
      cancelled = true
      if (timeoutId != null) clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, autoEnrich, mapsAvailable])

  // ── Budget split (new-trip generator) ─────────────────────────────────────

  const budgetSplit = useMemo(() => {
    if (!budgetContext) return null
    const inc = budgetContext.included
    // Category buckets from activities.
    let food = 0, shopping = 0, local = 0, activities = 0, stayFromActs = 0
    for (const d of editDays) {
      for (const a of d.activities) {
        if (a._removed) continue
        const cost = a.estimatedCost || 0
        switch (a.category) {
          case 'food': food += cost; break
          case 'shopping': shopping += cost; break
          case 'transport': local += cost; break
          case 'hotel': stayFromActs += cost; break
          default: activities += cost
        }
      }
    }
    const plannedStayCost = budgetContext.plannedStay?.totalCost ?? 0
    const plannedTransportCost = (budgetContext.plannedTransport ?? []).reduce((s, t) => s + (t.totalCost ?? 0), 0)

    const rows: { key: BudgetCategoryKey; label: string; amount: number; included: boolean }[] = [
      { key: 'stay', label: BUDGET_LABELS.stay, amount: plannedStayCost + stayFromActs, included: !!inc.stay },
      { key: 'transport_to', label: BUDGET_LABELS.transport_to, amount: plannedTransportCost, included: !!inc.transport_to },
      { key: 'local_transport', label: BUDGET_LABELS.local_transport, amount: local, included: !!inc.local_transport },
      { key: 'food', label: BUDGET_LABELS.food, amount: food, included: !!inc.food },
      { key: 'activities', label: BUDGET_LABELS.activities, amount: activities, included: !!inc.activities },
      { key: 'shopping', label: BUDGET_LABELS.shopping, amount: shopping, included: !!inc.shopping },
    ]
    // Only count included categories against the budget.
    const includedTotal = rows.filter((r) => r.included).reduce((s, r) => s + r.amount, 0)
    const budget = budgetContext.budget
    const remaining = budget > 0 ? budget - includedTotal : 0
    const overBudget = budget > 0 && includedTotal > budget
    return { rows, includedTotal, budget, remaining, overBudget, perHead: travellerCount > 0 ? Math.round(includedTotal / travellerCount) : includedTotal }
  }, [budgetContext, editDays, travellerCount])

  // ── Apply ──────────────────────────────────────────────────────────────────

  const hasUnverified = stats.unverified > 0

  function handleApplyClick() {
    // PART 12A — never silently save an itinerary with sanity issues. Require a
    // second, explicit confirmation when review is needed.
    if (validation.needsReview && !confirmSave) {
      setConfirmSave(true)
      return
    }
    const cleaned = editDays
      .map((d) => ({ ...d, activities: d.activities.filter((a) => !a._removed) }))
      .filter((d) => d.activities.length > 0)
    onApply(cleaned)
  }

  const anyStale = useMemo(
    () => Object.values(dayRoutes).some((r) => r.stale),
    [dayRoutes],
  )
  const busy = enriching || optimisingAll || optimisingDay != null || autoRunning

  // ── PART 12A — final sanity validation (boundary / elevation / chronology /
  // route-status / departure-day). Gates "Create Trip" when issues exist. ─────
  const validation = useMemo(() => {
    const activities: ValidationActivity[] = []
    let chronoIssueCount = 0
    let departureConflict: string | null = null

    for (const d of editDays) {
      if (d._timingSummary?.chronoWarning) chronoIssueCount++
      for (const a of d.activities) {
        activities.push({
          _key: a._key, title: a.title, category: a.category, _removed: a._removed,
          _lat: a._lat, _lng: a._lng, _placeId: a._placeId, _enriched: a._enriched,
          _elevationFeet: a._activityContext?.elevationFeet,
        })
      }
    }

    // Departure-day conflict (PART 6): on the last day, a flexible stop must not
    // run up against the departure time without a safe pre-departure buffer.
    const lastDay = editDays[editDays.length - 1]
    if (lastDay) {
      const acts = lastDay.activities.filter((a) => !a._removed)
      const depIdx = acts.findIndex((a) => anchorKind(a) === 'departure')
      if (depIdx >= 0) {
        const dep = acts[depIdx]!
        const depMins = parseHHMM(dep._plannedStart ?? dep.startTime)
        if (depMins != null) {
          // Any non-anchor stop ending within 45 min of departure is too tight.
          for (const a of acts) {
            if (anchorKind(a) !== null) continue
            const end = parseHHMM(a._plannedEnd ?? a.endTime)
            if (end != null && end > depMins - 45) {
              departureConflict = 'Departure day is tight — a stop runs too close to your train/flight. Remove a stop or leave earlier.'
              break
            }
          }
          // A flexible stop scheduled AFTER the departure is always a conflict.
          for (let i = depIdx + 1; i < acts.length; i++) {
            if (anchorKind(acts[i]!) === null) {
              departureConflict = 'A sightseeing stop is scheduled after your departure — reorder or remove it.'
              break
            }
          }
        }
      }
    }

    const routeOptimiseFailed = Object.values(dayRoutes).some((r) => r.optimiseStatus === 'failed')

    // Part 7 + Part 10 — count meal-time mismatches.
    let mealTimeMismatchCount = 0
    for (const d of editDays) {
      for (const a of d.activities) {
        if (!a._removed && a._mealTimeIssue) mealTimeMismatchCount++
      }
    }

    const dest: DestinationRef = {
      city: destinationContext?.city,
      lat: destinationContext?.lat,
      lng: destinationContext?.lng,
    }
    return validateItinerary({
      activities, destination: dest, chronologyIssueCount: chronoIssueCount,
      routeOptimiseFailed, departureConflict, mealTimeMismatchCount,
    })
  }, [editDays, dayRoutes, destinationContext])

  const c = result.comfortSummary

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl p-4 sm:p-5 border-2 border-violet-100 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-violet-500" />
          <h2 className="text-sm font-bold text-gray-900">Generated plan (preview)</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
            result.confidence === 'high' ? 'bg-emerald-100 text-emerald-700' :
            result.confidence === 'medium' ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {result.confidence} confidence
          </span>
          {isMock && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Development Mock</span>}
        </div>
      </div>

      <p className="text-xs text-gray-600 mb-1">{result.tripSummary}</p>
      <p className="text-[11px] text-amber-600 mb-3 flex items-start gap-1.5">
        <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" /> {result.approximateLabel}
      </p>

      {/* Stay base */}
      {budgetContext?.stayBaseLabel && (
        <div className="mb-3 flex items-center gap-2 text-[11px] text-gray-600 bg-violet-50/60 border border-violet-100 rounded-xl px-3 py-2">
          <Home size={13} className="text-violet-500 flex-shrink-0" />
          <span>Daily routes start &amp; end near <strong>{budgetContext.stayBaseLabel}</strong>.</span>
        </div>
      )}

      {/* Auto-run banner */}
      {autoRunning && (
        <div className="mb-3 flex items-center gap-2 text-[11px] text-sky-700 bg-sky-50 border border-sky-100 rounded-xl px-3 py-2">
          <Loader2 size={13} className="animate-spin flex-shrink-0" />
          Verifying places with Google &amp; optimising daily routes…
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <SummaryCard icon={<Wallet size={13} />} label="Total est." value={formatCurrency(stats.total, currency)} tone="primary" />
        <SummaryCard icon={<Wallet size={13} />} label="Per head" value={formatCurrency(stats.perHead, currency)} tone="violet" />
        <SummaryCard icon={<ShieldCheck size={13} />} label="Verified" value={`${stats.verified}/${stats.count}`} tone={stats.verified > 0 ? 'emerald' : 'amber'} />
        <SummaryCard icon={<Route size={13} />} label="Pace risk" value={c.paceRisk} tone={c.paceRisk === 'high' ? 'amber' : 'emerald'} />
      </div>

      {/* Budget split (new-trip generator) */}
      {budgetSplit && (
        <div className="mb-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3">
          <p className="text-[11px] font-bold text-gray-600 mb-2 flex items-center gap-1"><Wallet size={12} /> Budget split</p>
          <div className="space-y-1">
            {budgetSplit.rows.map((r) => (
              <div key={r.key} className="flex items-center justify-between text-[11px]">
                <span className={r.included ? 'text-gray-700' : 'text-gray-400 line-through'}>
                  {r.label}{!r.included && ' (excluded)'}
                </span>
                <span className={r.included ? 'font-semibold text-gray-800' : 'text-gray-400'}>
                  {r.amount > 0 ? formatCurrency(r.amount, currency) : '—'}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-gray-200 flex items-center justify-between text-[11px]">
            <span className="font-bold text-gray-700">Planned (included only)</span>
            <span className="font-black text-gray-900">{formatCurrency(budgetSplit.includedTotal, currency)}</span>
          </div>
          {budgetSplit.budget > 0 && (
            <div className="mt-1 flex items-center justify-between text-[11px]">
              <span className="text-gray-500">{budgetSplit.overBudget ? 'Over budget by' : 'Remaining buffer'}</span>
              <span className={`font-semibold ${budgetSplit.overBudget ? 'text-amber-600' : 'text-emerald-600'}`}>
                {formatCurrency(Math.abs(budgetSplit.remaining), currency)}
              </span>
            </div>
          )}
          <p className="mt-1 text-[10px] text-gray-400">Per head (included) ≈ {formatCurrency(budgetSplit.perHead, currency)}. Excluded categories aren&apos;t compared against the budget.</p>
        </div>
      )}

      {/* Warnings */}
      {result.warnings.map((w, i) => (
        <p key={i} className="text-[11px] text-amber-600 flex items-center gap-1 mb-0.5"><AlertTriangle size={10} /> {w}</p>
      ))}
      {result.assumptions.length > 0 && (
        <p className="text-[11px] text-gray-400 mb-2 flex items-start gap-1"><Info size={10} className="mt-0.5" /> {result.assumptions.join(' · ')}</p>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 my-3 p-3 bg-gray-50 rounded-xl">
        <Button size="sm" variant="secondary" onClick={() => handleEnrich(false)} disabled={busy || stats.withQuery === 0 || !mapsAvailable}>
          {enriching ? <Loader2 size={13} className="animate-spin" /> : <MapPin size={13} />}
          {enriching ? 'Verifying…' : 'Verify all with Google'}
        </Button>
        {hasUnverified && (
          <Button size="sm" variant="secondary" onClick={() => handleEnrich(true)} disabled={busy || !mapsAvailable}>
            <ShieldAlert size={13} /> Resolve unverified ({stats.unverified})
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={optimiseAllDays} disabled={busy || geocodedCount < 2 || !mapsAvailable}>
          {optimisingAll ? <Loader2 size={13} className="animate-spin" /> : <Route size={13} />}
          {optimisingAll ? 'Optimising…' : anyStale ? 'Re-optimise routes' : 'Optimise routes'}
        </Button>
        {!mapsAvailable && <span className="text-[11px] text-gray-400">Google Maps not configured — places stay unverified and routes can&apos;t be computed.</span>}
        {geocodedCount > 0 && <span className="text-[11px] text-emerald-600 font-semibold">{geocodedCount} place(s) located</span>}
      </div>
      {enrichNote && <p className="text-[11px] text-gray-500 mb-2 flex items-center gap-1"><Info size={11} /> {enrichNote}</p>}
      {/* Phase 16F — show time zone only when it differs from India (avoids clutter). */}
      {timeZone?.timeZoneId && timeZone.timeZoneId !== 'Asia/Kolkata' && (
        <p className="text-[11px] text-gray-500 mb-2 flex items-center gap-1">
          <Clock size={11} /> Destination time zone: {timeZone.timeZoneName ?? timeZone.timeZoneId}
        </p>
      )}

      {/* Day-by-day editable plan */}
      <div className="space-y-4">
        {editDays.map((d) => {
          const dayCost = d.activities.filter((a) => !a._removed).reduce((s, a) => s + (a.estimatedCost || 0), 0)
          const r = dayRoutes[d.date]
          const dayGeocoded = d.activities.filter((a) => !a._removed && a._lat != null).length
          return (
            <div key={d.date} className="border border-gray-100 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <p className="text-xs font-bold text-gray-800">Day {d.dayNumber} · {formatDate(d.date)}</p>
                  {d.theme && <p className="text-[11px] text-gray-400">{d.theme}</p>}
                </div>
                <span className="text-[11px] text-gray-500 font-semibold">{formatCurrency(dayCost, currency)}</span>
              </div>

              {/* Per-day route summary */}
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mb-2 text-[11px]">
                {r ? (
                  <>
                    <span className={`inline-flex items-center gap-1 font-semibold ${r.stale ? 'text-amber-600' : 'text-sky-700'}`}>
                      <Route size={11} /> {r.stops} stops · ≈ {r.distanceKm} km{r.durationText !== '—' ? ` · ${r.durationText}` : ''}
                    </span>
                    <span className="text-[10px] text-gray-400">{r.method === 'road' ? 'road' : 'straight-line'}</span>
                    {!r.stale && r.optimiseStatus === 'optimised' && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-600"><Check size={9} /> Route optimised{r.timingsUpdated ? ' — timings updated' : ''}</span>
                    )}
                    {!r.stale && r.optimiseStatus === 'fallback' && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600"><Info size={9} /> Optimised (straight-line) — timings updated</span>
                    )}
                    {!r.stale && r.optimiseStatus === 'failed' && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500"><AlertTriangle size={9} /> Route optimisation unavailable — using original order</span>
                    )}
                    {r.stale && (
                      <button onClick={() => optimiseDay(d.date)} disabled={busy || dayGeocoded < 2}
                        className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50">
                        {optimisingDay === d.date ? <Loader2 size={9} className="animate-spin" /> : <RotateCcw size={9} />} Re-optimise
                      </button>
                    )}
                  </>
                ) : dayGeocoded >= 2 && mapsAvailable ? (
                  <button onClick={() => optimiseDay(d.date)} disabled={busy}
                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-600 hover:bg-sky-100 disabled:opacity-50">
                    {optimisingDay === d.date ? <Loader2 size={9} className="animate-spin" /> : <Route size={9} />} Optimise day route
                  </button>
                ) : null}
              </div>

              {/* Phase 16E — day timing summary */}
              {d._timingSummary && (
                <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mb-2 text-[11px] text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    <Clock size={11} className="text-violet-400" />
                    Activities: {fmtMins(d._timingSummary.activityMins)}
                  </span>
                  {d._timingSummary.travelMins > 0 && (
                    <span>Travel: {fmtMins(d._timingSummary.travelMins)}</span>
                  )}
                  <span className="font-semibold">Est. end: {d._timingSummary.dayEnd}</span>
                  {d._timingSummary.paceWarning && (
                    <span className="text-amber-600 flex items-center gap-0.5">
                      <AlertTriangle size={10} /> {d._timingSummary.paceWarning}
                    </span>
                  )}
                  {d._timingSummary.chronoWarning && (
                    <span className="text-red-600 flex items-center gap-0.5">
                      <AlertTriangle size={10} /> {d._timingSummary.chronoWarning}
                    </span>
                  )}
                </div>
              )}

              {/* Phase 16F — day-level carry suggestions */}
              <EssentialsBlock essentials={d._essentials} />

              <div className="space-y-1.5">
                {d.activities.map((act) => (
                  <ActivityRow
                    key={act._key}
                    act={act}
                    days={editDays}
                    dayDate={d.date}
                    currency={currency}
                    travellerCount={travellerCount}
                    suspect={validation.suspectKeys.has(act._key)}
                    nextActivityTitle={(() => {
                      const visibleActs = d.activities.filter((a) => !a._removed)
                      const idx = visibleActs.findIndex((a) => a._key === act._key)
                      return visibleActs[idx + 1]?.title
                    })()}
                    onPatch={(u) => patch(d.date, act._key, u)}
                    onToggleRemove={() => toggleRemove(d.date, act._key)}
                    onMove={(toDate) => moveToDay(d.date, act._key, toDate)}
                  />
                ))}
                {d.activities.length === 0 && <p className="text-[11px] text-gray-300 py-1">No activities.</p>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Route + comfort notes */}
      {(result.routeSummary.logic || c.notes.length > 0) && (
        <div className="mt-3 text-[11px] text-gray-500 space-y-0.5">
          {result.routeSummary.logic && <p>🧭 {result.routeSummary.logic}</p>}
          {c.notes.map((n, i) => <p key={i}>• {n}</p>)}
        </div>
      )}

      {hasUnverified && (
        <p className="mt-3 text-[11px] text-amber-600 flex items-center gap-1.5">
          <ShieldAlert size={12} /> {stats.unverified} place(s) are unverified AI suggestions.
          {mapsAvailable ? ' Use “Resolve unverified” to confirm them with Google before applying.' : ' Edit them manually before applying.'}
        </p>
      )}
      {applyNote && <p className="mt-2 text-xs text-emerald-600 flex items-center gap-1.5"><Check size={12} /> {applyNote}</p>}

      {/* PART 12A — sanity review banner. Blocks a silent save of an invalid plan. */}
      {validation.needsReview && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-[11px] font-bold text-amber-700 flex items-center gap-1.5 mb-1">
            <AlertTriangle size={12} /> This itinerary needs review before saving
          </p>
          <ul className="space-y-0.5">
            {validation.issues.slice(0, 5).map((iss, i) => (
              <li key={i} className="text-[10px] text-amber-700 leading-snug">• {iss.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mt-4">
        <Button onClick={handleApplyClick} disabled={applying || busy}
          variant={validation.needsReview && confirmSave ? 'secondary' : 'primary'}
          className="flex-1 min-w-[140px]">
          {applying ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          {applying
            ? applyingLabel
            : validation.needsReview
              ? (confirmSave ? 'Save anyway' : 'Review & save…')
              : applyLabel}
        </Button>
        <Button variant="secondary" onClick={onRegenerate} disabled={applying || busy}>
          <Sparkles size={14} /> Regenerate
        </Button>
        <Button variant="ghost" onClick={onDiscard} disabled={applying || busy}>Discard</Button>
      </div>
      <p className="text-[11px] text-gray-400 mt-2">
        Past/completed days are protected. Generated activities are saved as planned estimates and marked
        as AI-generated — they never overwrite your confirmed or completed activities.
      </p>
    </motion.div>
  )
}

// ── Suggested food items (Phase 16D refinement) ───────────────────────────────

/** Plain-language label for an item's price basis. */
function itemBasisLabel(basis: SuggestedFoodItem['basis'], confidence: SuggestedFoodItem['confidence']): string {
  switch (basis) {
    case 'user_entered':
      return 'Confirmed price'
    case 'official_menu_or_website':
      return 'Menu-based estimate'
    case 'google_review_item_mentions':
      return 'Review-mentioned dish'
    case 'google_review_price_clues':
      return 'Review-based estimate'
    case 'google_price_level':
      return 'Google price-level estimate'
    case 'restaurant_type_city_heuristic':
    default:
      return confidence === 'low' ? 'Heuristic estimate' : 'Estimate'
  }
}

function popularityHintLabel(hint: SuggestedFoodItem['popularityHint']): string | null {
  switch (hint) {
    case 'best_seller': return '★ Best seller'
    case 'popular': return '★ Popular'
    case 'often_mentioned': return 'Often mentioned'
    case 'recommended': return 'Recommended'
    default: return null
  }
}

function vegBadge(vegType: SuggestedFoodItem['vegType']): { label: string; cls: string } | null {
  if (vegType === 'veg') return { label: 'Veg', cls: 'bg-green-50 text-green-600' }
  if (vegType === 'vegan') return { label: 'Vegan', cls: 'bg-green-50 text-green-700' }
  if (vegType === 'non_veg') return { label: 'Non-veg', cls: 'bg-red-50 text-red-500' }
  return null
}

function itemKey(item: SuggestedFoodItem, idx: number): string {
  return `${idx}:${item.name}`
}

/**
 * Renders per-item price estimates with explicit basis labels + veg badges.
 * Removable items are excluded from the activity's budget (estimatedCost is
 * recomputed from remaining items × travellers when the user edits the set).
 */
function SuggestedItemsBlock({
  items, removedKeys, currency, travellerCount, onToggleItem,
}: {
  items: SuggestedFoodItem[]
  removedKeys: string[]
  currency: string
  travellerCount: number
  onToggleItem: (key: string) => void
}) {
  if (!items.length) return null
  const removed = new Set(removedKeys)
  return (
    <div className="mt-1.5 space-y-1">
      <p className="text-[9px] font-bold uppercase tracking-wide text-gray-400">Suggested items (est. prices)</p>
      {items.map((item, idx) => {
        const key = itemKey(item, idx)
        const isRemoved = removed.has(key)
        const badge = vegBadge(item.vegType)
        return (
          <div key={key} className={`flex items-center gap-1.5 text-[10px] ${isRemoved ? 'opacity-40' : ''}`}>
            <button
              type="button"
              onClick={() => onToggleItem(key)}
              className={`p-0.5 rounded ${isRemoved ? 'text-gray-400 hover:bg-gray-100' : 'text-red-400 hover:bg-red-50'}`}
              title={isRemoved ? 'Add back (counts in budget)' : 'Remove (excluded from budget)'}
            >
              {isRemoved ? <RotateCcw size={9} /> : <Trash2 size={9} />}
            </button>
            <span className={`font-semibold text-gray-700 ${isRemoved ? 'line-through' : ''}`}>{item.name}</span>
            {badge && <span className={`text-[8px] font-bold px-1 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>}
            {item.popularityHint && item.popularityHint !== 'unknown' && (() => {
              const ph = popularityHintLabel(item.popularityHint)
              return ph ? (
                <span className="text-[8px] font-semibold px-1 py-0.5 rounded-full bg-violet-50 text-violet-600">{ph}</span>
              ) : null
            })()}
            <span className="text-gray-500">
              {formatCurrency(item.estimatedPriceMin, currency)}–{formatCurrency(item.estimatedPriceMax, currency)}/person
            </span>
            <span
              className="text-[8px] font-semibold px-1 py-0.5 rounded-full bg-gray-100 text-gray-500"
              title={item.sourceNote}
            >
              {itemBasisLabel(item.basis, item.confidence)}
            </span>
          </div>
        )
      })}
      <p className="text-[9px] text-gray-400">
        Prices are estimates — verify in person. {travellerCount > 1 ? `Per-person × ${travellerCount} travellers.` : ''}
      </p>
    </div>
  )
}

// ── Activity row ──────────────────────────────────────────────────────────────

function ActivityRow({
  act, days, dayDate, currency, travellerCount, suspect, nextActivityTitle, onPatch, onToggleRemove, onMove,
}: {
  act: EditableGeneratedActivity
  days: EditableGeneratedDay[]
  dayDate: string
  currency: string
  travellerCount: number
  suspect?: boolean
  nextActivityTitle?: string
  onPatch: (u: Partial<EditableGeneratedActivity>) => void
  onToggleRemove: () => void
  onMove: (toDate: string) => void
}) {
  const [open, setOpen] = useState(false)
  const v = verifyState(act)

  // Part 8: compact locality label shown in collapsed view.
  const localityLabel = act._locationContext?.locality
    ? `${act._locationContext.locality}${act._locationContext.city && act._locationContext.city !== act._locationContext.locality ? `, ${act._locationContext.city}` : ''}`
    : act._locationContext?.city ?? undefined

  return (
    <div className={`rounded-xl border p-2 ${act._removed ? 'opacity-40 border-gray-100 bg-gray-50' : 'border-gray-150 bg-white'}`}>
      <div className="flex items-center gap-2">
        <input
          value={act.startTime ?? ''}
          onChange={(e) => onPatch({ startTime: e.target.value })}
          placeholder="--:--"
          className="w-14 text-xs font-mono text-gray-500 bg-gray-50 rounded-lg px-1.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-300"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <input
              value={act.title}
              onChange={(e) => onPatch({ title: e.target.value })}
              className="flex-1 min-w-0 text-sm text-gray-800 bg-transparent focus:outline-none"
            />
            {/* Part 8: locality shown beside title in collapsed view */}
            {localityLabel && !open && (
              <span className="text-[9px] text-gray-400 whitespace-nowrap flex items-center gap-0.5">
                <MapPin size={8} className="flex-shrink-0" /> {localityLabel}
              </span>
            )}
          </div>
          {/* Badges */}
          <div className="flex items-center flex-wrap gap-1 mt-0.5">
            {act.isBreak && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-500">Break</span>}
            {/* PART 12A — a geographically-wrong match must not claim "Verified by Google". */}
            {v === 'verified' && !suspect && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600"><ShieldCheck size={9} /> Verified by Google</span>}
            {suspect && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600"><ShieldAlert size={9} /> Verify match — looks wrong</span>}
            {v === 'unverified' && !suspect && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600"><ShieldAlert size={9} /> Unverified</span>}
            {act._autoCategory && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-500">Auto-category</span>}
            {act._placeRating != null && <span className="text-[9px] text-gray-400">★ {act._placeRating}{act._placeUserRatings ? ` (${act._placeUserRatings})` : ''}</span>}
            {/* Part 7: meal-time mismatch warning badge */}
            {act._mealTimeIssue && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600" title={act._mealTimeIssue}><AlertTriangle size={8} /> Meal time adjusted</span>}
          </div>
          {/* Phase 16D — restaurant suggestion for food breaks */}
          {act.restaurantSuggestion && act.category === 'food' && (
            <>
              <div className="mt-1 text-[10px] text-emerald-700 flex items-center gap-1 flex-wrap">
                <ShieldCheck size={9} className="flex-shrink-0" />
                <span className="font-semibold">{act.restaurantSuggestion.name}</span>
                {act.restaurantSuggestion.rating != null && <span className="text-gray-400">★{act.restaurantSuggestion.rating}</span>}
                {act.estimatedSpendRange && (
                  <span className="text-gray-500">
                    · ≈{formatCurrency(act.estimatedSpendRange.perPersonMin, currency)}–{formatCurrency(act.estimatedSpendRange.perPersonMax, currency)}/person
                    {act.spendConfidence === 'high' ? '' : ' (est.)'}
                  </span>
                )}
              </div>
              {act.menuSourceUrl && (
                <a
                  href={act.menuSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-block text-[9px] text-sky-600 hover:underline"
                  title="Opens the restaurant's official website in a new tab"
                >
                  Menu/website available — prices still shown as estimates unless parsed confidently.
                </a>
              )}
              {act.suggestedItems && act.suggestedItems.length > 0 && (
                <SuggestedItemsBlock
                  items={act.suggestedItems}
                  removedKeys={act._removedItemKeys ?? []}
                  currency={currency}
                  travellerCount={travellerCount}
                  onToggleItem={(key) => {
                    const current = act._removedItemKeys ?? []
                    const nextRemoved = current.includes(key)
                      ? current.filter((k) => k !== key)
                      : [...current, key]
                    // Recompute estimatedCost from remaining items × travellers so
                    // removed options no longer count in the budget.
                    const removedSet = new Set(nextRemoved)
                    const items = act.suggestedItems ?? []
                    const perPersonMid = items.reduce((sum, it, idx) => {
                      if (removedSet.has(itemKey(it, idx))) return sum
                      return sum + (it.estimatedPriceMin + it.estimatedPriceMax) / 2
                    }, 0)
                    const n = Math.max(1, travellerCount)
                    onPatch({
                      _removedItemKeys: nextRemoved,
                      estimatedCost: Math.round(perPersonMid * n),
                      estimatedCostPerPerson: Math.round(perPersonMid),
                    })
                  }}
                />
              )}
            </>
          )}
          {/* Phase 16E — planned timing (collapsed) */}
          {act._plannedStart && act._durationMins != null && act._durationMins > 0 && (
            <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-400">
              <Clock size={9} className="flex-shrink-0" />
              <span>{act._plannedStart} – {act._plannedEnd}</span>
              <span className="text-gray-300">·</span>
              <span>{fmtMins(act._durationMins)} stay</span>
            </div>
          )}
          {act._travelToNextMins != null && nextActivityTitle && (
            <div className="flex items-center gap-1 mt-0.5 text-[10px] text-sky-600 flex-wrap">
              <Navigation2 size={9} className="flex-shrink-0" />
              <span>
                Next: {act._travelToNextDistText ?? fmtMins(act._travelToNextMins)}
                {act._travelToNextDistKm ? ` / ${act._travelToNextDistKm}` : ''}
                {` to ${nextActivityTitle}`}
              </span>
              {act._travelRouteSource === 'estimate' && <span className="text-gray-400">(est.)</span>}
              {act._travelBufferMins != null && act._travelBufferMins > 0 && (
                <span className="text-gray-400" title={act._travelBufferNote}>
                  incl. +{act._travelBufferMins} min buffer
                </span>
              )}
            </div>
          )}
          {/* Phase 16F — location context shown in collapsed view */}
          <ActivityContextLines ctx={act._activityContext} />
        </div>
        <input
          type="number" min="0"
          value={act.estimatedCost ?? 0}
          onChange={(e) => onPatch({ estimatedCost: Number(e.target.value) || 0 })}
          className="w-16 text-xs text-gray-500 bg-gray-50 rounded-lg px-1.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-300 self-start"
        />
        <button onClick={() => setOpen((vv) => !vv)} className="text-gray-400 hover:bg-gray-100 rounded-lg p-1 self-start" title={open ? 'Hide details' : 'Show details'}>
          <ArrowRightLeft size={13} />
        </button>
        <button onClick={onToggleRemove}
          className={`p-1 rounded-lg self-start ${act._removed ? 'text-gray-400 hover:bg-gray-100' : 'text-red-400 hover:bg-red-50'}`}
          title={act._removed ? 'Restore' : 'Remove'}>
          {act._removed ? <RotateCcw size={13} /> : <Trash2 size={13} />}
        </button>
      </div>

      {open && (
        <div className="mt-2 pt-2 border-t border-gray-100 grid sm:grid-cols-2 gap-2">
          {/* Part 8: full locality display in expanded */}
          {localityLabel && (
            <p className="text-[11px] text-gray-500 sm:col-span-2 flex items-center gap-1">
              <MapPin size={11} className="text-violet-400 flex-shrink-0" />
              {localityLabel}
            </p>
          )}
          {/* Part 7: meal-time mismatch detail */}
          {act._mealTimeIssue && (
            <p className="text-[11px] text-orange-600 sm:col-span-2 flex items-start gap-1">
              <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" /> {act._mealTimeIssue}
            </p>
          )}
          <label className="text-[11px] text-gray-500">
            Category
            <select
              value={act.category}
              onChange={(e) => onPatch({ category: e.target.value as ActivityCategory, _autoCategory: false })}
              className="mt-0.5 w-full text-xs bg-gray-50 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-300"
            >
              {CATEGORIES.map((cc) => <option key={cc} value={cc}>{cc}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-gray-500">
            Move to day
            <select
              value={dayDate}
              onChange={(e) => onMove(e.target.value)}
              className="mt-0.5 w-full text-xs bg-gray-50 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-300"
            >
              {days.map((d) => <option key={d.date} value={d.date}>Day {d.dayNumber} ({formatDate(d.date)})</option>)}
            </select>
          </label>
          <label className="text-[11px] text-gray-500 sm:col-span-2">
            Location
            <input
              value={act.locationName ?? ''}
              onChange={(e) => onPatch({ locationName: e.target.value })}
              className="mt-0.5 w-full text-xs bg-gray-50 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-300"
              placeholder="Place / area"
            />
          </label>
          {act._placeAddress && <p className="text-[11px] text-gray-400 sm:col-span-2">📍 {act._placeAddress}</p>}
          {act.suggestedPlaceSearchQuery && <p className="text-[11px] text-gray-400 sm:col-span-2">🔎 {act.suggestedPlaceSearchQuery}</p>}
          {act.timeToSpend && <p className="text-[11px] text-gray-400 sm:col-span-2">⏳ Suggested time: {act.timeToSpend}</p>}
          {act.whyRecommended && <p className="text-[11px] text-gray-400 sm:col-span-2">💡 {act.whyRecommended}</p>}
          {act.foodInsightNotes && <p className="text-[11px] text-gray-400 sm:col-span-2">🍽 {act.foodInsightNotes}</p>}
          {act.routeNotes && <p className="text-[11px] text-gray-400 sm:col-span-2">🧭 {act.routeNotes}</p>}
          {act.estimatedCostPerPerson != null && <p className="text-[11px] text-gray-400 sm:col-span-2">Per head ≈ {formatCurrency(act.estimatedCostPerPerson, currency)}</p>}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: 'primary' | 'violet' | 'emerald' | 'amber' }) {
  const cls = {
    primary: 'bg-primary-50 text-primary-600',
    violet: 'bg-violet-50 text-violet-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
  }[tone]
  return (
    <div className="bg-white rounded-xl p-2.5 border border-gray-100">
      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md mb-1 ${cls}`}>{icon} {label}</span>
      <p className="text-sm font-black text-gray-900 leading-none truncate capitalize">{value}</p>
    </div>
  )
}
