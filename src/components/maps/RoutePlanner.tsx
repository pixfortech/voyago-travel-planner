'use client'

import { useMemo, useState } from 'react'
import { Car, Footprints, Bus, Route, AlertTriangle, ArrowRight, MapPin } from 'lucide-react'
import { getRoutableActivities } from '@/lib/maps/route'
import type { ItineraryDay, DayRouteSummary, TravelMode } from '@/types'

const MODES: { key: TravelMode; label: string; icon: React.ReactNode }[] = [
  { key: 'driving', label: 'Drive', icon: <Car size={14} /> },
  { key: 'walking', label: 'Walk', icon: <Footprints size={14} /> },
  { key: 'transit', label: 'Transit', icon: <Bus size={14} /> },
]

interface RoutePlannerProps {
  day: ItineraryDay
  onComputed: (dayId: string, summary: DayRouteSummary | null) => void
}

export default function RoutePlanner({ day, onComputed }: RoutePlannerProps) {
  const [mode, setMode] = useState<TravelMode>('driving')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [summary, setSummary] = useState<DayRouteSummary | null>(null)
  const [error, setError] = useState('')

  const routable = useMemo(() => getRoutableActivities(day.activities), [day.activities])
  const canRoute = routable.length >= 2

  async function handleCalculate() {
    if (!canRoute) return
    setStatus('loading')
    setError('')
    try {
      const points = routable.map((a) => ({
        activityId: a.id,
        name: a.placeName ?? a.locationName ?? a.title,
        lat: a.lat as number,
        lng: a.lng as number,
      }))
      const res = await fetch('/api/maps/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayId: day.id, points, travelMode: mode }),
      })
      if (res.status === 503) throw new Error('Maps is not configured in this environment.')
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(data.message || 'Route calculation failed.')
      }
      const data = (await res.json()) as DayRouteSummary
      setSummary(data)
      setStatus('done')
      onComputed(day.id, data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setStatus('error')
      onComputed(day.id, null)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
            <span className="text-xs font-black text-primary-600">{day.dayNumber}</span>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">Day {day.dayNumber} route</p>
            <p className="text-[11px] text-gray-400">
              {routable.length} place{routable.length === 1 ? '' : 's'} with coordinates
            </p>
          </div>
        </div>
        <Route size={16} className="text-gray-300" />
      </div>

      <div className="p-4">
        {!canRoute ? (
          <div className="flex items-start gap-2 text-xs text-gray-400">
            <MapPin size={14} className="mt-0.5 flex-shrink-0" />
            <p>
              Select Google places for at least two activities on this day to calculate travel
              time and distance between them.
            </p>
          </div>
        ) : (
          <>
            {/* Travel mode toggle */}
            <div className="flex items-center gap-1.5 mb-3">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    mode === m.key
                      ? 'bg-primary-500 text-white border-primary-500'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {m.icon} {m.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleCalculate}
              disabled={status === 'loading'}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-primary-500 to-teal-500 text-white text-sm font-semibold shadow-sm hover:shadow-md disabled:opacity-50 transition-all"
            >
              {status === 'loading' ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Calculating…
                </>
              ) : (
                <>
                  <Route size={15} /> {status === 'done' ? 'Recalculate route' : 'Calculate route & time'}
                </>
              )}
            </button>

            {/* Error */}
            {status === 'error' && (
              <div className="flex items-start gap-2 mt-3 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                <AlertTriangle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}

            {/* Result */}
            {status === 'done' && summary && (
              <div className="mt-4 space-y-3">
                {/* Totals */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2">
                    <p className="text-[11px] text-gray-400">Total distance</p>
                    <p className="text-sm font-bold text-gray-900">{summary.totalDistanceText}</p>
                  </div>
                  <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2">
                    <p className="text-[11px] text-gray-400">Total travel time</p>
                    <p className="text-sm font-bold text-gray-900">{summary.totalDurationText}</p>
                  </div>
                </div>

                {/* Legs */}
                <div className="space-y-1.5">
                  {summary.legs.map((leg, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-gray-700 truncate max-w-[34%]">
                        {leg.originName}
                      </span>
                      <ArrowRight size={12} className="text-gray-300 flex-shrink-0" />
                      <span className="font-medium text-gray-700 truncate max-w-[34%]">
                        {leg.destinationName}
                      </span>
                      <span
                        className={`ml-auto flex-shrink-0 font-semibold ${
                          leg.ok ? 'text-primary-600' : 'text-gray-400'
                        }`}
                      >
                        {leg.ok ? `${leg.durationText} · ${leg.distanceText}` : 'No route'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Warnings */}
                {summary.warnings.length > 0 && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 space-y-1">
                    {summary.warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <AlertTriangle size={13} className="text-amber-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-amber-800">{w}</p>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-[11px] text-gray-400">
                  Estimates from Google Maps for travel between selected places. Route data is not
                  saved.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
