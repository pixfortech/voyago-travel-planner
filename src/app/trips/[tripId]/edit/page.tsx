'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getTrip, updateTrip, getItineraryDays } from '@/lib/firestore'
import { getDatesInRange } from '@/lib/utils'
import AppShell from '@/components/layout/AppShell'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import DateChangeReflowModal from '@/components/trips/DateChangeReflowModal'
import type { Trip, TripType, ItineraryDay } from '@/types'

const TRIP_TYPES: { value: TripType; label: string; emoji: string }[] = [
  { value: 'solo', label: 'Solo', emoji: '🧳' },
  { value: 'couple', label: 'Couple', emoji: '💑' },
  { value: 'group', label: 'Group', emoji: '👥' },
  { value: 'family', label: 'Family', emoji: '👨‍👩‍👧' },
]

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD', 'SGD']

export default function EditTripPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const router = useRouter()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [name, setName] = useState('')
  const [destination, setDestination] = useState('')
  const [type, setType] = useState<TripType>('solo')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [budget, setBudget] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [notes, setNotes] = useState('')

  // Reflow modal state
  const [showReflow, setShowReflow] = useState(false)
  const [allDays, setAllDays] = useState<ItineraryDay[]>([])
  const [outOfRangeDays, setOutOfRangeDays] = useState<ItineraryDay[]>([])
  // Pending non-date updates to apply after reflow
  const [pendingUpdate, setPendingUpdate] = useState<Partial<Trip> | null>(null)

  useEffect(() => {
    if (!tripId) return
    getTrip(tripId).then((t) => {
      if (!t) { router.push('/dashboard'); return }
      setTrip(t)
      setName(t.name)
      setDestination(t.destination)
      setType(t.type)
      setStartDate(t.startDate)
      setEndDate(t.endDate)
      setBudget(t.budget > 0 ? String(t.budget) : '')
      setCurrency(t.currency)
      setNotes(t.notes)
      setLoading(false)
    })
  }, [tripId, router])

  function validate() {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = 'Trip name is required'
    if (!destination.trim()) e.destination = 'Destination is required'
    if (!startDate) e.startDate = 'Start date is required'
    if (!endDate) e.endDate = 'End date is required'
    if (startDate && endDate && endDate < startDate) e.endDate = 'End date must be after start date'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSave() {
    if (!validate() || !trip) return
    setSaving(true)

    const nonDateUpdate: Partial<Trip> = {
      name: name.trim(),
      destination: destination.trim(),
      type,
      budget: parseFloat(budget) || 0,
      currency,
      notes: notes.trim(),
    }

    const datesChanged = startDate !== trip.startDate || endDate !== trip.endDate

    if (datesChanged) {
      // Check for out-of-range itinerary days before saving
      try {
        const days = await getItineraryDays(tripId)
        const validDates = new Set(getDatesInRange(startDate, endDate))
        const oor = days.filter((d) => !validDates.has(d.date))

        if (oor.length > 0) {
          setAllDays(days)
          setOutOfRangeDays(oor)
          setPendingUpdate(nonDateUpdate)
          setSaving(false)
          setShowReflow(true)
          return
        }
      } catch {
        // If we can't fetch days, just save normally
      }
    }

    // No out-of-range days (or no date change): save everything at once
    try {
      await updateTrip(tripId, {
        ...nonDateUpdate,
        startDate,
        endDate,
      })
      router.push(`/trips/${tripId}`)
    } catch (err) {
      console.error(err)
      setSaving(false)
    }
  }

  async function handleReflowDone() {
    // Reflow modal already saved the new dates + handled days.
    // Apply the remaining non-date field updates now.
    if (pendingUpdate) {
      try {
        await updateTrip(tripId, pendingUpdate)
      } catch (err) {
        console.error(err)
      }
    }
    setShowReflow(false)
    router.push(`/trips/${tripId}`)
  }

  function handleReflowCancel() {
    setShowReflow(false)
    setSaving(false)
  }

  if (loading) {
    return (
      <AppShell title="Edit Trip" back={`/trips/${tripId}`} hideNav>
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
        </div>
      </AppShell>
    )
  }

  const datesChanged = trip && (startDate !== trip.startDate || endDate !== trip.endDate)

  return (
    <AppShell title="Edit Trip" back={`/trips/${tripId}`} hideNav>
      <div className="space-y-5">
        <Input
          label="Trip name"
          value={name}
          onChange={(e) => { setName(e.target.value); setErrors({}) }}
          error={errors.name}
        />

        <Input
          label="Destination"
          value={destination}
          onChange={(e) => { setDestination(e.target.value); setErrors({}) }}
          error={errors.destination}
        />

        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Trip type</p>
          <div className="grid grid-cols-2 gap-2">
            {TRIP_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setType(t.value)}
                className={`flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all ${
                  type === t.value
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="text-2xl">{t.emoji}</span>
                <span
                  className={`font-semibold text-sm ${
                    type === t.value ? 'text-primary-700' : 'text-gray-700'
                  }`}
                >
                  {t.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Start date"
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setErrors({}) }}
            error={errors.startDate}
          />
          <Input
            label="End date"
            type="date"
            min={startDate}
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setErrors({}) }}
            error={errors.endDate}
          />
        </div>

        {datesChanged && !errors.startDate && !errors.endDate && (
          <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2.5 rounded-xl leading-relaxed">
            You&apos;re changing the trip dates. Existing itinerary days will be checked for conflicts before saving.
          </p>
        )}

        <div className="flex gap-3">
          <div className="w-28 flex-shrink-0">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <Input
              label="Total budget (optional)"
              type="number"
              placeholder="0"
              min="0"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
          <textarea
            placeholder="Things to remember, ideas…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent resize-none"
          />
        </div>

        <div className="flex gap-3 pb-4">
          <Button variant="secondary" onClick={() => router.back()} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleSave} className="flex-1" disabled={saving}>
            {saving ? 'Checking…' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {showReflow && trip && (
        <DateChangeReflowModal
          tripId={tripId}
          tripName={name}
          newStartDate={startDate}
          newEndDate={endDate}
          oldStartDate={trip.startDate}
          oldEndDate={trip.endDate}
          allDays={allDays}
          outOfRangeDays={outOfRangeDays}
          onDone={handleReflowDone}
          onCancel={handleReflowCancel}
        />
      )}
    </AppShell>
  )
}
