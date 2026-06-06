'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Plane } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { getTrips, deleteTrip } from '@/lib/firestore'
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

  return (
    <AppShell
      title={profile ? `Hi, ${profile.name} 👋` : 'My Trips'}
      actions={
        <Button size="sm" onClick={() => router.push('/trips/new')}>
          <Plus size={16} /> New Trip
        </Button>
      }
    >
      <ProfileSetup open={!!showProfileSetup} />

      {tripsLoading ? (
        <div className="space-y-3">
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
        <div className="space-y-3">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </AppShell>
  )
}
