'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Navigation, Camera, Calendar, Play, Pause, RotateCcw,
  Zap, Clock, ChevronLeft, ChevronRight, Map, Info,
  ArrowUp, ArrowDown, Loader2, AlertTriangle, TrendingUp, CheckCircle2,
} from 'lucide-react'
import { getTrip, getItineraryDays, getLocationPoints, getMemories } from '@/lib/firestore'
import { buildPlaybackPoints, groupPlaybackByDay } from '@/lib/location/playback'
import { computeTripDistance } from '@/lib/location/distance'
import AppShell from '@/components/layout/AppShell'
import RouteGoogleMap, { type MapRenderStatus } from '@/components/maps/RouteGoogleMap'
import { isBrowserMapsConfigured, getLoaderState } from '@/lib/maps/mapsLoader'
import type {
  Trip, ItineraryDay, TripLocationPoint, TripMemory,
  PlaybackPoint, PlaybackPointType, OptimiseRouteResult,
} from '@/types'

// ── constants ──────────────────────────────────────────────────────────────

const COLORS: Record<PlaybackPointType, string> = {
  checkin: '#14b8a6',
  live_tracking: '#10b981',
  activity: '#f59e0b',
  memory: '#f43f5e',
}

const TYPE_LABELS: Record<PlaybackPointType, string> = {
  checkin: 'Check-in',
  live_tracking: 'Live',
  activity: 'Activity',
  memory: 'Photo',
}

const CATEGORY_LABELS: Partial<Record<string, string>> = {
  sightseeing: 'Sightseeing',
  food: 'Food & Dining',
  hotel: 'Accommodation',
  transport: 'Transport',
  shopping: 'Shopping',
  adventure: 'Adventure',
  spiritual: 'Spiritual',
  leisure: 'Leisure',
  emergency: 'Emergency',
  other: 'Other',
}

const BASE_MS = 900

// ── helpers ──────────────────────────────────────────────────────────────

