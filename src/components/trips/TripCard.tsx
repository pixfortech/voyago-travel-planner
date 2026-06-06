'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Calendar, MapPin, Users, Trash2 } from 'lucide-react'
import { formatShortDate, getDayCount, tripTypeLabel, formatCurrency } from '@/lib/utils'
import type { Trip } from '@/types'

interface TripCardProps {
  trip: Trip
  onDelete?: (id: string) => void
}

export default function TripCard({ trip, onDelete }: TripCardProps) {
  const days = getDayCount(trip.startDate, trip.endDate)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative group"
    >
      <Link href={`/trips/${trip.id}`} className="block">
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          {/* Color banner */}
          <div className="h-2" style={{ backgroundColor: trip.coverColor }} />

          <div className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-bold text-gray-900 text-base leading-tight">{trip.name}</h3>
                <div className="flex items-center gap-1 mt-0.5 text-gray-500">
                  <MapPin size={12} />
                  <span className="text-xs">{trip.destination}</span>
                </div>
              </div>
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded-full text-white flex-shrink-0"
                style={{ backgroundColor: trip.coverColor }}
              >
                {tripTypeLabel(trip.type)}
              </span>
            </div>

            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Calendar size={12} />
                {formatShortDate(trip.startDate)} – {formatShortDate(trip.endDate)}
              </span>
              <span className="flex items-center gap-1">
                <Users size={12} />
                {days} {days === 1 ? 'day' : 'days'}
              </span>
              {trip.budget > 0 && (
                <span className="ml-auto font-semibold text-primary-600">
                  {formatCurrency(trip.budget, trip.currency)}
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>

      {onDelete && (
        <button
          onClick={(e) => {
            e.preventDefault()
            onDelete(trip.id)
          }}
          className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/80 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 transition-all shadow-sm"
        >
          <Trash2 size={14} />
        </button>
      )}
    </motion.div>
  )
}
