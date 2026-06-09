'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  FileText, BarChart2, Users, Route, Camera,
  Wallet, ArrowRight, Download,
} from 'lucide-react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import AppShell from '@/components/layout/AppShell'
import { Skeleton } from '@/components/ui/Skeleton'
import { getTrip, getExpenses, getMemories } from '@/lib/firestore'
import { downloadExpensesCSV, downloadSettlementCSV } from '@/lib/export'
import type { Trip, Expense, TripMemory } from '@/types'

interface ReportCard {
  type: string
  title: string
  description: string
  icon: React.ReactNode
  gradient: string
  accent: string
  hoverBorder: string
  available: (trip: Trip, expenses: Expense[], memories: TripMemory[]) => boolean
  unavailableReason?: string
}

const REPORTS: ReportCard[] = [
  {
    type: 'full',
    title: 'Full Trip Recap',
    description: 'Complete overview — trip details, itinerary, budget, settlements, and highlights.',
    icon: <FileText size={22} className="text-white" />,
    gradient: 'from-primary-500 to-teal-500',
    accent: 'text-primary-600',
    hoverBorder: 'hover:border-primary-200',
    available: () => true,
  },
  {
    type: 'itinerary',
    title: 'Itinerary Report',
    description: 'Day-by-day schedule with activities, timings, and booking status.',
    icon: <Route size={22} className="text-white" />,
    gradient: 'from-sky-500 to-blue-500',
    accent: 'text-sky-600',
    hoverBorder: 'hover:border-sky-200',
    available: () => true,
  },
  {
    type: 'budget',
    title: 'Budget Report',
    description: 'Full expense breakdown by category, vendor, and day. Includes CSV export.',
    icon: <Wallet size={22} className="text-white" />,
    gradient: 'from-amber-400 to-orange-500',
    accent: 'text-amber-600',
    hoverBorder: 'hover:border-amber-200',
    available: (_t, expenses) => expenses.length > 0,
    unavailableReason: 'Add some expenses first',
  },
  {
    type: 'settlement',
    title: 'Settlement Report',
    description: 'Who owes whom and how much. Minimal-transfer settle-up with CSV export.',
    icon: <Users size={22} className="text-white" />,
    gradient: 'from-violet-500 to-purple-500',
    accent: 'text-violet-600',
    hoverBorder: 'hover:border-violet-200',
    available: (trip, expenses) => expenses.length > 0 && (trip.travellers?.length ?? 0) > 1,
    unavailableReason: 'Need expenses and multiple travellers',
  },
  {
    type: 'route',
    title: 'Route Summary',
    description: 'Geographic journey overview with check-ins, distances, and place highlights.',
    icon: <BarChart2 size={22} className="text-white" />,
    gradient: 'from-emerald-500 to-teal-500',
    accent: 'text-emerald-600',
    hoverBorder: 'hover:border-emerald-200',
    available: () => true,
  },
  {
    type: 'memories',
    title: 'Memories Album',
    description: 'Photo album of your trip memories, grouped by day.',
    icon: <Camera size={22} className="text-white" />,
    gradient: 'from-rose-500 to-pink-500',
    accent: 'text-rose-600',
    hoverBorder: 'hover:border-rose-200',
    available: (_t, _e, memories) => memories.length > 0,
    unavailableReason: 'No memories uploaded yet',
  },
]

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, delay },
})

export default function ReportsPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const router = useRouter()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [memories, setMemories] = useState<TripMemory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tripId) return
    Promise.all([getTrip(tripId), getExpenses(tripId), getMemories(tripId)]).then(([t, e, m]) => {
      if (!t) { router.push('/dashboard'); return }
      setTrip(t)
      setExpenses(e)
      setMemories(m)
      setLoading(false)
    })
  }, [tripId, router])

  if (loading) {
    return (
      <AppShell back={`/trips/${tripId}`} tripId={tripId} wide>
        <div className="max-w-3xl mx-auto space-y-4">
          <Skeleton className="h-16 rounded-2xl" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[0,1,2,3,4,5].map(i => <Skeleton key={i} className="h-36 rounded-2xl" />)}
          </div>
        </div>
      </AppShell>
    )
  }

  if (!trip) return null

  return (
    <AppShell back={`/trips/${tripId}`} tripId={tripId} wide>
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <motion.div {...fadeUp(0)} className="mb-6">
          <h1 className="text-2xl font-black text-gray-900">Reports &amp; Exports</h1>
          <p className="text-sm text-gray-500 mt-1">
            Print, save as PDF, or download CSV — all private to trip members.
          </p>
        </motion.div>

        {/* Quick CSV downloads */}
        {expenses.length > 0 && (
          <motion.div {...fadeUp(0.05)} className="mb-6 flex flex-wrap gap-2">
            <button
              onClick={() => downloadExpensesCSV(expenses, trip)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
            >
              <Download size={14} className="text-amber-500" />
              Expenses CSV
            </button>
            {(trip.travellers?.length ?? 0) > 1 && (
              <button
                onClick={() => downloadSettlementCSV(expenses, trip.travellers ?? [], trip)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
              >
                <Download size={14} className="text-violet-500" />
                Settlements CSV
              </button>
            )}
          </motion.div>
        )}

        {/* Report cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {REPORTS.map((report, i) => {
            const ok = report.available(trip, expenses, memories)
            return (
              <motion.div key={report.type} {...fadeUp(0.05 + i * 0.04)}>
                {ok ? (
                  <Link href={`/trips/${tripId}/reports/${report.type}`}>
                    <div className={`bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md ${report.hoverBorder} hover:-translate-y-0.5 transition-all cursor-pointer group h-full`}>
                      <div className={`w-11 h-11 bg-gradient-to-br ${report.gradient} rounded-xl flex items-center justify-center mb-3 shadow-sm`}>
                        {report.icon}
                      </div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-gray-900 text-sm">{report.title}</p>
                          <p className="text-xs text-gray-400 mt-1 leading-relaxed">{report.description}</p>
                        </div>
                        <ArrowRight size={15} className={`flex-shrink-0 mt-0.5 text-gray-300 group-hover:${report.accent} transition-colors`} />
                      </div>
                    </div>
                  </Link>
                ) : (
                  <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 opacity-60 h-full">
                    <div className={`w-11 h-11 bg-gradient-to-br ${report.gradient} rounded-xl flex items-center justify-center mb-3 shadow-sm opacity-60`}>
                      {report.icon}
                    </div>
                    <p className="font-bold text-gray-500 text-sm">{report.title}</p>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">{report.description}</p>
                    {report.unavailableReason && (
                      <p className="text-[11px] text-gray-400 mt-2 font-medium">{report.unavailableReason}</p>
                    )}
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      </div>
    </AppShell>
  )
}
