'use client'

/**
 * GeneratedItineraryPreview — Phase 15C.
 *
 * Renders the AI-generated plan as an editable preview. The user can edit
 * titles/times/costs/category/location, remove activities, move them between
 * days, optionally enrich places via Google Places (user-triggered), and run a
 * road-aware route optimisation (user-triggered) before applying. Nothing is
 * saved until the parent's onApply runs.
 */

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Sparkles, AlertTriangle, Trash2, RotateCcw, Check, Loader2, MapPin,
  Wallet, Footprints, Route, Info, ArrowRightLeft,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import { formatCurrency, formatDate } from '@/lib/utils'
import { mapPlaceTypesToCategory } from '@/lib/maps/categoryMapping'
import type {
  TripGeneratorResult, GeneratedActivity, ActivityCategory,
  PlaceSearchResult, OptimiseRouteResult,
} from '@/types'

export interface EditableGeneratedActivity extends GeneratedActivity {
  _key: string
  _removed: boolean
  _lat?: number
  _lng?: number
  _placeId?: string
  _enriched?: boolean
}
export interface EditableGeneratedDay {
  date: string
  dayNumber: number
  theme?: string
  activities: EditableGeneratedActivity[]
}

interface PreviewProps {
  result: TripGeneratorResult
  currency: string
  travellerCount: number
  isMock: boolean
  applying: boolean
  applyNote: string | null
  mapsAvailable: boolean
  onApply: (days: EditableGeneratedDay[]) => void
  onDiscard: () => void
  onRegenerate: () => void
}

const CATEGORIES: ActivityCategory[] = [
  'sightseeing', 'food', 'hotel', 'transport', 'shopping',
  'adventure', 'spiritual', 'leisure', 'emergency', 'other',
]

interface OptimiseSummary {
  originalKm: number
  optimisedKm: number
  durationText: string
  method: 'road' | 'haversine'
  rank: Map<string, number>   // activity _key → global optimised rank
}

