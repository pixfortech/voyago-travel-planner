'use client'

import { Trash2, CheckCircle, Circle, Pencil, Star, MessageSquare } from 'lucide-react'
import { activityTypeIcon, activityCategoryIcon, formatCurrency } from '@/lib/utils'
import { priceLevelSymbol, formatRating } from '@/lib/maps/config'
import type { Activity, BookingStatus } from '@/types'

const STATUS_CONFIG: Record<BookingStatus, { label: string; cls: string }> = {
  planned: { label: 'Planned', cls: 'bg-gray-100 text-gray-500' },
  booked: { label: 'Booked', cls: 'bg-blue-50 text-blue-600' },
  completed: { label: 'Done', cls: 'bg-green-50 text-green-600' },
  skipped: { label: 'Skipped', cls: 'bg-amber-50 text-amber-600' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-50 text-red-500' },
}

interface ActivityCardProps {
  activity: Activity
  currency: string
  hasConflict?: boolean
  onEdit: () => void
  onDelete: () => void
  onToggleConfirm: (confirmed: boolean) => void
  onCommentsClick?: () => void
}

export default function ActivityCard({
  activity,
  currency,
  hasConflict = false,
  onEdit,
  onDelete,
  onToggleConfirm,
  onCommentsClick,
}: ActivityCardProps) {
  const isCompleted =
    activity.bookingStatus === 'completed' || (!activity.bookingStatus && activity.confirmed)

  const icon = activity.category
    ? activityCategoryIcon(activity.category)
    : activityTypeIcon(activity.type)

  const estimatedCost = activity.estimatedCost ?? activity.cost ?? 0

  const timeDisplay = (() => {
    const start = activity.startTime ?? activity.time
    if (!start) return null
    if (activity.endTime) return `${start} → ${activity.endTime}`
    return start
  })()

  const status = activity.bookingStatus ?? (activity.confirmed ? 'completed' : 'planned')
  const statusCfg = STATUS_CONFIG[status]

  // Place metadata (Phase 6) — only shown when present.
  const placeLine = activity.placeAddress || activity.locationName
  const rating = formatRating(activity.placeRating)
  const price = priceLevelSymbol(activity.priceLevel)

  return (
    <div className="px-4 py-3 group hover:bg-gray-50 transition-colors">
      <div className="flex items-start gap-3">
        {/* Confirm toggle */}
        <button
          onClick={() => onToggleConfirm(!isCompleted)}
          className="flex-shrink-0 mt-0.5 text-gray-300 hover:text-primary-500 transition-colors"
          aria-label={isCompleted ? 'Mark incomplete' : 'Mark complete'}
        >
          {isCompleted ? (
            <CheckCircle size={18} className="text-primary-500" />
          ) : (
            <Circle size={18} />
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-base leading-none">{icon}</span>
            <p
              className={`text-sm font-semibold ${
                isCompleted ? 'line-through text-gray-400' : 'text-gray-900'
              }`}
            >
              {activity.title}
            </p>
            {status !== 'planned' && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${statusCfg.cls}`}>
                {statusCfg.label}
              </span>
            )}
            {hasConflict && (
              <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full">
                ⚠ Conflict
              </span>
            )}
          </div>

          {placeLine && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">📍 {placeLine}</p>
          )}

          {(rating || price) && (
            <div className="flex items-center gap-2 mt-0.5">
              {rating && (
                <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-600">
                  <Star size={11} className="fill-amber-400 text-amber-400" /> {rating}
                  {activity.placeUserRatingsTotal != null && (
                    <span className="text-gray-400 font-normal">
                      ({activity.placeUserRatingsTotal})
                    </span>
                  )}
                </span>
              )}
              {price && <span className="text-xs font-semibold text-gray-500">{price}</span>}
            </div>
          )}

          {(timeDisplay || estimatedCost > 0) && (
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {timeDisplay && <span className="text-xs text-gray-400">🕐 {timeDisplay}</span>}
              {estimatedCost > 0 && (
                <span className="text-xs font-medium text-gray-500">
                  {formatCurrency(estimatedCost, currency)}
                </span>
              )}
            </div>
          )}

          {activity.notes && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">{activity.notes}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          {onCommentsClick && (
            <button
              onClick={onCommentsClick}
              className="p-1.5 rounded-lg text-gray-300 hover:text-primary-500 hover:bg-primary-50 transition-all"
              aria-label="Discussion"
              title="Comments & reactions"
            >
              <MessageSquare size={13} />
            </button>
          )}
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-gray-300 hover:text-primary-500 hover:bg-primary-50 transition-all"
            aria-label="Edit activity"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all"
            aria-label="Delete activity"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
