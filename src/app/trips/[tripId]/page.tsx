'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  MapPin, Calendar, Users, Wallet, Map, Pencil, Trash2, Share2,
  Sparkles, Camera, Lock,
} from 'lucide-react'
import { getTrip, deleteTrip, getExpenses } from '@/lib/firestore'
import AppShell from '@/components/layout/AppShell'
import Badge from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatDate, getDayCount, tripTypeLabel, formatCurrency } from '@/lib/utils'
import type { Trip, Expense } from '@/types'
import Link from 'next/link'

export default function TripOverviewPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const router = useRouter()
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
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-2xl" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        </div>
      </AppShell>
    )
  }

  if (!trip) return null

  const days = getDayCount(trip.startDate, trip.endDate)
  const spent = expenses.reduce((s, e) => s + e.amount, 0)
  const remaining = trip.budget - spent

  const stats = [
    {
      label: 'Days',
      value: String(days),
      icon: <Calendar size={14} />,
      color: 'text-primary-600',
      bg: 'bg-primary-50',
    },
    {
      label: 'Type',
      value: tripTypeLabel(trip.type),
      icon: <Users size={14} />,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
    },
    ...(trip.budget > 0
      ? [{
          label: 'Budget',
          value: formatCurrency(trip.budget, trip.currency),
          icon: <Wallet size={14} />,
          color: 'text-amber-600',
          bg: 'bg-amber-50',
        }]
      : []),
    ...(trip.budget > 0 && spent > 0
      ? [{
          label: remaining >= 0 ? 'Remaining' : 'Over',
          value: formatCurrency(Math.abs(remaining), trip.currency),
          icon: <Wallet size={14} />,
          color: remaining >= 0 ? 'text-green-600' : 'text-red-600',
          bg: remaining >= 0 ? 'bg-green-50' : 'bg-red-50',
        }]
      : []),
  ]

  return (
    <AppShell
      back="/dashboard"
      tripId={tripId}
      actions={
        <div className="flex items-center gap-0.5">
          <Link
            href={`/trips/${tripId}/edit`}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <Pencil size={18} />
          </Link>
          <Link
            href={`/trips/${tripId}/share`}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <Share2 size={18} />
          </Link>
          <button
            onClick={handleDelete}
            className="p-2 rounded-xl hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
          >
            <Trash2 size={18} />
          </button>
        </div>
      }
    >
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        {/* Trip header card */}
        <div
          className="rounded-2xl p-5 text-white relative overflow-hidden"
          style={{ backgroundColor: trip.coverColor }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-black/20 pointer-events-none" />
          <div className="relative">
            <div className="flex items-start justify-between mb-2">
              <h1 className="text-2xl font-black leading-tight flex-1 pr-2">{trip.name}</h1>
              <Badge variant="glass" className="flex-shrink-0 mt-0.5">
                {tripTypeLabel(trip.type)}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5 text-white/75 mb-1.5">
              <MapPin size={13} />
              <span className="text-sm">{trip.destination}</span>
            </div>
            <div className="flex items-center gap-1.5 text-white/65">
              <Calendar size={13} />
              <span className="text-sm">
                {formatDate(trip.startDate)} – {formatDate(trip.endDate)}
              </span>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className={`inline-flex items-center gap-1.5 ${s.bg} ${s.color} px-2 py-1 rounded-lg mb-2 text-xs font-semibold`}>
                {s.icon}
                {s.label}
              </div>
              <p className="text-lg font-black text-gray-900 leading-tight">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Quick nav */}
        <div>
          <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3 px-0.5">
            Explore
          </p>
          <div className="grid grid-cols-2 gap-3">
            {/* Active: Itinerary */}
            <Link href={`/trips/${tripId}/itinerary`}>
              <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md hover:border-primary-200 hover:-translate-y-0.5 transition-all cursor-pointer">
                <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-teal-500 rounded-xl flex items-center justify-center mb-3 shadow-sm shadow-primary-500/20">
                  <Map size={20} className="text-white" />
                </div>
                <p className="font-bold text-gray-900 text-sm">Itinerary</p>
                <p className="text-xs text-gray-400 mt-0.5">Day-by-day plan</p>
              </div>
            </Link>

            {/* Active: Budget */}
            <Link href={`/trips/${tripId}/budget`}>
              <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md hover:border-amber-200 hover:-translate-y-0.5 transition-all cursor-pointer">
                <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center mb-3 shadow-sm shadow-amber-500/20">
                  <Wallet size={20} className="text-white" />
                </div>
                <p className="font-bold text-gray-900 text-sm">Budget</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {spent > 0 ? `${formatCurrency(spent, trip.currency)} spent` : 'Track expenses'}
                </p>
              </div>
            </Link>

            {/* Coming Soon: AI Planner */}
            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 relative overflow-hidden opacity-75">
              <div className="absolute top-2.5 right-2.5">
                <span className="inline-flex items-center gap-1 bg-primary-100 text-primary-600 text-[10px] font-black px-2 py-0.5 rounded-full">
                  <Lock size={8} /> Soon
                </span>
              </div>
              <div className="w-10 h-10 bg-gradient-to-br from-violet-400 to-purple-500 rounded-xl flex items-center justify-center mb-3">
                <Sparkles size={20} className="text-white" />
              </div>
              <p className="font-bold text-gray-500 text-sm">AI Planner</p>
              <p className="text-xs text-gray-400 mt-0.5">Smart suggestions</p>
            </div>

            {/* Coming Soon: Photos */}
            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 relative overflow-hidden opacity-75">
              <div className="absolute top-2.5 right-2.5">
                <span className="inline-flex items-center gap-1 bg-primary-100 text-primary-600 text-[10px] font-black px-2 py-0.5 rounded-full">
                  <Lock size={8} /> Soon
                </span>
              </div>
              <div className="w-10 h-10 bg-gradient-to-br from-rose-400 to-pink-500 rounded-xl flex items-center justify-center mb-3">
                <Camera size={20} className="text-white" />
              </div>
              <p className="font-bold text-gray-500 text-sm">Photos</p>
              <p className="text-xs text-gray-400 mt-0.5">Trip memories</p>
            </div>
          </div>
        </div>

        {/* Notes */}
        {trip.notes && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <p className="text-xs font-black text-gray-400 uppercase tracking-wide mb-2">Notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{trip.notes}</p>
          </div>
        )}
      </motion.div>
    </AppShell>
  )
}
