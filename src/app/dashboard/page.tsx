'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Plane, Calendar, MapPin, Sparkles } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { getTrips, deleteTrip } from '@/lib/firestore'
import { getDayCount } from '@/lib/utils'
import AppShell from '@/components/layout/AppShell'
import TripCard from '@/components/trips/TripCard'
import ProfileSetup from '@/components/trips/ProfileSetup'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import type { Trip } from '@/types'

export default function DashboardPage() {
  const router = useRouter()
  const { user, profile, loading } = useApp()
  const [trips, setTrips] = useState<Trip[]>([])
  const [tripsLoading, setTripsLoading] = useState(true)

  useEffect(() => {
    if (!user || loading) return
    getTrips(user.uid).then((data) => {
      setTrips(data)
      setTripsLoading(false)
    })
  }, [user, loading])

  async function handleDelete(tripId: string) {
    if (!confirm('Delete this trip? This cannot be undone.')) return
    await deleteTrip(tripId)
    setTrips((prev) => prev.filter((t) => t.id !== tripId))
  }

  const showProfileSetup = !loading && user && !profile

  // Aggregate stats shown when trips are loaded
  const totalDays = trips.reduce((s, t) => s + getDayCount(t.startDate, t.endDate), 0)
  const uniqueDests = new Set(trips.map((t) => t.destination)).size

  const stats = [
    { label: 'Total trips', value: trips.length, icon: <Plane size={16} /> },
    { label: 'Days planned', value: totalDays, icon: <Calendar size={16} /> },
    { label: 'Destinations', value: uniqueDests, icon: <MapPin size={16} /> },
  ]

  return (
    <AppShell
      title={profile ? `Hi, ${profile.name} 👋` : 'My Trips'}
      actions={
        <Button size="sm" onClick={() => router.push('/trips/new')}>
          <Plus size={16} /> New Trip
        </Button>
      }
      wide
    >
      <ProfileSetup open={!!showProfileSetup} />

      {tripsLoading ? (
        <>
          {/* Stats skeletons */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
          {/* Card skeletons */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
                <Skeleton className="h-2.5 rounded-none" />
                <div className="p-4 space-y-2.5">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : trips.length === 0 ? (
        <EmptyState
          icon={<Plane size={32} />}
          title="No trips yet"
          description="Create your first trip and start building your perfect itinerary."
          action={
            <Button onClick={() => router.push('/trips/new')} size="lg">
              <Plus size={18} /> Plan Your First Trip
            </Button>
          }
        />
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {stats.map((s) => (
              <div
                key={s.label}
                className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col"
              >
                <div className="flex items-center gap-1.5 text-primary-500 mb-2 text-xs font-semibold">
                  {s.icon}
                  <span className="text-gray-400">{s.label}</span>
                </div>
                <p className="text-2xl font-black text-gray-900">{s.value}</p>
              </div>
            ))}
          </div>

          {/* AI Trip Generator banner */}
          <button
            onClick={() => router.push(`/trips/${trips[0]!.id}/ai-generator`)}
            className="w-full text-left mb-6 rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50 to-fuchsia-50 p-4 flex items-center gap-3 hover:shadow-md hover:-translate-y-0.5 transition-all"
          >
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm shadow-violet-500/20">
              <Sparkles size={20} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm">AI Trip Generator</p>
              <p className="text-xs text-gray-500">Auto-fill a full day-by-day itinerary inside any trip — preview &amp; edit before saving.</p>
            </div>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-violet-100 text-violet-600 flex-shrink-0">New</span>
          </button>

          {/* Trip cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {trips.map((trip) => (
              <TripCard key={trip.id} trip={trip} onDelete={handleDelete} />
            ))}
          </div>
        </>
      )}
    </AppShell>
  )
}
