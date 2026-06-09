'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Printer, ArrowLeft, Download, UtensilsCrossed, Image, Lock } from 'lucide-react'
import Link from 'next/link'
import {
  getTrip, getExpenses, getMemories, getItineraryDays, getLocationPoints,
} from '@/lib/firestore'
import { getTasks } from '@/lib/planning'
import {
  getDocs, collection,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import {
  getTotalSpent, getRemainingBudget, getCategoryTotals, getVendorTypeTotals,
  getDayWiseTotals, getTravellerBalances, getSettlementSummary, getPerHeadActualCost,
  getFoodSpendStats,
} from '@/lib/calculations'
import { computeTripDistance } from '@/lib/location/distance'
import { buildPlaybackPoints } from '@/lib/location/playback'
import { computeGapAnalysis } from '@/lib/location/gapAnalysis'
import { downloadExpensesCSV, downloadSettlementCSV } from '@/lib/export'
import { formatDate, formatCurrency, getDayCount, tripTypeLabel } from '@/lib/utils'
import ItineraryRatingCard from '@/components/trips/ItineraryRatingCard'
import type {
  Trip, Expense, TripMemory, ItineraryDay, TripLocationPoint,
  TripTask, ItineraryRatingInput,
} from '@/types'

const REPORT_TITLES: Record<string, string> = {
  full: 'Full Trip Recap',
  itinerary: 'Itinerary Report',
  budget: 'Budget Report',
  settlement: 'Settlement Report',
  route: 'Route Summary',
  memories: 'Memories Album',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8 print:mb-6 print:break-inside-avoid-page">
      <h2 className="text-base font-black text-gray-700 uppercase tracking-wider mb-3 pb-2 border-b border-gray-200">
        {title}
      </h2>
      {children}
    </section>
  )
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl px-4 py-3 print:border print:border-gray-200 print:bg-white">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-black text-gray-900 mt-0.5">{value}</p>
    </div>
  )
}

// ── Enhanced Trip Header ──────────────────────────────────────────────────────

function TripHeader({
  trip,
  expenses,
  days,
  memories,
  tasks,
  pollCount,
  totalDistanceKm,
}: {
  trip: Trip
  expenses: Expense[]
  days: ItineraryDay[]
  memories: TripMemory[]
  tasks: TripTask[]
  pollCount: number
  totalDistanceKm: number
}) {
  const dayCount = getDayCount(trip.startDate, trip.endDate)
  const spent = getTotalSpent(expenses)
  const remaining = trip.budget > 0 ? getRemainingBudget(trip.budget, expenses) : null
  const perHead = (trip.travellers?.length ?? 0) > 0
    ? getPerHeadActualCost(expenses, trip.travellers!.length)
    : null
  const completedTasks = tasks.filter((t) => t.status === 'done').length
  const activityCount = days.reduce((n, d) => n + d.activities.length, 0)
  const foodStats = getFoodSpendStats(expenses, trip.travellers?.length ?? 1)

  return (
    <Section title="Trip Overview">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatPill label="Destination" value={trip.destination} />
        <StatPill label="Duration" value={`${dayCount} day${dayCount !== 1 ? 's' : ''}`} />
        <StatPill label="Dates" value={`${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}`} />
        <StatPill label="Type" value={tripTypeLabel(trip.type)} />
        {expenses.length > 0 && (
          <StatPill label="Total Spent" value={formatCurrency(spent, trip.currency)} />
        )}
        {remaining !== null && (
          <StatPill
            label={remaining < 0 ? 'Over Budget' : 'Remaining'}
            value={formatCurrency(Math.abs(remaining), trip.currency)}
          />
        )}
        {trip.budget > 0 && (
          <StatPill label="Budget" value={formatCurrency(trip.budget, trip.currency)} />
        )}
        {perHead !== null && perHead > 0 && (
          <StatPill label="Per Head" value={formatCurrency(perHead, trip.currency)} />
        )}
        {(trip.travellers?.length ?? 0) > 0 && (
          <StatPill label="Travellers" value={String(trip.travellers!.length)} />
        )}
        {activityCount > 0 && (
          <StatPill label="Activities" value={String(activityCount)} />
        )}
        {memories.length > 0 && (
          <StatPill label="Memories" value={String(memories.length)} />
        )}
        {tasks.length > 0 && (
          <StatPill label="Tasks" value={`${completedTasks}/${tasks.length} done`} />
        )}
        {pollCount > 0 && (
          <StatPill label="Polls" value={String(pollCount)} />
        )}
        {totalDistanceKm > 0 && (
          <StatPill label="Distance" value={`${totalDistanceKm} km`} />
        )}
        {foodStats.foodTotal > 0 && (
          <StatPill label="Food Spend" value={formatCurrency(foodStats.foodTotal, trip.currency)} />
        )}
        {foodStats.billAttachmentCount > 0 && (
          <StatPill label="Bills Attached" value={String(foodStats.billAttachmentCount)} />
        )}
      </div>
      {trip.notes && (
        <div className="mt-3 bg-gray-50 rounded-xl p-4 print:border print:border-gray-200 print:bg-white">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Notes</p>
          <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{trip.notes}</p>
        </div>
      )}
    </Section>
  )
}

