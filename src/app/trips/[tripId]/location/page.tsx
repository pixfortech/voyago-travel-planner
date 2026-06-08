'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Navigation, Play, Square, Trash2, Clock, AlertTriangle,
  CheckCircle2, Loader2, ChevronDown, ChevronUp, Info,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import {
  getTrip, getLocationPoints, addLocationPoint, deleteLocationPoint,
} from '@/lib/firestore'
import { getCurrentPosition, watchPosition, isGeolocationSupported, GeoError } from '@/lib/location/geo'
import { computeTripDistance } from '@/lib/location/distance'
import AppShell from '@/components/layout/AppShell'
import type { Trip, TripLocationPoint, LocationSource } from '@/types'

// ── helpers ──────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function formatAccuracy(m?: number) {
  if (!m) return null
  if (m < 10) return '±< 10 m'
  if (m < 100) return `±${Math.round(m)} m`
  return `±${(m / 1000).toFixed(1)} km`
}

/** Group points by their dayKey (YYYY-MM-DD). */
function groupByDay(points: TripLocationPoint[]): Array<{ dayKey: string; pts: TripLocationPoint[] }> {
  const map = new Map<string, TripLocationPoint[]>()
  for (const p of points) {
    const key = p.dayKey ?? p.capturedAt.slice(0, 10)
    const arr = map.get(key) ?? []
    arr.push(p)
    map.set(key, arr)
  }
  // newest day first
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dayKey, pts]) => ({ dayKey, pts }))
}

function geoErrorMessage(err: GeoError): string {
  return err.message
}

// ── component ─────────────────────────────────────────────────────────────

