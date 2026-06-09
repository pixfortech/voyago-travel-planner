'use client'

/**
 * FoodInsightCard — Phase 14 Restaurant / Café Intelligence.
 *
 * Shown for food-category activities. Runs AI analysis manually (never auto-runs)
 * from place metadata + trip context, then lets the user save the insight onto
 * the activity. All figures are clearly labelled approximate. Mock fallback is
 * labelled as a development mock.
 */

import { useState } from 'react'
import {
  UtensilsCrossed, Sparkles, RefreshCw, Star, Wallet, Users2,
  ClipboardList, Lightbulb, AlertTriangle, FlaskConical, Check, Loader2,
} from 'lucide-react'
import { priceLevelLabel, priceLevelSymbol } from '@/lib/maps/config'
import { formatCurrency } from '@/lib/utils'
import type {
  Trip, Activity, FoodPlaceInsight, FoodPlaceInsightInput, FoodPlaceInsightResponse, InsightConfidence,
} from '@/types'

interface Props {
  trip: Trip
  activity: Activity
  onSave: (insight: FoodPlaceInsight) => Promise<void>
}

const CONFIDENCE_META: Record<InsightConfidence, { label: string; cls: string }> = {
  low: { label: 'Low confidence', cls: 'bg-amber-50 text-amber-600' },
  medium: { label: 'Medium confidence', cls: 'bg-blue-50 text-blue-600' },
  high: { label: 'High confidence', cls: 'bg-emerald-50 text-emerald-600' },
}

function InfoBlock({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  if (!children) return null
  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-gray-400">{icon}</span>
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">{title}</p>
      </div>
      <p className="text-sm text-gray-700 leading-snug">{children}</p>
    </div>
  )
}

