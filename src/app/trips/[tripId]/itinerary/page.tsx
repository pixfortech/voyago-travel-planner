'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, TrendingDown, X } from 'lucide-react'
import { getTrip, getItineraryDays, getExpenses, getLocationPoints, getMemories, addActivity, deleteActivity, updateActivity } from '@/lib/firestore'
import { detectVisitedActivities } from '@/lib/location/visited'
import { formatCurrency } from '@/lib/utils'
import { useApp } from '@/context/AppContext'
import AppShell from '@/components/layout/AppShell'
import DaySection from '@/components/itinerary/DaySection'
import AddActivityModal from '@/components/itinerary/AddActivityModal'
import BudgetCoachCard from '@/components/ai/BudgetCoachCard'
import RoutePlanningSection from '@/components/maps/RoutePlanningSection'
import CommentsPanel from '@/components/comments/CommentsPanel'
import ReactionBar from '@/components/comments/ReactionBar'
import FoodInsightCard from '@/components/itinerary/FoodInsightCard'
import { useMapsStatus } from '@/lib/maps/useMapsStatus'
import type {
  Trip, ItineraryDay, Activity, Expense, BudgetCoachRouteSummary, FoodPlaceInsight,
  TripLocationPoint, TripMemory,
} from '@/types'

export default function ItineraryPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const router = useRouter()
  const { user, profile } = useApp()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [days, setDays] = useState<ItineraryDay[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)

  const [addingDayId, setAddingDayId] = useState<string | null>(null)
  const [editingActivity, setEditingActivity] = useState<{ dayId: string; activity: Activity } | null>(null)
  const [routeSummary, setRouteSummary] = useState<BudgetCoachRouteSummary | undefined>(undefined)
  const [commentTarget, setCommentTarget] = useState<{ activityId: string; activityTitle: string } | null>(null)
  const [foodTarget, setFoodTarget] = useState<{ dayId: string; activity: Activity } | null>(null)
  // Phase 15A — location signals for likely-visited badges (read-only, no GPS prompt).
  const [locationPoints, setLocationPoints] = useState<TripLocationPoint[]>([])
  const [memories, setMemories] = useState<TripMemory[]>([])

  const { status: mapsStatus } = useMapsStatus()

  useEffect(() => {
    if (!tripId) return
    Promise.all([getTrip(tripId), getItineraryDays(tripId), getExpenses(tripId)]).then(
      ([t, d, e]) => {
        if (!t) { router.push('/dashboard'); return }
        setTrip(t)
        setDays(d)
        setExpenses(e)
        setLoading(false)
      }
    )
    // Best-effort: load saved location/memory data for visited badges. Never
    // requests GPS permission — only reads what the user already saved.
    Promise.all([getLocationPoints(tripId), getMemories(tripId)])
      .then(([lp, m]) => { setLocationPoints(lp); setMemories(m) })
      .catch(() => {})
  }, [tripId, router])

  // Activity IDs detected as likely visited (display-only; stored status wins).
  const likelyVisitedIds = useMemo(() => {
    if (locationPoints.length === 0 && memories.length === 0) return new Set<string>()
    return new Set(
      detectVisitedActivities(days, locationPoints, memories).map((d) => d.activityId),
    )
  }, [days, locationPoints, memories])

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

  async function handleSaveFoodInsight(dayId: string, activityId: string, insight: FoodPlaceInsight) {
    await updateActivity(tripId, dayId, activityId, { foodInsight: insight })
    setDays((prev) =>
      prev.map((d) =>
        d.id === dayId
          ? {
              ...d,
              activities: d.activities.map((a) =>
                a.id === activityId ? { ...a, foodInsight: insight } : a
              ),
            }
          : d
      )
    )
    // Keep the drawer's activity in sync so the saved badge reflects immediately.
    setFoodTarget((prev) =>
      prev && prev.activity.id === activityId
        ? { ...prev, activity: { ...prev.activity, foodInsight: insight } }
        : prev
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
              onCommentsClick={(activityId, activityTitle) =>
                setCommentTarget({ activityId, activityTitle })
              }
              onFoodInsightClick={(dayId, activity) => setFoodTarget({ dayId, activity })}
              likelyVisitedIds={likelyVisitedIds}
            />
          ))
        )}

        {/* Maps & route planning (gated; manual entry always works) */}
        {days.length > 0 && (
          <div className="pt-1">
            <RoutePlanningSection
              days={days}
              status={mapsStatus}
              onAggregate={setRouteSummary}
            />
          </div>
        )}

        {/* AI Budget Coach — planned itinerary vs budget (+ route summary if any) */}
        {trip && totalEstimated > 0 && (
          <div className="pt-1">
            <BudgetCoachCard
              trip={trip}
              expenses={expenses}
              days={days}
              variant="itinerary"
              routeSummary={routeSummary}
            />
          </div>
        )}
      </motion.div>

      <AddActivityModal
        open={modalOpen}
        onClose={handleModalClose}
        onSave={handleSaveActivity}
        editActivity={editingActivity?.activity}
        existingActivities={modalDayActivities}
      />

      {/* ── Activity comments & reactions drawer ── */}
      <AnimatePresence>
        {commentTarget && trip && user && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex justify-end"
            onClick={() => setCommentTarget(null)}
          >
            {/* Backdrop */}
            <div className="flex-1 bg-black/40" />

            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="w-full max-w-sm bg-white flex flex-col h-full shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 flex-shrink-0">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-gray-400 uppercase tracking-wide">Discussion</p>
                  <p className="text-sm font-bold text-gray-900 truncate">{commentTarget.activityTitle}</p>
                </div>
                <button
                  onClick={() => setCommentTarget(null)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors flex-shrink-0"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Reactions */}
              <div className="px-4 py-3 border-b border-gray-50 flex-shrink-0">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">React</p>
                <ReactionBar
                  tripId={tripId}
                  targetType="activity"
                  targetId={commentTarget.activityId}
                  currentUid={user.uid}
                />
              </div>

              {/* Comments — scrollable */}
              <div className="flex-1 overflow-y-auto px-4 py-3">
                <CommentsPanel
                  tripId={tripId}
                  targetType="activity"
                  targetId={commentTarget.activityId}
                  trip={trip}
                  currentUid={user.uid}
                  authorName={profile?.name ?? user.displayName ?? 'Member'}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Food Intelligence drawer ── */}
      <AnimatePresence>
        {foodTarget && trip && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex justify-end"
            onClick={() => setFoodTarget(null)}
          >
            <div className="flex-1 bg-black/40" />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="w-full max-w-sm bg-white flex flex-col h-full shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 flex-shrink-0">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-gray-400 uppercase tracking-wide">Restaurant / Café</p>
                  <p className="text-sm font-bold text-gray-900 truncate">{foodTarget.activity.title}</p>
                </div>
                <button
                  onClick={() => setFoodTarget(null)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors flex-shrink-0"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <FoodInsightCard
                  trip={trip}
                  activity={foodTarget.activity}
                  onSave={(insight) =>
                    handleSaveFoodInsight(foodTarget.dayId, foodTarget.activity.id, insight)
                  }
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  )
}
