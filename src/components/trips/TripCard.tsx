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
        <div
          className="rounded-xl overflow-hidden border transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
          style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
        >
          {/* Coloured accent strip */}
          <div className="h-1.5" style={{ backgroundColor: trip.coverColor }} />

          <div className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0 pr-2">
                <h3
                  className="font-display font-extrabold text-[17px] leading-tight truncate"
                  style={{ color: 'var(--foreground)' }}
                >
                  {trip.name}
                </h3>
                <div className="flex items-center gap-1 mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                  <MapPin size={11} />
                  <span className="text-xs truncate">{trip.destination}</span>
                </div>
              </div>
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded-full text-white flex-shrink-0"
                style={{ backgroundColor: trip.coverColor }}
              >
                {tripTypeLabel(trip.type)}
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>
              <span className="flex items-center gap-1">
                <Calendar size={11} />
                {formatShortDate(trip.startDate)} – {formatShortDate(trip.endDate)}
              </span>
              <span className="flex items-center gap-1">
                <Users size={11} />
                {days} {days === 1 ? 'day' : 'days'}
              </span>
              {trip.budget > 0 && (
                <span className="ml-auto font-bold text-primary-600">
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
          className="absolute top-3 right-3 p-1.5 rounded-lg border transition-all shadow-sm text-gray-300 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:text-red-500 hover:bg-red-50"
          style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
        >
          <Trash2 size={13} />
        </button>
      )}
    </motion.div>
  )
}
