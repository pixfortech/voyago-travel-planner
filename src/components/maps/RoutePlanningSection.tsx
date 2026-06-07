'use client'

import { useCallback, useMemo, useState } from 'react'
import { Map as MapIcon, Lock, Settings } from 'lucide-react'
import RoutePlanner from './RoutePlanner'
import { dayHasRoutablePair, getRoutableActivities, aggregateRouteSummaries } from '@/lib/maps/route'
import type {
  ItineraryDay, MapsStatus, DayRouteSummary, BudgetCoachRouteSummary,
} from '@/types'

interface RoutePlanningSectionProps {
  days: ItineraryDay[]
  status: MapsStatus
  /** Reports the aggregate route summary up for the AI Budget Coach (or undefined). */
  onAggregate?: (summary: BudgetCoachRouteSummary | undefined) => void
}

function SectionShell({ children }: { children: React.ReactNode }) {
  return (
    <div id="route-planning" className="scroll-mt-24 space-y-3">
      <div className="flex items-center gap-2 px-0.5">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-blue-500 flex items-center justify-center">
          <MapIcon size={15} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-black text-gray-900">Maps &amp; Route Planning</p>
          <p className="text-[11px] text-gray-400">Travel time and distance between your places</p>
        </div>
      </div>
      {children}
    </div>
  )
}

export default function RoutePlanningSection({
  days, status, onAggregate,
}: RoutePlanningSectionProps) {
  const [summaries, setSummaries] = useState<Record<string, DayRouteSummary>>({})

  const dayNumberById = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of days) m.set(d.id, d.dayNumber)
    return m
  }, [days])

  const handleComputed = useCallback(
    (dayId: string, summary: DayRouteSummary | null) => {
      setSummaries((prev) => {
        const next = { ...prev }
        if (summary) next[dayId] = summary
        else delete next[dayId]
        if (onAggregate) {
          onAggregate(aggregateRouteSummaries(Object.values(next), dayNumberById))
        }
        return next
      })
    },
    [onAggregate, dayNumberById]
  )

  // Feature flag off → Coming Soon.
  if (!status.featureEnabled) {
    return (
      <SectionShell>
        <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5 text-center">
          <span className="inline-flex items-center gap-1 bg-primary-100 text-primary-600 text-[10px] font-black px-2 py-0.5 rounded-full mb-2">
            <Lock size={9} /> Coming Soon
          </span>
          <p className="text-sm font-semibold text-gray-700">Route planning is on the way</p>
          <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto leading-relaxed">
            Once enabled, you&apos;ll be able to search Google places for your activities and see
            travel time and distance between them. Manual itinerary planning works fully today.
          </p>
        </div>
      </SectionShell>
    )
  }

  // Flag on but no key → Setup Required.
  if (!status.configured) {
    return (
      <SectionShell>
        <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-5 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-50 mb-2">
            <Settings size={18} className="text-amber-500" />
          </div>
          <p className="text-sm font-semibold text-gray-700">Setup required</p>
          <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto leading-relaxed">
            Add a Google Maps API key (<code className="px-1 bg-gray-100 rounded text-[11px]">GOOGLE_MAPS_API_KEY</code>)
            to enable place search and route estimates. See the Google Maps section of the README.
            You can keep planning with manual locations in the meantime.
          </p>
        </div>
      </SectionShell>
    )
  }

  // Available.
  const planDays = days.filter((d) => getRoutableActivities(d.activities).length >= 1)
  const anyRoutable = days.some(dayHasRoutablePair)

  return (
    <SectionShell>
      {!anyRoutable ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
          <p className="text-2xl mb-1">🗺️</p>
          <p className="text-sm font-semibold text-gray-700">No places selected yet</p>
          <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto leading-relaxed">
            Edit an activity and search Google Places to attach a location. Add places to at least
            two activities on the same day to calculate routes between them.
          </p>
        </div>
      ) : (
        planDays.map((day) => (
          <RoutePlanner key={day.id} day={day} onComputed={handleComputed} />
        ))
      )}
    </SectionShell>
  )
}
