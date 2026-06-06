'use client'

import { Trash2, CheckCircle, Circle } from 'lucide-react'
import { activityTypeIcon, formatCurrency } from '@/lib/utils'
import type { Activity } from '@/types'

interface ActivityCardProps {
  activity: Activity
  currency: string
  onDelete: () => void
  onToggleConfirm: (confirmed: boolean) => void
}

export default function ActivityCard({
  activity,
  currency,
  onDelete,
  onToggleConfirm,
}: ActivityCardProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 group hover:bg-gray-50 transition-colors">
      <button
        onClick={() => onToggleConfirm(!activity.confirmed)}
        className="flex-shrink-0 text-gray-300 hover:text-primary-500 transition-colors"
      >
        {activity.confirmed ? (
          <CheckCircle size={18} className="text-primary-500" />
        ) : (
          <Circle size={18} />
        )}
      </button>

      <span className="text-lg flex-shrink-0">{activityTypeIcon(activity.type)}</span>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold text-gray-900 truncate ${activity.confirmed ? 'line-through text-gray-400' : ''}`}>
          {activity.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {activity.time && (
            <span className="text-xs text-gray-400">{activity.time}</span>
          )}
          {activity.notes && (
            <span className="text-xs text-gray-400 truncate">{activity.notes}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {activity.cost > 0 && (
          <span className="text-xs font-semibold text-gray-600">
            {formatCurrency(activity.cost, currency)}
          </span>
        )}
        <button
          onClick={onDelete}
          className="p-1.5 rounded-lg text-gray-300 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:text-red-400 hover:bg-red-50 transition-all"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}
