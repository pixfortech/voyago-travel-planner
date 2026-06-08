'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Navigation, Camera, Calendar, Play, Pause, RotateCcw,
  Zap, Clock, ChevronLeft, ChevronRight, Map, Info,
} from 'lucide-react'
import { getTrip, getItineraryDays, getLocationPoints, getMemories } from '@/lib/firestore'
import { buildPlaybackPoints, groupPlaybackByDay } from '@/lib/location/playback'
import { computeTripDistance } from '@/lib/location/distance'
import AppShell from '@/components/layout/AppShell'
import type {
  Trip, ItineraryDay, TripLocationPoint, TripMemory,
  PlaybackPoint, PlaybackPointType,
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

/** ms between playback steps at 1× speed */
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
  // Ensure non-zero range so single-point routes render at the center.
  const latRange = Math.max(maxLat - minLat, 0.0003)
  const lngRange = Math.max(maxLng - minLng, 0.0003)

  function proj(lat: number, lng: number) {
    return {
      x: SVG_PAD + ((lng - minLng) / lngRange) * (SVG_W - 2 * SVG_PAD),
      // Latitude increases northward; SVG y increases downward — invert.
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
      {/* CSS animation for the active-point ring — avoid SMIL for TS compat */}
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

      {/* Background */}
      <rect width={SVG_W} height={SVG_H} rx="12" fill="#f0fdf4" />

      {/* Dot grid */}
      {Array.from({ length: 6 }, (_, row) =>
        Array.from({ length: 9 }, (_, col) => (
          <circle
            key={`g${row}-${col}`}
            cx={col * 50}
            cy={row * 52}
            r="1.5"
            fill="#bbf7d0"
          />
        ))
      )}

      {/* Full route — faint dashed */}
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

      {/* Traveled segment — solid teal */}
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

      {/* Point markers */}
      {pts.map(({ x, y }, i) => {
        const pt = points[i]
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
              cx={x}
              cy={y}
              r={isActive ? 7 : 5}
              fill={isPast ? color : '#e2e8f0'}
              stroke="white"
              strokeWidth={isActive ? 2.5 : 1.5}
              opacity={!isPast && !isActive ? 0.5 : 1}
            />
          </g>
        )
      })}

      {/* Start / End labels */}
      {pts[0] && (
        <text
          x={pts[0].x}
          y={pts[0].y - 12}
          fontSize="9"
          fill="#64748b"
          textAnchor="middle"
          fontFamily="sans-serif"
          fontWeight="600"
        >
          Start
        </text>
      )}
      {pts.length > 1 && pts[pts.length - 1] && (
        <text
          x={pts[pts.length - 1].x}
          y={pts[pts.length - 1].y - 12}
          fontSize="9"
          fill="#64748b"
          textAnchor="middle"
          fontFamily="sans-serif"
          fontWeight="600"
        >
          End
        </text>
      )}

      {/* North indicator */}
      <text
        x={SVG_W - 16}
        y={20}
        fontSize="10"
        fill="#94a3b8"
        textAnchor="middle"
        fontFamily="sans-serif"
      >
        N↑
      </text>

      {/* Approx note */}
      <text
        x={SVG_PAD}
        y={SVG_H - 6}
        fontSize="9"
        fill="#94a3b8"
        fontFamily="sans-serif"
      >
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

  const [trip, setTrip] = useState<Trip | null>(null)
  const [days, setDays] = useState<ItineraryDay[]>([])
  const [locationPoints, setLocationPoints] = useState<TripLocationPoint[]>([])
  const [memories, setMemories] = useState<TripMemory[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedDayKey, setSelectedDayKey] = useState('')
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<1 | 2 | 4>(1)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timelineRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!tripId) return
    Promise.all([
      getTrip(tripId), getItineraryDays(tripId),
      getLocationPoints(tripId), getMemories(tripId),
    ]).then(([t, d, lp, m]) => {
      if (!t) { router.push('/dashboard'); return }
      setTrip(t)
      setDays(d)
      setLocationPoints(lp)
      setMemories(m)
      setLoading(false)
    })
  }, [tripId, router])

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

  // Auto-select the first day that has points.
  useEffect(() => {
    if (daysWithPoints.length > 0 && !selectedDayKey) {
      setSelectedDayKey(daysWithPoints[0])
    }
  }, [daysWithPoints, selectedDayKey])

  const dayPoints = useMemo(
    () => pointsByDay.get(selectedDayKey) ?? [],
    [pointsByDay, selectedDayKey],
  )

  const totalDistance = useMemo(
    () => computeTripDistance(allPoints),
    [allPoints],
  )

  const dayDistance = useMemo(() => computeTripDistance(dayPoints), [dayPoints])

  const selectedPoint: PlaybackPoint | null =
    currentIndex >= 0 ? (dayPoints[currentIndex] ?? null) : null

  // ── playback ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (!playing) return
    if (dayPoints.length === 0) { setPlaying(false); return }

    const ms = Math.round(BASE_MS / speed)
    intervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = prev + 1
        if (next >= dayPoints.length) {
          setPlaying(false)
          return prev
        }
        return next
      })
    }, ms)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [playing, speed, dayPoints])

  // Scroll active timeline item into view.
  useEffect(() => {
    if (currentIndex < 0 || !timelineRef.current) return
    const el = timelineRef.current.querySelector(`[data-idx="${currentIndex}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [currentIndex])

  // ── handlers ──────────────────────────────────────────────────────────

  function handlePlay() {
    if (dayPoints.length === 0) return
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
    dayPoints.length > 1 && currentIndex >= 0
      ? Math.round((currentIndex / (dayPoints.length - 1)) * 100)
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
              onClick={() => dayIdx > 0 && handleDayChange(daysWithPoints[dayIdx - 1])}
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
              onClick={() => dayIdx < daysWithPoints.length - 1 && handleDayChange(daysWithPoints[dayIdx + 1])}
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
                  <span className="text-xs text-gray-400">{dayPoints.length} point{dayPoints.length !== 1 ? 's' : ''}</span>
                  {dayPoints.length >= 2 && (
                    <>
                      <span className="text-gray-300">·</span>
                      <span className="text-xs text-primary-600 font-semibold">≈ {dayDistance.totalKm} km</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1 text-[10px] text-gray-400">
                  <Info size={10} />
                  Approx.
                </div>
              </div>
              <div className="px-2 pb-2">
                <RouteSvg points={dayPoints} activeIndex={currentIndex} />
              </div>
            </div>

            {/* Playback controls */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 space-y-3">
              {/* Progress bar */}
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary-400 rounded-full"
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.15 }}
                />
              </div>

              <div className="flex items-center justify-between">
                {/* Transport controls */}
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
                      disabled={dayPoints.length === 0}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-500 hover:bg-primary-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-bold shadow-sm transition-colors"
                    >
                      <Play size={14} />
                      {currentIndex < 0 ? 'Play' : 'Resume'}
                    </button>
                  )}
                </div>

                {/* Counter + speed */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 tabular-nums">
                    {currentIndex >= 0 ? `${currentIndex + 1}` : '0'}/{dayPoints.length}
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
                <p className="text-xs font-black text-gray-500 uppercase tracking-wider">Timeline</p>
                {currentIndex >= 0 && (
                  <span className="text-[11px] text-primary-600 font-bold bg-primary-50 px-2 py-0.5 rounded-full">
                    {currentIndex + 1} / {dayPoints.length}
                  </span>
                )}
              </div>

              <div ref={timelineRef} className="overflow-y-auto flex-1">
                {dayPoints.length === 0 ? (
                  <div className="py-10 text-center text-gray-400">
                    <p className="text-xs">No points for this day</p>
                  </div>
                ) : (
                  dayPoints.map((pt, i) => {
                    const isActive = i === currentIndex
                    return (
                      <button
                        key={pt.id}
                        data-idx={i}
                        onClick={() => { setCurrentIndex(i); setPlaying(false) }}
                        className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b border-gray-50 last:border-0 transition-colors hover:bg-gray-50 ${
                          isActive ? 'bg-primary-50 hover:bg-primary-50' : ''
                        }`}
                      >
                        {/* Connector column */}
                        <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-sm flex-shrink-0"
                            style={isActive ? { backgroundColor: COLORS[pt.type] } : { backgroundColor: '#f1f5f9' }}
                          >
                            <span style={isActive ? { filter: 'brightness(10)' } : undefined}>
                              <PointIcon type={pt.type} size={11} />
                            </span>
                          </div>
                          {i < dayPoints.length - 1 && (
                            <div className="w-px bg-gray-100 flex-1 mt-1" style={{ minHeight: 10 }} />
                          )}
                        </div>

                        {/* Text */}
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
                  {/* Memory photo thumbnail */}
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

                  {/* Icon for non-memory points */}
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

                    {/* Location context: note */}
                    {selectedPoint.locationCtx?.note && (
                      <p className="text-sm text-gray-600 mt-1 leading-snug">
                        {selectedPoint.locationCtx.note}
                      </p>
                    )}

                    {/* Activity context */}
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

                    {/* Memory context: place */}
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

      </motion.div>
    </AppShell>
  )
}
