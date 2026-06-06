'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Plus, Plane } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { getTrips, deleteTrip } from '@/lib/firestore'
import AppShell from '@/components/layout/AppShell'
import TripCard from '@/components/trips/TripCard'
import ProfileSetup from '@/components/trips/ProfileSetup'
import Button from '@/components/ui/Button'
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
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
        </div>
      ) : trips.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center h-64 text-center"
        >
          <div className="w-20 h-20 bg-primary-50 rounded-3xl flex items-center justify-center mb-4">
            <Plane size={32} className="text-primary-400" />
          </div>
          <h3 className="font-bold text-gray-800 text-lg mb-1">No trips yet</h3>
          <p className="text-gray-400 text-sm mb-6 max-w-xs">
            Create your first trip and start building your perfect itinerary.
          </p>
          <Button onClick={() => router.push('/trips/new')} size="lg">
            <Plus size={18} /> Plan Your First Trip
          </Button>
        </motion.div>
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
