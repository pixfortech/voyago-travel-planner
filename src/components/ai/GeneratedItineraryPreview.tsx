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
} from 'lucide-react'
import Button from '@/components/ui/Button'
import { formatCurrency, formatDate } from '@/lib/utils'
import { mapPlaceTypesToCategory } from '@/lib/maps/categoryMapping'
import type {
  TripGeneratorResult, GeneratedActivity, ActivityCategory,
  PlaceSearchResult, OptimiseRouteResult, GeneratedDayRoute,
  BudgetInclusion, BudgetCategoryKey, PlannedTransport, PlannedStay,
} from '@/types'

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
}
export interface EditableGeneratedDay {
  date: string
  dayNumber: number
  theme?: string
  activities: EditableGeneratedActivity[]
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

/** Verification state for a single activity (drives badges + apply gating). */
function verifyState(a: EditableGeneratedActivity): 'verified' | 'unverified' | 'neutral' {
  if (a._enriched && a._placeId) return 'verified'
  if (a.needsVerification || (a._enriched && !a._placeId)) return 'unverified'
  return 'neutral'
}

export default function GeneratedItineraryPreview({
  result, currency, travellerCount, isMock, applying, applyNote, mapsAvailable,
  applyLabel = 'Apply to trip', applyingLabel = 'Applying…',
  autoEnrich = false, budgetContext,
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

  async function optimiseDay(date: string, silent = false): Promise<void> {
    if (!silent) setOptimisingDay(date)
    const day = editDaysRef.current.find((d) => d.date === date)
    if (!day) { if (!silent) setOptimisingDay(null); return }
    const points = day.activities
      .filter((a) => !a._removed && a._lat != null && a._lng != null)
      .map((a) => ({ id: a._key, name: a.title, lat: a._lat!, lng: a._lng! }))

    if (points.length < 2) { if (!silent) setOptimisingDay(null); return }

    let origM = 0
    for (let i = 0; i < points.length - 1; i++) origM += haversine(points[i]!, points[i + 1]!)

    try {
      const res = await fetch('/api/maps/route/optimise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points, travelMode: 'driving', mode: 'fastest', keepFirstFixed: true }),
      })

      let rank = new Map<string, number>()
      let summary: GeneratedDayRoute

      if (res.status === 503 || !res.ok) {
        // Haversine nearest-neighbour fallback.
        const order = [0]; const used = new Set([0])
        while (order.length < points.length) {
          const last = points[order[order.length - 1]!]!
          let best = -1, bestD = Infinity
          for (let i = 0; i < points.length; i++) {
            if (used.has(i)) continue
            const d = haversine(last, points[i]!)
            if (d < bestD) { bestD = d; best = i }
          }
          if (best < 0) break
          order.push(best); used.add(best)
        }
        let optM = 0
        for (let i = 0; i < order.length - 1; i++) optM += haversine(points[order[i]!]!, points[order[i + 1]!]!)
        order.forEach((pi, idx) => rank.set(points[pi]!.id, idx))
        summary = { stops: points.length, distanceKm: Math.round(optM / 100) / 10, durationText: '—', method: 'haversine', stale: false }
      } else {
        const data = await res.json() as OptimiseRouteResult
        data.optimisedOrder.forEach((id, idx) => rank.set(id, idx))
        summary = {
          stops: points.length,
          distanceKm: Math.round(data.optimisedRouteDistanceMeters / 100) / 10,
          durationText: fmtDuration(data.optimisedRouteDurationSeconds),
          method: 'road',
          stale: false,
        }
      }

      // Reorder the day's geocoded activities by rank; keep others in place after.
      const next = editDaysRef.current.map((d) => {
        if (d.date !== date) return d
        const ranked = d.activities.filter((a) => rank.has(a._key)).sort((x, y) => (rank.get(x._key) ?? 0) - (rank.get(y._key) ?? 0))
        const unranked = d.activities.filter((a) => !rank.has(a._key))
        return { ...d, activities: [...ranked, ...unranked] }
      })
      commitDays(next)
      setDayRoutes((prev) => ({ ...prev, [date]: summary }))
    } catch {
      // leave as-is on failure
    } finally {
      if (!silent) setOptimisingDay(null)
    }
  }

  async function optimiseAllDays() {
    setOptimisingAll(true)
    const dates = editDaysRef.current
      .filter((d) => d.activities.filter((a) => !a._removed && a._lat != null).length >= 2)
      .map((d) => d.date)
    for (const date of dates) await optimiseDay(date, true)
    setOptimisingAll(false)
  }

  // ── Auto-run: enrich + optimise before the final preview ──────────────────

  useEffect(() => {
    if (!autoEnrich || !mapsAvailable) return
    if (autoRanForRef.current === result) return
    autoRanForRef.current = result
    let cancelled = false
    ;(async () => {
      setAutoRunning(true)
      setEnriching(true)
      const r = await enrichPlaces(true)
      setEnriching(false)
      if (cancelled) return
      if (r.unavailable) {
        setEnrichNote('Google Places is not configured — places shown are AI suggestions and remain unverified.')
        setAutoRunning(false)
        return
      }
      setEnrichNote(r.done > 0 ? `Auto-verified ${r.done} place${r.done === 1 ? '' : 's'} with Google.` : 'Could not match places automatically — try “Resolve unverified”.')
      await optimiseAllDays()
      if (!cancelled) setAutoRunning(false)
    })()
    return () => { cancelled = true }
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
                    {!r.stale && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-600"><Check size={9} /> Route optimised</span>}
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

      {hasUnverified && (
        <p className="mt-3 text-[11px] text-amber-600 flex items-center gap-1.5">
          <ShieldAlert size={12} /> {stats.unverified} place(s) are unverified AI suggestions.
          {mapsAvailable ? ' Use “Resolve unverified” to confirm them with Google before applying.' : ' Edit them manually before applying.'}
        </p>
      )}
      {applyNote && <p className="mt-2 text-xs text-emerald-600 flex items-center gap-1.5"><Check size={12} /> {applyNote}</p>}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mt-4">
        <Button onClick={handleApplyClick} disabled={applying || busy} className="flex-1 min-w-[140px]">
          {applying ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          {applying ? applyingLabel : applyLabel}
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
  const v = verifyState(act)
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
          <input
            value={act.title}
            onChange={(e) => onPatch({ title: e.target.value })}
            className="w-full text-sm text-gray-800 bg-transparent focus:outline-none"
          />
          {/* Badges */}
          <div className="flex items-center flex-wrap gap-1 mt-0.5">
            {act.isBreak && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-500">Break</span>}
            {v === 'verified' && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600"><ShieldCheck size={9} /> Verified by Google</span>}
            {v === 'unverified' && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600"><ShieldAlert size={9} /> Unverified</span>}
            {act._autoCategory && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-500">Auto-category</span>}
            {act._placeRating != null && <span className="text-[9px] text-gray-400">★ {act._placeRating}{act._placeUserRatings ? ` (${act._placeUserRatings})` : ''}</span>}
          </div>
        </div>
        <input
          type="number" min="0"
          value={act.estimatedCost ?? 0}
          onChange={(e) => onPatch({ estimatedCost: Number(e.target.value) || 0 })}
          className="w-16 text-xs text-gray-500 bg-gray-50 rounded-lg px-1.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-300 self-start"
        />
        <button onClick={() => setOpen((vv) => !vv)} className="text-gray-400 hover:bg-gray-100 rounded-lg p-1 self-start" title="Details">
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
