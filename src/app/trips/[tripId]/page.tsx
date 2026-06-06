'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  MapPin,
  Calendar,
  Users,
  Wallet,
  Map,
  Pencil,
  Trash2,
  ExternalLink,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { getTrip, deleteTrip, getExpenses } from '@/lib/firestore'
import AppShell from '@/components/layout/AppShell'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { formatDate, getDayCount, tripTypeLabel, formatCurrency } from '@/lib/utils'
import type { Trip, Expense } from '@/types'
import Link from 'next/link'

export default function TripOverviewPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const router = useRouter()
  const { user } = useApp()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tripId) return
    Promise.all([getTrip(tripId), getExpenses(tripId)]).then(([t, e]) => {
      if (!t) { router.push('/dashboard'); return }
      setTrip(t)
      setExpenses(e)
      setLoading(false)
    })
  }, [tripId, router])

  async function handleDelete() {
    if (!confirm('Delete this trip and all its data? This cannot be undone.')) return
    await deleteTrip(tripId)
    router.push('/dashboard')
  }

  if (loading) {
    return (
      <AppShell back="/dashboard" tripId={tripId}>
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
        </div>
      </AppShell>
    )
  }

  if (!trip) return null

  const days = getDayCount(trip.startDate, trip.endDate)
  const spent = expenses.reduce((s, e) => s + e.amount, 0)
  const remaining = trip.budget - spent

  const stats = [
    { label: 'Days', value: String(days), icon: <Calendar size={16} /> },
    { label: 'Type', value: tripTypeLabel(trip.type), icon: <Users size={16} /> },
    ...(trip.budget > 0
      ? [{ label: 'Budget', value: formatCurrency(trip.budget, trip.currency), icon: <Wallet size={16} /> }]
      : []),
    ...(trip.budget > 0 && spent > 0
      ? [{ label: remaining >= 0 ? 'Remaining' : 'Over', value: formatCurrency(Math.abs(remaining), trip.currency), icon: <Wallet size={16} /> }]
      : []),
  ]

  return (
    <AppShell
      back="/dashboard"
      tripId={tripId}
      actions={
        <button
          onClick={handleDelete}
          className="p-2 rounded-xl hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
        >
          <Trash2 size={18} />
        </button>
      }
    >
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        {/* Trip header */}
        <div
          className="rounded-2xl p-5 text-white"
          style={{ backgroundColor: trip.coverColor }}
        >
          <div className="flex items-start justify-between mb-1">
            <h1 className="text-2xl font-black leading-tight">{trip.name}</h1>
            <Badge className="bg-white/20 text-white border-0 flex-shrink-0 ml-2">
              {tripTypeLabel(trip.type)}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 text-white/80 mb-4">
            <MapPin size={14} />
            <span className="text-sm">{trip.destination}</span>
          </div>
          <div className="flex items-center gap-1.5 text-white/80">
            <Calendar size={14} />
            <span className="text-sm">
              {formatDate(trip.startDate)} – {formatDate(trip.endDate)}
            </span>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-1.5 text-gray-400 mb-1.5">
                {s.icon}
                <span className="text-xs font-medium">{s.label}</span>
              </div>
              <p className="text-lg font-black text-gray-900">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Quick nav */}
        <div className="grid grid-cols-2 gap-3">
          <Link href={`/trips/${tripId}/itinerary`}>
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:border-primary-200 hover:shadow-md transition-all cursor-pointer">
              <Map size={24} className="text-primary-500 mb-2" />
              <p className="font-bold text-gray-900 text-sm">Itinerary</p>
              <p className="text-xs text-gray-400">Day-by-day plan</p>
            </div>
          </Link>
          <Link href={`/trips/${tripId}/budget`}>
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:border-primary-200 hover:shadow-md transition-all cursor-pointer">
              <Wallet size={24} className="text-amber-500 mb-2" />
              <p className="font-bold text-gray-900 text-sm">Budget</p>
              <p className="text-xs text-gray-400">
                {spent > 0
                  ? `${formatCurrency(spent, trip.currency)} spent`
                  : 'Track expenses'}
              </p>
            </div>
          </Link>
        </div>

        {/* Notes */}
        {trip.notes && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{trip.notes}</p>
          </div>
        )}
      </motion.div>
    </AppShell>
  )
}