function fmtDuration(seconds: number): string {
  const mins = Math.round(seconds / 60)
  if (mins < 1) return '—'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`
}

export default function GeneratedItineraryPreview({
  result, currency, travellerCount, isMock, applying, applyNote, mapsAvailable,
  onApply, onDiscard, onRegenerate,
}: PreviewProps) {
  const [editDays, setEditDays] = useState<EditableGeneratedDay[]>([])

  // Enrichment.
  const [enriching, setEnriching] = useState(false)
  const [enrichNote, setEnrichNote] = useState<string | null>(null)

  // Optimise.
  const [optimising, setOptimising] = useState(false)
  const [optimise, setOptimise] = useState<OptimiseSummary | null>(null)
  const [optimiseApplied, setOptimiseApplied] = useState(false)
  const [optimiseError, setOptimiseError] = useState<string | null>(null)

  // Rebuild editable state whenever a new result arrives.
  useEffect(() => {
    setEditDays(result.dayPlans.map((d) => ({
      date: d.date,
      dayNumber: d.dayNumber,
      theme: d.theme,
      activities: d.activities.map((a, i) => ({ ...a, _key: `${d.dayNumber}-${i}-${a.title.slice(0, 6)}`, _removed: false })),
    })))
    setOptimise(null)
    setOptimiseApplied(false)
    setEnrichNote(null)
  }, [result])

  const stats = useMemo(() => {
    let total = 0
    let count = 0
    let enriched = 0
    let withQuery = 0
    for (const d of editDays) {
      for (const a of d.activities) {
        if (a._removed) continue
        total += a.estimatedCost || 0
        count++
        if (a._enriched) enriched++
        if (a.suggestedPlaceSearchQuery) withQuery++
      }
    }
    return { total, count, enriched, withQuery, perHead: travellerCount > 0 ? Math.round(total / travellerCount) : total }
  }, [editDays, travellerCount])

  const enrichedCount = useMemo(
    () => editDays.reduce((n, d) => n + d.activities.filter((a) => !a._removed && a._lat != null).length, 0),
    [editDays],
  )

  // ── Editing ─────────────────────────────────────────────────────────────

  function patch(dayDate: string, key: string, updates: Partial<EditableGeneratedActivity>) {
    setEditDays((prev) => prev.map((d) => d.date === dayDate ? {
      ...d,
      activities: d.activities.map((a) => a._key === key ? { ...a, ...updates } : a),
    } : d))
  }
  function toggleRemove(dayDate: string, key: string) {
    setEditDays((prev) => prev.map((d) => d.date === dayDate ? {
      ...d,
      activities: d.activities.map((a) => a._key === key ? { ...a, _removed: !a._removed } : a),
    } : d))
  }
  function moveToDay(fromDate: string, key: string, toDate: string) {
    if (fromDate === toDate) return
    setEditDays((prev) => {
      let moving: EditableGeneratedActivity | undefined
      const stripped = prev.map((d) => {
        if (d.date !== fromDate) return d
        moving = d.activities.find((a) => a._key === key)
        return { ...d, activities: d.activities.filter((a) => a._key !== key) }
      })
      if (!moving) return prev
      return stripped.map((d) => d.date === toDate ? { ...d, activities: [...d.activities, moving!] } : d)
    })
  }

  // ── Google Places enrichment (user-triggered, sequential, bounded) ────────

  async function handleEnrich() {
    setEnriching(true)
    setEnrichNote(null)
    let done = 0
    let failed = 0
    let unavailable = false
    const MAX = 24
    let processed = 0

    // Work on a flat list of activities that have a query and aren't enriched yet.
    const targets: { date: string; key: string; query: string }[] = []
    for (const d of editDays) {
      for (const a of d.activities) {
        if (a._removed || a._enriched || !a.suggestedPlaceSearchQuery) continue
        targets.push({ date: d.date, key: a._key, query: a.suggestedPlaceSearchQuery })
      }
    }

    for (const t of targets) {
      if (processed >= MAX) break
      processed++
      try {
        const res = await fetch('/api/maps/places/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: t.query }),
        })
        if (res.status === 503) {
          unavailable = true
          setEnrichNote('Google Places is not configured — enrichment skipped. The plan still works without it.')
          break
        }
        if (!res.ok) { failed++; continue }
        const data = await res.json() as { results: PlaceSearchResult[] }
        const top = data.results?.[0]
        if (top) {
          const refinedCat = top.types?.length ? mapPlaceTypesToCategory(top.types) : undefined
          const update: Partial<EditableGeneratedActivity> = {
            _lat: top.lat,
            _lng: top.lng,
            _placeId: top.placeId,
            _enriched: true,
            locationName: top.name,
          }
          // Only overwrite category when Google gave a meaningful one.
          if (refinedCat && refinedCat !== 'other') update.category = refinedCat
          patch(t.date, t.key, update)
          done++
        } else {
          patch(t.date, t.key, { _enriched: true }) // mark attempted
        }
      } catch {
        failed++
      }
    }

    setEnriching(false)
    if (!unavailable) {
      setEnrichNote(
        done > 0
          ? `Enriched ${done} place${done === 1 ? '' : 's'} with Google data.${failed ? ` ${failed} could not be matched.` : ''}`
          : 'No places could be matched right now.',
      )
    }
  }

  // ── Route optimisation (user-triggered) ───────────────────────────────────

  async function handleOptimise() {
    setOptimising(true)
    setOptimiseError(null)
    setOptimise(null)
    setOptimiseApplied(false)

    const points: { id: string; name: string; lat: number; lng: number }[] = []
    for (const d of editDays) {
      for (const a of d.activities) {
        if (a._removed || a._lat == null || a._lng == null) continue
        points.push({ id: a._key, name: a.title, lat: a._lat, lng: a._lng })
      }
    }

    if (points.length < 2) {
      setOptimiseError('Enrich at least 2 places with Google Places first so they have coordinates.')
      setOptimising(false)
      return
    }

    // Haversine baseline for the current order.
    const hav = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      const R = 6_371_000, r = (x: number) => (x * Math.PI) / 180
      const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng)
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2
      return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
    }
    let origM = 0
    for (let i = 0; i < points.length - 1; i++) origM += hav(points[i]!, points[i + 1]!)

    try {
      const res = await fetch('/api/maps/route/optimise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points, travelMode: 'driving', mode: 'fastest', keepFirstFixed: true }),
      })

      if (res.status === 503) {
        // Haversine nearest-neighbour fallback.
        const order = [0]
        const used = new Set([0])
        while (order.length < points.length) {
          const last = points[order[order.length - 1]!]!
          let best = -1, bestD = Infinity
          for (let i = 0; i < points.length; i++) {
            if (used.has(i)) continue
            const d = hav(last, points[i]!)
            if (d < bestD) { bestD = d; best = i }
          }
          if (best < 0) break
          order.push(best); used.add(best)
        }
        let optM = 0
        for (let i = 0; i < order.length - 1; i++) optM += hav(points[order[i]!]!, points[order[i + 1]!]!)
        const rank = new Map<string, number>()
        order.forEach((pi, idx) => rank.set(points[pi]!.id, idx))
        setOptimise({
          originalKm: Math.round(origM / 100) / 10,
          optimisedKm: Math.round(optM / 100) / 10,
          durationText: '—',
          method: 'haversine',
          rank,
        })
        return
      }

      if (!res.ok) throw new Error('optimise_failed')
      const data = await res.json() as OptimiseRouteResult
      const rank = new Map<string, number>()
      data.optimisedOrder.forEach((id, idx) => rank.set(id, idx))
      setOptimise({
        originalKm: data.originalRouteDistanceMeters > 0
          ? Math.round(data.originalRouteDistanceMeters / 100) / 10
          : Math.round(origM / 100) / 10,
        optimisedKm: Math.round(data.optimisedRouteDistanceMeters / 100) / 10,
        durationText: fmtDuration(data.optimisedRouteDurationSeconds),
        method: 'road',
        rank,
      })
    } catch {
      setOptimiseError('Route optimisation failed. You can still apply the plan in its current order.')
    } finally {
      setOptimising(false)
    }
  }

  function applyOptimisedOrder() {
    if (!optimise) return
    const rank = optimise.rank
    setEditDays((prev) => prev.map((d) => {
      // Sort enriched (ranked) activities by global rank; keep others in place.
      const ranked = d.activities
        .filter((a) => rank.has(a._key))
        .sort((x, y) => (rank.get(x._key) ?? 0) - (rank.get(y._key) ?? 0))
      const unranked = d.activities.filter((a) => !rank.has(a._key))
      return { ...d, activities: [...ranked, ...unranked] }
    }))
    setOptimiseApplied(true)
  }

  // ── Apply ─────────────────────────────────────────────────────────────────

  function handleApplyClick() {
    const cleaned = editDays
      .map((d) => ({ ...d, activities: d.activities.filter((a) => !a._removed) }))
      .filter((d) => d.activities.length > 0)
    onApply(cleaned)
  }

  const b = result.budgetSummary
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

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <SummaryCard icon={<Wallet size={13} />} label="Total est." value={formatCurrency(stats.total, currency)} tone="primary" />
        <SummaryCard icon={<Wallet size={13} />} label="Per head" value={formatCurrency(stats.perHead, currency)} tone="violet" />
        <SummaryCard icon={<Footprints size={13} />} label="Walking" value={c.walkingIntensity} tone={c.walkingIntensity === 'high' ? 'amber' : 'emerald'} />
        <SummaryCard icon={<Route size={13} />} label="Pace risk" value={c.paceRisk} tone={c.paceRisk === 'high' ? 'amber' : 'emerald'} />
      </div>

      {/* Budget / warnings */}
      {b.remainingBuffer < 0 && (
        <p className="text-xs text-amber-600 font-semibold mb-1 flex items-center gap-1.5">
          <AlertTriangle size={12} /> Over budget by {formatCurrency(Math.abs(b.remainingBuffer), currency)}.
        </p>
      )}
      {result.warnings.map((w, i) => (
        <p key={i} className="text-[11px] text-amber-600 flex items-center gap-1 mb-0.5"><AlertTriangle size={10} /> {w}</p>
      ))}
      {result.assumptions.length > 0 && (
        <p className="text-[11px] text-gray-400 mb-2 flex items-start gap-1"><Info size={10} className="mt-0.5" /> {result.assumptions.join(' · ')}</p>
      )}

      {/* Enrich + optimise toolbar */}
      <div className="flex flex-wrap items-center gap-2 my-3 p-3 bg-gray-50 rounded-xl">
        <Button size="sm" variant="secondary" onClick={handleEnrich} disabled={enriching || stats.withQuery === 0}>
          {enriching ? <Loader2 size={13} className="animate-spin" /> : <MapPin size={13} />}
          {enriching ? 'Enriching…' : 'Enrich with Google Places'}
        </Button>
        <Button size="sm" variant="secondary" onClick={handleOptimise} disabled={optimising || enrichedCount < 2}>
          {optimising ? <Loader2 size={13} className="animate-spin" /> : <Route size={13} />}
          {optimising ? 'Optimising…' : 'Optimise route for this plan'}
        </Button>
        {!mapsAvailable && <span className="text-[11px] text-gray-400">Google Maps not configured — enrichment/optimise unavailable.</span>}
        {enrichedCount > 0 && <span className="text-[11px] text-emerald-600 font-semibold">{enrichedCount} place(s) located</span>}
      </div>
      {enrichNote && <p className="text-[11px] text-gray-500 mb-2 flex items-center gap-1"><Info size={11} /> {enrichNote}</p>}
      {optimiseError && <p className="text-[11px] text-amber-600 mb-2 flex items-center gap-1"><AlertTriangle size={11} /> {optimiseError}</p>}
      {optimise && (
        <div className="mb-3 bg-sky-50 rounded-xl p-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-sky-700">
            <span>Original ≈ {optimise.originalKm} km</span>
            <span>Optimised ≈ {optimise.optimisedKm} km</span>
            {optimise.durationText !== '—' && <span>⏱ {optimise.durationText}</span>}
            <span className="text-[10px] font-normal text-sky-500">{optimise.method === 'road' ? 'Road estimate' : 'Straight-line estimate'}</span>
          </div>
          {!optimiseApplied ? (
            <Button size="sm" onClick={applyOptimisedOrder} className="mt-2">
              <Check size={13} /> Apply optimised order
            </Button>
          ) : (
            <p className="text-[11px] text-emerald-600 font-semibold mt-2 flex items-center gap-1"><Check size={12} /> Optimised order applied to the preview.</p>
          )}
        </div>
      )}

      {/* Day-by-day editable plan */}
      <div className="space-y-4">
        {editDays.map((d) => {
          const dayCost = d.activities.filter((a) => !a._removed).reduce((s, a) => s + (a.estimatedCost || 0), 0)
          return (
            <div key={d.date} className="border border-gray-100 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs font-bold text-gray-800">Day {d.dayNumber} · {formatDate(d.date)}</p>
                  {d.theme && <p className="text-[11px] text-gray-400">{d.theme}</p>}
                </div>
                <span className="text-[11px] text-gray-500 font-semibold">{formatCurrency(dayCost, currency)}</span>
              </div>
              <div className="space-y-1.5">
                {d.activities.map((act) => (
                  <ActivityRow
                    key={act._key}
                    act={act}
                    days={editDays}
                    dayDate={d.date}
                    currency={currency}
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

      {applyNote && <p className="mt-3 text-xs text-emerald-600 flex items-center gap-1.5"><Check size={12} /> {applyNote}</p>}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mt-4">
        <Button onClick={handleApplyClick} disabled={applying} className="flex-1 min-w-[140px]">
          {applying ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          {applying ? 'Applying…' : 'Apply to trip'}
        </Button>
        <Button variant="secondary" onClick={onRegenerate} disabled={applying}>
          <Sparkles size={14} /> Regenerate
        </Button>
        <Button variant="ghost" onClick={onDiscard} disabled={applying}>Discard</Button>
      </div>
      <p className="text-[11px] text-gray-400 mt-2">
        Past/completed days are protected. Generated activities are added as planned estimates and marked
        as AI-generated — they never overwrite your confirmed or completed activities.
      </p>
    </motion.div>
  )
}

// ── Activity row ──────────────────────────────────────────────────────────────

function ActivityRow({
  act, days, dayDate, currency, onPatch, onToggleRemove, onMove,
}: {
  act: EditableGeneratedActivity
  days: EditableGeneratedDay[]
  dayDate: string
  currency: string
  onPatch: (u: Partial<EditableGeneratedActivity>) => void
  onToggleRemove: () => void
  onMove: (toDate: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`rounded-xl border p-2 ${act._removed ? 'opacity-40 border-gray-100 bg-gray-50' : 'border-gray-150 bg-white'}`}>
      <div className="flex items-center gap-2">
        <input
          value={act.startTime ?? ''}
          onChange={(e) => onPatch({ startTime: e.target.value })}
          placeholder="--:--"
          className="w-14 text-xs font-mono text-gray-500 bg-gray-50 rounded-lg px-1.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-300"
        />
        <input
          value={act.title}
          onChange={(e) => onPatch({ title: e.target.value })}
          className="flex-1 min-w-0 text-sm text-gray-800 bg-transparent focus:outline-none"
        />
        {act.isBreak && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-500">Break</span>}
        {act._enriched && act._lat != null && <MapPin size={12} className="text-emerald-500 flex-shrink-0" />}
        <input
          type="number" min="0"
          value={act.estimatedCost ?? 0}
          onChange={(e) => onPatch({ estimatedCost: Number(e.target.value) || 0 })}
          className="w-16 text-xs text-gray-500 bg-gray-50 rounded-lg px-1.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-300"
        />
        <button onClick={() => setOpen((v) => !v)} className="text-gray-400 hover:bg-gray-100 rounded-lg p-1" title="Details">
          <ArrowRightLeft size={13} />
        </button>
        <button onClick={onToggleRemove}
          className={`p-1 rounded-lg ${act._removed ? 'text-gray-400 hover:bg-gray-100' : 'text-red-400 hover:bg-red-50'}`}
          title={act._removed ? 'Restore' : 'Remove'}>
          {act._removed ? <RotateCcw size={13} /> : <Trash2 size={13} />}
        </button>
      </div>

      {open && (
        <div className="mt-2 pt-2 border-t border-gray-100 grid sm:grid-cols-2 gap-2">
          <label className="text-[11px] text-gray-500">
            Category
            <select
              value={act.category}
              onChange={(e) => onPatch({ category: e.target.value as ActivityCategory })}
              className="mt-0.5 w-full text-xs bg-gray-50 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-300"
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
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
