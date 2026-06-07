'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  MapPin, Calendar, Users, Wallet, Map, Pencil, Trash2, Share2,
  Sparkles, Camera, Lock, Plus, ChevronRight, CheckCircle2, Circle,
  TrendingUp, UserPlus,
} from 'lucide-react'
import { getTrip, deleteTrip, getExpenses } from '@/lib/firestore'
import AppShell from '@/components/layout/AppShell'
import Badge from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  formatDate, getDayCount, tripTypeLabel, formatCurrency, formatCurrencyPrecise,
} from '@/lib/utils'
import {
  getTotalSpent, getBudgetUsagePercent, getPerHeadBudget, getPerHeadActualCost,
} from '@/lib/calculations'
import type { Trip, Expense } from '@/types'
import Link from 'next/link'

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay },
})

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
      <AppShell back="/dashboard" tripId={tripId} wide>
        <div className="space-y-4 lg:grid lg:grid-cols-3 lg:gap-6 lg:space-y-0">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-36 rounded-2xl" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[0,1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}
            </div>
            <Skeleton className="h-10 rounded-xl" />
            <div className="grid grid-cols-2 gap-3">
              {[0,1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
            </div>
          </div>
          <div className="space-y-4">
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-36 rounded-2xl" />
          </div>
        </div>
      </AppShell>
    )
  }

  if (!trip) return null

  const days = getDayCount(trip.startDate, trip.endDate)
  const travellers = trip.travellers ?? []
  const travellerCount = Math.max(travellers.length, 1)
  const spent = getTotalSpent(expenses)
  const remaining = trip.budget > 0 ? trip.budget - spent : 0
  const usagePct = trip.budget > 0 ? getBudgetUsagePercent(trip.budget, expenses) : 0
  const perHeadBudget = trip.budget > 0 ? getPerHeadBudget(trip.budget, travellerCount) : 0
  const perHeadSpent = getPerHeadActualCost(expenses, travellerCount)

  const isOverBudget = trip.budget > 0 && spent > trip.budget
  // Whether the AI Budget Coach has enough signal to give useful advice.
  const hasCoachData = trip.budget > 0 || expenses.length > 0
  const barColor = isOverBudget
    ? 'bg-red-500'
    : usagePct > 80
    ? 'bg-amber-400'
    : 'bg-emerald-500'

  // Next-step checklist
  const steps = [
    { label: 'Trip created', done: true },
    { label: 'Add travellers', done: travellers.length > 0, href: `/trips/${tripId}/edit` },
    { label: 'Plan your itinerary', done: false, href: `/trips/${tripId}/itinerary` },
    { label: 'Set a budget', done: trip.budget > 0, href: `/trips/${tripId}/edit` },
    { label: 'Log first expense', done: expenses.length > 0, href: `/trips/${tripId}/budget` },
  ]
  const doneCount = steps.filter(s => s.done).length

  return (
    <AppShell
      back="/dashboard"
      tripId={tripId}
      wide
      actions={
        <div className="flex items-center gap-0.5">
          <Link
            href={`/trips/${tripId}/edit`}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors"
            title="Edit trip"
          >
            <Pencil size={18} />
          </Link>
          <Link
            href={`/trips/${tripId}/share`}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors"
            title="Share trip"
          >
            <Share2 size={18} />
          </Link>
          <button
            onClick={handleDelete}
            className="p-2 rounded-xl hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
            title="Delete trip"
          >
            <Trash2 size={18} />
          </button>
        </div>
      }
    >
      <div className="lg:grid lg:grid-cols-3 lg:gap-6 space-y-4 lg:space-y-0">

        {/* ── Main column ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Hero card */}
          <motion.div {...fadeUp(0)}>
            <div
              className="rounded-2xl p-5 text-white relative overflow-hidden"
              style={{ backgroundColor: trip.coverColor }}
            >
              {/* Decorative blobs */}
              <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/10 pointer-events-none" />
              <div className="absolute -bottom-8 -left-4 w-24 h-24 rounded-full bg-black/10 pointer-events-none" />
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-black/20 pointer-events-none" />
              <div className="relative">
                <div className="flex items-start justify-between mb-3">
                  <h1 className="text-2xl font-black leading-tight flex-1 pr-2">{trip.name}</h1>
                  <Badge variant="glass" className="flex-shrink-0 mt-0.5">
                    {tripTypeLabel(trip.type)}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <div className="flex items-center gap-1.5 text-white/80">
                    <MapPin size={13} />
                    <span className="text-sm font-medium">{trip.destination}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-white/70">
                    <Calendar size={13} />
                    <span className="text-sm">
                      {formatDate(trip.startDate)} – {formatDate(trip.endDate)}
                    </span>
                  </div>
                </div>
                {trip.budget > 0 && (
                  <div className="mt-3 inline-flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1">
                    <Wallet size={11} className="text-white/80" />
                    <span className="text-xs font-bold text-white">
                      Budget: {formatCurrency(trip.budget, trip.currency)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Stats row */}
          <motion.div {...fadeUp(0.06)} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Days */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="inline-flex items-center gap-1.5 bg-primary-50 text-primary-600 px-2 py-1 rounded-lg mb-2 text-xs font-semibold">
                <Calendar size={11} /> Days
              </div>
              <p className="text-2xl font-black text-gray-900 leading-none">{days}</p>
              <p className="text-[11px] text-gray-400 mt-1">night trip</p>
            </div>

            {/* Travellers */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="inline-flex items-center gap-1.5 bg-violet-50 text-violet-600 px-2 py-1 rounded-lg mb-2 text-xs font-semibold">
                <Users size={11} /> People
              </div>
              <p className="text-2xl font-black text-gray-900 leading-none">{travellerCount}</p>
              <p className="text-[11px] text-gray-400 mt-1">{tripTypeLabel(trip.type)}</p>
            </div>

            {/* Spent */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-600 px-2 py-1 rounded-lg mb-2 text-xs font-semibold">
                <TrendingUp size={11} /> Spent
              </div>
              <p className="text-lg font-black text-gray-900 leading-none truncate">
                {spent > 0 ? formatCurrency(spent, trip.currency) : '—'}
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                {perHeadSpent > 0 ? `${formatCurrency(perHeadSpent, trip.currency)}/head` : 'no expenses'}
              </p>
            </div>

            {/* Remaining */}
            <div className={`bg-white rounded-2xl p-4 border shadow-sm ${isOverBudget ? 'border-red-100' : 'border-gray-100'}`}>
              <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg mb-2 text-xs font-semibold ${isOverBudget ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                <Wallet size={11} /> {isOverBudget ? 'Over' : 'Left'}
              </div>
              <p className={`text-lg font-black leading-none truncate ${isOverBudget ? 'text-red-600' : 'text-gray-900'}`}>
                {trip.budget > 0 ? formatCurrency(Math.abs(remaining), trip.currency) : '—'}
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                {trip.budget > 0
                  ? (perHeadBudget > 0 ? `${formatCurrency(perHeadBudget, trip.currency)}/head budget` : 'of budget')
                  : 'no budget set'}
              </p>
            </div>
          </motion.div>

          {/* Budget progress bar */}
          {trip.budget > 0 && (
            <motion.div {...fadeUp(0.1)}>
              <Link href={`/trips/${tripId}/budget`}>
                <div className="bg-white rounded-2xl px-4 py-3 border border-gray-100 shadow-sm hover:shadow-md hover:border-primary-200 transition-all group">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-gray-600 group-hover:text-primary-600 transition-colors">
                      Budget tracker
                    </span>
                    <span className={`text-xs font-bold ${isOverBudget ? 'text-red-500' : usagePct > 80 ? 'text-amber-500' : 'text-emerald-600'}`}>
                      {Math.round(usagePct)}% used
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${barColor}`}
                      style={{ width: `${Math.min(usagePct, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[11px] text-gray-400">
                      {formatCurrencyPrecise(spent, trip.currency)} spent
                    </span>
                    <span className="text-[11px] text-gray-400 flex items-center gap-1">
                      View details <ChevronRight size={10} />
                    </span>
                  </div>
                </div>
              </Link>
            </motion.div>
          )}

          {/* Module cards */}
          <motion.div {...fadeUp(0.14)}>
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3 px-0.5">
              Explore
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Link href={`/trips/${tripId}/itinerary`}>
                <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md hover:border-primary-200 hover:-translate-y-0.5 transition-all cursor-pointer">
                  <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-teal-500 rounded-xl flex items-center justify-center mb-3 shadow-sm shadow-primary-500/20">
                    <Map size={20} className="text-white" />
                  </div>
                  <p className="font-bold text-gray-900 text-sm">Itinerary</p>
                  <p className="text-xs text-gray-400 mt-0.5">Day-by-day plan</p>
                </div>
              </Link>

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

              <Link href={`/trips/${tripId}/budget#ai-coach`}>
                <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md hover:border-violet-200 hover:-translate-y-0.5 transition-all cursor-pointer relative overflow-hidden">
                  <div className="absolute top-2.5 right-2.5">
                    <span className="inline-flex items-center gap-1 bg-violet-100 text-violet-600 text-[10px] font-black px-2 py-0.5 rounded-full">
                      Beta
                    </span>
                  </div>
                  <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-500 rounded-xl flex items-center justify-center mb-3 shadow-sm shadow-violet-500/20">
                    <Sparkles size={20} className="text-white" />
                  </div>
                  <p className="font-bold text-gray-900 text-sm">AI Budget Coach</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {hasCoachData ? 'Smart budget advice' : 'Add data to unlock'}
                  </p>
                </div>
              </Link>

              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 relative overflow-hidden opacity-70">
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
          </motion.div>

          {/* Notes */}
          {trip.notes && (
            <motion.div {...fadeUp(0.18)}>
              <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                <p className="text-xs font-black text-gray-400 uppercase tracking-wide mb-2">Notes</p>
                <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{trip.notes}</p>
              </div>
            </motion.div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-4">

          {/* Travellers */}
          <motion.div {...fadeUp(0.08)}>
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-black text-gray-400 uppercase tracking-wide">Travellers</p>
                <Link
                  href={`/trips/${tripId}/edit`}
                  className="text-[11px] font-semibold text-primary-600 hover:text-primary-700 transition-colors"
                >
                  Edit
                </Link>
              </div>
              {travellers.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {travellers.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-1.5 rounded-full pl-1 pr-3 py-1 text-white text-xs font-bold"
                      style={{ backgroundColor: t.color }}
                      title={t.name}
                    >
                      <span
                        className="w-5 h-5 rounded-full bg-white/30 flex items-center justify-center text-[9px] font-black"
                      >
                        {t.initials}
                      </span>
                      {t.name}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-xs text-gray-400 mb-3">No travellers added yet</p>
                  <Link
                    href={`/trips/${tripId}/edit`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold bg-primary-50 text-primary-600 hover:bg-primary-100 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <UserPlus size={12} /> Add travellers
                  </Link>
                </div>
              )}
            </div>
          </motion.div>

          {/* Quick actions */}
          <motion.div {...fadeUp(0.12)}>
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <p className="text-xs font-black text-gray-400 uppercase tracking-wide mb-3">Quick Actions</p>
              <div className="space-y-1">
                <Link
                  href={`/trips/${tripId}/itinerary`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-primary-50 group transition-colors"
                >
                  <div className="w-7 h-7 bg-primary-50 group-hover:bg-primary-100 rounded-lg flex items-center justify-center transition-colors">
                    <Plus size={14} className="text-primary-600" />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 group-hover:text-primary-700 transition-colors flex-1">
                    Add Activity
                  </span>
                  <ChevronRight size={13} className="text-gray-300 group-hover:text-primary-400 transition-colors" />
                </Link>

                <Link
                  href={`/trips/${tripId}/budget`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-amber-50 group transition-colors"
                >
                  <div className="w-7 h-7 bg-amber-50 group-hover:bg-amber-100 rounded-lg flex items-center justify-center transition-colors">
                    <Plus size={14} className="text-amber-600" />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 group-hover:text-amber-700 transition-colors flex-1">
                    Add Expense
                  </span>
                  <ChevronRight size={13} className="text-gray-300 group-hover:text-amber-400 transition-colors" />
                </Link>

                <Link
                  href={`/trips/${tripId}/edit`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 group transition-colors"
                >
                  <div className="w-7 h-7 bg-gray-50 group-hover:bg-gray-100 rounded-lg flex items-center justify-center transition-colors">
                    <Pencil size={13} className="text-gray-500" />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 flex-1">Edit Trip</span>
                  <ChevronRight size={13} className="text-gray-300" />
                </Link>

                <Link
                  href={`/trips/${tripId}/share`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 group transition-colors"
                >
                  <div className="w-7 h-7 bg-gray-50 group-hover:bg-gray-100 rounded-lg flex items-center justify-center transition-colors">
                    <Share2 size={13} className="text-gray-500" />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 flex-1">Share Trip</span>
                  <ChevronRight size={13} className="text-gray-300" />
                </Link>

                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl opacity-50 cursor-not-allowed">
                  <div className="w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center">
                    <UserPlus size={13} className="text-gray-400" />
                  </div>
                  <span className="text-sm font-semibold text-gray-400 flex-1">Invite Members</span>
                  <span className="text-[10px] font-black text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                    Soon
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Next-step guide */}
          <motion.div {...fadeUp(0.16)}>
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-black text-gray-400 uppercase tracking-wide">Trip Setup</p>
                <span className="text-[11px] font-bold text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
                  {doneCount}/{steps.length}
                </span>
              </div>
              {/* Progress micro-bar */}
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-primary-400 rounded-full transition-all"
                  style={{ width: `${(doneCount / steps.length) * 100}%` }}
                />
              </div>
              <div className="space-y-1.5">
                {steps.map((step) => {
                  const inner = (
                    <div
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-colors ${
                        step.done
                          ? 'opacity-60'
                          : step.href
                          ? 'hover:bg-primary-50 cursor-pointer'
                          : ''
                      }`}
                    >
                      {step.done ? (
                        <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0" />
                      ) : (
                        <Circle size={15} className="text-gray-300 flex-shrink-0" />
                      )}
                      <span
                        className={`text-sm font-semibold ${
                          step.done ? 'text-gray-400 line-through' : 'text-gray-700'
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                  )
                  return step.href && !step.done ? (
                    <Link key={step.label} href={step.href}>
                      {inner}
                    </Link>
                  ) : (
                    <div key={step.label}>{inner}</div>
                  )
                })}
              </div>
            </div>
          </motion.div>

        </div>
      </div>
    </AppShell>
  )
}
