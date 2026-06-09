'use client'

/**
 * ItineraryRatingCard — Phase 13 AI itinerary analysis card.
 *
 * Calls POST /api/ai/itinerary-rating and shows a structured preview.
 * Included in the Full Recap and Itinerary reports.
 */

import { useState } from 'react'
import { Wand2, Loader2, Info, Star, TrendingUp, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import type { ItineraryRatingInput, ItineraryRatingResult, RatingLevel } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function levelBadge(level: RatingLevel): { label: string; bg: string; text: string } {
  switch (level) {
    case 'excellent': return { label: 'Excellent', bg: 'bg-emerald-100', text: 'text-emerald-700' }
    case 'good':      return { label: 'Good',      bg: 'bg-blue-100',    text: 'text-blue-700' }
    case 'caution':   return { label: 'Caution',   bg: 'bg-amber-100',   text: 'text-amber-700' }
    case 'risky':     return { label: 'Risky',     bg: 'bg-rose-100',    text: 'text-rose-700' }
  }
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, (score / 10) * 100))
  const color =
    score >= 8 ? 'bg-emerald-500' :
    score >= 6 ? 'bg-blue-500' :
    score >= 4 ? 'bg-amber-500' : 'bg-rose-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-gray-600 w-6 text-right">{score}</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  input: ItineraryRatingInput
  /** If true, rendered inside a print context — hide interactive buttons. */
  printable?: boolean
}

export default function ItineraryRatingCard({ input, printable }: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ItineraryRatingResult | null>(null)
  const [isMock, setIsMock] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  async function runRating() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/itinerary-rating', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error('Request failed')
      const data = await res.json()
      setResult(data.result)
      setIsMock(data.isMock)
    } catch {
      setError('Could not reach the AI service. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (printable && !result) return null

  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden print:border-gray-300">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-primary-50 to-indigo-50 border-b border-gray-100">
        <div className="w-8 h-8 rounded-xl bg-primary-100 flex items-center justify-center">
          <Wand2 size={15} className="text-primary-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-black text-gray-900">AI Itinerary Rating</p>
          <p className="text-[11px] text-gray-500">Analysed by Claude</p>
        </div>
        {result && (
          <div className="text-right">
            <p className="text-2xl font-black text-gray-900">{result.overallScore}<span className="text-sm font-semibold text-gray-400">/10</span></p>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${levelBadge(result.overallLevel).bg} ${levelBadge(result.overallLevel).text}`}>
              {levelBadge(result.overallLevel).label}
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-4 space-y-4">
        {!result && !loading && !error && !printable && (
          <div className="text-center py-2">
            <p className="text-xs text-gray-500 mb-3">Get an AI-powered assessment of your itinerary&apos;s quality across 6 dimensions.</p>
            <button
              onClick={runRating}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-colors"
            >
              <Wand2 size={14} />
              Rate My Itinerary
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-4 text-primary-600 text-sm">
            <Loader2 size={16} className="animate-spin" />
            Analysing itinerary…
          </div>
        )}

        {error && (
          <div className="text-xs text-rose-600 bg-rose-50 rounded-xl p-3">
            {error}
            <button onClick={runRating} className="ml-2 underline">Retry</button>
          </div>
        )}

        {result && (
          <>
            {isMock && (
              <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
                <Info size={11} />
                Development mock — no AI key configured
              </div>
            )}

            <p className="text-sm text-gray-700 leading-relaxed">{result.summary}</p>

            {/* Dimension scores */}
            <div className="space-y-2.5">
              {result.dimensions.map((dim) => {
                const badge = levelBadge(dim.level)
                const isOpen = expanded === dim.name
                return (
                  <div key={dim.name} className="rounded-xl border border-gray-100 overflow-hidden">
                    <button
                      onClick={() => setExpanded(isOpen ? null : dim.name)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-gray-800">{dim.name}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>
                            {badge.label}
                          </span>
                        </div>
                        <ScoreBar score={dim.score} />
                      </div>
                      {!printable && (
                        isOpen
                          ? <ChevronUp size={13} className="text-gray-400 flex-shrink-0" />
                          : <ChevronDown size={13} className="text-gray-400 flex-shrink-0" />
                      )}
                    </button>
                    {(isOpen || printable) && (
                      <div className="px-3 pb-3 space-y-1.5">
                        <p className="text-xs text-gray-600">{dim.reason}</p>
                        {dim.improvements.length > 0 && (
                          <ul className="space-y-0.5">
                            {dim.improvements.map((imp, i) => (
                              <li key={i} className="text-xs text-primary-700 flex items-start gap-1.5">
                                <TrendingUp size={11} className="mt-0.5 flex-shrink-0" />
                                {imp}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Strengths & Improvements */}
            {result.topStrengths.length > 0 && (
              <div className="bg-emerald-50 rounded-xl p-3 space-y-1.5">
                <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide flex items-center gap-1">
                  <Star size={11} /> Top Strengths
                </p>
                {result.topStrengths.map((s, i) => (
                  <p key={i} className="text-xs text-emerald-800">• {s}</p>
                ))}
              </div>
            )}
            {result.topImprovements.length > 0 && (
              <div className="bg-amber-50 rounded-xl p-3 space-y-1.5">
                <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wide flex items-center gap-1">
                  <AlertTriangle size={11} /> Suggested Improvements
                </p>
                {result.topImprovements.map((s, i) => (
                  <p key={i} className="text-xs text-amber-800">• {s}</p>
                ))}
              </div>
            )}

            {!printable && (
              <button
                onClick={runRating}
                className="text-xs text-primary-600 hover:underline"
              >
                Re-analyse
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
