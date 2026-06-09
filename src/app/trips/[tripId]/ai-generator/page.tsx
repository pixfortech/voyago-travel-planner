'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Info, Sparkles, AlertTriangle } from 'lucide-react'
import {
  getTrip, getItineraryDays, updateItineraryDay,
} from '@/lib/firestore'
import AppShell from '@/components/layout/AppShell'
import { Skeleton } from '@/components/ui/Skeleton'
import TripGeneratorWizard from '@/components/ai/TripGeneratorWizard'
import GeneratedItineraryPreview, {
  type EditableGeneratedDay,
} from '@/components/ai/GeneratedItineraryPreview'
import { useMapsStatus } from '@/lib/maps/useMapsStatus'
import { getDayCount } from '@/lib/utils'
import { categoryToActivityType } from '@/lib/maps/categoryMapping'
import type {
  Trip, ItineraryDay, Activity, TripGeneratorInput, TripGeneratorResult,
  GeneratorExistingDay, GeneratorMode,
} from '@/types'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Drop undefined keys so Firestore (which rejects undefined) accepts the write. */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v
  }
  return out as T
}

/** A day is protected when it is in the past or holds a completed/confirmed activity. */
function isDayProtected(day: ItineraryDay, today: string): boolean {
  if (day.date < today) return true
  return day.activities.some(
    (a) => a.visitedStatus === 'confirmed_visited' || a.bookingStatus === 'completed',
  )
}