function fmtTime(iso?: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function fmtAccuracy(m?: number): string | null {
  if (!m) return null
  return m < 100 ? `±${Math.round(m)} m` : `±${(m / 1000).toFixed(1)} km`
}

function fmtMeters(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`
  return `${Math.round(m)} m`
}

function fmtSeconds(s: number): string {
  const mins = Math.round(s / 60)
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h} h ${m} min` : `${h} h`
}

// ── AI Route Coach (rule-based) ───────────────────────────────────────────

interface CoachHint {
  level: 'ok' | 'tip' | 'warning'
  text: string
}

function buildCoachHints(
  points: PlaybackPoint[],
  manualKm: number,
  result: OptimiseRouteResult | null,
): CoachHint[] {
  if (points.length === 0) return []
  const hints: CoachHint[] = []

  if (result) {
    const origKm = result.originalHaversineMeters / 1000
    const optKm = result.optimisedHaversineMeters / 1000
    const savedKm = origKm - optKm
    const pct = origKm > 0 ? (savedKm / origKm) * 100 : 0

    if (pct > 25) {
      hints.push({
        level: 'warning',
        text: `Backtracking detected — optimised order is ~${savedKm.toFixed(1)} km shorter straight-line (${Math.round(pct)}% improvement).`,
      })
    } else if (pct > 8) {
      hints.push({
        level: 'tip',
        text: `Minor optimisation possible — reordering saves ~${savedKm.toFixed(1)} km of travel.`,
      })
    } else {
      hints.push({
        level: 'ok',
        text: `Your route order is near-optimal (within ${Math.round(pct)}% of the shortest sequence).`,
      })
    }

    if (result.optimisedRouteDurationSeconds > 4 * 3600) {
      hints.push({
        level: 'warning',
        text: `Even optimised, this day has ${fmtSeconds(result.optimisedRouteDurationSeconds)} of road travel. Consider splitting across days.`,
      })
    } else if (result.optimisedRouteDurationSeconds > 2 * 3600) {
      hints.push({
        level: 'tip',
        text: `~${fmtSeconds(result.optimisedRouteDurationSeconds)} of road travel planned — factor this into your schedule.`,
      })
    }
  } else {
    if (manualKm > 50) {
      hints.push({
        level: 'warning',
        text: `~${manualKm.toFixed(0)} km straight-line today — likely a heavy travel day. Consider splitting.`,
      })
    } else if (manualKm > 25) {
      hints.push({
        level: 'tip',
        text: `~${manualKm.toFixed(0)} km of ground to cover today. Factor transit time when planning.`,
      })
    }

    if (points.length > 8) {
      hints.push({
        level: 'tip',
        text: `${points.length} stops in one day is ambitious. A relaxed pace typically fits 4–6 stops.`,
      })
    }

    if (hints.length === 0) {
      hints.push({
        level: 'ok',
        text: `${points.length} stop${points.length !== 1 ? 's' : ''} planned. Tap "Optimise" to check the best visit order.`,
      })
    }
  }

  return hints.slice(0, 3)
}

// ── SVG route map ──────────────────────────────────────────────────────────

const SVG_W = 400
const SVG_H = 258
const SVG_PAD = 30

function RouteSvg({
  points,
  activeIndex,
}: {
  points: PlaybackPoint[]
  activeIndex: number
}) {
  if (points.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
        <Map size={26} className="opacity-30" />
        <p className="text-xs">No location data for this day</p>
      </div>
    )
  }

  const lats = points.map((p) => p.latitude)
  const lngs = points.map((p) => p.longitude)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const latRange = Math.max(maxLat - minLat, 0.0003)
  const lngRange = Math.max(maxLng - minLng, 0.0003)

  function proj(lat: number, lng: number) {
    return {
      x: SVG_PAD + ((lng - minLng) / lngRange) * (SVG_W - 2 * SVG_PAD),
      y: SVG_PAD + ((maxLat - lat) / latRange) * (SVG_H - 2 * SVG_PAD),
    }
  }

  const pts = points.map((p) => proj(p.latitude, p.longitude))
  const fullPolyline = pts.map((p) => `${p.x},${p.y}`).join(' ')
  const traveledPolyline =
    activeIndex >= 1
      ? pts.slice(0, activeIndex + 1).map((p) => `${p.x},${p.y}`).join(' ')
      : null

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      className="w-full"
      aria-label="Approximate route map"
    >
      <style>{`
        .vg-pulse {
          transform-box: fill-box;
          transform-origin: center;
          animation: vg-pulse 1.6s ease-in-out infinite;
        }
        @keyframes vg-pulse {
          0%, 100% { transform: scale(1);   opacity: 0.22; }
          50%       { transform: scale(1.9); opacity: 0.03; }
        }
      `}</style>

      <rect width={SVG_W} height={SVG_H} rx="12" fill="#f0fdf4" />

      {Array.from({ length: 6 }, (_, row) =>
        Array.from({ length: 9 }, (_, col) => (
          <circle key={`g${row}-${col}`} cx={col * 50} cy={row * 52} r="1.5" fill="#bbf7d0" />
        ))
      )}

      {points.length > 1 && (
        <polyline
          points={fullPolyline}
          fill="none"
          stroke="#cbd5e1"
          strokeWidth="2"
          strokeDasharray="5 4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {traveledPolyline && (
        <polyline
          points={traveledPolyline}
          fill="none"
          stroke="#14b8a6"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {pts.map(({ x, y }, i) => {
        const pt = points[i]!
        const isActive = i === activeIndex
        const isPast = activeIndex >= 0 && i <= activeIndex
        const color = COLORS[pt.type]

        return (
          <g key={pt.id}>
            {isActive && (
              <>
                <circle className="vg-pulse" cx={x} cy={y} r="12" fill={color} />
                <circle cx={x} cy={y} r="9" fill={color} opacity="0.2" />
              </>
            )}
            <circle
              cx={x} cy={y}
              r={isActive ? 7 : 5}
              fill={isPast ? color : '#e2e8f0'}
              stroke="white"
              strokeWidth={isActive ? 2.5 : 1.5}
              opacity={!isPast && !isActive ? 0.5 : 1}
            />
          </g>
        )
      })}

      {pts[0] && (
        <text x={pts[0].x} y={pts[0].y - 12} fontSize="9" fill="#64748b"
          textAnchor="middle" fontFamily="sans-serif" fontWeight="600">
          Start
        </text>
      )}
      {pts.length > 1 && pts[pts.length - 1] && (
        <text x={pts[pts.length - 1]!.x} y={pts[pts.length - 1]!.y - 12}
          fontSize="9" fill="#64748b" textAnchor="middle" fontFamily="sans-serif" fontWeight="600">
          End
        </text>
      )}

      <text x={SVG_W - 16} y={20} fontSize="10" fill="#94a3b8"
        textAnchor="middle" fontFamily="sans-serif">
        N↑
      </text>
      <text x={SVG_PAD} y={SVG_H - 6} fontSize="9" fill="#94a3b8" fontFamily="sans-serif">
        approx. positions
      </text>
    </svg>
  )
}

// ── point icon ─────────────────────────────────────────────────────────────

function PointIcon({ type, size = 13 }: { type: PlaybackPointType; size?: number }) {
  if (type === 'checkin') return <MapPin size={size} className="text-teal-500" />
  if (type === 'live_tracking') return <Navigation size={size} className="text-emerald-500" />
  if (type === 'activity') return <Calendar size={size} className="text-amber-500" />
  return <Camera size={size} className="text-rose-500" />
}

function dotColor(type: PlaybackPointType) {
  return { backgroundColor: COLORS[type] }
}

// ── main page ─────────────────────────────────────────────────────────────

export default function PlaybackPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const router = useRouter()

  // ── data ──────────────────────────────────────────────────────────────
  const [trip, setTrip] = useState<Trip | null>(null)
  const [days, setDays] = useState<ItineraryDay[]>([])
  const [locationPoints, setLocationPoints] = useState<TripLocationPoint[]>([])
  const [memories, setMemories] = useState<TripMemory[]>([])
  const [loading, setLoading] = useState(true)

  // ── playback ──────────────────────────────────────────────────────────
  const [selectedDayKey, setSelectedDayKey] = useState('')
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<1 | 2 | 4>(1)

  // ── reorder ───────────────────────────────────────────────────────────
  /** customOrder[i] = index into dayPoints. Starts as identity permutation. */
  const [customOrder, setCustomOrder] = useState<number[]>([])

  // ── optimiser ─────────────────────────────────────────────────────────
  const [optimiseResult, setOptimiseResult] = useState<OptimiseRouteResult | null>(null)
  const [optimisedIndices, setOptimisedIndices] = useState<number[] | null>(null)
  const [optimising, setOptimising] = useState(false)
  const [optimiseError, setOptimiseError] = useState<string | null>(null)
  const [mapsAvailable, setMapsAvailable] = useState(true)
  const [showCoach, setShowCoach] = useState(true)

  // ── Google Maps canvas (Phase 7E) ─────────────────────────────────────
  // Derived client-side only (after hydration) so SSR never tries to mount the
  // Google Map — the key check and script injection are browser-only.
  const [browserMapsConfigured, setBrowserMapsConfigured] = useState(false)
  const [mapStatus, setMapStatus] = useState<MapRenderStatus>('loading')

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timelineRef = useRef<HTMLDivElement>(null)

  // ── data fetch ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!tripId) return
    Promise.all([
      getTrip(tripId), getItineraryDays(tripId),
      getLocationPoints(tripId), getMemories(tripId),
    ]).then(([t, d, lp, m]) => {
      if (!t) { router.push('/dashboard'); return }
      setTrip(t); setDays(d); setLocationPoints(lp); setMemories(m); setLoading(false)
    })
  }, [tripId, router])

  useEffect(() => {
    fetch('/api/maps/status')
      .then(r => r.ok ? r.json() : { available: false })
      .then((d: { available?: boolean }) => setMapsAvailable(d.available ?? false))
      .catch(() => { /* keep optimistic */ })
  }, [])

  // Detect the browser key client-side only (after hydration).
  useEffect(() => {
    const configured = isBrowserMapsConfigured()
    setBrowserMapsConfigured(configured)
    if (process.env.NODE_ENV === 'development') {
      console.log('[Voyago Playback] NEXT_PUBLIC_GOOGLE_MAPS_API_KEY present:', configured)
    }
  }, [])

  // ── derived ───────────────────────────────────────────────────────────

  const allPoints = useMemo(
    () => buildPlaybackPoints(days, locationPoints, memories),
    [days, locationPoints, memories],
  )

  const pointsByDay = useMemo(() => groupPlaybackByDay(allPoints), [allPoints])

  const daysWithPoints = useMemo(
    () => Array.from(pointsByDay.keys()).sort(),
    [pointsByDay],
  )

  useEffect(() => {
    if (daysWithPoints.length > 0 && !selectedDayKey) {
      setSelectedDayKey(daysWithPoints[0]!)
    }
  }, [daysWithPoints, selectedDayKey])

  const dayPoints = useMemo(
    () => pointsByDay.get(selectedDayKey) ?? [],
    [pointsByDay, selectedDayKey],
  )

  /** Points in the user's chosen order (customOrder permutation of dayPoints). */
  const displayPoints = useMemo(
    () => customOrder.map((i) => dayPoints[i]).filter((p): p is PlaybackPoint => p != null),
    [dayPoints, customOrder],
  )

  const isReordered = useMemo(
    () => customOrder.some((v, i) => v !== i),
    [customOrder],
  )

  // Reset custom order and optimiser when day changes.
  useEffect(() => {
    const identity = Array.from({ length: dayPoints.length }, (_, i) => i)
    setCustomOrder(identity)
    setOptimisedIndices(null)
    setOptimiseResult(null)
    setOptimiseError(null)
    setCurrentIndex(-1)
    setPlaying(false)
  }, [selectedDayKey, dayPoints.length])

  const totalDistance = useMemo(() => computeTripDistance(allPoints), [allPoints])
  const originalDayDistance = useMemo(() => computeTripDistance(dayPoints), [dayPoints])
  const manualDayDistance = useMemo(() => computeTripDistance(displayPoints), [displayPoints])

  const selectedPoint: PlaybackPoint | null =
    currentIndex >= 0 ? (displayPoints[currentIndex] ?? null) : null

  // The exact road polyline only matches the map when the displayed order is
  // exactly the optimised order. After a manual reorder it goes stale, so we
  // drop back to the straight-line approximation until the user re-optimises.
  const currentOrderIds = useMemo(
    () => displayPoints.map((p) => p.id).join('>'),
    [displayPoints],
  )
  const polylineIsCurrent =
    !!optimiseResult?.routePolyline &&
    optimiseResult.optimisedOrder.join('>') === currentOrderIds
  const activePolyline = polylineIsCurrent ? optimiseResult!.routePolyline! : null
  const showGoogleMap = browserMapsConfigured && mapStatus !== 'error'

  const coachHints = useMemo(
    () => buildCoachHints(displayPoints, manualDayDistance.totalKm, optimiseResult),
    [displayPoints, manualDayDistance.totalKm, optimiseResult],
  )

  // ── playback ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    if (!playing) return
    if (displayPoints.length === 0) { setPlaying(false); return }

    const ms = Math.round(BASE_MS / speed)
    intervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = prev + 1
        if (next >= displayPoints.length) { setPlaying(false); return prev }
        return next
      })
    }, ms)

    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [playing, speed, displayPoints])

  useEffect(() => {
    if (currentIndex < 0 || !timelineRef.current) return
    const el = timelineRef.current.querySelector(`[data-idx="${currentIndex}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [currentIndex])

  // ── handlers ──────────────────────────────────────────────────────────

  function handlePlay() {
    if (displayPoints.length === 0) return
    if (currentIndex < 0) setCurrentIndex(0)
    setPlaying(true)
  }

  function handlePause() { setPlaying(false) }

  function handleReset() {
    setPlaying(false)
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    setCurrentIndex(-1)
  }

  function handleDayChange(key: string) {
    handleReset()
    setSelectedDayKey(key)
  }

  function handleSpeedCycle() {
    setSpeed((prev) => (prev === 1 ? 2 : prev === 2 ? 4 : 1))
  }

  function handleMoveUp(displayIdx: number) {
    if (displayIdx <= 0 || playing) return
    setCustomOrder((prev) => {
      const next = [...prev]
      const tmp = next[displayIdx - 1]!
      next[displayIdx - 1] = next[displayIdx]!
      next[displayIdx] = tmp
      return next
    })
    setCurrentIndex(-1)
    setOptimisedIndices(null)
    setOptimiseResult(null)
    setOptimiseError(null)
  }

  function handleMoveDown(displayIdx: number) {
    if (displayIdx >= customOrder.length - 1 || playing) return
    setCustomOrder((prev) => {
      const next = [...prev]
      const tmp = next[displayIdx + 1]!
      next[displayIdx + 1] = next[displayIdx]!
      next[displayIdx] = tmp
      return next
    })
    setCurrentIndex(-1)
    setOptimisedIndices(null)
    setOptimiseResult(null)
    setOptimiseError(null)
  }

  function handleRevertToOriginal() {
    setCustomOrder(Array.from({ length: dayPoints.length }, (_, i) => i))
    setCurrentIndex(-1)
    setPlaying(false)
    setOptimisedIndices(null)
    setOptimiseResult(null)
    setOptimiseError(null)
  }

  function handleApplyOptimised() {
    if (!optimisedIndices) return
    setCustomOrder(optimisedIndices)
    setCurrentIndex(-1)
    setPlaying(false)
  }

  async function handleOptimise() {
    if (dayPoints.length < 2 || optimising) return
    setOptimising(true)
    setOptimiseError(null)

    try {
      const body = {
        points: dayPoints.map((p) => ({ id: p.id, name: p.label, lat: p.latitude, lng: p.longitude })),
        travelMode: 'driving',
        mode: 'fastest',
      }
      const res = await fetch('/api/maps/route/optimise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.status === 503) {
        setMapsAvailable(false)
        throw new Error('Google Maps is not configured for this deployment.')
      }
      if (!res.ok) throw new Error('Route optimisation failed. Please try again.')

      const data = (await res.json()) as OptimiseRouteResult
      setOptimiseResult(data)

      // Map optimised order (point IDs) back to dayPoints indices.
      const idToIdx: Record<string, number> = {}
      dayPoints.forEach((p, i) => { idToIdx[p.id] = i })
      const indices = data.optimisedOrder
        .map((id) => idToIdx[id])
        .filter((i): i is number => i !== undefined)
      setOptimisedIndices(indices)
    } catch (err) {
      setOptimiseError(err instanceof Error ? err.message : 'Optimisation failed.')
    } finally {
      setOptimising(false)
    }
  }

  const dayIdx = daysWithPoints.indexOf(selectedDayKey)

  // ── loading ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <AppShell title="Route Playback" back={`/trips/${tripId}`} tripId={tripId}>
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
        </div>
      </AppShell>
    )
  }

  // ── empty state ───────────────────────────────────────────────────────

  if (allPoints.length === 0) {
    return (
      <AppShell title="Route Playback" back={`/trips/${tripId}`} tripId={tripId}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 space-y-5 text-center">
            <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center mx-auto">
              <Map size={28} className="text-primary-500" />
            </div>
            <div>
              <p className="font-bold text-gray-900">No location data yet</p>
              <p className="text-sm text-gray-500 mt-1">
                Add location data from any of these sources to animate your route:
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
              <div className="bg-teal-50 rounded-xl p-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <MapPin size={12} className="text-teal-600" />
                  <p className="text-xs font-bold text-teal-700">Travel History</p>
                </div>
                <p className="text-xs text-teal-600">Save GPS check-ins or use foreground live tracking</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Calendar size={12} className="text-amber-600" />
                  <p className="text-xs font-bold text-amber-700">Activity Places</p>
                </div>
                <p className="text-xs text-amber-600">Search places in the Itinerary when Maps is configured</p>
              </div>
              <div className="bg-rose-50 rounded-xl p-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Camera size={12} className="text-rose-500" />
                  <p className="text-xs font-bold text-rose-600">Memory Locations</p>
                </div>
                <p className="text-xs text-rose-500">Attach GPS when saving a photo memory</p>
              </div>
            </div>
          </div>
        </motion.div>
      </AppShell>
    )
  }

  // ── render ────────────────────────────────────────────────────────────

  const progressPct =
    displayPoints.length > 1 && currentIndex >= 0
      ? Math.round((currentIndex / (displayPoints.length - 1)) * 100)
      : 0

  return (
    <AppShell title="Route Playback" back={`/trips/${tripId}`} tripId={tripId}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-3 text-center">
            <p className="text-[11px] text-gray-400">Total points</p>
            <p className="text-xl font-black text-gray-900 mt-0.5">{allPoints.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-3 text-center">
            <p className="text-[11px] text-gray-400">Approx. distance</p>
            <p className="text-xl font-black text-primary-600 mt-0.5">{totalDistance.totalKm} km</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-3 text-center">
            <p className="text-[11px] text-gray-400">Days tracked</p>
            <p className="text-xl font-black text-gray-900 mt-0.5">{daysWithPoints.length}</p>
          </div>
        </div>

        {/* Day selector */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => dayIdx > 0 && handleDayChange(daysWithPoints[dayIdx - 1]!)}
              disabled={dayIdx <= 0}
              className="p-1.5 rounded-xl hover:bg-gray-100 disabled:opacity-25 transition-colors flex-shrink-0"
            >
              <ChevronLeft size={16} className="text-gray-500" />
            </button>

            <div className="flex-1 flex gap-1.5 overflow-x-auto pb-0.5">
              {daysWithPoints.map((key) => (
                <button
                  key={key}
                  onClick={() => handleDayChange(key)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    key === selectedDayKey
                      ? 'bg-primary-500 text-white shadow-sm'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {fmtDate(key)}
                  <span className="ml-1 opacity-60 font-normal">
                    {pointsByDay.get(key)?.length ?? 0}
                  </span>
                </button>
              ))}
            </div>

            <button
              onClick={() => dayIdx < daysWithPoints.length - 1 && handleDayChange(daysWithPoints[dayIdx + 1]!)}
              disabled={dayIdx >= daysWithPoints.length - 1}
              className="p-1.5 rounded-xl hover:bg-gray-100 disabled:opacity-25 transition-colors flex-shrink-0"
            >
              <ChevronRight size={16} className="text-gray-500" />
            </button>
          </div>
        </div>

        {/* Map + controls (left) / Timeline (right) */}
        <div className="lg:grid lg:grid-cols-5 lg:gap-4 space-y-4 lg:space-y-0">

          {/* ── Left: map + controls ─────────────────────────────────── */}
          <div className="lg:col-span-3 space-y-3">

            {/* SVG map card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-3 pb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-gray-700">{fmtDate(selectedDayKey)}</span>
                  <span className="text-gray-300">·</span>
                  <span className="text-xs text-gray-400">
                    {displayPoints.length} point{displayPoints.length !== 1 ? 's' : ''}
                  </span>
                  {displayPoints.length >= 2 && (
                    <>
                      <span className="text-gray-300">·</span>
                      <span className="text-xs text-primary-600 font-semibold">
                        ≈ {manualDayDistance.totalKm} km
                      </span>
                    </>
                  )}
                  {isReordered && (
                    <span className="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full font-bold">
                      reordered
                    </span>
                  )}
                </div>
                {showGoogleMap && mapStatus === 'ready' ? (
                  polylineIsCurrent ? (
                    <div className="flex items-center gap-1 text-[10px] font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                      Google Maps · road route
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-[10px] font-bold text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                      Google Maps · approx. line
                    </div>
                  )
                ) : showGoogleMap && mapStatus === 'loading' ? (
                  <div className="flex items-center gap-1 text-[10px] text-gray-400">
                    <Loader2 size={10} className="animate-spin" />
                    Loading map…
                  </div>
                ) : !browserMapsConfigured ? (
                  <div className="flex items-center gap-1 text-[10px] text-gray-400">
                    <Info size={10} />
                    SVG fallback · set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable map
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-[10px] text-gray-400">
                    <Info size={10} />
                    Approximate SVG fallback
                  </div>
                )}
              </div>
              <div className="px-2 pb-2">
                {showGoogleMap ? (
                  <RouteGoogleMap
                    points={displayPoints}
                    activeIndex={currentIndex}
                    onSelectPoint={(i) => { setCurrentIndex(i); setPlaying(false) }}
                    encodedPolyline={activePolyline}
                    colors={COLORS}
                    labels={TYPE_LABELS}
                    onStatusChange={setMapStatus}
                  />
                ) : (
                  <RouteSvg points={displayPoints} activeIndex={currentIndex} />
                )}
              </div>
              {/* Setup note when browser key is missing */}
              {!browserMapsConfigured && (
                <div className="mx-3 mb-3 flex items-start gap-2 bg-blue-50 rounded-xl px-3 py-2.5">
                  <Info size={12} className="text-blue-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-blue-700">Enable Google Maps canvas</p>
                    <p className="text-[11px] text-blue-600 mt-0.5 leading-snug">
                      Add <code className="bg-blue-100 px-1 rounded font-mono">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> with
                      a key that has the <strong>Maps JavaScript API</strong> enabled, then restart the dev server.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Playback controls */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 space-y-3">
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary-400 rounded-full"
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.15 }}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleReset}
                    title="Reset"
                    className="p-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors"
                  >
                    <RotateCcw size={14} />
                  </button>

                  {playing ? (
                    <button
                      onClick={handlePause}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-500 hover:bg-primary-600 text-white text-sm font-bold shadow-sm transition-colors"
                    >
                      <Pause size={14} /> Pause
                    </button>
                  ) : (
                    <button
                      onClick={handlePlay}
                      disabled={displayPoints.length === 0}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-500 hover:bg-primary-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-bold shadow-sm transition-colors"
                    >
                      <Play size={14} />
                      {currentIndex < 0 ? 'Play' : 'Resume'}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 tabular-nums">
                    {currentIndex >= 0 ? `${currentIndex + 1}` : '0'}/{displayPoints.length}
                  </span>
                  <button
                    onClick={handleSpeedCycle}
                    title="Change playback speed"
                    className="flex items-center gap-1 bg-gray-50 hover:bg-gray-100 text-gray-600 text-xs font-bold px-2.5 py-1.5 rounded-xl transition-colors"
                  >
                    <Zap size={10} className="text-amber-500" />
                    {speed}×
                  </button>
                </div>
              </div>
            </div>

            {/* Route Optimiser card */}
            {dayPoints.length >= 2 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={14} className="text-primary-500" />
                    <p className="text-xs font-black text-gray-700">Route Optimiser</p>
                  </div>
                  {isReordered && (
                    <button
                      onClick={handleRevertToOriginal}
                      className="text-[11px] text-gray-400 hover:text-gray-600 underline transition-colors"
                    >
                      Revert to original
                    </button>
                  )}
                </div>

                {/* Distance comparison */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Original order</span>
                    <span className="font-semibold text-gray-700 tabular-nums">
                      ≈ {originalDayDistance.totalKm} km
                      <span className="text-gray-400 font-normal ml-1">straight-line</span>
                    </span>
                  </div>

                  {isReordered && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-amber-600 font-medium">Your order</span>
                      <span className="font-semibold text-amber-700 tabular-nums">
                        ≈ {manualDayDistance.totalKm} km
                        <span className="text-amber-500 font-normal ml-1">straight-line</span>
                      </span>
                    </div>
                  )}

                  {optimiseResult && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-primary-600 font-medium">Optimised order</span>
                      <div className="text-right">
                        <span className="font-semibold text-primary-700 tabular-nums">
                          ≈ {(optimiseResult.optimisedHaversineMeters / 1000).toFixed(1)} km
                          <span className="text-primary-400 font-normal ml-1">straight-line</span>
                        </span>
                        {optimiseResult.optimisedRouteDurationSeconds > 0 && (
                          <div className="text-[11px] text-primary-500">
                            {fmtMeters(optimiseResult.optimisedRouteDistanceMeters)} road ·{' '}
                            {fmtSeconds(optimiseResult.optimisedRouteDurationSeconds)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  {optimisedIndices && (
                    <button
                      onClick={handleApplyOptimised}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-50 hover:bg-primary-100 text-primary-700 text-xs font-bold transition-colors"
                    >
                      <CheckCircle2 size={12} />
                      Apply optimised order
                    </button>
                  )}

                  <button
                    onClick={handleOptimise}
                    disabled={optimising || !mapsAvailable || dayPoints.length < 2}
                    title={!mapsAvailable ? 'Google Maps not configured — set GOOGLE_MAPS_API_KEY' : undefined}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-900 hover:bg-gray-700 disabled:bg-gray-100 disabled:text-gray-400 text-white text-xs font-bold transition-colors"
                  >
                    {optimising ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <TrendingUp size={12} />
                    )}
                    {optimising ? 'Optimising…' : optimiseResult ? 'Re-optimise' : 'Optimise via Google Routes'}
                    {!mapsAvailable && !optimising && (
                      <span className="text-[10px] text-gray-400 ml-0.5">(setup required)</span>
                    )}
                  </button>
                </div>

                {optimiseError && (
                  <div className="flex items-start gap-1.5 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">
                    <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                    {optimiseError}
                  </div>
                )}
              </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap gap-2">
              {(Object.keys(COLORS) as PlaybackPointType[]).map((type) => (
                <div key={type} className="flex items-center gap-1.5 bg-white rounded-xl border border-gray-100 px-2.5 py-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={dotColor(type)} />
                  <span className="text-[11px] text-gray-600 font-medium">{TYPE_LABELS[type]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right: timeline ───────────────────────────────────────── */}
          <div className="lg:col-span-2">
            <div
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col"
              style={{ maxHeight: 460 }}
            >
              <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-black text-gray-500 uppercase tracking-wider">Timeline</p>
                  {!playing && displayPoints.length >= 2 && (
                    <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-full">
                      reorder ↕
                    </span>
                  )}
                </div>
                {currentIndex >= 0 && (
                  <span className="text-[11px] text-primary-600 font-bold bg-primary-50 px-2 py-0.5 rounded-full">
                    {currentIndex + 1} / {displayPoints.length}
                  </span>
                )}
              </div>

              <div ref={timelineRef} className="overflow-y-auto flex-1">
                {displayPoints.length === 0 ? (
                  <div className="py-10 text-center text-gray-400">
                    <p className="text-xs">No points for this day</p>
                  </div>
                ) : (
                  displayPoints.map((pt, i) => {
                    const isActive = i === currentIndex
                    return (
                      <div
                        key={pt.id}
                        data-idx={i}
                        className={`flex items-start gap-0 border-b border-gray-50 last:border-0 transition-colors ${
                          isActive ? 'bg-primary-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        {/* Reorder buttons */}
                        {!playing && (
                          <div className="flex flex-col items-center justify-center pl-2 pr-1 py-3 gap-0.5 flex-shrink-0">
                            <button
                              onClick={() => handleMoveUp(i)}
                              disabled={i === 0}
                              className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-20 text-gray-400 transition-colors"
                              title="Move up"
                            >
                              <ArrowUp size={11} />
                            </button>
                            <button
                              onClick={() => handleMoveDown(i)}
                              disabled={i === displayPoints.length - 1}
                              className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-20 text-gray-400 transition-colors"
                              title="Move down"
                            >
                              <ArrowDown size={11} />
                            </button>
                          </div>
                        )}

                        {/* Timeline row (clickable) */}
                        <button
                          onClick={() => { setCurrentIndex(i); setPlaying(false) }}
                          className="flex-1 flex items-start gap-3 px-3 py-3 text-left"
                        >
                          <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-sm flex-shrink-0"
                              style={isActive ? { backgroundColor: COLORS[pt.type] } : { backgroundColor: '#f1f5f9' }}
                            >
                              <span style={isActive ? { filter: 'brightness(10)' } : undefined}>
                                <PointIcon type={pt.type} size={11} />
                              </span>
                            </div>
                            {i < displayPoints.length - 1 && (
                              <div className="w-px bg-gray-100 flex-1 mt-1" style={{ minHeight: 10 }} />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-xs font-bold truncate ${
                                isActive ? 'text-primary-700' : 'text-gray-800'
                              }`}
                            >
                              {pt.label}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                              {pt.timestamp && (
                                <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                                  <Clock size={9} /> {fmtTime(pt.timestamp)}
                                </span>
                              )}
                              {pt.accuracy && (
                                <span className="text-[10px] text-gray-400">{fmtAccuracy(pt.accuracy)}</span>
                              )}
                              <span
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                style={{
                                  backgroundColor: COLORS[pt.type] + '22',
                                  color: COLORS[pt.type],
                                }}
                              >
                                {TYPE_LABELS[pt.type]}
                              </span>
                            </div>
                          </div>
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Selected point detail card */}
        <AnimatePresence mode="wait">
          {selectedPoint && (
            <motion.div
              key={selectedPoint.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
            >
              <div
                className="bg-white rounded-2xl border shadow-sm p-4"
                style={{ borderColor: COLORS[selectedPoint.type] + '55' }}
              >
                <div className="flex items-start gap-3">
                  {selectedPoint.memoryCtx?.photoUrl && (
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selectedPoint.memoryCtx.photoUrl}
                        alt={selectedPoint.memoryCtx.title || 'Memory'}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2' }}
                      />
                    </div>
                  )}

                  {!selectedPoint.memoryCtx && (
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: COLORS[selectedPoint.type] + '18' }}
                    >
                      <PointIcon type={selectedPoint.type} size={18} />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-gray-900 text-sm">{selectedPoint.label}</p>
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: COLORS[selectedPoint.type] + '22',
                          color: COLORS[selectedPoint.type],
                        }}
                      >
                        {TYPE_LABELS[selectedPoint.type]}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-gray-400">
                      {selectedPoint.timestamp && (
                        <span className="flex items-center gap-1">
                          <Clock size={10} /> {fmtTime(selectedPoint.timestamp)}
                        </span>
                      )}
                      {selectedPoint.accuracy && <span>{fmtAccuracy(selectedPoint.accuracy)}</span>}
                      <span className="font-mono text-[10px]">
                        {selectedPoint.latitude.toFixed(5)}, {selectedPoint.longitude.toFixed(5)}
                      </span>
                    </div>

                    {selectedPoint.locationCtx?.note && (
                      <p className="text-sm text-gray-600 mt-1 leading-snug">
                        {selectedPoint.locationCtx.note}
                      </p>
                    )}

                    {selectedPoint.activityCtx && (
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        {selectedPoint.activityCtx.category && (
                          <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                            {CATEGORY_LABELS[selectedPoint.activityCtx.category] ?? selectedPoint.activityCtx.category}
                          </span>
                        )}
                        {selectedPoint.activityCtx.placeName && (
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <MapPin size={10} /> {selectedPoint.activityCtx.placeName}
                          </span>
                        )}
                        {selectedPoint.activityCtx.startTime && (
                          <span className="text-xs text-gray-400">{selectedPoint.activityCtx.startTime}</span>
                        )}
                      </div>
                    )}

                    {selectedPoint.memoryCtx?.placeName && (
                      <span className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                        <MapPin size={10} /> {selectedPoint.memoryCtx.placeName}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI Route Coach card */}
        {displayPoints.length >= 1 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <button
              onClick={() => setShowCoach((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-primary-50 flex items-center justify-center">
                  <TrendingUp size={13} className="text-primary-500" />
                </div>
                <p className="text-xs font-black text-gray-700">AI Route Coach</p>
                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium">
                  rule-based
                </span>
              </div>
              <ChevronRight
                size={14}
                className={`text-gray-400 transition-transform ${showCoach ? 'rotate-90' : ''}`}
              />
            </button>

            <AnimatePresence>
              {showCoach && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 space-y-2 border-t border-gray-50 pt-3">
                    {coachHints.map((hint, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs ${
                          hint.level === 'warning'
                            ? 'bg-amber-50 text-amber-800'
                            : hint.level === 'ok'
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-blue-50 text-blue-800'
                        }`}
                      >
                        {hint.level === 'warning' ? (
                          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5 text-amber-600" />
                        ) : hint.level === 'ok' ? (
                          <CheckCircle2 size={12} className="flex-shrink-0 mt-0.5 text-emerald-600" />
                        ) : (
                          <Info size={12} className="flex-shrink-0 mt-0.5 text-blue-600" />
                        )}
                        {hint.text}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Dev-only debug panel — removed from production build by tree-shaking */}
        {process.env.NODE_ENV === 'development' && (
          <DevMapStatus
            browserMapsConfigured={browserMapsConfigured}
            googleMapMounted={showGoogleMap}
            mapStatus={mapStatus}
            routePolylineAvailable={!!activePolyline}
            polylineIsCurrent={polylineIsCurrent}
            loaderState={getLoaderState()}
          />
        )}

      </motion.div>
    </AppShell>
  )
}

// ── Dev-only status panel ─────────────────────────────────────────────────

interface DevMapStatusProps {
  browserMapsConfigured: boolean
  googleMapMounted: boolean
  mapStatus: MapRenderStatus
  routePolylineAvailable: boolean
  polylineIsCurrent: boolean
  loaderState: string
}

function DevMapStatus(p: DevMapStatusProps) {
  const [open, setOpen] = useState(false)

  const fallbackReason = !p.browserMapsConfigured
    ? 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY missing or empty'
    : p.mapStatus === 'error'
    ? 'Maps JS SDK failed to load'
    : p.mapStatus === 'loading'
    ? 'SDK still loading…'
    : null

  function row(label: string, value: string, ok?: boolean) {
    const color = ok === true ? '#16a34a' : ok === false ? '#dc2626' : '#4b5563'
    return (
      <div className="flex items-center justify-between gap-4">
        <span className="text-[10px] text-gray-500">{label}</span>
        <span className="text-[10px] font-mono font-bold" style={{ color }}>{value}</span>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 overflow-hidden text-xs">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-amber-100 transition-colors"
      >
        <span className="font-bold text-amber-800">
          🗺 Maps Debug{!p.browserMapsConfigured ? ' · key missing' : p.mapStatus === 'error' ? ' · load failed' : p.mapStatus === 'ready' ? ' · ready' : ' · loading'}
        </span>
        <span className="text-amber-600 text-[10px]">{open ? '▲ hide' : '▼ show'}</span>
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-1 border-t border-amber-200 pt-2">
          {row('publicBrowserKeyPresent', String(p.browserMapsConfigured), p.browserMapsConfigured)}
          {row('googleMapMounted', String(p.googleMapMounted), p.googleMapMounted)}
          {row('loaderState', p.loaderState)}
          {row('mapStatus', p.mapStatus, p.mapStatus === 'ready')}
          {row('routePolylineAvailable', String(p.routePolylineAvailable))}
          {row('polylineIsCurrent', String(p.polylineIsCurrent))}
          {fallbackReason && (
            <div className="mt-1.5 text-[10px] text-amber-700 bg-amber-100 rounded-lg px-2 py-1.5 leading-snug">
              ⚠ fallbackReason: {fallbackReason}
            </div>
          )}
          {!p.browserMapsConfigured && (
            <div className="mt-1 text-[10px] text-amber-700 leading-snug">
              Fix: add <code className="bg-amber-200 px-0.5 rounded font-mono">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIza…</code> to
              .env.local and restart <code className="font-mono">npm run dev</code>.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