export default function LocationPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const router = useRouter()
  const { user } = useApp()

  const [trip, setTrip] = useState<Trip | null>(null)
  const [points, setPoints] = useState<TripLocationPoint[]>([])
  const [loading, setLoading] = useState(true)

  // check-in form state
  const [checkinLabel, setCheckinLabel] = useState('')
  const [checkinNote, setCheckinNote] = useState('')
  const [checkinBusy, setCheckinBusy] = useState(false)
  const [checkinError, setCheckinError] = useState<string | null>(null)
  const [checkinSuccess, setCheckinSuccess] = useState(false)

  // live tracking state
  const [tracking, setTracking] = useState(false)
  const [trackingError, setTrackingError] = useState<string | null>(null)
  const [trackingCount, setTrackingCount] = useState(0)
  const stopTrackingRef = useRef<(() => void) | null>(null)

  // UI state
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (!tripId) return
    Promise.all([getTrip(tripId), getLocationPoints(tripId)]).then(([t, pts]) => {
      if (!t) { router.push('/dashboard'); return }
      setTrip(t)
      setPoints(pts)
      // auto-expand the most recent day
      const first = pts[0]?.dayKey ?? pts[0]?.capturedAt.slice(0, 10)
      if (first) setExpandedDays(new Set([first]))
      setLoading(false)
    })
  }, [tripId, router])

  // stop tracking when the component unmounts
  useEffect(() => {
    return () => { stopTrackingRef.current?.() }
  }, [])

  // ── check-in ──────────────────────────────────────────────────────────

  async function handleCheckin() {
    if (!user || !tripId) return
    setCheckinBusy(true)
    setCheckinError(null)
    setCheckinSuccess(false)
    try {
      const pos = await getCurrentPosition()
      const now = new Date()
      const dayKey = now.toISOString().slice(0, 10)
      const data: Omit<TripLocationPoint, 'id' | 'createdAt'> = {
        tripId,
        userId: user.uid,
        latitude: pos.latitude,
        longitude: pos.longitude,
        accuracy: pos.accuracy,
        altitude: pos.altitude ?? undefined,
        heading: pos.heading ?? undefined,
        speed: pos.speed ?? undefined,
        capturedAt: new Date(pos.timestamp).toISOString(),
        source: 'manual_checkin' as LocationSource,
        label: checkinLabel.trim() || undefined,
        note: checkinNote.trim() || undefined,
        dayKey,
      }
      const saved = await addLocationPoint(tripId, data)
      setPoints((prev) => [saved, ...prev])
      setCheckinLabel('')
      setCheckinNote('')
      setCheckinSuccess(true)
      setTimeout(() => setCheckinSuccess(false), 3000)
      setExpandedDays((prev) => { const next = new Set(prev); next.add(dayKey); return next })
    } catch (err) {
      setCheckinError(geoErrorMessage(err as GeoError))
    } finally {
      setCheckinBusy(false)
    }
  }

  // ── live tracking ─────────────────────────────────────────────────────

  function handleStartTracking() {
    if (!user || !tripId) return
    setTrackingError(null)

    const lastPoint = points[0]
    const stop = watchPosition(
      async (pos) => {
        const now = new Date()
        const dayKey = now.toISOString().slice(0, 10)
        const data: Omit<TripLocationPoint, 'id' | 'createdAt'> = {
          tripId,
          userId: user.uid,
          latitude: pos.latitude,
          longitude: pos.longitude,
          accuracy: pos.accuracy,
          altitude: pos.altitude ?? undefined,
          heading: pos.heading ?? undefined,
          speed: pos.speed ?? undefined,
          capturedAt: new Date(pos.timestamp).toISOString(),
          source: 'live_tracking' as LocationSource,
          dayKey,
        }
        try {
          const saved = await addLocationPoint(tripId, data)
          setPoints((prev) => [saved, ...prev])
          setTrackingCount((c) => c + 1)
          setExpandedDays((prev) => { const next = new Set(prev); next.add(dayKey); return next })
        } catch {
          // silent — tracking continues even if one save fails
        }
      },
      (err) => {
        setTrackingError(geoErrorMessage(err))
        handleStopTracking()
      },
      lastPoint?.latitude,
      lastPoint?.longitude,
    )

    stopTrackingRef.current = stop
    setTracking(true)
    setTrackingCount(0)
  }

  function handleStopTracking() {
    stopTrackingRef.current?.()
    stopTrackingRef.current = null
    setTracking(false)
  }

  // ── delete ────────────────────────────────────────────────────────────

  async function handleDelete(pointId: string) {
    if (!confirm('Delete this check-in? This cannot be undone.')) return
    setDeletingId(pointId)
    try {
      await deleteLocationPoint(tripId, pointId)
      setPoints((prev) => prev.filter((p) => p.id !== pointId))
    } finally {
      setDeletingId(null)
    }
  }

  // ── derived data ──────────────────────────────────────────────────────

  // Distance is computed from oldest→newest, so reverse the default desc order
  const orderedPoints = [...points].reverse()
  const { totalKm } = computeTripDistance(orderedPoints)
  const groups = groupByDay(points)

  if (loading) {
    return (
      <AppShell title="Travel History" back={`/trips/${tripId}`} tripId={tripId}>
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title="Travel History" back={`/trips/${tripId}`} tripId={tripId}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">

        {/* Summary bar */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400">Total check-ins</p>
              <p className="text-2xl font-black text-gray-900 mt-0.5">{points.length}</p>
            </div>
            {points.length >= 2 && (
              <div className="text-right">
                <p className="text-xs text-gray-400">Approx. distance</p>
                <p className="text-lg font-black text-primary-600 mt-0.5">{totalKm} km</p>
                <p className="text-[10px] text-gray-400">approx. · straight-line</p>
              </div>
            )}
          </div>
        </div>

        {/* Check-in card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-50 rounded-xl flex items-center justify-center">
              <MapPin size={15} className="text-primary-600" />
            </div>
            <p className="font-bold text-gray-900 text-sm">Save check-in</p>
          </div>

          <input
            type="text"
            placeholder="Label (e.g. Taj Mahal gate)"
            value={checkinLabel}
            onChange={(e) => setCheckinLabel(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-300"
          />
          <input
            type="text"
            placeholder="Note (optional)"
            value={checkinNote}
            onChange={(e) => setCheckinNote(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-300"
          />

          <button
            onClick={handleCheckin}
            disabled={checkinBusy}
            className="w-full flex items-center justify-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:bg-primary-300 text-white text-sm font-bold rounded-xl px-4 py-2.5 transition-colors"
          >
            {checkinBusy ? (
              <Loader2 size={15} className="animate-spin" />
            ) : checkinSuccess ? (
              <CheckCircle2 size={15} />
            ) : (
              <MapPin size={15} />
            )}
            {checkinBusy ? 'Getting location…' : checkinSuccess ? 'Saved!' : 'Use current location'}
          </button>

          {checkinError && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 text-xs rounded-xl px-3 py-2">
              <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
              <span>{checkinError}</span>
            </div>
          )}

          {!isGeolocationSupported() && (
            <div className="flex items-start gap-2 bg-amber-50 text-amber-700 text-xs rounded-xl px-3 py-2">
              <Info size={13} className="mt-0.5 flex-shrink-0" />
              <span>Location is not supported by this browser.</span>
            </div>
          )}
        </div>

        {/* Live tracking card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${tracking ? 'bg-emerald-50' : 'bg-gray-50'}`}>
              <Navigation size={15} className={tracking ? 'text-emerald-600' : 'text-gray-500'} />
            </div>
            <div className="flex-1">
              <p className="font-bold text-gray-900 text-sm">Foreground live tracking</p>
              {tracking && (
                <p className="text-[11px] text-emerald-600 font-semibold">
                  Active · {trackingCount} point{trackingCount !== 1 ? 's' : ''} saved
                </p>
              )}
            </div>
            {tracking && (
              <span className="flex items-center gap-1 bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            )}
          </div>

          <div className="flex items-start gap-2 bg-amber-50 text-amber-700 text-xs rounded-xl px-3 py-2">
            <Info size={13} className="mt-0.5 flex-shrink-0" />
            <span>
              Tracking works only while this page is open and the browser tab is active.
              It stops when you switch apps or close the tab.
            </span>
          </div>

          {tracking ? (
            <button
              onClick={handleStopTracking}
              className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-xl px-4 py-2.5 transition-colors"
            >
              <Square size={14} />
              Stop tracking
            </button>
          ) : (
            <button
              onClick={handleStartTracking}
              disabled={!isGeolocationSupported()}
              className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white text-sm font-bold rounded-xl px-4 py-2.5 transition-colors"
            >
              <Play size={14} />
              Start live tracking
            </button>
          )}

          {trackingError && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 text-xs rounded-xl px-3 py-2">
              <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
              <span>{trackingError}</span>
            </div>
          )}
        </div>

        {/* Check-in history */}
        {groups.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <MapPin size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No check-ins yet</p>
            <p className="text-xs mt-1">Save your first location above</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider px-0.5">
              Check-in history
            </p>
            {groups.map(({ dayKey, pts }) => {
              const expanded = expandedDays.has(dayKey)
              return (
                <div key={dayKey} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <button
                    onClick={() => setExpandedDays((prev) => {
                      const next = new Set(prev)
                      if (next.has(dayKey)) next.delete(dayKey)
                      else next.add(dayKey)
                      return next
                    })}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-primary-50 rounded-lg flex items-center justify-center">
                        <Clock size={11} className="text-primary-600" />
                      </div>
                      <span className="text-sm font-bold text-gray-800">{formatDate(dayKey)}</span>
                      <span className="text-xs text-gray-400 font-medium">{pts.length} check-in{pts.length !== 1 ? 's' : ''}</span>
                    </div>
                    {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                  </button>

                  <AnimatePresence initial={false}>
                    {expanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="divide-y divide-gray-50 border-t border-gray-50">
                          {pts.map((pt) => (
                            <div key={pt.id} className="px-4 py-3 flex items-start gap-3">
                              <div className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center mt-0.5 flex-shrink-0">
                                {pt.source === 'live_tracking' ? (
                                  <Navigation size={9} className="text-primary-600" />
                                ) : (
                                  <MapPin size={9} className="text-primary-600" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                {pt.label && (
                                  <p className="text-sm font-bold text-gray-900 truncate">{pt.label}</p>
                                )}
                                {pt.note && (
                                  <p className="text-xs text-gray-500 truncate">{pt.note}</p>
                                )}
                                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                  <span className="text-[11px] text-gray-400">{formatTime(pt.capturedAt)}</span>
                                  {pt.accuracy && (
                                    <span className="text-[11px] text-gray-400">{formatAccuracy(pt.accuracy)}</span>
                                  )}
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                    pt.source === 'live_tracking'
                                      ? 'bg-emerald-50 text-emerald-600'
                                      : 'bg-primary-50 text-primary-600'
                                  }`}>
                                    {pt.source === 'live_tracking' ? 'Live' : 'Check-in'}
                                  </span>
                                </div>
                                <p className="text-[10px] text-gray-300 mt-0.5 font-mono">
                                  {pt.latitude.toFixed(5)}, {pt.longitude.toFixed(5)}
                                </p>
                              </div>
                              <button
                                onClick={() => handleDelete(pt.id)}
                                disabled={deletingId === pt.id}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                                title="Delete check-in"
                              >
                                {deletingId === pt.id ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <Trash2 size={13} />
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        )}

      </motion.div>
    </AppShell>
  )
}
