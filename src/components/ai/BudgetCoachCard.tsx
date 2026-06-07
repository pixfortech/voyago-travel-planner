'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, RefreshCw, AlertTriangle, Lightbulb,
  CalendarClock, Users, ListChecks, Info, FlaskConical,
} from 'lucide-react'
import { buildBudgetCoachInput } from '@/lib/ai/budgetCoach'
import type {
  Trip, Expense, ItineraryDay, BudgetCoachResult, BudgetCoachResponse,
  BudgetHealth, OverspendRisk,
} from '@/types'

interface BudgetCoachCardProps {
  trip: Trip
  expenses: Expense[]
  days: ItineraryDay[]
  /** 'budget' shows everything; 'itinerary' leads with planned-vs-budget advice. */
  variant?: 'budget' | 'itinerary'
}

const HEALTH_META: Record<BudgetHealth, { label: string; cls: string; bar: string }> = {
  excellent: { label: 'Excellent', cls: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500' },
  good: { label: 'Good', cls: 'bg-green-50 text-green-700', bar: 'bg-green-500' },
  caution: { label: 'Caution', cls: 'bg-amber-50 text-amber-700', bar: 'bg-amber-400' },
  risky: { label: 'Risky', cls: 'bg-orange-50 text-orange-700', bar: 'bg-orange-500' },
  over_budget: { label: 'Over budget', cls: 'bg-red-50 text-red-700', bar: 'bg-red-500' },
}

const RISK_META: Record<OverspendRisk, { label: string; cls: string }> = {
  low: { label: 'Low risk', cls: 'bg-emerald-50 text-emerald-600' },
  medium: { label: 'Medium risk', cls: 'bg-amber-50 text-amber-600' },
  high: { label: 'High risk', cls: 'bg-orange-50 text-orange-600' },
  critical: { label: 'Critical risk', cls: 'bg-red-50 text-red-600' },
}

const HEALTH_FILL: Record<BudgetHealth, number> = {
  excellent: 20, good: 45, caution: 70, risky: 90, over_budget: 100,
}

function ListBlock({
  icon, title, items, tone = 'gray',
}: {
  icon: React.ReactNode
  title: string
  items: string[]
  tone?: 'gray' | 'amber' | 'primary'
}) {
  if (items.length === 0) return null
  const dot =
    tone === 'amber' ? 'bg-amber-400' : tone === 'primary' ? 'bg-primary-400' : 'bg-gray-300'
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-gray-400">{icon}</span>
        <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">{title}</p>
      </div>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
            <span className="text-sm text-gray-700 leading-snug">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function BudgetCoachCard({
  trip, expenses, days, variant = 'budget',
}: BudgetCoachCardProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<BudgetCoachResult | null>(null)
  const [isMock, setIsMock] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const activityCount = days.reduce((s, d) => s + d.activities.length, 0)
  const hasData = trip.budget > 0 || expenses.length > 0 || activityCount > 0

  async function runAnalysis() {
    setStatus('loading')
    setErrorMsg('')
    try {
      const input = buildBudgetCoachInput(trip, expenses, days)
      const res = await fetch('/api/ai/budget-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
        throw new Error(data.message || data.error || `Request failed (${res.status})`)
      }
      const data = (await res.json()) as BudgetCoachResponse
      setResult(data.result)
      setIsMock(data.isMock)
      setStatus('done')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  const health = result ? HEALTH_META[result.budgetHealth] : null
  const risk = result ? RISK_META[result.overspendRisk] : null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-50">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center flex-shrink-0 shadow-sm shadow-violet-500/20">
          <Sparkles size={19} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-bold text-gray-900 text-sm">AI Budget Coach</p>
            <span className="text-[10px] font-black text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full">
              BETA
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {variant === 'itinerary'
              ? 'Planned activities vs your budget'
              : 'Smart, India-first money advice for this trip'}
          </p>
        </div>
        {status === 'done' && (
          <button
            type="button"
            onClick={runAnalysis}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-violet-600 transition-colors flex-shrink-0"
          >
            <RefreshCw size={13} /> Refresh
          </button>
        )}
      </div>

      <div className="p-5">
        {/* Idle */}
        {status === 'idle' && (
          <div className="text-center py-3">
            {hasData ? (
              <>
                <p className="text-sm text-gray-500 mb-4 max-w-sm mx-auto leading-relaxed">
                  Run an analysis of your budget, spending pace, and itinerary
                  estimates to get practical tips for staying on track.
                </p>
                <button
                  type="button"
                  onClick={runAnalysis}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 text-white text-sm font-semibold shadow-md shadow-violet-500/20 hover:shadow-lg hover:-translate-y-px transition-all"
                >
                  <Sparkles size={16} /> Run AI Analysis
                </button>
              </>
            ) : (
              <div className="py-2">
                <p className="text-3xl mb-2">🧭</p>
                <p className="text-sm font-semibold text-gray-700 mb-1">
                  Add itinerary and expenses to unlock smarter advice
                </p>
                <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
                  Set a budget, plan a few activities with estimated costs, and log
                  some expenses — then the AI coach can analyse your trip.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Loading */}
        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="w-9 h-9 border-4 border-violet-100 border-t-violet-500 rounded-full animate-spin mb-3" />
            <p className="text-sm text-gray-500">Analysing your trip…</p>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="text-center py-4">
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-red-50 mb-3">
              <AlertTriangle size={20} className="text-red-500" />
            </div>
            <p className="text-sm font-semibold text-gray-700 mb-1">Analysis failed</p>
            <p className="text-xs text-gray-400 mb-4 max-w-xs mx-auto">{errorMsg}</p>
            <button
              type="button"
              onClick={runAnalysis}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition-colors"
            >
              <RefreshCw size={14} /> Try again
            </button>
          </div>
        )}

        {/* Result */}
        <AnimatePresence>
          {status === 'done' && result && health && risk && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              {/* Mock notice */}
              {isMock && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                  <FlaskConical size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-800 leading-relaxed">
                    <span className="font-bold">Development mock response.</span> This advice was
                    generated locally from your numbers, not a live AI model. Add an
                    <code className="mx-1 px-1 py-0.5 bg-amber-100 rounded text-[11px]">ANTHROPIC_API_KEY</code>
                    in deployment for real AI analysis.
                  </p>
                </div>
              )}

              {/* Health + risk */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${health.cls}`}>
                    {health.label}
                  </span>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${risk.cls}`}>
                    {risk.label}
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${health.bar}`}
                    style={{ width: `${HEALTH_FILL[result.budgetHealth]}%` }}
                  />
                </div>
              </div>

              {/* Summary */}
              <p className="text-sm text-gray-700 leading-relaxed">{result.summary}</p>

              {/* Daily + per-head advice */}
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CalendarClock size={13} className="text-primary-500" />
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                      Daily spend
                    </p>
                  </div>
                  <p className="text-sm text-gray-700 leading-snug">{result.dailySpendAdvice}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Users size={13} className="text-violet-500" />
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                      Per head
                    </p>
                  </div>
                  <p className="text-sm text-gray-700 leading-snug">{result.perHeadAdvice}</p>
                </div>
              </div>

              <ListBlock
                icon={<Info size={13} />}
                title="Key findings"
                items={result.keyFindings}
              />
              <ListBlock
                icon={<Lightbulb size={13} />}
                title="Recommended actions"
                items={result.recommendedActions}
                tone="primary"
              />

              {/* Warnings */}
              {result.categoryWarnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                  <ListBlock
                    icon={<AlertTriangle size={13} />}
                    title="Overspending warnings"
                    items={result.categoryWarnings}
                    tone="amber"
                  />
                </div>
              )}

              <ListBlock
                icon={<CalendarClock size={13} />}
                title="Itinerary suggestions"
                items={result.itinerarySuggestions}
                tone="primary"
              />
              <ListBlock
                icon={<ListChecks size={13} />}
                title="Next best steps"
                items={result.nextBestSteps}
              />

              {/* Data gaps */}
              {result.dataGaps.length > 0 && (
                <div className="border-t border-gray-50 pt-3">
                  <ListBlock
                    icon={<Info size={13} />}
                    title="Missing data"
                    items={result.dataGaps}
                  />
                </div>
              )}

              {/* Disclaimer */}
              <p className="text-[11px] text-gray-400 leading-relaxed border-t border-gray-50 pt-3">
                AI advice is approximate and should be reviewed before you act on it.
                It is not financial advice and no savings are guaranteed.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
