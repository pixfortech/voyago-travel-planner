'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  MapPin, Navigation, CheckCircle2, Circle, SkipForward, Sparkles,
  Loader2, AlertTriangle, Crosshair, Save, RotateCcw, Check, Trash2, Info,
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
import type {
  Trip, ItineraryDay, Activity, Expense, TripLocationPoint, TripMemory,
  GapAnalysis, VisitedStatus, VisitedConfidence,
  GapPlannerMode, GapPlannerInput, GapPlannerResult, GapPlannerProposedActivity,
  ActivityCategory, ActivityType,
} from '@/types'

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

/** Local editable copy of a proposed activity, with a removed flag. */
interface EditableActivity extends GapPlannerProposedActivity {
  _key: string
  _removed: boolean
}
interface EditableDay {
  date: string
  label: string
  activities: EditableActivity[]
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}
function nowHHMM(): string {
  return new Date().toTimeString().slice(0, 5)
}

export default function SmartPlannerPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const router = useRouter()
  const { user } = useApp()

  const [trip, setTrip] = useState<Trip | null>(null)
  const [days, setDays] = useState<ItineraryDay[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [locationPoints, setLocationPoints] = useState<TripLocationPoint[]>([])
  const [memories, setMemories] = useState<TripMemory[]>([])
  const [loading, setLoading] = useState(true)

  // Current-location check (user-triggered only).
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [savingCheckin, setSavingCheckin] = useState(false)

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

  // ── Current location ──
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

  // ── Visited status mutations (always user-confirmed) ──
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
    // Clearing the stored status lets live detection drive again.
    setVisited(dayId, activityId, 'not_visited', undefined, undefined, undefined)
  }
  function markVisitedFromCurrent(dayId: string, activityId: string) {
    setVisited(dayId, activityId, 'confirmed_visited', 'high', 'current_location')
  }

  // ── AI generation ──
  async function handleGenerate() {
    if (!trip || !analysis) return
    setGenerating(true)
    setAiError(null)
    setAiResult(null)
    setApplyNote(null)

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
      remainingPlaces: analysis.remainingPlaces.map((p) => ({
        title: p.title, category: p.category, lat: p.lat, lng: p.lng, date: p.date,
      })),
      constraints: constraints.trim() || undefined,
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

  // ── Editing the preview ──
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

  // ── Apply preview to the itinerary (only future/unprotected days) ──
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

    const ok = window.confirm(
      `Add ${applicable.reduce((n, d) => n + d.activities.length, 0)} activit${total === 1 ? 'y' : 'ies'} to ${applicable.length} day(s)? ` +
      `Past/completed days are protected and will be skipped. Existing activities are kept.`,
    )
    if (!ok) return

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
    setApplyNote(
      `Added ${added} activit${added === 1 ? 'y' : 'ies'}.` +
      (skippedDates.length ? ` Skipped ${skippedDates.length} protected/unmatched day(s).` : ''),
    )
  }

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
              {/* Nearby planned places */}
              <NearbyPlaces analysis={a} onMarkVisited={markVisitedFromCurrent} />
            </>
          )}
        </div>

        {/* Remaining + Next best */}
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Visited / remaining lists */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              <MapPin size={15} className="text-emerald-500" /> Visited places
            </h2>
            {a.visitedPlaces.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">No places detected as visited yet. Add Travel History check-ins or confirm places below.</p>
            ) : (
              <div className="space-y-1.5">
                {a.visitedPlaces.map((p) => (
                  <PlaceRow key={p.activityId} title={p.title} day={p.dayNumber} status={p.status} confidence={p.confidence}>
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
          </div>

          {/* Remaining */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Circle size={15} className="text-gray-400" /> Remaining itinerary
            </h2>
            {a.remainingPlaces.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">Nothing left — every planned place is visited or skipped. 🎉</p>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {a.remainingPlaces.map((p) => (
                  <PlaceRow key={p.activityId} title={p.title} day={p.dayNumber} status={p.status} distanceM={p.distanceFromCurrentMeters}>
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

            <div className="flex gap-2 mt-4">
              <Button onClick={handleApply} disabled={applying} className="flex-1">
                {applying ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                {applying ? 'Applying…' : 'Apply to itinerary'}
              </Button>
              <Button variant="secondary" onClick={() => { setAiResult(null); setEditDays([]) }} disabled={applying}>
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

// ── Small presentational helpers ──

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
  title, day, status, confidence, distanceM, children,
}: {
  title: string; day: number; status: VisitedStatus; confidence?: VisitedConfidence; distanceM?: number; children?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 py-1">
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
  // Planned places sorted by distance from current location (computed in analysis).
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
