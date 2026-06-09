'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  MapPin, Navigation, CheckCircle2, Circle, SkipForward, Sparkles,
  Loader2, AlertTriangle, Crosshair, Save, RotateCcw, Check, Trash2, Info,
  Map as MapIcon, Route,
} from 'lucide-react'
import {
  getTrip, getItineraryDays, getExpenses, getLocationPoints, getMemories,
  updateActivity, addActivity, addLocationPoint,
} from '@/lib/firestore'
import { useApp } from '@/context/AppContext'
import AppShell from '@/components/layout/AppShell'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatCurrency, formatDate } from '@/lib/utils'
import { getTotalSpent } from '@/lib/calculations'
import { computeGapAnalysis } from '@/lib/location/gapAnalysis'
import { detectionMap } from '@/lib/location/visited'
import { gapPlannerModeLabel } from '@/lib/ai/itineraryGapPlanner'
import { getCurrentPosition, type GeoError } from '@/lib/location/geo'
import { haversineMeters } from '@/lib/location/distance'
import { useMapsStatus } from '@/lib/maps/useMapsStatus'
import SmartPlannerMap, { type SmartPlannerMarker } from '@/components/maps/SmartPlannerMap'
import type {
  Trip, ItineraryDay, Activity, Expense, TripLocationPoint, TripMemory,
  GapAnalysis, GapAnalysisPlace, VisitedStatus, VisitedConfidence,
  GapPlannerMode, GapPlannerInput, GapPlannerResult, GapPlannerProposedActivity,
  ActivityCategory, ActivityType, OptimiseRouteResult, GapPlanRouteSummary,
} from '@/types'

// ── Constants ───────────────────────────────────────────────────────────────

const MODES: { key: GapPlannerMode; label: string }[] = [
  { key: 'complete_remaining', label: 'Complete remaining' },
  { key: 'today_only', label: 'Today only' },
  { key: 'tomorrow_only', label: 'Tomorrow only' },
  { key: 'next_few_hours', label: 'Next few hours' },
  { key: 'fill_free_time', label: 'Fill free time' },
  { key: 'replace_missed', label: 'Replace missed' },
]

const PACES: { key: GapPlannerInput['pace']; label: string }[] = [
  { key: 'relaxed', label: 'Relaxed' },
  { key: 'balanced', label: 'Balanced' },
  { key: 'packed', label: 'Packed' },
]

const CATEGORY_TO_TYPE: Record<ActivityCategory, ActivityType> = {
  sightseeing: 'activity', food: 'food', hotel: 'hotel', transport: 'transport',
  shopping: 'other', adventure: 'activity', spiritual: 'activity', leisure: 'activity',
  emergency: 'other', other: 'other',
}

const CONFIDENCE_CLS: Record<VisitedConfidence, string> = {
  high: 'bg-emerald-50 text-emerald-600',
  medium: 'bg-sky-50 text-sky-600',
  low: 'bg-gray-100 text-gray-500',
}

// ── Types ───────────────────────────────────────────────────────────────────

interface EditableActivity extends GapPlannerProposedActivity {
  _key: string
  _removed: boolean
}
interface EditableDay {
  date: string
  label: string
  activities: EditableActivity[]
}

interface LocalOptimiseResult {
  originalDistanceKm: number
  optimisedDistanceKm: number
  distanceSavedKm: number
  originalDurationSeconds: number
  optimisedDurationSeconds: number
  durationSavedSeconds: number
  optimisedOrder: string[]
  warnings: string[]
  method: 'road' | 'haversine'
  polyline?: string
}

interface LocalRoutePreview {
  totalDistanceKm: number
  durationText: string
  stopCount: number
  method: 'road' | 'haversine'
  warnings: string[]
  polyline?: string
}

// ── Small utilities ──────────────────────────────────────────────────────────

function todayISO(): string { return new Date().toISOString().slice(0, 10) }
function nowHHMM(): string { return new Date().toTimeString().slice(0, 5) }

function fmtDuration(seconds: number): string {
  const mins = Math.round(seconds / 60)
  if (mins < 1) return '< 1 min'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`
}

function fmtDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(meters >= 10_000 ? 0 : 1)} km`
  return `${Math.round(meters)} m`
}

/** Nearest-neighbour sort for Haversine fallback. */
function nearestNeighbourSort(
  places: GapAnalysisPlace[],
  from: { lat: number; lng: number } | null,
): GapAnalysisPlace[] {
  if (!from || places.length === 0) return places
  const pool = [...places]
  const sorted: GapAnalysisPlace[] = []
  let cur = from
  while (pool.length > 0) {
    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < pool.length; i++) {
      const d = haversineMeters(cur.lat, cur.lng, pool[i]!.lat!, pool[i]!.lng!)
      if (d < bestDist) { bestDist = d; best = i }
    }
    const next = pool.splice(best, 1)[0]!
    sorted.push(next)
    cur = { lat: next.lat!, lng: next.lng! }
  }
  return sorted
}