export default function FoodInsightCard({ trip, activity, onSave }: Props) {
  const saved = activity.foodInsight
  const [result, setResult] = useState<FoodPlaceInsight | null>(saved ?? null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>(saved ? 'done' : 'idle')
  const [isMock, setIsMock] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [preferenceNotes, setPreferenceNotes] = useState('')
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved'>('idle')

  const placeName = activity.placeName ?? activity.locationName ?? activity.title
  const rating = activity.placeRating
  const priceLevel = activity.priceLevel

  async function runAnalysis() {
    setStatus('loading')
    setErrorMsg('')
    setSavingState('idle')
    try {
      const input: FoodPlaceInsightInput = {
        placeName,
        placeAddress: activity.placeAddress ?? activity.locationName,
        rating: activity.placeRating,
        userRatingsTotal: activity.placeUserRatingsTotal,
        priceLevel: activity.priceLevel,
        placeTypes: activity.category ? [activity.category] : ['food'],
        tripName: trip.name,
        destination: trip.destination,
        tripType: trip.type,
        currency: trip.currency,
        travellerCount: Math.max(trip.travellers?.length ?? 1, 1),
        preferenceNotes: preferenceNotes.trim() || undefined,
      }
      const res = await fetch('/api/ai/food-place-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
        throw new Error(data.message || data.error || `Request failed (${res.status})`)
      }
      const data = (await res.json()) as FoodPlaceInsightResponse
      setResult(data.result)
      setIsMock(data.isMock)
      setStatus('done')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.')
      setStatus('error')
    }
  }

  async function handleSave() {
    if (!result) return
    setSavingState('saving')
    try {
      await onSave(result)
      setSavingState('saved')
    } catch {
      setSavingState('idle')
    }
  }

  const costRange =
    result?.estimatedCostPerPersonMin != null && result?.estimatedCostPerPersonMax != null
      ? `${formatCurrency(result.estimatedCostPerPersonMin, trip.currency)} – ${formatCurrency(result.estimatedCostPerPersonMax, trip.currency)}`
      : null

  const confidence = result?.confidence ? CONFIDENCE_META[result.confidence] : null

  return (
    <div className="bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-400 to-rose-400 flex items-center justify-center flex-shrink-0 shadow-sm">
          <UtensilsCrossed size={17} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-bold text-gray-900 text-sm truncate">Food Intelligence</p>
            <span className="text-[10px] font-black text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full">BETA</span>
          </div>
          <p className="text-xs text-gray-400 truncate">{placeName}</p>
        </div>
        {status === 'done' && (
          <button
            onClick={runAnalysis}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-orange-600 transition-colors flex-shrink-0"
          >
            <RefreshCw size={13} /> Re-run
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Place metadata chips */}
        {(rating != null || priceLevel != null) && (
          <div className="flex items-center gap-2 flex-wrap">
            {rating != null && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                <Star size={11} className="fill-amber-400 text-amber-400" /> {rating.toFixed(1)}
                {activity.placeUserRatingsTotal != null && (
                  <span className="text-gray-400 font-normal">({activity.placeUserRatingsTotal})</span>
                )}
              </span>
            )}
            {priceLevel != null && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-1 rounded-full">
                {priceLevelSymbol(priceLevel)} · {priceLevelLabel(priceLevel)}
              </span>
            )}
          </div>
        )}

        {/* Idle */}
        {status === 'idle' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 leading-relaxed">
              Get an AI read on this place — vibe, budget fit, an approximate per-person cost range, and ordering tips. Analysis runs only when you ask.
            </p>
            <input
              type="text"
              value={preferenceNotes}
              onChange={(e) => setPreferenceNotes(e.target.value)}
              placeholder="Optional: cuisine or preferences (e.g. veg, spicy)"
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
            />
            <button
              onClick={runAnalysis}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 text-white text-sm font-semibold shadow-md hover:-translate-y-px transition-all"
            >
              <Sparkles size={16} /> Analyse Place
            </button>
          </div>
        )}

        {/* Loading */}
        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center py-6">
            <Loader2 size={24} className="animate-spin text-orange-500 mb-2" />
            <p className="text-sm text-gray-500">Analysing place…</p>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="text-center py-4">
            <AlertTriangle size={20} className="text-red-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-gray-700 mb-1">Analysis failed</p>
            <p className="text-xs text-gray-400 mb-3">{errorMsg}</p>
            <button
              onClick={runAnalysis}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition-colors"
            >
              <RefreshCw size={14} /> Try again
            </button>
          </div>
        )}

        {/* Result */}
        {status === 'done' && result && (
          <div className="space-y-3">
            {isMock && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                <FlaskConical size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-800 leading-relaxed">
                  <span className="font-bold">Development mock.</span> Generated locally from place metadata, not a live AI model. Add an{' '}
                  <code className="px-1 py-0.5 bg-amber-100 rounded text-[11px]">ANTHROPIC_API_KEY</code> for real analysis.
                </p>
              </div>
            )}

            {/* Approximate + confidence badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full uppercase tracking-wide">
                Approximate
              </span>
              {confidence && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${confidence.cls}`}>
                  {confidence.label}
                </span>
              )}
            </div>

            {result.vibeSummary && (
              <p className="text-sm text-gray-700 leading-relaxed">{result.vibeSummary}</p>
            )}

            {/* Cost range — headline */}
            {costRange && (
              <div className="bg-gradient-to-r from-orange-50 to-rose-50 rounded-xl p-3 border border-orange-100">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Wallet size={13} className="text-orange-500" />
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Est. per person (approx)</p>
                </div>
                <p className="text-lg font-black text-gray-900">{costRange}</p>
              </div>
            )}

            <div className="grid gap-2">
              <InfoBlock icon={<Wallet size={13} />} title="Budget fit">{result.budgetFit}</InfoBlock>
              <InfoBlock icon={<Users2 size={13} />} title="Suits">{result.suitableGroupType}</InfoBlock>
              <InfoBlock icon={<ClipboardList size={13} />} title="Ordering strategy">{result.orderingStrategy}</InfoBlock>
              <InfoBlock icon={<Lightbulb size={13} />} title="Spend control">{result.spendControlAdvice}</InfoBlock>
            </div>

            {result.reviewSummary && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">Review summary</p>
                <p className="text-sm text-gray-700 leading-snug">{result.reviewSummary}</p>
              </div>
            )}

            {result.recommendedDishes && result.recommendedDishes.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Dish ideas (generic)</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.recommendedDishes.map((d, i) => (
                    <span key={i} className="text-xs font-medium text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">{d}</span>
                  ))}
                </div>
              </div>
            )}

            {result.caveats && result.caveats.length > 0 && (
              <ul className="space-y-1 border-t border-gray-50 pt-3">
                {result.caveats.map((c, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-400 leading-snug">
                    <AlertTriangle size={10} className="mt-0.5 flex-shrink-0" /> {c}
                  </li>
                ))}
              </ul>
            )}

            {/* Save to activity */}
            <button
              onClick={handleSave}
              disabled={savingState !== 'idle'}
              className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                savingState === 'saved'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-gray-900 text-white hover:bg-gray-800'
              }`}
            >
              {savingState === 'saving' ? (
                <><Loader2 size={15} className="animate-spin" /> Saving…</>
              ) : savingState === 'saved' ? (
                <><Check size={15} /> Saved to activity</>
              ) : (
                <>Save insight to this activity</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
