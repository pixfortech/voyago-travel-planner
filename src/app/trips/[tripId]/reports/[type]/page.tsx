'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Printer, ArrowLeft, Download } from 'lucide-react'
import Link from 'next/link'
import {
  getTrip, getExpenses, getMemories, getItineraryDays, getLocationPoints,
} from '@/lib/firestore'
import {
  getTotalSpent, getRemainingBudget, getCategoryTotals, getVendorTypeTotals,
  getDayWiseTotals, getTravellerBalances, getSettlementSummary,
} from '@/lib/calculations'
import { computeTripDistance } from '@/lib/location/distance'
import { buildPlaybackPoints } from '@/lib/location/playback'
import { downloadExpensesCSV, downloadSettlementCSV } from '@/lib/export'
import { formatDate, formatCurrency, getDayCount, tripTypeLabel } from '@/lib/utils'
import type {
  Trip, Expense, TripMemory, ItineraryDay, TripLocationPoint,
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

// ── Report sections ──────────────────────────────────────────────────────────

function TripHeader({ trip, expenses }: { trip: Trip; expenses: Expense[] }) {
  const days = getDayCount(trip.startDate, trip.endDate)
  const spent = getTotalSpent(expenses)
  const remaining = trip.budget > 0 ? getRemainingBudget(trip.budget, expenses) : null

  return (
    <Section title="Trip Overview">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatPill label="Destination" value={trip.destination} />
        <StatPill label="Duration" value={`${days} day${days !== 1 ? 's' : ''}`} />
        <StatPill label="Dates" value={`${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}`} />
        <StatPill label="Type" value={tripTypeLabel(trip.type)} />
        {expenses.length > 0 && (
          <StatPill label="Total Spent" value={formatCurrency(spent, trip.currency)} />
        )}
        {remaining !== null && (
          <StatPill label={remaining < 0 ? 'Over Budget' : 'Remaining'} value={formatCurrency(Math.abs(remaining), trip.currency)} />
        )}
        {trip.budget > 0 && (
          <StatPill label="Budget" value={formatCurrency(trip.budget, trip.currency)} />
        )}
        {(trip.travellers?.length ?? 0) > 0 && (
          <StatPill label="Travellers" value={String(trip.travellers!.length)} />
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

function BudgetSection({ trip, expenses, onCSV }: { trip: Trip; expenses: Expense[]; onCSV: () => void }) {
  const spent = getTotalSpent(expenses)
  const categoryTotals = getCategoryTotals(expenses)
  const dayTotals = getDayWiseTotals(expenses)

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

function SettlementSection({ trip, expenses, onCSV }: { trip: Trip; expenses: Expense[]; onCSV: () => void }) {
  const travellers = trip.travellers ?? []
  const balances = getTravellerBalances(expenses, travellers)
  const settlements = getSettlementSummary(balances)

  return (
    <>
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
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-black flex-shrink-0" style={{ backgroundColor: b.color }}>
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
              <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 print:border print:border-gray-200 print:bg-white">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-black flex-shrink-0" style={{ backgroundColor: s.fromColor }}>
                  {s.fromName.slice(0, 2).toUpperCase()}
                </span>
                <span className="text-sm font-semibold text-gray-700">{s.fromName}</span>
                <span className="text-xs text-gray-400 flex-1">owes</span>
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-black flex-shrink-0" style={{ backgroundColor: s.toColor }}>
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

function RouteSection({ trip, locationPoints, days, memories }: {
  trip: Trip
  locationPoints: TripLocationPoint[]
  days: ItineraryDay[]
  memories: TripMemory[]
}) {
  const playbackPoints = buildPlaybackPoints(days, locationPoints, memories)
  const distanceSummary = computeTripDistance(playbackPoints)

  const checkins = locationPoints.filter(p => p.source !== 'live_tracking')
  const livePoints = locationPoints.filter(p => p.source === 'live_tracking')

  return (
    <Section title="Route Summary">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatPill label="Total Points" value={String(playbackPoints.length)} />
        <StatPill label="Check-ins" value={String(checkins.length)} />
        <StatPill label="Live Track Pts" value={String(livePoints.length)} />
        <StatPill label="Distance (approx)" value={distanceSummary.totalKm > 0 ? `${distanceSummary.totalKm} km` : '—'} />
      </div>

      {checkins.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Check-in Locations</p>
          <div className="space-y-1.5">
            {checkins.map((p) => (
              <div key={p.id} className="flex items-center gap-3 text-sm">
                <span className="text-gray-400 text-[11px] w-32 flex-shrink-0">{formatDate(p.capturedAt.slice(0, 10))}</span>
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

function MemoriesSection({ memories, days }: { memories: TripMemory[]; days: ItineraryDay[] }) {
  const dayMap = new Map<string, string>()
  days.forEach(d => dayMap.set(d.date, `Day ${d.dayNumber}`))

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

// ── Main page component ───────────────────────────────────────────────────────

export default function ReportViewPage() {
  const { tripId, type } = useParams<{ tripId: string; type: string }>()
  const router = useRouter()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [memories, setMemories] = useState<TripMemory[]>([])
  const [days, setDays] = useState<ItineraryDay[]>([])
  const [locationPoints, setLocationPoints] = useState<TripLocationPoint[]>([])
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
    ]).then(([t, e, m, d, lp]) => {
      if (!t) { router.push('/dashboard'); return }
      setTrip(t)
      setExpenses(e)
      setMemories(m)
      setDays(d)
      setLocationPoints(lp)
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

          {/* Render appropriate sections */}
          {type === 'full' && (
            <>
              <TripHeader trip={trip} expenses={expenses} />
              <ItinerarySection days={days} />
              {expenses.length > 0 && (
                <BudgetSection
                  trip={trip}
                  expenses={expenses}
                  onCSV={() => downloadExpensesCSV(expenses, trip)}
                />
              )}
              {expenses.length > 0 && (trip.travellers?.length ?? 0) > 1 && (
                <SettlementSection
                  trip={trip}
                  expenses={expenses}
                  onCSV={() => downloadSettlementCSV(expenses, trip.travellers ?? [], trip)}
                />
              )}
              {memories.length > 0 && <MemoriesSection memories={memories} days={days} />}
            </>
          )}

          {type === 'itinerary' && (
            <>
              <TripHeader trip={trip} expenses={[]} />
              <ItinerarySection days={days} />
            </>
          )}

          {type === 'budget' && (
            <BudgetSection
              trip={trip}
              expenses={expenses}
              onCSV={() => downloadExpensesCSV(expenses, trip)}
            />
          )}

          {type === 'settlement' && (
            <SettlementSection
              trip={trip}
              expenses={expenses}
              onCSV={() => downloadSettlementCSV(expenses, trip.travellers ?? [], trip)}
            />
          )}

          {type === 'route' && (
            <RouteSection
              trip={trip}
              locationPoints={locationPoints}
              days={days}
              memories={memories}
            />
          )}

          {type === 'memories' && (
            <MemoriesSection memories={memories} days={days} />
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
