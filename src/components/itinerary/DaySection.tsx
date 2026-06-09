'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, ChevronDown } from 'lucide-react'
import { formatDate, formatCurrency } from '@/lib/utils'
import type { ItineraryDay, Activity } from '@/types'
import ActivityCard from './ActivityCard'

interface DaySectionProps {
  day: ItineraryDay
  currency: string
  onAddActivity: (dayId: string) => void
  onEditActivity: (dayId: string, activity: Activity) => void
  onDeleteActivity: (dayId: string, activityId: string) => void
  onToggleConfirm: (dayId: string, activityId: string, confirmed: boolean) => void
  onCommentsClick?: (activityId: string, activityTitle: string) => void
  onFoodInsightClick?: (dayId: string, activity: Activity) => void
}

function detectConflicts(activities: Activity[]): Set<string> {
  const conflicted = new Set<string>()
  const withBoth = activities.filter((a) => !!(a.startTime ?? a.time) && !!a.endTime)
  for (let i = 0; i < withBoth.length; i++) {
    for (let j = i + 1; j < withBoth.length; j++) {
      const a = withBoth[i]
      const b = withBoth[j]
      const aStart = (a.startTime ?? a.time) as string
      const bStart = (b.startTime ?? b.time) as string
      if (aStart < (b.endTime as string) && (a.endTime as string) > bStart) {
        conflicted.add(a.id)
        conflicted.add(b.id)
      }
    }
  }
  return conflicted
}

export default function DaySection({
  day,
  currency,
  onAddActivity,
  onEditActivity,
  onDeleteActivity,
  onToggleConfirm,
  onCommentsClick,
  onFoodInsightClick,
}: DaySectionProps) {
  const [expanded, setExpanded] = useState(true)

  const conflictIds = useMemo(() => detectConflicts(day.activities), [day.activities])

  const timed = useMemo(
    () =>
      [...day.activities]
        .filter((a) => !!(a.startTime ?? a.time))
        .sort((a, b) =>
          (a.startTime ?? a.time ?? '').localeCompare(b.startTime ?? b.time ?? '')
        ),
    [day.activities]
  )

  const untimed = useMemo(
    () => day.activities.filter((a) => !(a.startTime ?? a.time)),
    [day.activities]
  )

  const dayEstimated = day.activities.reduce(
    (sum, a) => sum + (a.estimatedCost ?? a.cost ?? 0),
    0
  )

  const conflictCount = conflictIds.size > 0 ? Math.floor(conflictIds.size / 2) : 0

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
      {/* Day header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-black text-primary-600">{day.dayNumber}</span>
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-gray-900">Day {day.dayNumber}</p>
            <p className="text-xs text-gray-400">{formatDate(day.date)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {conflictCount > 0 && (
            <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
              {conflictCount} conflict{conflictCount > 1 ? 's' : ''}
            </span>
          )}
          {dayEstimated > 0 && (
            <span className="text-xs font-semibold text-primary-600">
              {formatCurrency(dayEstimated, currency)}
            </span>
          )}
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {day.activities.length}
          </span>
          <ChevronDown
            size={16}
            className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100">
              {day.activities.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-6">No activities yet</p>
              ) : (
                <>
                  {/* Timed activities — timeline */}
                  {timed.length > 0 && (
                    <div className="px-4 pt-3 pb-1">
                      {timed.map((activity, index) => {
                        const isLast = index === timed.length - 1
                        return (
                          <div key={activity.id} className="flex gap-2">
                            {/* Time + connector column */}
                            <div className="flex flex-col items-center w-14 flex-shrink-0 pt-3">
                              <span className="text-[11px] font-mono text-gray-400 leading-none whitespace-nowrap">
                                {activity.startTime ?? activity.time}
                              </span>
                              {!isLast && (
                                <div className="w-px bg-gray-200 flex-1 mt-1" style={{ minHeight: 24 }} />
                              )}
                            </div>
                            {/* Card */}
                            <div className="flex-1 min-w-0 border border-gray-100 rounded-xl mb-2 overflow-hidden">
                              <ActivityCard
                                activity={activity}
                                currency={currency}
                                hasConflict={conflictIds.has(activity.id)}
                                onEdit={() => onEditActivity(day.id, activity)}
                                onDelete={() => onDeleteActivity(day.id, activity.id)}
                                onToggleConfirm={(confirmed) =>
                                  onToggleConfirm(day.id, activity.id, confirmed)
                                }
                                onCommentsClick={
                                  onCommentsClick
                                    ? () => onCommentsClick(activity.id, activity.title)
                                    : undefined
                                }
                                onFoodInsightClick={
                                  onFoodInsightClick
                                    ? () => onFoodInsightClick(day.id, activity)
                                    : undefined
                                }
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Untimed / Flexible activities */}
                  {untimed.length > 0 && (
                    <div className={timed.length > 0 ? 'border-t border-gray-50' : ''}>
                      {timed.length > 0 && (
                        <div className="px-4 pt-2 pb-1">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                            Flexible
                          </span>
                        </div>
                      )}
                      <div className="divide-y divide-gray-50">
                        {untimed.map((activity) => (
                          <ActivityCard
                            key={activity.id}
                            activity={activity}
                            currency={currency}
                            hasConflict={false}
                            onEdit={() => onEditActivity(day.id, activity)}
                            onDelete={() => onDeleteActivity(day.id, activity.id)}
                            onToggleConfirm={(confirmed) =>
                              onToggleConfirm(day.id, activity.id, confirmed)
                            }
                            onCommentsClick={
                              onCommentsClick
                                ? () => onCommentsClick(activity.id, activity.title)
                                : undefined
                            }
                            onFoodInsightClick={
                              onFoodInsightClick
                                ? () => onFoodInsightClick(day.id, activity)
                                : undefined
                            }
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Add activity button */}
              <div className="p-3 border-t border-gray-50">
                <button
                  onClick={() => onAddActivity(day.id)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-primary-300 hover:text-primary-500 transition-colors"
                >
                  <Plus size={16} />
                  Add activity
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
