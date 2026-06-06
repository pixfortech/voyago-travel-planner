'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, ChevronDown } from 'lucide-react'
import { formatDate, activityTypeIcon, formatCurrency } from '@/lib/utils'
import type { ItineraryDay, Activity } from '@/types'
import ActivityCard from './ActivityCard'

interface DaySectionProps {
  day: ItineraryDay
  currency: string
  onAddActivity: (dayId: string) => void
  onDeleteActivity: (dayId: string, activityId: string) => void
  onToggleConfirm: (dayId: string, activityId: string, confirmed: boolean) => void
}

export default function DaySection({
  day,
  currency,
  onAddActivity,
  onDeleteActivity,
  onToggleConfirm,
}: DaySectionProps) {
  const [expanded, setExpanded] = useState(true)
  const dayTotal = day.activities.reduce((sum, a) => sum + (a.cost ?? 0), 0)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center">
            <span className="text-sm font-black text-primary-600">{day.dayNumber}</span>
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-gray-900">Day {day.dayNumber}</p>
            <p className="text-xs text-gray-400">{formatDate(day.date)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dayTotal > 0 && (
            <span className="text-xs font-semibold text-primary-600">
              {formatCurrency(dayTotal, currency)}
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
                <div className="divide-y divide-gray-50">
                  {[...day.activities]
                    .sort((a, b) => a.time.localeCompare(b.time))
                    .map((activity) => (
                      <ActivityCard
                        key={activity.id}
                        activity={activity}
                        currency={currency}
                        onDelete={() => onDeleteActivity(day.id, activity.id)}
                        onToggleConfirm={(confirmed) =>
                          onToggleConfirm(day.id, activity.id, confirmed)
                        }
                      />
                    ))}
                </div>
              )}

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
