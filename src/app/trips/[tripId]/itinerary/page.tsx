'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { getTrip, getItineraryDays, addActivity, deleteActivity, updateActivity } from '@/lib/firestore'
import { formatCurrency } from '@/lib/utils'
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

  const [addingDayId, setAddingDayId] = useState<string | null>(null)
  const [editingActivity, setEditingActivity] = useState<{ dayId: string; activity: Activity } | null>(null)

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
    setAddingDayId(dayId)
    setEditingActivity(null)
  }

  function handleEditActivityClick(dayId: string, activity: Activity) {
    setEditingActivity({ dayId, activity })
    setAddingDayId(null)
  }

  function handleModalClose() {
    setAddingDayId(null)
    setEditingActivity(null)
  }

  async function handleSaveActivity(activityData: Omit<Activity, 'id'>) {
    if (!tripId) return
    if (editingActivity) {
      await updateActivity(tripId, editingActivity.dayId, editingActivity.activity.id, activityData)
      setDays((prev) =>
        prev.map((d) =>
          d.id === editingActivity.dayId
            ? {
                ...d,
                activities: d.activities.map((a) =>
                  a.id === editingActivity.activity.id ? { ...a, ...activityData } : a
                ),
              }
            : d
        )
      )
      setEditingActivity(null)
    } else if (addingDayId) {
      const newActivity = await addActivity(tripId, addingDayId, activityData)
      setDays((prev) =>
        prev.map((d) =>
          d.id === addingDayId ? { ...d, activities: [...d.activities, newActivity] } : d
        )
      )
      setAddingDayId(null)
    }
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
    const updates: Partial<Activity> = {
      confirmed,
      bookingStatus: confirmed ? 'completed' : 'planned',
    }
    await updateActivity(tripId, dayId, activityId, updates)
    setDays((prev) =>
      prev.map((d) =>
        d.id === dayId
          ? {
              ...d,
              activities: d.activities.map((a) =>
                a.id === activityId ? { ...a, ...updates } : a
              ),
            }
          : d
      )
    )
  }

  const totalEstimated = days.reduce(
    (sum, d) => sum + d.activities.reduce((s, a) => s + (a.estimatedCost ?? a.cost ?? 0), 0),
    0
  )
  const isOverBudget = trip && trip.budget > 0 && totalEstimated > trip.budget
  const budgetPct = trip && trip.budget > 0
    ? Math.min(100, (totalEstimated / trip.budget) * 100)
    : 0

  const modalOpen = addingDayId !== null || editingActivity !== null
  const modalDayActivities = editingActivity
    ? days.find((d) => d.id === editingActivity.dayId)?.activities ?? []
    : days.find((d) => d.id === addingDayId)?.activities ?? []

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
        {/* Budget connection header */}
        {trip && totalEstimated > 0 && trip.budget > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-gray-400">Estimated itinerary cost</p>
                <p
                  className={`text-xl font-black mt-0.5 ${
                    isOverBudget ? 'text-red-600' : 'text-gray-900'
                  }`}
                >
                  {formatCurrency(totalEstimated, trip.currency)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">Trip budget</p>
                <p className="text-sm font-semibold text-gray-600 mt-0.5">
                  {formatCurrency(trip.budget, trip.currency)}
                </p>
              </div>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  isOverBudget ? 'bg-red-400' : 'bg-primary-400'
                }`}
                style={{ width: `${budgetPct}%` }}
              />
            </div>
            <div className="flex items-center gap-1 mt-1.5">
              {isOverBudget ? (
                <TrendingUp size={12} className="text-red-500" />
              ) : (
                <TrendingDown size={12} className="text-gray-400" />
              )}
              <p
                className={`text-xs font-medium ${
                  isOverBudget ? 'text-red-500' : 'text-gray-400'
                }`}
              >
                {isOverBudget
                  ? `${formatCurrency(totalEstimated - trip.budget, trip.currency)} over budget`
                  : `${formatCurrency(trip.budget - totalEstimated, trip.currency)} remaining`}
              </p>
            </div>
          </div>
        )}

        {days.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-sm">No days found. Re-create the trip with valid dates.</p>
          </div>
        ) : (
          days.map((day) => (
            <DaySection
              key={day.id}
              day={day}
              currency={trip?.currency ?? 'INR'}
              onAddActivity={handleAddActivityClick}
              onEditActivity={handleEditActivityClick}
              onDeleteActivity={handleDeleteActivity}
              onToggleConfirm={handleToggleConfirm}
            />
          ))
        )}
      </motion.div>

      <AddActivityModal
        open={modalOpen}
        onClose={handleModalClose}
        onSave={handleSaveActivity}
        editActivity={editingActivity?.activity}
        existingActivities={modalDayActivities}
      />
    </AppShell>
  )
}
