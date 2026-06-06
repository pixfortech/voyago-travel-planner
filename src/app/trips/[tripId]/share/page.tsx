'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { MapPin, Calendar, Printer, Share2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { getTrip, getItineraryDays, getExpenses } from '@/lib/firestore'
import {
  formatDate,
  getDayCount,
  tripTypeLabel,
  formatCurrency,
  activityTypeIcon,
  expenseCategoryIcon,
} from '@/lib/utils'
import type { Trip, ItineraryDay, Expense } from '@/types'

export default function ShareTripPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const router = useRouter()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [days, setDays] = useState<ItineraryDay[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tripId) return
    Promise.all([getTrip(tripId), getItineraryDays(tripId), getExpenses(tripId)]).then(
      ([t, d, e]) => {
        if (!t) { router.push('/dashboard'); return }
        setTrip(t)
        setDays(d)
        setExpenses(e)
        setLoading(false)
      }
    )
  }, [tripId, router])

  function handleShare() {
    if (!trip) return
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator
        .share({
          title: trip.name,
          text: `${trip.name} — ${trip.destination} · ${formatDate(trip.startDate)} to ${formatDate(trip.endDate)}. Planned with VoyaGO!`,
        })
        .catch(() => {})
    } else {
      window.print()
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (!trip) return null

  const totalDays = getDayCount(trip.startDate, trip.endDate)
  const spent = expenses.reduce((s, e) => s + e.amount, 0)
  const remaining = trip.budget - spent
  const daysWithActivities = days.filter((d) => d.activities.length > 0)
  const totalActivities = days.reduce((s, d) => s + d.activities.length, 0)

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {/* Toolbar — hidden on print */}
      <div className="print:hidden sticky top-0 z-30 bg-white/80 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-2">
          <Link
            href={`/trips/${tripId}`}
            className="p-2 -ml-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <span className="flex-1 font-bold text-gray-900 text-base">Trip Summary</span>
          <button
            onClick={() => window.print()}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors"
            title="Print / Save as PDF"
          >
            <Printer size={20} />
          </button>
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 bg-primary-500 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-primary-600 transition-colors"
          >
            <Share2 size={15} />
            Share
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5 print:px-0 print:py-4 print:space-y-4">
        {/* Trip banner */}
        <div
          className="rounded-2xl p-6 text-white print:rounded-none"
          style={{ backgroundColor: trip.coverColor }}
        >
          <h1 className="text-2xl font-black leading-tight mb-1">{trip.name}</h1>
          <div className="flex items-center gap-1.5 text-white/80 mb-3">
            <MapPin size={14} />
            <span className="text-sm">{trip.destination}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-white/80 text-sm">
            <span className="flex items-center gap-1.5">
              <Calendar size={14} />
              {formatDate(trip.startDate)} – {formatDate(trip.endDate)}
            </span>
            <span>{totalDays} {totalDays === 1 ? 'day' : 'days'}</span>
            <span>{tripTypeLabel(trip.type)}</span>
          </div>
        </div>

        {/* Quick stats */}
        <div className={`grid gap-3 ${trip.budget > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm text-center">
            <p className="text-lg font-black text-gray-900">{totalDays}</p>
            <p className="text-xs text-gray-400">Days</p>
          </div>
          <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm text-center">
            <p className="text-lg font-black text-gray-900">{totalActivities}</p>
            <p className="text-xs text-gray-400">Activities</p>
          </div>
          {trip.budget > 0 && (
            <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm text-center">
              <p className="text-lg font-black text-gray-900">
                {formatCurrency(trip.budget, trip.currency)}
              </p>
              <p className="text-xs text-gray-400">Budget</p>
            </div>
          )}
        </div>

        {/* Itinerary */}
        {daysWithActivities.length > 0 && (
          <div>
            <h2 className="text-base font-black text-gray-900 mb-3">Itinerary</h2>
            <div className="space-y-3">
              {daysWithActivities.map((day) => (
                <div
                  key={day.id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden print:break-inside-avoid"
                >
                  <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
                    <div className="w-8 h-8 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-black text-primary-600">{day.dayNumber}</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">Day {day.dayNumber}</p>
                      <p className="text-xs text-gray-400">{formatDate(day.date)}</p>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {[...day.activities]
                      .sort((a, b) => a.time.localeCompare(b.time))
                      .map((activity) => (
                        <div key={activity.id} className="flex items-center gap-3 px-4 py-3">
                          <span className="text-lg flex-shrink-0">{activityTypeIcon(activity.type)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900">{activity.title}</p>
                            {(activity.time || activity.notes) && (
                              <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                                {activity.time && <span>{activity.time}</span>}
                                {activity.time && activity.notes && (
                                  <span className="text-gray-200">·</span>
                                )}
                                {activity.notes && (
                                  <span className="truncate">{activity.notes}</span>
                                )}
                              </div>
                            )}
                          </div>
                          {activity.cost > 0 && (
                            <span className="text-xs font-semibold text-gray-600 flex-shrink-0">
                              {formatCurrency(activity.cost, trip.currency)}
                            </span>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expenses */}
        {expenses.length > 0 && (
          <div>
            <h2 className="text-base font-black text-gray-900 mb-3">Expenses</h2>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden print:break-inside-avoid">
              <div className="divide-y divide-gray-50">
                {expenses.map((expense) => (
                  <div key={expense.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-lg flex-shrink-0">
                      {expenseCategoryIcon(expense.category)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {expense.title}
                      </p>
                      <p className="text-xs text-gray-400 capitalize">
                        {expense.category} · {formatDate(expense.date)}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-gray-900 flex-shrink-0">
                      {formatCurrency(expense.amount, trip.currency)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-100">
                <span className="text-sm font-bold text-gray-700">Total spent</span>
                <span className="text-sm font-black text-gray-900">
                  {formatCurrency(spent, trip.currency)}
                </span>
              </div>
              {trip.budget > 0 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-50">
                  <span className="text-sm text-gray-500">
                    {remaining >= 0 ? 'Remaining' : 'Over budget'}
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      remaining >= 0 ? 'text-primary-600' : 'text-red-500'
                    }`}
                  >
                    {formatCurrency(Math.abs(remaining), trip.currency)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Notes */}
        {trip.notes && (
          <div>
            <h2 className="text-base font-black text-gray-900 mb-3">Notes</h2>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                {trip.notes}
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-2 pb-8 text-center print:pb-2">
          <p className="text-xs text-gray-400">Planned with VoyaGO</p>
        </div>
      </div>
    </div>
  )
}