export default function AiGeneratorPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const router = useRouter()
  const { status: mapsStatus } = useMapsStatus()

  const [trip, setTrip] = useState<Trip | null>(null)
  const [days, setDays] = useState<ItineraryDay[]>([])
  const [loading, setLoading] = useState(true)

  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [result, setResult] = useState<TripGeneratorResult | null>(null)
  const [isMock, setIsMock] = useState(false)
  const [lastInput, setLastInput] = useState<TripGeneratorInput | null>(null)

  const [applying, setApplying] = useState(false)
  const [applyNote, setApplyNote] = useState<string | null>(null)

  useEffect(() => {
    if (!tripId) return
    Promise.all([getTrip(tripId), getItineraryDays(tripId)]).then(([t, d]) => {
      if (!t) { router.push('/dashboard'); return }
      setTrip(t); setDays(d); setLoading(false)
    })
  }, [tripId, router])

  const dayCount = useMemo(
    () => (trip ? getDayCount(trip.startDate, trip.endDate) : 0),
    [trip],
  )

  const existingDays: GeneratorExistingDay[] = useMemo(() => {
    const today = todayISO()
    return days.map((d) => ({
      date: d.date,
      dayNumber: d.dayNumber,
      activityTitles: d.activities.map((a) => a.title).slice(0, 12),
      isPast: d.date < today,
      isEmpty: d.activities.length === 0,
      isProtected: isDayProtected(d, today),
    }))
  }, [days])

  async function handleGenerate(input: TripGeneratorInput) {
    setGenerating(true)
    setGenError(null)
    setResult(null)
    setApplyNote(null)
    setLastInput(input)
    try {
      const res = await fetch('/api/ai/trip-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      })
      if (!res.ok) throw new Error('request_failed')
      const data = await res.json() as { result: TripGeneratorResult; isMock: boolean }
      setResult(data.result)
      setIsMock(data.isMock)
    } catch {
      setGenError('Could not generate an itinerary right now. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  function handleRegenerate() {
    if (lastInput) handleGenerate(lastInput)
  }

  // ── Apply the edited preview into the trip's itinerary days ────────────────

  async function handleApply(editDays: EditableGeneratedDay[]) {
    if (!tripId || !trip || !lastInput) return
    const today = todayISO()
    const mode: GeneratorMode = lastInput.mode

    // Map of trip days by date for fast lookup.
    const dayByDate = new Map(days.map((d) => [d.date, d]))

    // Decide which generated days are eligible, and whether to clear-first.
    const eligible: { editDay: EditableGeneratedDay; day: ItineraryDay; clear: boolean }[] = []
    const skipped: string[] = []

    for (const ed of editDays) {
      const day = dayByDate.get(ed.date)
      if (!day) { skipped.push(`${ed.date} (outside trip dates)`); continue }
      if (isDayProtected(day, today)) { skipped.push(`${ed.date} (protected)`); continue }

      let clear = false
      if (mode === 'fill_empty') {
        if (day.activities.length > 0) { skipped.push(`${ed.date} (not empty)`); continue }
      } else if (mode === 'replace_future') {
        if (ed.date <= today) { skipped.push(`${ed.date} (not a future day)`); continue }
        clear = true
      } else if (mode === 'replace_all_unprotected') {
        clear = true
      }
      // append → never clear, always eligible (if not protected)
      eligible.push({ editDay: ed, day, clear })
    }

    const totalToAdd = eligible.reduce((n, e) => n + e.editDay.activities.length, 0)
    if (eligible.length === 0 || totalToAdd === 0) {
      setApplyNote(`Nothing applied — ${skipped.length ? `all proposed days were skipped (${skipped.slice(0, 4).join('; ')}${skipped.length > 4 ? '…' : ''}).` : 'no eligible days.'}`)
      return
    }

    const clearing = eligible.filter((e) => e.clear).length
    const confirmMsg =
      `Apply ${totalToAdd} AI activit${totalToAdd === 1 ? 'y' : 'ies'} across ${eligible.length} day(s)?` +
      (clearing > 0 ? `\n\n${clearing} day(s) will have their existing (non-completed) activities REPLACED.` : '') +
      (skipped.length > 0 ? `\n${skipped.length} day(s) will be skipped (protected/ineligible).` : '') +
      `\n\nCompleted and past days are never touched.`
    if (!window.confirm(confirmMsg)) return

    setApplying(true)
    let added = 0
    const updatedDays = [...days]

    for (const { editDay, day, clear } of eligible) {
      const newActivities: Activity[] = editDay.activities.map((a) => {
        const cost = a.estimatedCost || 0
        const noteParts: string[] = []
        if (a.description) noteParts.push(a.description)
        if (a.whyRecommended) noteParts.push(`Why: ${a.whyRecommended}`)
        if (a.routeNotes) noteParts.push(a.routeNotes)
        noteParts.push('(AI Trip Generator)')
        return stripUndefined({
          id: `ai-${day.id}-${Math.random().toString(36).slice(2, 9)}`,
          type: categoryToActivityType(a.category),
          category: a.category,
          title: a.title,
          notes: noteParts.join(' · '),
          time: a.startTime ?? '',
          startTime: a.startTime || undefined,
          endTime: a.endTime || undefined,
          cost,
          estimatedCost: cost,
          locationName: a.locationName || undefined,
          confirmed: false,
          bookingStatus: 'planned' as const,
          // Persist Google place metadata when the place was verified.
          placeId: a._placeId || undefined,
          placeName: a._placeId ? (a.locationName || a.title) : undefined,
          placeAddress: a._placeAddress || undefined,
          placeRating: a._placeRating,
          placeUserRatingsTotal: a._placeUserRatings,
          priceLevel: a._priceLevel,
          lat: a._lat,
          lng: a._lng,
          suggestedCategorySource: a._autoCategory ? ('google_place_type' as const) : undefined,
          updatedAt: new Date().toISOString(),
        }) as Activity
      })

      // When clearing, keep any completed/confirmed activities; drop the rest.
      const kept = clear
        ? day.activities.filter((a) => a.visitedStatus === 'confirmed_visited' || a.bookingStatus === 'completed')
        : day.activities

      const merged = [...kept, ...newActivities]
      await updateItineraryDay(tripId, day.id, { activities: merged })

      const idx = updatedDays.findIndex((d) => d.id === day.id)
      if (idx >= 0) updatedDays[idx] = { ...day, activities: merged }
      added += newActivities.length
    }

    setDays(updatedDays)
    setApplying(false)
    setApplyNote(`Added ${added} activit${added === 1 ? 'y' : 'ies'} to ${eligible.length} day(s).${skipped.length ? ` Skipped ${skipped.length}.` : ''} Redirecting…`)
    setTimeout(() => router.push(`/trips/${tripId}/itinerary`), 1200)
  }

  if (loading || !trip) {
    return (
      <AppShell back={`/trips/${tripId}`} tripId={tripId} title="AI Trip Generator" wide>
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell back={`/trips/${tripId}`} tripId={tripId} title="AI Trip Generator" wide>
      <div className="space-y-5">
        {/* Intro */}
        <div className="flex items-start gap-2 rounded-2xl bg-violet-50/70 border border-violet-100 p-3.5">
          <Sparkles size={16} className="text-violet-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-gray-600 leading-relaxed">
            Generate a complete, day-by-day plan for <strong>{trip.name}</strong> from your destination, dates,
            travellers, budget and preferences. You&apos;ll get a fully editable preview — <strong>nothing is saved
            until you tap Apply</strong>. Completed and past days are always protected. All costs, timings and
            routes are <strong>approximate estimates</strong>, not bookings or actual expenses.
          </p>
        </div>

        <TripGeneratorWizard
          trip={trip}
          dayCount={dayCount}
          existingDays={existingDays}
          generating={generating}
          onGenerate={handleGenerate}
        />

        {genError && (
          <p className="text-xs text-amber-600 flex items-center gap-1.5"><AlertTriangle size={12} /> {genError}</p>
        )}

        {result && (
          <GeneratedItineraryPreview
            result={result}
            currency={trip.currency}
            travellerCount={lastInput?.travellerCount ?? 1}
            isMock={isMock}
            applying={applying}
            applyNote={applyNote}
            mapsAvailable={mapsStatus.available}
            onApply={handleApply}
            onDiscard={() => { setResult(null); setApplyNote(null) }}
            onRegenerate={handleRegenerate}
          />
        )}

        {/* New-trip draft generation — clearly Coming Soon */}
        <div className="flex items-start gap-2 rounded-2xl bg-gray-50 border border-gray-100 p-3.5">
          <Info size={15} className="text-gray-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-gray-500 leading-relaxed">
            <strong>Generating a brand-new trip from scratch</strong> (before it exists) is coming soon. For now,
            create the trip first, then use this generator to auto-fill its itinerary.
          </p>
        </div>
      </div>
    </AppShell>
  )
}