// ── Itinerary Section ─────────────────────────────────────────────────────────

function ItinerarySection({ days }: { days: ItineraryDay[] }) {
  if (days.length === 0) return (
    <Section title="Itinerary">
      <p className="text-sm text-gray-400 italic">No itinerary days added yet.</p>
    </Section>
  )

  return (
    <Section title="Itinerary">
      <div className="space-y-4">
        {days.map((day) => (
          <div key={day.id} className="print:break-inside-avoid">
            <p className="text-sm font-black text-gray-700 mb-2">
              Day {day.dayNumber} — {formatDate(day.date)}
            </p>
            {day.activities.length === 0 ? (
              <p className="text-xs text-gray-400 italic pl-2">No activities</p>
            ) : (
              <div className="space-y-1.5 pl-2 border-l-2 border-gray-100">
                {day.activities.map((act, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-[11px] text-gray-400 w-12 flex-shrink-0 mt-0.5 font-medium">
                      {act.startTime ?? act.time ?? '—'}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-800">{act.title}</p>
                      {act.locationName && (
                        <p className="text-xs text-gray-400">{act.locationName}</p>
                      )}
                      {act.notes && (
                        <p className="text-xs text-gray-500 mt-0.5">{act.notes}</p>
                      )}
                    </div>
                    {act.cost > 0 && (
                      <span className="text-xs font-bold text-gray-500 flex-shrink-0">
                        {act.cost}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  )
}

// ── Budget Section ────────────────────────────────────────────────────────────

function BudgetSection({
  trip,
  expenses,
  onCSV,
  perHeadSpend,
}: {
  trip: Trip
  expenses: Expense[]
  onCSV: () => void
  perHeadSpend: number | null
}) {
  const spent = getTotalSpent(expenses)
  const categoryTotals = getCategoryTotals(expenses)
  const vendorTotals = getVendorTypeTotals(expenses)
  const dayTotals = getDayWiseTotals(expenses)
  const travellers = trip.travellers ?? []
  const balances = getTravellerBalances(expenses, travellers)

  return (
    <>
      <Section title="Budget Summary">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <StatPill label="Total Spent" value={formatCurrency(spent, trip.currency)} />
          {trip.budget > 0 && (
            <>
              <StatPill label="Budget" value={formatCurrency(trip.budget, trip.currency)} />
              <StatPill
                label={spent > trip.budget ? 'Over Budget' : 'Remaining'}
                value={formatCurrency(Math.abs(trip.budget - spent), trip.currency)}
              />
            </>
          )}
          {perHeadSpend !== null && perHeadSpend > 0 && (
            <StatPill label="Per Head Spent" value={formatCurrency(perHeadSpend, trip.currency)} />
          )}
          {trip.budget > 0 && perHeadSpend !== null && (trip.travellers?.length ?? 0) > 0 && (
            <StatPill
              label="Per Head Budget"
              value={formatCurrency(trip.budget / trip.travellers!.length, trip.currency)}
            />
          )}
        </div>
        <button
          onClick={onCSV}
          className="print:hidden inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <Download size={12} className="text-amber-500" />
          Download Expenses CSV
        </button>
      </Section>

      {categoryTotals.length > 0 && (
        <Section title="By Category">
          <div className="space-y-2">
            {categoryTotals.map((c) => {
              const pct = spent > 0 ? Math.round((c.total / spent) * 100) : 0
              return (
                <div key={c.category} className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-700 capitalize w-28 flex-shrink-0">{c.category}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-400 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-bold text-gray-700 w-24 text-right">{formatCurrency(c.total, trip.currency)}</span>
                  <span className="text-xs text-gray-400 w-10 text-right">{pct}%</span>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {vendorTotals.length > 0 && (
        <Section title="By Vendor Type">
          <div className="space-y-2">
            {vendorTotals.map((v) => {
              const pct = spent > 0 ? Math.round((v.total / spent) * 100) : 0
              return (
                <div key={v.vendorType} className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-700 capitalize w-28 flex-shrink-0">{v.vendorType}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-400 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-bold text-gray-700 w-24 text-right">{formatCurrency(v.total, trip.currency)}</span>
                  <span className="text-xs text-gray-400 w-10 text-right">{pct}%</span>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {travellers.length > 1 && balances.length > 0 && (
        <Section title="Spend by Traveller">
          <div className="space-y-2">
            {balances.map((b) => (
              <div key={b.travellerId} className="flex items-center gap-3">
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-black flex-shrink-0"
                  style={{ backgroundColor: b.color }}
                >
                  {b.initials}
                </span>
                <span className="text-sm font-medium text-gray-700 flex-1">{b.name}</span>
                <span className="text-sm font-bold text-gray-700">{formatCurrency(b.totalPaid, trip.currency)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {dayTotals.length > 0 && (
        <Section title="Day-wise Expenses">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-1.5 text-xs font-bold text-gray-500 uppercase">Date</th>
                <th className="text-right py-1.5 text-xs font-bold text-gray-500 uppercase">Amount</th>
              </tr>
            </thead>
            <tbody>
              {dayTotals.map((d) => (
                <tr key={d.date} className="border-b border-gray-50">
                  <td className="py-1.5 text-gray-700">{formatDate(d.date)}</td>
                  <td className="py-1.5 text-right font-semibold text-gray-800">{formatCurrency(d.total, trip.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {expenses.length > 0 && (
        <Section title="All Expenses">
          <table className="w-full text-sm print:text-xs">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-1.5 text-xs font-bold text-gray-500 uppercase">Date</th>
                <th className="text-left py-1.5 text-xs font-bold text-gray-500 uppercase">Title</th>
                <th className="text-left py-1.5 text-xs font-bold text-gray-500 uppercase">Category</th>
                <th className="text-left py-1.5 text-xs font-bold text-gray-500 uppercase">Paid By</th>
                <th className="text-right py-1.5 text-xs font-bold text-gray-500 uppercase">Amount</th>
              </tr>
            </thead>
            <tbody>
              {[...expenses].sort((a, b) => a.date.localeCompare(b.date)).map((e) => (
                <tr key={e.id} className="border-b border-gray-50">
                  <td className="py-1.5 text-gray-500 whitespace-nowrap">{formatDate(e.date)}</td>
                  <td className="py-1.5 text-gray-700 font-medium">{e.title}</td>
                  <td className="py-1.5 text-gray-500 capitalize">{e.category}</td>
                  <td className="py-1.5 text-gray-500">{e.paidByName ?? '—'}</td>
                  <td className="py-1.5 text-right font-semibold text-gray-800">{formatCurrency(e.amount, trip.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </>
  )
}

// ── Food Spend & Bills Section (Phase 14) ─────────────────────────────────────

function FoodSpendSection({ trip, expenses }: { trip: Trip; expenses: Expense[] }) {
  const stats = getFoodSpendStats(expenses, trip.travellers?.length ?? 1)
  if (stats.foodExpenseCount === 0) return null

  return (
    <>
      <Section title="Food &amp; Café Spend">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatPill label="Total Food Spend" value={formatCurrency(stats.foodTotal, trip.currency)} />
          <StatPill label="Food / Person" value={formatCurrency(stats.foodPerPerson, trip.currency)} />
          <StatPill label="Avg / Meal" value={formatCurrency(stats.averageFoodPerMeal, trip.currency)} />
          <StatPill label="Highest Bill" value={formatCurrency(stats.highestFoodBill, trip.currency)} />
          <StatPill label="Food Expenses" value={String(stats.foodExpenseCount)} />
          {stats.billAttachmentCount > 0 && (
            <StatPill label="Bills Attached" value={String(stats.billAttachmentCount)} />
          )}
        </div>
      </Section>

      {stats.vendorWise.length > 0 && (
        <Section title="Food Spend by Vendor">
          <div className="space-y-2">
            {stats.vendorWise.map((v) => {
              const pct = stats.foodTotal > 0 ? Math.round((v.total / stats.foodTotal) * 100) : 0
              return (
                <div key={v.name} className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-700 capitalize w-32 flex-shrink-0 truncate">{v.name}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-400 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-bold text-gray-700 w-24 text-right">{formatCurrency(v.total, trip.currency)}</span>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {stats.locationWise.length > 0 && (
        <Section title="Food Spend by Location">
          <div className="space-y-2">
            {stats.locationWise.map((l) => {
              const pct = stats.foodTotal > 0 ? Math.round((l.total / stats.foodTotal) * 100) : 0
              return (
                <div key={l.name} className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-700 w-32 flex-shrink-0 truncate">{l.name}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-rose-400 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-bold text-gray-700 w-24 text-right">{formatCurrency(l.total, trip.currency)}</span>
                </div>
              )
            })}
          </div>
        </Section>
      )}
    </>
  )
}

// ── Settlement Section ────────────────────────────────────────────────────────

function SettlementSection({ trip, expenses, onCSV }: { trip: Trip; expenses: Expense[]; onCSV: () => void }) {
  const travellers = trip.travellers ?? []
  const balances = getTravellerBalances(expenses, travellers)
  const settlements = getSettlementSummary(balances)

  // Settlement stats
  const pendingCount = settlements.length
  const pendingTotal = settlements.reduce((n, s) => n + s.amount, 0)

  return (
    <>
      {pendingCount > 0 && (
        <Section title="Settlement Summary">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <StatPill label="Pending Transfers" value={String(pendingCount)} />
            <StatPill label="Total Pending" value={formatCurrency(pendingTotal, trip.currency)} />
          </div>
        </Section>
      )}

      <Section title="Traveller Balances">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-1.5 text-xs font-bold text-gray-500 uppercase">Traveller</th>
              <th className="text-right py-1.5 text-xs font-bold text-gray-500 uppercase">Paid</th>
              <th className="text-right py-1.5 text-xs font-bold text-gray-500 uppercase">Share</th>
              <th className="text-right py-1.5 text-xs font-bold text-gray-500 uppercase">Net</th>
            </tr>
          </thead>
          <tbody>
            {balances.map((b) => (
              <tr key={b.travellerId} className="border-b border-gray-50">
                <td className="py-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-black flex-shrink-0"
                      style={{ backgroundColor: b.color }}
                    >
                      {b.initials}
                    </span>
                    <span className="font-medium text-gray-700">{b.name}</span>
                  </span>
                </td>
                <td className="py-1.5 text-right text-gray-700">{formatCurrency(b.totalPaid, trip.currency)}</td>
                <td className="py-1.5 text-right text-gray-700">{formatCurrency(b.totalShare, trip.currency)}</td>
                <td className={`py-1.5 text-right font-bold ${b.net > 0 ? 'text-emerald-600' : b.net < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                  {b.net > 0 ? '+' : ''}{formatCurrency(b.net, trip.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Suggested Settle-up">
        {settlements.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Everyone is balanced — no transfers needed.</p>
        ) : (
          <div className="space-y-2">
            {settlements.map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 print:border print:border-gray-200 print:bg-white"
              >
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-black flex-shrink-0"
                  style={{ backgroundColor: s.fromColor }}
                >
                  {s.fromName.slice(0, 2).toUpperCase()}
                </span>
                <span className="text-sm font-semibold text-gray-700">{s.fromName}</span>
                <span className="text-xs text-gray-400 flex-1">owes</span>
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-black flex-shrink-0"
                  style={{ backgroundColor: s.toColor }}
                >
                  {s.toName.slice(0, 2).toUpperCase()}
                </span>
                <span className="text-sm font-semibold text-gray-700">{s.toName}</span>
                <span className="text-sm font-black text-gray-900 ml-2">{formatCurrency(s.amount, trip.currency)}</span>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={onCSV}
          className="print:hidden mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <Download size={12} className="text-violet-500" />
          Download Settlements CSV
        </button>
      </Section>
    </>
  )
}

// ── Route Section ─────────────────────────────────────────────────────────────

function RouteSection({
  trip,
  locationPoints,
  days,
  memories,
}: {
  trip: Trip
  locationPoints: TripLocationPoint[]
  days: ItineraryDay[]
  memories: TripMemory[]
}) {
  const playbackPoints = buildPlaybackPoints(days, locationPoints, memories)
  const distanceSummary = computeTripDistance(playbackPoints)
  const checkins = locationPoints.filter((p) => p.source !== 'live_tracking')
  const livePoints = locationPoints.filter((p) => p.source === 'live_tracking')

  return (
    <Section title="Route Summary">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatPill label="Total Points" value={String(playbackPoints.length)} />
        <StatPill label="Check-ins" value={String(checkins.length)} />
        <StatPill label="Live Track Pts" value={String(livePoints.length)} />
        <StatPill
          label="Distance (approx)"
          value={distanceSummary.totalKm > 0 ? `${distanceSummary.totalKm} km` : '—'}
        />
      </div>

      {checkins.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Check-in Locations</p>
          <div className="space-y-1.5">
            {checkins.map((p) => (
              <div key={p.id} className="flex items-center gap-3 text-sm">
                <span className="text-gray-400 text-[11px] w-32 flex-shrink-0">
                  {formatDate(p.capturedAt.slice(0, 10))}
                </span>
                <span className="text-gray-700 font-medium">{p.label || 'Unnamed check-in'}</span>
                {p.note && <span className="text-gray-400 text-xs">— {p.note}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {playbackPoints.length === 0 && (
        <p className="text-sm text-gray-400 italic">No location data recorded yet.</p>
      )}
    </Section>
  )
}

// ── Visited Progress Section (Phase 15A) ─────────────────────────────────────
//
// Shows itinerary completion derived from saved location data. Detection is
// approximate and user-confirmed. Precise coordinates are NOT printed here, and
// this section is never part of the public share snapshot.

function VisitedProgressSection({
  trip, days, expenses, locationPoints, memories,
}: {
  trip: Trip
  days: ItineraryDay[]
  expenses: Expense[]
  locationPoints: TripLocationPoint[]
  memories: TripMemory[]
}) {
  const { analysis } = computeGapAnalysis(trip, days, locationPoints, memories, {
    now: new Date(),
    budgetTotal: trip.budget,
    budgetSpent: getTotalSpent(expenses),
  })

  if (analysis.totalPlanned === 0) return null

  return (
    <Section title="Itinerary Progress">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatPill label="Completion" value={`${analysis.completionPercent}%`} />
        <StatPill label="Visited" value={String(analysis.confirmedVisited + analysis.likelyVisited)} />
        <StatPill label="Skipped" value={String(analysis.skipped)} />
        <StatPill label="Remaining" value={String(analysis.notVisited)} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatPill label="Confirmed" value={String(analysis.confirmedVisited)} />
        <StatPill label="Likely visited" value={String(analysis.likelyVisited)} />
        <StatPill label="Unplanned visited" value={String(analysis.unplannedVisitedCount)} />
        <StatPill
          label="Distance travelled"
          value={analysis.distanceTravelledKm > 0 ? `${analysis.distanceTravelledKm} km` : '—'}
        />
      </div>
      <p className="text-[11px] text-gray-400 mt-3 italic">
        Visited detection is approximate — based on saved check-ins, foreground tracking and photo
        locations, and confirmed by the traveller. Precise coordinates are not shown.
      </p>
    </Section>
  )
}

// ── Memories Section ──────────────────────────────────────────────────────────

function MemoriesSection({ memories, days }: { memories: TripMemory[]; days: ItineraryDay[] }) {
  const dayMap = new Map<string, string>()
  days.forEach((d) => dayMap.set(d.date, `Day ${d.dayNumber}`))

  const grouped = new Map<string, TripMemory[]>()
  const ungrouped: TripMemory[] = []

  for (const m of memories) {
    const key = m.dayKey ?? m.capturedAt?.slice(0, 10) ?? m.uploadedAt.slice(0, 10)
    if (key) {
      const arr = grouped.get(key) ?? []
      arr.push(m)
      grouped.set(key, arr)
    } else {
      ungrouped.push(m)
    }
  }

  const sortedKeys = Array.from(grouped.keys()).sort()

  return (
    <Section title="Memories Album">
      {memories.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No memories uploaded.</p>
      ) : (
        <div className="space-y-6">
          {sortedKeys.map((dateKey) => {
            const mems = grouped.get(dateKey)!
            const dayLabel = dayMap.get(dateKey)
            return (
              <div key={dateKey} className="print:break-inside-avoid">
                <p className="text-sm font-black text-gray-700 mb-2">
                  {dayLabel ? `${dayLabel} — ` : ''}{formatDate(dateKey)}
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {mems.map((m) => (
                    <div key={m.id} className="relative rounded-xl overflow-hidden bg-gray-100 aspect-square">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={m.photoUrl}
                        alt={m.title || 'Memory'}
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3' }}
                      />
                      {m.title && (
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5">
                          <p className="text-white text-[10px] font-semibold truncate">{m.title}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          {ungrouped.length > 0 && (
            <div className="print:break-inside-avoid">
              <p className="text-sm font-black text-gray-700 mb-2">Other Memories</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {ungrouped.map((m) => (
                  <div key={m.id} className="relative rounded-xl overflow-hidden bg-gray-100 aspect-square">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.photoUrl}
                      alt={m.title || 'Memory'}
                      loading="lazy"
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3' }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Section>
  )
}

// ── Restaurant Intelligence Placeholder (Phase 13 Part 7) ────────────────────
// Architecture is in place; full data integration requires the Places API
// pipeline and will be delivered in a future phase.

function RestaurantIntelligencePlaceholder() {
  return (
    <Section title="Restaurant Intelligence">
      <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center">
        <div className="w-10 h-10 bg-orange-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <UtensilsCrossed size={20} className="text-orange-500" />
        </div>
        <div className="flex items-center justify-center gap-2 mb-1">
          <p className="text-sm font-bold text-gray-700">Restaurant &amp; Café Intelligence</p>
          <span className="text-[10px] font-black text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full uppercase tracking-wide">
            Beta
          </span>
        </div>
        <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
          Open any food activity in your Itinerary and tap the fork icon to run AI Food Intelligence — vibe, budget fit and an approximate per-person cost range. Curated nearby picks are coming next.
        </p>
      </div>
    </Section>
  )
}

// ── Bill Upload Placeholder (Phase 13 Part 8) ────────────────────────────────
// Architecture placeholder. OCR and automatic extraction will be added in a
// future phase; manual confirmation and data entry remain the primary flow.

function BillUploadPlaceholder() {
  return (
    <Section title="Bill Upload">
      <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center">
        <div className="w-10 h-10 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <Image size={20} className="text-blue-500" />
        </div>
        <div className="flex items-center justify-center gap-2 mb-1">
          <p className="text-sm font-bold text-gray-700">Bill Upload &amp; Spend Analysis</p>
          <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full uppercase tracking-wide">
            Live
          </span>
        </div>
        <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
          Open an expense in the Budget tab and tap &ldquo;Attach Bill&rdquo; to upload a receipt and get an AI spend draft from your entered details. Automatic image reading (OCR) is coming soon — manual entry stays primary.
        </p>
        <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
          <Lock size={11} />
          <span>Bills are private to trip members only</span>
        </div>
      </div>
    </Section>
  )
}

// ── Itinerary Rating Input Builder ────────────────────────────────────────────

function buildRatingInput(
  trip: Trip,
  days: ItineraryDay[],
  totalDistanceKm: number,
  totalSpent: number,
): ItineraryRatingInput {
  return {
    tripName: trip.name,
    destination: trip.destination,
    tripType: trip.type,
    startDate: trip.startDate,
    endDate: trip.endDate,
    currency: trip.currency,
    budget: trip.budget,
    totalSpent,
    travellerCount: trip.travellers?.length ?? 1,
    days: days.map((d) => ({
      dayNumber: d.dayNumber,
      date: d.date,
      activityCount: d.activities.length,
      activities: d.activities.map((a) => ({
        title: a.title,
        type: a.type,
        time: a.time,
        estimatedCost: a.estimatedCost,
        locationName: a.locationName,
      })),
    })),
    totalActivityCount: days.reduce((n, d) => n + d.activities.length, 0),
    hasRouteData: totalDistanceKm > 0,
    totalDistanceKm,
  }
}

// ── Main page component ───────────────────────────────────────────────────────

export default function ReportViewPage() {
  const { tripId, type } = useParams<{ tripId: string; type: string }>()
  const router = useRouter()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [memories, setMemories] = useState<TripMemory[]>([])
  const [days, setDays] = useState<ItineraryDay[]>([])
  const [locationPoints, setLocationPoints] = useState<TripLocationPoint[]>([])
  const [tasks, setTasks] = useState<TripTask[]>([])
  const [pollCount, setPollCount] = useState(0)
  const [totalDistanceKm, setTotalDistanceKm] = useState(0)
  const [loading, setLoading] = useState(true)

  const reportTitle = REPORT_TITLES[type] ?? 'Report'

  useEffect(() => {
    if (!tripId) return
    Promise.all([
      getTrip(tripId),
      getExpenses(tripId),
      getMemories(tripId),
      getItineraryDays(tripId),
      getLocationPoints(tripId),
      getTasks(tripId),
      getDocs(collection(db, 'trips', tripId, 'polls')),
    ]).then(([t, e, m, d, lp, tk, pollSnap]) => {
      if (!t) { router.push('/dashboard'); return }
      setTrip(t)
      setExpenses(e)
      setMemories(m)
      setDays(d)
      setLocationPoints(lp)
      setTasks(tk)
      setPollCount(pollSnap.size)

      // Compute distance from playback points
      const pp = buildPlaybackPoints(d, lp, m)
      const dist = computeTripDistance(pp)
      setTotalDistanceKm(dist.totalKm)

      setLoading(false)
    })
  }, [tripId, router])

  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  if (loading || !trip) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
      </div>
    )
  }

  const totalSpent = getTotalSpent(expenses)
  const perHeadSpend = (trip.travellers?.length ?? 0) > 0
    ? getPerHeadActualCost(expenses, trip.travellers!.length)
    : null

  const ratingInput = buildRatingInput(trip, days, totalDistanceKm, totalSpent)

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          @page { margin: 1.5cm; size: A4; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="min-h-screen bg-gray-50 print:bg-white">

        {/* Toolbar — hidden in print */}
        <div className="print:hidden sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-gray-100 shadow-sm">
          <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
            <Link
              href={`/trips/${tripId}/reports`}
              className="p-2 -ml-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors"
            >
              <ArrowLeft size={20} />
            </Link>
            <h1 className="flex-1 font-bold text-gray-900 text-base truncate">{reportTitle}</h1>
            {type === 'budget' && expenses.length > 0 && (
              <button
                onClick={() => downloadExpensesCSV(expenses, trip)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <Download size={13} className="text-amber-500" />
                CSV
              </button>
            )}
            {type === 'settlement' && expenses.length > 0 && (trip.travellers?.length ?? 0) > 1 && (
              <button
                onClick={() => downloadSettlementCSV(expenses, trip.travellers ?? [], trip)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <Download size={13} className="text-violet-500" />
                CSV
              </button>
            )}
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-colors shadow-sm"
            >
              <Printer size={15} />
              Print / PDF
            </button>
          </div>
        </div>

        {/* Report body */}
        <div className="max-w-4xl mx-auto px-4 py-8 print:px-0 print:py-0">

          {/* Report header */}
          <div className="mb-8 print:mb-6">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-3xl font-black text-gray-900 print:text-2xl">{trip.name}</h1>
              <span className="text-lg font-bold text-gray-400 print:text-base">— {reportTitle}</span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {trip.destination} · {formatDate(trip.startDate)} – {formatDate(trip.endDate)}
            </p>
            <p className="text-xs text-gray-300 mt-1 print:block hidden">
              Generated {new Date().toLocaleDateString()}
            </p>
          </div>

          {/* Full Trip Recap */}
          {type === 'full' && (
            <>
              <TripHeader
                trip={trip}
                expenses={expenses}
                days={days}
                memories={memories}
                tasks={tasks}
                pollCount={pollCount}
                totalDistanceKm={totalDistanceKm}
              />
              <ItinerarySection days={days} />
              <VisitedProgressSection
                trip={trip}
                days={days}
                expenses={expenses}
                locationPoints={locationPoints}
                memories={memories}
              />
              {days.length > 0 && (
                <Section title="AI Itinerary Rating">
                  <ItineraryRatingCard input={ratingInput} printable={false} />
                </Section>
              )}
              {expenses.length > 0 && (
                <BudgetSection
                  trip={trip}
                  expenses={expenses}
                  onCSV={() => downloadExpensesCSV(expenses, trip)}
                  perHeadSpend={perHeadSpend}
                />
              )}
              {expenses.length > 0 && <FoodSpendSection trip={trip} expenses={expenses} />}
              {expenses.length > 0 && (trip.travellers?.length ?? 0) > 1 && (
                <SettlementSection
                  trip={trip}
                  expenses={expenses}
                  onCSV={() => downloadSettlementCSV(expenses, trip.travellers ?? [], trip)}
                />
              )}
              {memories.length > 0 && <MemoriesSection memories={memories} days={days} />}
              <RestaurantIntelligencePlaceholder />
            </>
          )}

          {/* Itinerary Report */}
          {type === 'itinerary' && (
            <>
              <TripHeader
                trip={trip}
                expenses={[]}
                days={days}
                memories={memories}
                tasks={tasks}
                pollCount={pollCount}
                totalDistanceKm={totalDistanceKm}
              />
              <ItinerarySection days={days} />
              <VisitedProgressSection
                trip={trip}
                days={days}
                expenses={expenses}
                locationPoints={locationPoints}
                memories={memories}
              />
              {days.length > 0 && (
                <Section title="AI Itinerary Rating">
                  <ItineraryRatingCard input={ratingInput} printable={false} />
                </Section>
              )}
            </>
          )}

          {/* Budget Report */}
          {type === 'budget' && (
            <>
              <BudgetSection
                trip={trip}
                expenses={expenses}
                onCSV={() => downloadExpensesCSV(expenses, trip)}
                perHeadSpend={perHeadSpend}
              />
              <FoodSpendSection trip={trip} expenses={expenses} />
            </>
          )}

          {/* Settlement Report */}
          {type === 'settlement' && (
            <SettlementSection
              trip={trip}
              expenses={expenses}
              onCSV={() => downloadSettlementCSV(expenses, trip.travellers ?? [], trip)}
            />
          )}

          {/* Route Summary */}
          {type === 'route' && (
            <RouteSection
              trip={trip}
              locationPoints={locationPoints}
              days={days}
              memories={memories}
            />
          )}

          {/* Memories Album */}
          {type === 'memories' && (
            <MemoriesSection memories={memories} days={days} />
          )}

          {/* Bill Upload placeholder in budget report */}
          {type === 'budget' && (
            <BillUploadPlaceholder />
          )}

          {/* Footer — print only */}
          <div className="hidden print:block mt-12 pt-4 border-t border-gray-200 text-center">
            <p className="text-xs text-gray-400">
              {trip.name} · Exported from VoyaGO · {new Date().toLocaleDateString()}
            </p>
          </div>

        </div>
      </div>
    </>
  )
}