/** Find lat/lng for a proposed activity title by matching against known places. */
function lookupCoords(
  title: string,
  allPlaces: GapAnalysisPlace[],
): { lat: number; lng: number } | null {
  const t = title.toLowerCase().trim()
  const match = allPlaces.find(
    (p) => p.lat != null && p.lng != null && p.title.toLowerCase().trim() === t,
  )
  return match ? { lat: match.lat!, lng: match.lng! } : null
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SmartPlannerPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const router = useRouter()
  const { user } = useApp()
  const { status: mapsStatus } = useMapsStatus()

  const [trip, setTrip] = useState<Trip | null>(null)
  const [days, setDays] = useState<ItineraryDay[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [locationPoints, setLocationPoints] = useState<TripLocationPoint[]>([])
  const [memories, setMemories] = useState<TripMemory[]>([])
  const [loading, setLoading] = useState(true)

  // Current-location (user-triggered only).
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [savingCheckin, setSavingCheckin] = useState(false)

  // Map view (user-toggled, defaults to hidden).
  const [showMap, setShowMap] = useState(false)
  const [activeMapMarkerId, setActiveMapMarkerId] = useState<string | null>(null)

  // Route optimise for remaining places.
  const [optimising, setOptimising] = useState(false)
  const [optimiseResult, setOptimiseResult] = useState<LocalOptimiseResult | null>(null)
  const [optimisedRemainingIds, setOptimisedRemainingIds] = useState<string[] | null>(null)
  const [optimiseApplied, setOptimiseApplied] = useState(false)
  const [optimiseError, setOptimiseError] = useState<string | null>(null)

  // Planning controls.
  const [mode, setMode] = useState<GapPlannerMode>('today_only')
  const [pace, setPace] = useState<GapPlannerInput['pace']>('balanced')
  const [allowRevisits, setAllowRevisits] = useState(false)
  const [constraints, setConstraints] = useState('')

  // AI preview state.
  const [generating, setGenerating] = useState(false)
  const [aiResult, setAiResult] = useState<GapPlannerResult | null>(null)
  const [aiMeta, setAiMeta] = useState<{ isMock: boolean; model: string } | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [editDays, setEditDays] = useState<EditableDay[]>([])
  const [applying, setApplying] = useState(false)
  const [applyNote, setApplyNote] = useState<string | null>(null)

  // Route preview for AI plan.
  const [calculatingRoute, setCalculatingRoute] = useState(false)
  const [routePreview, setRoutePreview] = useState<LocalRoutePreview | null>(null)

  useEffect(() => {
    if (!tripId) return
    Promise.all([
      getTrip(tripId), getItineraryDays(tripId), getExpenses(tripId),
      getLocationPoints(tripId), getMemories(tripId),
    ]).then(([t, d, e, lp, m]) => {
      if (!t) { router.push('/dashboard'); return }
      setTrip(t); setDays(d); setExpenses(e); setLocationPoints(lp); setMemories(m)
      setLoading(false)
    })
  }, [tripId, router])

  const spent = useMemo(() => getTotalSpent(expenses), [expenses])

  const { analysis, detMap } = useMemo(() => {
    if (!trip) return { analysis: null as GapAnalysis | null, detMap: new Map() }
    const { analysis, detections } = computeGapAnalysis(trip, days, locationPoints, memories, {
      now: new Date(),
      budgetTotal: trip.budget,
      budgetSpent: spent,
      currentLocation: currentLocation ? { lat: currentLocation.lat, lng: currentLocation.lng } : undefined,
    })
    return { analysis, detMap: detectionMap(detections) }
  }, [trip, days, locationPoints, memories, spent, currentLocation])

  // Remaining places, optionally sorted by the optimised order.
  const sortedRemainingPlaces = useMemo(() => {
    if (!analysis) return []
    if (!optimiseApplied || !optimisedRemainingIds) return analysis.remainingPlaces
    const order = new Map(optimisedRemainingIds.map((id, i) => [id, i]))
    return [...analysis.remainingPlaces].sort((a, b) => {
      const ia = order.get(a.activityId) ?? 999
      const ib = order.get(b.activityId) ?? 999
      return ia - ib
    })
  }, [analysis, optimiseApplied, optimisedRemainingIds])

  // Compact route summary for AI context (present when optimise is applied).
  const routeSummary = useMemo((): GapPlanRouteSummary | undefined => {
    if (!optimiseResult || !optimiseApplied) return undefined
    return {
      stopCount: optimisedRemainingIds?.length ?? 0,
      totalDistanceKm: optimiseResult.optimisedDistanceKm,
      totalDurationText: optimiseResult.optimisedDurationSeconds > 0
        ? fmtDuration(optimiseResult.optimisedDurationSeconds)
        : `${optimiseResult.optimisedDistanceKm} km straight-line`,
      optimisationMethod: optimiseResult.method === 'road' ? 'route_matrix_tsp' : 'haversine_fallback',
      warnings: optimiseResult.warnings,
    }
  }, [optimiseResult, optimiseApplied, optimisedRemainingIds])

  // Map markers derived from gap analysis + current location.
  const mapMarkers = useMemo((): SmartPlannerMarker[] => {
    if (!analysis) return []
    const markers: SmartPlannerMarker[] = []
    if (currentLocation) {
      markers.push({
        id: 'current',
        lat: currentLocation.lat, lng: currentLocation.lng,
        label: 'Your location', type: 'current',
      })
    }
    for (const p of analysis.visitedPlaces) {
      if (p.lat == null || p.lng == null) continue
      markers.push({
        id: p.activityId, lat: p.lat, lng: p.lng, label: p.title,
        type: p.status === 'confirmed_visited' ? 'confirmed' : 'likely',
        sublabel: `Day ${p.dayNumber}`,
      })
    }
    for (const p of analysis.remainingPlaces) {
      if (p.lat == null || p.lng == null) continue
      markers.push({ id: p.activityId, lat: p.lat, lng: p.lng, label: p.title, type: 'remaining', sublabel: `Day ${p.dayNumber}` })
    }
    for (const p of analysis.skippedPlaces) {
      if (p.lat == null || p.lng == null) continue
      markers.push({ id: p.activityId, lat: p.lat, lng: p.lng, label: p.title, type: 'skipped', sublabel: `Day ${p.dayNumber} · Skipped` })
    }
    return markers
  }, [analysis, currentLocation])

  // Active polyline: optimised route when applied, or AI plan route preview.
  const activePolyline = routePreview?.polyline ?? (optimiseApplied ? optimiseResult?.polyline : null)

  // ── Current location ──────────────────────────────────────────────────────

  async function handleUseCurrentLocation() {
    setLocating(true)
    setGeoError(null)
    try {
      const pos = await getCurrentPosition()
      setCurrentLocation({ lat: pos.latitude, lng: pos.longitude, accuracy: pos.accuracy })
    } catch (err) {
      setGeoError((err as GeoError).message || 'Could not get your location.')
    } finally {
      setLocating(false)
    }
  }

  async function handleSaveCheckin() {
    if (!tripId || !user || !currentLocation) return
    setSavingCheckin(true)
    try {
      const point = await addLocationPoint(tripId, {
        tripId,
        userId: user.uid,
        latitude: currentLocation.lat,
        longitude: currentLocation.lng,
        accuracy: currentLocation.accuracy,
        capturedAt: new Date().toISOString(),
        source: 'manual_checkin',
        dayKey: todayISO(),
      })
      setLocationPoints((prev) => [point, ...prev])
    } finally {
      setSavingCheckin(false)
    }
  }

  // ── Visited status mutations ──────────────────────────────────────────────

  async function setVisited(
    dayId: string, activityId: string, status: VisitedStatus,
    confidence?: VisitedConfidence, source?: Activity['visitedSource'], locPointId?: string,
  ) {
    if (!tripId) return
    const updates: Partial<Activity> = {
      visitedStatus: status,
      visitedAt: status === 'not_visited' ? undefined : new Date().toISOString(),
      visitedConfidence: confidence,
      visitedSource: source,
      visitedLocationPointId: locPointId,
    }
    await updateActivity(tripId, dayId, activityId, updates)
    setDays((prev) => prev.map((d) => d.id === dayId ? {
      ...d,
      activities: d.activities.map((a) => a.id === activityId ? { ...a, ...updates } : a),
    } : d))
  }

  function confirmVisited(dayId: string, activityId: string) {
    const det = detMap.get(activityId)
    setVisited(dayId, activityId, 'confirmed_visited', det?.confidence, det ? det.source : 'manual', det?.matchedLocationPointId)
  }
  function skipPlace(dayId: string, activityId: string) {
    setVisited(dayId, activityId, 'skipped', undefined, 'manual')
  }
  function resetVisited(dayId: string, activityId: string) {
    setVisited(dayId, activityId, 'not_visited', undefined, undefined, undefined)
  }
  function markVisitedFromCurrent(dayId: string, activityId: string) {
    setVisited(dayId, activityId, 'confirmed_visited', 'high', 'current_location')
  }

  // ── Route optimise for remaining places ───────────────────────────────────

  async function handleOptimiseRemaining() {
    if (!analysis) return
    const withCoords = analysis.remainingPlaces.filter((p) => p.lat != null && p.lng != null)
    if (withCoords.length < 2) return

    setOptimising(true)
    setOptimiseError(null)
    setOptimiseResult(null)
    setOptimiseApplied(false)

    const points: { id: string; name: string; lat: number; lng: number }[] = []
    if (currentLocation) {
      points.push({ id: 'current', name: 'Current Location', lat: currentLocation.lat, lng: currentLocation.lng })
    }
    withCoords.forEach((p) => points.push({ id: p.activityId, name: p.title, lat: p.lat!, lng: p.lng! }))

    // Haversine chain for the original order (baseline).
    let origHav = 0
    for (let i = 0; i < points.length - 1; i++) {
      origHav += haversineMeters(points[i]!.lat, points[i]!.lng, points[i + 1]!.lat, points[i + 1]!.lng)
    }

    try {
      const res = await fetch('/api/maps/route/optimise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points, travelMode: 'driving', mode: 'fastest', keepFirstFixed: !!currentLocation }),
      })

      if (res.status === 503) {
        // Maps not configured — Haversine nearest-neighbour fallback.
        const sorted = nearestNeighbourSort(withCoords, currentLocation)
        const sortedIds = sorted.map((p) => p.activityId)
        const sortedPts = currentLocation
          ? [currentLocation, ...sorted.map((p) => ({ lat: p.lat!, lng: p.lng! }))]
          : sorted.map((p) => ({ lat: p.lat!, lng: p.lng! }))
        let sortedHav = 0
        for (let i = 0; i < sortedPts.length - 1; i++) {
          sortedHav += haversineMeters(sortedPts[i]!.lat, sortedPts[i]!.lng, sortedPts[i + 1]!.lat, sortedPts[i + 1]!.lng)
        }
        setOptimisedRemainingIds(sortedIds)
        setOptimiseResult({
          originalDistanceKm: Math.round(origHav / 100) / 10,
          optimisedDistanceKm: Math.round(sortedHav / 100) / 10,
          distanceSavedKm: Math.round(Math.max(0, origHav - sortedHav) / 100) / 10,
          originalDurationSeconds: 0,
          optimisedDurationSeconds: 0,
          durationSavedSeconds: 0,
          optimisedOrder: sortedIds,
          warnings: ['Road data unavailable — order estimated from straight-line distances.'],
          method: 'haversine',
        })
        return
      }

      if (!res.ok) throw new Error('optimise_failed')
      const data = await res.json() as OptimiseRouteResult
      const optimisedIds = data.optimisedOrder.filter((id) => id !== 'current')
      setOptimisedRemainingIds(optimisedIds)
      setOptimiseResult({
        originalDistanceKm: data.originalRouteDistanceMeters > 0
          ? Math.round(data.originalRouteDistanceMeters / 100) / 10
          : Math.round(origHav / 100) / 10,
        optimisedDistanceKm: Math.round(data.optimisedRouteDistanceMeters / 100) / 10,
        distanceSavedKm: Math.round(Math.max(0, data.distanceSavedMeters) / 100) / 10,
        originalDurationSeconds: data.originalRouteDurationSeconds,
        optimisedDurationSeconds: data.optimisedRouteDurationSeconds,
        durationSavedSeconds: Math.max(0, data.durationSavedSeconds),
        optimisedOrder: optimisedIds,
        warnings: data.warnings,
        method: 'road',
        polyline: data.routePolyline,
      })
    } catch {
      setOptimiseError('Route optimisation failed. Try again or proceed with itinerary order.')
    } finally {
      setOptimising(false)
    }
  }

  function handleResetOptimise() {
    setOptimiseResult(null)
    setOptimisedRemainingIds(null)
    setOptimiseApplied(false)
    setOptimiseError(null)
  }

  // ── Calculate route preview for AI plan ──────────────────────────────────

  async function handleCalculateRoutePreview() {
    if (!analysis || editDays.length === 0) return

    const allPlaces = [
      ...analysis.visitedPlaces,
      ...analysis.remainingPlaces,
      ...analysis.skippedPlaces,
    ]

    const points: { id: string; name: string; lat: number; lng: number }[] = []
    if (currentLocation) {
      points.push({ id: 'current', name: 'Current Location', lat: currentLocation.lat, lng: currentLocation.lng })
    }
    for (const day of editDays) {
      for (const act of day.activities) {
        if (act._removed || act.isBreak) continue
        const coords = lookupCoords(act.title, allPlaces)
        if (coords) points.push({ id: act._key, name: act.title, lat: coords.lat, lng: coords.lng })
      }
    }

    const stopCount = points.length - (currentLocation ? 1 : 0)

    if (points.length < 2) {
      setRoutePreview({
        totalDistanceKm: 0,
        durationText: '—',
        stopCount,
        method: 'haversine',
        warnings: ['Not enough places with coordinates for a route preview.'],
      })
      return
    }

    setCalculatingRoute(true)
    setRoutePreview(null)

    // Haversine chain baseline.
    let havMeters = 0
    for (let i = 0; i < points.length - 1; i++) {
      havMeters += haversineMeters(points[i]!.lat, points[i]!.lng, points[i + 1]!.lat, points[i + 1]!.lng)
    }

    try {
      const res = await fetch('/api/maps/route/optimise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points, travelMode: 'driving', mode: 'fastest', keepFirstFixed: true }),
      })

      if (res.ok) {
        const data = await res.json() as OptimiseRouteResult
        const relevant = data.warnings.filter((w) => !w.includes('Optimised order saves'))
        setRoutePreview({
          totalDistanceKm: Math.round(data.optimisedRouteDistanceMeters / 100) / 10,
          durationText: fmtDuration(data.optimisedRouteDurationSeconds),
          stopCount,
          method: 'road',
          warnings: relevant,
          polyline: data.routePolyline,
        })
      } else {
        setRoutePreview({
          totalDistanceKm: Math.round(havMeters / 100) / 10,
          durationText: '—',
          stopCount,
          method: 'haversine',
          warnings: ['Road data unavailable — showing approximate straight-line distance.'],
        })
      }
    } catch {
      setRoutePreview({
        totalDistanceKm: Math.round(havMeters / 100) / 10,
        durationText: '—',
        stopCount,
        method: 'haversine',
        warnings: ['Route calculation failed — showing approximate straight-line distance.'],
      })
    } finally {
      setCalculatingRoute(false)
    }
  }

  // ── AI generation ──────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!trip || !analysis) return
    setGenerating(true)
    setAiError(null)
    setAiResult(null)
    setApplyNote(null)
    setRoutePreview(null)

    const input: GapPlannerInput = {
      tripName: trip.name,
      destination: trip.destination,
      tripType: trip.type,
      travellerCount: Math.max(trip.travellers?.length ?? 1, 1),
      currency: trip.currency,
      startDate: trip.startDate,
      endDate: trip.endDate,
      today: todayISO(),
      nowTime: nowHHMM(),
      mode,
      pace,
      allowRevisits,
      hasCurrentLocation: !!currentLocation,
      currentLocation: currentLocation ? { lat: currentLocation.lat, lng: currentLocation.lng } : undefined,
      startPointName: locationPoints[0]?.label,
      budgetRemaining: trip.budget > 0 ? Math.max(trip.budget - spent, 0) : undefined,
      visitedPlaces: analysis.visitedPlaces.map((p) => ({
        title: p.title, category: p.category, lat: p.lat, lng: p.lng, date: p.date,
      })),
      remainingPlaces: sortedRemainingPlaces.map((p) => ({
        title: p.title, category: p.category, lat: p.lat, lng: p.lng, date: p.date,
      })),
      constraints: constraints.trim() || undefined,
      routeSummary,
    }

    try {
      const res = await fetch('/api/ai/itinerary-gap-planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      })
      if (!res.ok) throw new Error('request_failed')
      const data = await res.json() as { result: GapPlannerResult; isMock: boolean; model: string }
      setAiResult(data.result)
      setAiMeta({ isMock: data.isMock, model: data.model })
      setEditDays(data.result.proposedDays.map((d, di) => ({
        date: d.date,
        label: d.label,
        activities: d.activities.map((a, ai) => ({ ...a, _key: `${di}-${ai}`, _removed: false })),
      })))
    } catch {
      setAiError('Could not generate a plan right now. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  // ── Editing the preview ────────────────────────────────────────────────────

  function toggleRemove(dayDate: string, key: string) {
    setEditDays((prev) => prev.map((d) => d.date === dayDate ? {
      ...d,
      activities: d.activities.map((a) => a._key === key ? { ...a, _removed: !a._removed } : a),
    } : d))
  }
  function editField(dayDate: string, key: string, field: 'title' | 'startTime' | 'estimatedCost', value: string) {
    setEditDays((prev) => prev.map((d) => d.date === dayDate ? {
      ...d,
      activities: d.activities.map((a) => a._key === key ? {
        ...a,
        [field]: field === 'estimatedCost' ? (Number(value) || 0) : value,
      } : a),
    } : d))
  }

  // ── Apply preview to itinerary ─────────────────────────────────────────────

  async function handleApply() {
    if (!tripId || !trip) return
    const today = todayISO()
    const toApply = editDays
      .map((d) => ({ ...d, activities: d.activities.filter((a) => !a._removed) }))
      .filter((d) => d.activities.length > 0)

    const total = toApply.reduce((n, d) => n + d.activities.length, 0)
    if (total === 0) { setApplyNote('Nothing selected to apply.'); return }

    const protectedDates = toApply.filter((d) => d.date < today).map((d) => d.date)
    const applicable = toApply.filter((d) => d.date >= today)
    if (applicable.length === 0) {
      setApplyNote('All proposed days are in the past and were protected — nothing applied.')
      return
    }

    setApplying(true)
    const skippedDates: string[] = [...protectedDates]
    let added = 0
    const updatedDays = [...days]

    for (const pd of applicable) {
      const day = updatedDays.find((d) => d.date === pd.date)
      if (!day) { skippedDates.push(pd.date); continue }
      for (const a of pd.activities) {
        const category = a.category ?? 'other'
        const cost = a.estimatedCost ?? 0
        const newActivity: Omit<Activity, 'id'> = {
          type: CATEGORY_TO_TYPE[category],
          category,
          title: a.title,
          time: a.startTime ?? '',
          startTime: a.startTime || undefined,
          endTime: a.endTime || undefined,
          cost,
          estimatedCost: cost,
          locationName: a.locationName || undefined,
          notes: a.notes ? `${a.notes} (AI Gap Planner)` : 'Added by AI Gap Planner',
          confirmed: false,
          bookingStatus: 'planned',
          updatedAt: new Date().toISOString(),
        }
        const saved = await addActivity(tripId, day.id, newActivity)
        day.activities = [...day.activities, saved]
        added++
      }
    }

    setDays(updatedDays)
    setApplying(false)
    setAiResult(null)
    setEditDays([])
    setRoutePreview(null)
    setApplyNote(
      `Added ${added} activit${added === 1 ? 'y' : 'ies'}.` +
      (skippedDates.length ? ` Skipped ${skippedDates.length} protected/unmatched day(s).` : ''),
    )
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────

  if (loading || !trip || !analysis) {
    return (
      <AppShell back={`/trips/${tripId}`} tripId={tripId} title="Smart Planner" wide>
        <div className="space-y-4">
          <Skeleton className="h-28 rounded-2xl" />
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </AppShell>
    )
  }

  const a = analysis
  const remainingWithCoords = a.remainingPlaces.filter((p) => p.lat != null && p.lng != null)

  // Pre-apply summary (future days only).
  const today = todayISO()
  const previewFutureDays = editDays.filter(
    (d) => d.date >= today && d.activities.some((act) => !act._removed),
  )
  const previewPastDays = editDays.filter((d) => d.date < today)

  return (
    <AppShell back={`/trips/${tripId}`} tripId={tripId} title="Smart Planner" wide>
      <div className="space-y-5">

        {/* Intro */}
        <div className="flex items-start gap-2 rounded-2xl bg-primary-50/60 border border-primary-100 p-3.5">
          <Info size={16} className="text-primary-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-gray-600 leading-relaxed">
            Voyago compares your saved <strong>Travel History</strong> and photo locations with your
            itinerary to estimate which places you&apos;ve likely visited, then helps you plan what&apos;s left.
            Detection is <strong>approximate</strong> — please confirm before relying on it. Location is
            only used when you tap a button below; nothing is tracked automatically.
          </p>
        </div>

        {/* Progress stats */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Completion" value={`${a.completionPercent}%`} sub={`${a.confirmedVisited + a.likelyVisited + a.skipped}/${a.totalPlanned} places`} tone="primary" />
          <StatCard label="Days left" value={String(a.tripDaysRemaining)} sub={`of ${a.tripDaysTotal} days`} tone="violet" />
          <StatCard
            label="Budget left"
            value={a.budgetTotal > 0 ? formatCurrency(Math.max(a.budgetRemaining, 0), trip.currency) : '—'}
            sub={a.budgetTotal > 0 ? `${formatCurrency(a.budgetSpent, trip.currency)} spent` : 'no budget set'}
            tone="emerald"
          />
          <StatCard label="Distance" value={a.distanceTravelledKm > 0 ? `${a.distanceTravelledKm} km` : '—'} sub="travelled" tone="amber" />
        </motion.div>

        {/* Completion bar */}
        <div className="bg-white rounded-2xl px-4 py-3 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-2 text-xs font-bold text-gray-600">
            <span>Trip completion</span>
            <span className="text-primary-600">{a.completionPercent}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-teal-500 transition-all" style={{ width: `${a.completionPercent}%` }} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-gray-400">
            <span>✅ {a.confirmedVisited} confirmed</span>
            <span>📍 {a.likelyVisited} likely</span>
            <span>⏭ {a.skipped} skipped</span>
            <span>🕓 {a.notVisited} remaining</span>
            {a.unplannedVisitedCount > 0 && <span>➕ {a.unplannedVisitedCount} unplanned visited</span>}
          </div>
        </div>

        {/* Map view toggle + canvas */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <MapIcon size={15} className="text-gray-400" />
              <span className="text-sm font-bold text-gray-900">Trip map</span>
              {mapMarkers.length > 0 && (
                <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-semibold">
                  {mapMarkers.length} place{mapMarkers.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <Button size="sm" variant="secondary" onClick={() => setShowMap((v) => !v)}>
              {showMap ? 'Hide map' : 'Show map'}
            </Button>
          </div>
          {showMap && (
            <div className="px-4 pb-4">
              <SmartPlannerMap
                markers={mapMarkers}
                activeMarkerId={activeMapMarkerId}
                onSelectMarker={setActiveMapMarkerId}
                routePolyline={activePolyline ?? null}
                heightPx={320}
              />
            </div>
          )}
        </div>

        {/* Current location card */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Crosshair size={16} className="text-sky-500" />
            <h2 className="text-sm font-bold text-gray-900">Current location</h2>
          </div>
          {!currentLocation ? (
            <>
              <p className="text-xs text-gray-500 mb-3">
                Check which planned places are near you right now. Your browser will ask for location
                permission only when you tap this.
              </p>
              <Button size="sm" onClick={handleUseCurrentLocation} disabled={locating}>
                {locating ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} />}
                {locating ? 'Locating…' : 'Use current location'}
              </Button>
              {geoError && (
                <p className="mt-2 text-xs text-amber-600 flex items-center gap-1.5">
                  <AlertTriangle size={12} /> {geoError}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-xs text-gray-600">
                  📍 {currentLocation.lat.toFixed(4)}, {currentLocation.lng.toFixed(4)}
                  <span className="text-gray-400"> · ±{Math.round(currentLocation.accuracy)}m</span>
                </p>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="secondary" onClick={handleSaveCheckin} disabled={savingCheckin}>
                    {savingCheckin ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save check-in
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setCurrentLocation(null)}>Clear</Button>
                </div>
              </div>
              <NearbyPlaces analysis={a} onMarkVisited={markVisitedFromCurrent} />
            </>
          )}
        </div>

        {/* Optimise remaining plan */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Route size={16} className="text-sky-500" />
            <h2 className="text-sm font-bold text-gray-900">Optimise remaining plan</h2>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Reorder remaining places by shortest driving route
            {currentLocation ? ' from your current location' : ''}.
            {!mapsStatus.available && ' Using straight-line estimate (Maps not configured).'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={handleOptimiseRemaining}
              disabled={optimising || remainingWithCoords.length < 2}
            >
              {optimising ? <Loader2 size={14} className="animate-spin" /> : <Route size={14} />}
              {optimising ? 'Calculating…' : 'Optimise remaining plan'}
            </Button>
            {remainingWithCoords.length < 2 && (
              <span className="text-[11px] text-gray-400 self-center">
                Need ≥ 2 remaining places with coordinates
              </span>
            )}
          </div>

          {optimiseError && (
            <p className="mt-2 text-xs text-amber-600 flex items-center gap-1.5">
              <AlertTriangle size={12} /> {optimiseError}
            </p>
          )}

          {optimiseResult && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-3">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="rounded-xl bg-gray-50 p-3 text-center">
                  <p className="text-[10px] text-gray-400 mb-1 font-semibold">Original order</p>
                  <p className="text-lg font-black text-gray-800">{optimiseResult.originalDistanceKm} km</p>
                  {optimiseResult.originalDurationSeconds > 0 && (
                    <p className="text-[10px] text-gray-400 mt-0.5">{fmtDuration(optimiseResult.originalDurationSeconds)}</p>
                  )}
                </div>
                <div className="rounded-xl bg-sky-50 p-3 text-center">
                  <p className="text-[10px] text-sky-500 mb-1 font-semibold">Optimised</p>
                  <p className="text-lg font-black text-sky-700">{optimiseResult.optimisedDistanceKm} km</p>
                  {optimiseResult.optimisedDurationSeconds > 0 && (
                    <p className="text-[10px] text-sky-500 mt-0.5">{fmtDuration(optimiseResult.optimisedDurationSeconds)}</p>
                  )}
                </div>
              </div>

              {(optimiseResult.distanceSavedKm > 0 || optimiseResult.durationSavedSeconds > 60) && (
                <p className="text-xs text-emerald-600 font-semibold mb-2">
                  ✓ Saves{optimiseResult.distanceSavedKm > 0 ? ` ≈${optimiseResult.distanceSavedKm} km` : ''}
                  {optimiseResult.durationSavedSeconds > 60 ? ` · ${fmtDuration(optimiseResult.durationSavedSeconds)}` : ''} of travel
                </p>
              )}

              <p className="text-[10px] text-gray-400 mb-2">
                {optimiseResult.method === 'road' ? '🛣 Road-aware estimate' : '📐 Straight-line estimate'}
                {' · '}{optimiseResult.optimisedOrder.length} stops
              </p>

              {optimiseResult.warnings.map((w, i) => (
                <p key={i} className="text-[11px] text-amber-600 flex items-center gap-1 mb-0.5">
                  <AlertTriangle size={10} /> {w}
                </p>
              ))}

              {!optimiseApplied ? (
                <Button size="sm" onClick={() => setOptimiseApplied(true)} className="mt-2">
                  Apply optimised order
                </Button>
              ) : (
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                    <Check size={12} /> Optimised order applied to remaining list
                  </span>
                  <button
                    onClick={handleResetOptimise}
                    className="text-[11px] text-gray-400 hover:text-gray-600 underline"
                  >
                    Reset
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* Visited / Remaining grid */}
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Visited */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              <MapPin size={15} className="text-emerald-500" /> Visited places
            </h2>
            {a.visitedPlaces.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">No places detected as visited yet. Add Travel History check-ins or confirm places below.</p>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {a.visitedPlaces.map((p) => (
                  <PlaceRow
                    key={p.activityId}
                    title={p.title}
                    day={p.dayNumber}
                    status={p.status}
                    confidence={p.confidence}
                    activeId={activeMapMarkerId}
                    onFocus={setActiveMapMarkerId}
                    id={p.activityId}
                  >
                    {p.status !== 'confirmed_visited' && (
                      <button onClick={() => confirmVisited(p.dayId, p.activityId)} className="text-emerald-600 hover:bg-emerald-50 rounded-lg p-1" title="Confirm visited">
                        <CheckCircle2 size={15} />
                      </button>
                    )}
                    <button onClick={() => resetVisited(p.dayId, p.activityId)} className="text-gray-400 hover:bg-gray-100 rounded-lg p-1" title="Undo / reset">
                      <RotateCcw size={14} />
                    </button>
                  </PlaceRow>
                ))}
              </div>
            )}
            {a.skippedPlaces.length > 0 && (
              <>
                <p className="text-[10px] font-bold text-amber-500 mt-3 mb-1.5">SKIPPED</p>
                <div className="space-y-1.5">
                  {a.skippedPlaces.map((p) => (
                    <PlaceRow
                      key={p.activityId}
                      title={p.title}
                      day={p.dayNumber}
                      status={p.status}
                      id={p.activityId}
                      activeId={activeMapMarkerId}
                      onFocus={setActiveMapMarkerId}
                    >
                      <button onClick={() => resetVisited(p.dayId, p.activityId)} className="text-gray-400 hover:bg-gray-100 rounded-lg p-1" title="Restore">
                        <RotateCcw size={14} />
                      </button>
                    </PlaceRow>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Remaining */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Circle size={15} className="text-gray-400" /> Remaining itinerary
              {optimiseApplied && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-600">Optimised order</span>
              )}
            </h2>
            {sortedRemainingPlaces.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">Nothing left — every planned place is visited or skipped. 🎉</p>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {sortedRemainingPlaces.map((p) => (
                  <PlaceRow
                    key={p.activityId}
                    title={p.title}
                    day={p.dayNumber}
                    status={p.status}
                    distanceM={p.distanceFromCurrentMeters}
                    id={p.activityId}
                    activeId={activeMapMarkerId}
                    onFocus={setActiveMapMarkerId}
                  >
                    <button onClick={() => confirmVisited(p.dayId, p.activityId)} className="text-emerald-600 hover:bg-emerald-50 rounded-lg p-1" title="Mark visited">
                      <CheckCircle2 size={15} />
                    </button>
                    <button onClick={() => skipPlace(p.dayId, p.activityId)} className="text-amber-600 hover:bg-amber-50 rounded-lg p-1" title="Skip">
                      <SkipForward size={14} />
                    </button>
                  </PlaceRow>
                ))}
              </div>
            )}
            {optimiseApplied && optimiseResult && (
              <p className="text-[10px] text-sky-500 mt-2 flex items-center gap-1">
                <Route size={10} />
                {fmtDistance(optimiseResult.optimisedDistanceKm * 1000)} total travel
                {optimiseResult.optimisedDurationSeconds > 0 && ` · ${fmtDuration(optimiseResult.optimisedDurationSeconds)}`}
              </p>
            )}
          </div>
        </div>

        {/* AI Gap Planner */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={16} className="text-violet-500" />
            <h2 className="text-sm font-bold text-gray-900">AI Gap Planner</h2>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-violet-100 text-violet-600">Beta</span>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Generate a plan for what&apos;s left. You&apos;ll get a preview to edit — nothing is saved until you apply.
            {optimiseApplied && <span className="text-sky-600 ml-1">Using optimised travel order.</span>}
          </p>

          {/* Mode */}
          <p className="text-xs font-semibold text-gray-700 mb-1.5">Planning mode</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {MODES.map((m) => (
              <button key={m.key} onClick={() => setMode(m.key)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${mode === m.key ? 'bg-violet-500 text-white border-violet-500' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                {m.label}
              </button>
            ))}
          </div>

          {/* Pace + revisits */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-gray-700">Pace</span>
              {PACES.map((p) => (
                <button key={p.key} onClick={() => setPace(p.key)}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold border transition-all ${pace === p.key ? 'bg-gray-800 text-white border-gray-800' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 cursor-pointer">
              <input type="checkbox" checked={allowRevisits} onChange={(e) => setAllowRevisits(e.target.checked)} className="rounded" />
              Allow revisiting visited places
            </label>
          </div>

          <Input label="Constraints (optional)" placeholder="e.g. avoid long drives, finish by 6pm, vegetarian food"
            value={constraints} onChange={(e) => setConstraints(e.target.value)} className="mb-3" />

          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {generating ? 'Generating…' : `Generate: ${gapPlannerModeLabel(mode)}`}
          </Button>
          {aiError && (
            <p className="mt-2 text-xs text-amber-600 flex items-center gap-1.5"><AlertTriangle size={12} /> {aiError}</p>
          )}
          {applyNote && (
            <p className="mt-2 text-xs text-emerald-600 flex items-center gap-1.5"><Check size={12} /> {applyNote}</p>
          )}
        </div>

        {/* AI preview */}
        {aiResult && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl p-4 border-2 border-violet-100 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-gray-900">Proposed plan (preview)</h2>
              {aiMeta?.isMock && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  Development Mock
                </span>
              )}
            </div>
            <p className="text-xs text-gray-600 mb-1">{aiResult.summary}</p>
            <p className="text-[11px] text-amber-600 mb-3 flex items-center gap-1.5">
              <AlertTriangle size={11} /> {aiResult.approximateLabel}
            </p>

            {editDays.map((d) => (
              <div key={d.date} className="mb-3">
                <p className="text-xs font-bold text-gray-700 mb-1.5">{d.label} · {formatDate(d.date)}</p>
                <div className="space-y-1.5">
                  {d.activities.map((act) => (
                    <div key={act._key}
                      className={`flex items-center gap-2 rounded-xl border p-2 ${act._removed ? 'opacity-40 border-gray-100 bg-gray-50' : 'border-gray-150 bg-white'}`}>
                      <input
                        value={act.startTime ?? ''}
                        onChange={(e) => editField(d.date, act._key, 'startTime', e.target.value)}
                        placeholder="--:--"
                        className="w-16 text-xs font-mono text-gray-500 bg-gray-50 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-300"
                      />
                      <input
                        value={act.title}
                        onChange={(e) => editField(d.date, act._key, 'title', e.target.value)}
                        className="flex-1 min-w-0 text-sm text-gray-800 bg-transparent focus:outline-none"
                      />
                      {act.isBreak && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-500">Break</span>}
                      <input
                        type="number" min="0"
                        value={act.estimatedCost ?? 0}
                        onChange={(e) => editField(d.date, act._key, 'estimatedCost', e.target.value)}
                        className="w-20 text-xs text-gray-500 bg-gray-50 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-300"
                      />
                      <button onClick={() => toggleRemove(d.date, act._key)}
                        className={`p-1 rounded-lg ${act._removed ? 'text-gray-400 hover:bg-gray-100' : 'text-red-400 hover:bg-red-50'}`}
                        title={act._removed ? 'Restore' : 'Remove'}>
                        {act._removed ? <RotateCcw size={14} /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {aiResult.routeOrderNote && <p className="text-[11px] text-gray-500 mb-1">🧭 {aiResult.routeOrderNote}</p>}
            {aiResult.estimatedTotalCost > 0 && (
              <p className="text-[11px] text-gray-500 mb-1">💰 Est. total: {formatCurrency(aiResult.estimatedTotalCost, trip.currency)} (approx.)</p>
            )}
            {aiResult.timingNotes.map((n, i) => <p key={i} className="text-[11px] text-gray-400">• {n}</p>)}
            {aiResult.warnings.map((w, i) => (
              <p key={i} className="text-[11px] text-amber-600 flex items-center gap-1 mt-0.5"><AlertTriangle size={10} /> {w}</p>
            ))}

            {/* Route preview */}
            <div className="mt-3 mb-1">
              <Button size="sm" variant="secondary" onClick={handleCalculateRoutePreview} disabled={calculatingRoute}>
                {calculatingRoute ? <Loader2 size={13} className="animate-spin" /> : <Route size={13} />}
                {calculatingRoute ? 'Calculating route…' : 'Calculate route for preview'}
              </Button>
              {routePreview && (
                <div className="mt-2 bg-sky-50 rounded-xl p-3">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-sky-700">
                    <span>📍 {routePreview.stopCount} stop{routePreview.stopCount !== 1 ? 's' : ''}</span>
                    {routePreview.totalDistanceKm > 0 && <span>🛣 {routePreview.totalDistanceKm} km</span>}
                    {routePreview.durationText !== '—' && <span>⏱ {routePreview.durationText}</span>}
                    <span className="text-[10px] text-sky-500 font-normal">
                      {routePreview.method === 'road' ? 'Road estimate' : 'Straight-line estimate'}
                    </span>
                  </div>
                  {routePreview.warnings.map((w, i) => (
                    <p key={i} className="text-[11px] text-amber-600 mt-1 flex items-center gap-1"><AlertTriangle size={10} /> {w}</p>
                  ))}
                </div>
              )}
            </div>

            {/* Pre-apply summary */}
            {previewFutureDays.length > 0 && (
              <div className="bg-violet-50 rounded-xl p-3 mt-3 text-xs text-gray-600">
                <p className="font-bold text-gray-800 mb-1.5">Will add to itinerary:</p>
                {previewFutureDays.map((d) => {
                  const acts = d.activities.filter((act) => !act._removed)
                  if (acts.length === 0) return null
                  return (
                    <p key={d.date} className="mb-0.5 leading-relaxed">
                      <span className="font-semibold">{formatDate(d.date)}</span>
                      {': '}
                      <span className="text-violet-700 font-semibold">+{acts.length}</span>
                      {' '}
                      <span className="text-gray-500">{acts.map((act) => act.title).join(', ')}</span>
                    </p>
                  )
                })}
                {previewPastDays.length > 0 && (
                  <p className="mt-1 text-amber-600 flex items-center gap-1">
                    <AlertTriangle size={10} />
                    {previewPastDays.length} past day(s) will be skipped (protected).
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <Button onClick={handleApply} disabled={applying} className="flex-1">
                {applying ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                {applying ? 'Applying…' : 'Apply to itinerary'}
              </Button>
              <Button variant="secondary" onClick={() => { setAiResult(null); setEditDays([]); setRoutePreview(null) }} disabled={applying}>
                Discard
              </Button>
            </div>
            <p className="text-[11px] text-gray-400 mt-2">
              Past/completed days are protected. Apply only adds new activities to today and future days — it never
              deletes or overwrites your existing plan.
            </p>
          </motion.div>
        )}
      </div>
    </AppShell>
  )
}

// ── Presentational helpers ────────────────────────────────────────────────────

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: 'primary' | 'violet' | 'emerald' | 'amber' }) {
  const toneCls = {
    primary: 'bg-primary-50 text-primary-600',
    violet: 'bg-violet-50 text-violet-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
  }[tone]
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
      <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-lg mb-2 ${toneCls}`}>{label}</span>
      <p className="text-xl font-black text-gray-900 leading-none truncate">{value}</p>
      <p className="text-[11px] text-gray-400 mt-1">{sub}</p>
    </div>
  )
}

function PlaceRow({
  id, title, day, status, confidence, distanceM, activeId, onFocus, children,
}: {
  id: string; title: string; day: number; status: VisitedStatus
  confidence?: VisitedConfidence; distanceM?: number
  activeId?: string | null; onFocus?: (id: string) => void
  children?: React.ReactNode
}) {
  const isActive = activeId === id
  return (
    <div
      className={`flex items-center gap-2 py-1 rounded-lg px-1 -mx-1 transition-colors cursor-pointer ${isActive ? 'bg-sky-50' : 'hover:bg-gray-50'}`}
      onClick={() => onFocus?.(id)}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 truncate">{title}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-gray-400">Day {day}</span>
          {status === 'likely_visited' && confidence && (
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${CONFIDENCE_CLS[confidence]}`}>
              likely · {confidence}
            </span>
          )}
          {status === 'confirmed_visited' && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600">visited</span>
          )}
          {status === 'skipped' && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">skipped</span>
          )}
          {distanceM != null && (
            <span className="text-[10px] text-sky-500 font-semibold">
              {distanceM < 1000 ? `${distanceM}m` : `${(distanceM / 1000).toFixed(1)}km`} away
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0">{children}</div>
    </div>
  )
}

function NearbyPlaces({
  analysis, onMarkVisited,
}: {
  analysis: GapAnalysis; onMarkVisited: (dayId: string, activityId: string) => void
}) {
  const nearby = [...analysis.remainingPlaces, ...analysis.visitedPlaces]
    .filter((p) => p.distanceFromCurrentMeters != null)
    .sort((x, y) => (x.distanceFromCurrentMeters ?? 0) - (y.distanceFromCurrentMeters ?? 0))
    .slice(0, 5)

  if (nearby.length === 0) {
    return <p className="text-xs text-gray-400">No planned places have coordinates to compare against.</p>
  }
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold text-gray-500">Nearest planned places</p>
      {nearby.map((p) => {
        const dist = p.distanceFromCurrentMeters ?? 0
        return (
          <div key={p.activityId} className="flex items-center gap-2 py-1">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800 truncate">{p.title}</p>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-sky-500 font-semibold">
                  {dist < 1000 ? `${dist}m` : `${(dist / 1000).toFixed(1)}km`} away
                </span>
                <span className="text-[9px] text-gray-400">· Day {p.dayNumber}</span>
                <span className="text-[9px] font-semibold text-emerald-600">in itinerary</span>
                {p.status === 'confirmed_visited' && <span className="text-[9px] text-emerald-500">✓ visited</span>}
              </div>
            </div>
            {p.status !== 'confirmed_visited' && (
              <button onClick={() => onMarkVisited(p.dayId, p.activityId)}
                className="text-emerald-600 hover:bg-emerald-50 rounded-lg p-1 flex-shrink-0" title="Mark visited (I'm here)">
                <CheckCircle2 size={15} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
