'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Plane, Sparkles } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { getTrips, deleteTrip } from '@/lib/firestore'
import { getDayCount } from '@/lib/utils'
import AppShell from '@/components/layout/AppShell'
import TripCard from '@/components/trips/TripCard'
import ProfileSetup from '@/components/trips/ProfileSetup'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatTile } from '@/components/vy'
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

  const totalDays = trips.reduce((s, t) => s + getDayCount(t.startDate, t.endDate), 0)
  const uniqueDests = new Set(trips.map((t) => t.destination)).size

  const stats = [
    { label: 'Total trips', value: trips.length, icon: 'suitcase-rolling', tone: 'teal' as const },
    { label: 'Days planned', value: totalDays, icon: 'calendar-day', tone: 'violet' as const },
    { label: 'Destinations', value: uniqueDests, icon: 'location-dot', tone: 'coral' as const },
  ]

  return (
    <AppShell
      title={profile ? `Hi, ${profile.name} 👋` : 'My Trips'}
      actions={
        <Button size="sm" onClick={() => router.push('/trips/new')}>
          <Plus size={15} /> New Trip
        </Button>
      }
      wide
    >
      <ProfileSetup open={!!showProfileSetup} />

      {tripsLoading ? (
        <>
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-xl overflow-hidden border"
                style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
              >
                <Skeleton className="h-1.5 rounded-none" />
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
          icon={<Plane size={30} />}
          title="No trips yet"
          description="Create your first trip and start building your perfect itinerary."
          action={
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <Button onClick={() => router.push('/trips/new/ai-generator')} size="lg" className="w-full">
                <Sparkles size={17} /> Create with AI
              </Button>
              <Button variant="secondary" onClick={() => router.push('/trips/new')} size="lg" className="w-full">
                <Plus size={17} /> Create manually
              </Button>
            </div>
          }
        />
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {stats.map((s) => (
              <StatTile key={s.label} icon={s.icon} value={s.value} label={s.label} tone={s.tone} />
            ))}
          </div>

          {/* AI quick-access row */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              onClick={() => router.push('/trips/new/ai-generator')}
              className="text-left rounded-xl border p-3.5 flex flex-col gap-2 hover:shadow-md hover:-translate-y-0.5 transition-all"
              style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
            >
              <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-xl flex items-center justify-center shadow-sm shadow-violet-500/20">
                <Sparkles size={17} className="text-white" />
              </div>
              <div>
                <p className="font-bold text-xs leading-tight" style={{ color: 'var(--foreground)' }}>
                  Create Trip with AI
                </p>
                <p className="text-[10px] mt-0.5 leading-tight" style={{ color: 'var(--muted-foreground)' }}>
                  Prompt, form or guided questions
                </p>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-600 self-start">
                New
              </span>
            </button>

            <button
              onClick={() => router.push(`/trips/${trips[0]!.id}/ai-generator`)}
              className="text-left rounded-xl border p-3.5 flex flex-col gap-2 hover:shadow-md hover:-translate-y-0.5 transition-all"
              style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
            >
              <div className="w-9 h-9 bg-gradient-to-br from-fuchsia-500 to-pink-500 rounded-xl flex items-center justify-center shadow-sm shadow-fuchsia-500/20">
                <Sparkles size={17} className="text-white" />
              </div>
              <div>
                <p className="font-bold text-xs leading-tight" style={{ color: 'var(--foreground)' }}>
                  Auto-fill Existing Trip
                </p>
                <p className="text-[10px] mt-0.5 leading-tight" style={{ color: 'var(--muted-foreground)' }}>
                  Day-by-day itinerary for any trip
                </p>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-fuchsia-100 text-fuchsia-600 self-start">
                AI
              </span>
            </button>
          </div>

          {/* Trip cards */}
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
