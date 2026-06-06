'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { getTrip, getItineraryDays, addActivity, deleteActivity, updateActivity } from '@/lib/firestore'
import AppShell from '@/components/layout/AppShell'
import DaySection from '@/components/itinerary/DaySection'
import AddActivityModal from '@/components/itinerary/AddActivityModal'
import type { Trip, ItineraryDay, Activity } from '@/types'

export default function ItineraryPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const router = useRouter()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [days, setDays] = useState<ItineraryDay[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    if (!tripId) return
    Promise.all([getTrip(tripId), getItineraryDays(tripId)]).then(([t, d]) => {
      if (!t) { router.push('/dashboard'); return }
      setTrip(t)
      setDays(d)
      setLoading(false)
    })
  }, [tripId, router])

  function handleAddActivityClick(dayId: string) {
    setSelectedDayId(dayId)
    setModalOpen(true)
  }

  async function handleAddActivity(activity: Omit<Activity, 'id'>) {
    if (!selectedDayId || !tripId) return
    const newActivity = await addActivity(tripId, selectedDayId, activity)
    setDays((prev) =>
      prev.map((d) =>
        d.id === selectedDayId ? { ...d, activities: [...d.activities, newActivity] } : d
      )
    )
  }

  async function handleDeleteActivity(dayId: string, activityId: string) {
    await deleteActivity(tripId, dayId, activityId)
    setDays((prev) =>
      prev.map((d) =>
        d.id === dayId
          ? { ...d, activities: d.activities.filter((a) => a.id !== activityId) }
          : d
      )
    )
  }

  async function handleToggleConfirm(dayId: string, activityId: string, confirmed: boolean) {
    await updateActivity(tripId, dayId, activityId, { confirmed })
    setDays((prev) =>
      prev.map((d) =>
        d.id === dayId
          ? {
              ...d,
              activities: d.activities.map((a) =>
                a.id === activityId ? { ...a, confirmed } : a
              ),
            }
          : d
      )
    )
  }

  if (loading) {
    return (
      <AppShell title="Itinerary" back={`/trips/${tripId}`} tripId={tripId}>
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title="Itinerary" back={`/trips/${tripId}`} tripId={tripId}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
        {days.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-sm">No days found. Re-create the trip with valid dates.</p>
          </div>
        ) : (
          days.map((day) => (
            <DaySection
              key={day.id}
              day={day}
              currency={trip?.currency ?? 'USD'}
              onAddActivity={handleAddActivityClick}
              onDeleteActivity={handleDeleteActivity}
              onToggleConfirm={handleToggleConfirm}
            />
          ))
        )}
      </motion.div>

      <AddActivityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdd={handleAddActivity}
      />
    </AppShell>
  )
}
