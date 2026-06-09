'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import PlacePicker, { type SelectedPlace } from '@/components/maps/PlacePicker'
import { useMapsStatus } from '@/lib/maps/useMapsStatus'
import { mapPlaceTypesToCategory } from '@/lib/maps/categoryMapping'
import { activityCategoryIcon } from '@/lib/utils'
import type { ActivityType, ActivityCategory, BookingStatus, Activity } from '@/types'

const CATEGORIES: { key: ActivityCategory; label: string }[] = [
  { key: 'sightseeing', label: 'Sightseeing' },
  { key: 'food', label: 'Food' },
  { key: 'hotel', label: 'Hotel' },
  { key: 'transport', label: 'Transport' },
  { key: 'shopping', label: 'Shopping' },
  { key: 'adventure', label: 'Adventure' },
  { key: 'spiritual', label: 'Spiritual' },
  { key: 'leisure', label: 'Leisure' },
  { key: 'emergency', label: 'Emergency' },
  { key: 'other', label: 'Other' },
]

const CATEGORY_TO_TYPE: Record<ActivityCategory, ActivityType> = {
  sightseeing: 'activity',
  food: 'food',
  hotel: 'hotel',
  transport: 'transport',
  shopping: 'other',
  adventure: 'activity',
  spiritual: 'activity',
  leisure: 'activity',
  emergency: 'other',
  other: 'other',
}

const STATUSES: { key: BookingStatus; label: string; activeCls: string }[] = [
  { key: 'planned', label: 'Planned', activeCls: 'bg-gray-100 text-gray-700 border-gray-400' },
  { key: 'booked', label: 'Booked', activeCls: 'bg-blue-50 text-blue-700 border-blue-400' },
  { key: 'completed', label: 'Done', activeCls: 'bg-green-50 text-green-700 border-green-400' },
  { key: 'skipped', label: 'Skipped', activeCls: 'bg-amber-50 text-amber-700 border-amber-400' },
  { key: 'cancelled', label: 'Cancelled', activeCls: 'bg-red-50 text-red-700 border-red-400' },
]

function deriveCategory(activity: Activity): ActivityCategory {
  if (activity.category) return activity.category
  const map: Record<ActivityType, ActivityCategory> = {
    hotel: 'hotel',
    transport: 'transport',
    food: 'food',
    activity: 'sightseeing',
    other: 'other',
  }
  return map[activity.type] ?? 'other'
}

interface AddActivityModalProps {
  open: boolean
  onClose: () => void
  onSave: (activity: Omit<Activity, 'id'>) => Promise<void>
  editActivity?: Activity
  existingActivities?: Activity[]
}

export default function AddActivityModal({
  open,
  onClose,
  onSave,
  editActivity,
  existingActivities = [],
}: AddActivityModalProps) {
  const { status: mapsStatus } = useMapsStatus()
  const [category, setCategory] = useState<ActivityCategory>('sightseeing')
  const [title, setTitle] = useState('')
  const [locationName, setLocationName] = useState('')
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [estimatedCost, setEstimatedCost] = useState('')
  const [bookingStatus, setBookingStatus] = useState<BookingStatus>('planned')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [titleError, setTitleError] = useState('')
  /** True only when category was auto-set from a Google place selected this session. */
  const [suggestedByGoogle, setSuggestedByGoogle] = useState(false)
  /** True when the user explicitly clicked a category (overriding any auto-suggestion). */
  const [userPickedCategory, setUserPickedCategory] = useState(false)

  // Pre-fill fields when editing
  useEffect(() => {
    if (editActivity) {
      setCategory(deriveCategory(editActivity))
      setTitle(editActivity.title)
      setLocationName(editActivity.locationName ?? '')
      // Restore a previously-selected Google place, if any.
      if (editActivity.placeId && editActivity.lat != null && editActivity.lng != null) {
        setSelectedPlace({
          placeId: editActivity.placeId,
          placeName: editActivity.placeName ?? editActivity.locationName ?? editActivity.title,
          placeAddress: editActivity.placeAddress ?? '',
          placeRating: editActivity.placeRating,
          placeUserRatingsTotal: editActivity.placeUserRatingsTotal,
          priceLevel: editActivity.priceLevel,
          lat: editActivity.lat,
          lng: editActivity.lng,
          placeTypes: editActivity.detectedGoogleTypes,
        })
      } else {
        setSelectedPlace(null)
      }
      setStartTime(editActivity.startTime ?? editActivity.time ?? '')
      setEndTime(editActivity.endTime ?? '')
      setEstimatedCost(String(editActivity.estimatedCost ?? editActivity.cost ?? ''))
      setBookingStatus(editActivity.bookingStatus ?? (editActivity.confirmed ? 'completed' : 'planned'))
      setNotes(editActivity.notes ?? '')
    } else {
      setCategory('sightseeing')
      setTitle('')
      setLocationName('')
      setSelectedPlace(null)
      setStartTime('')
      setEndTime('')
      setEstimatedCost('')
      setBookingStatus('planned')
      setNotes('')
    }
    // Reset suggestion state on every open/edit change
    setSuggestedByGoogle(false)
    setUserPickedCategory(false)
    setTitleError('')
  }, [editActivity, open])

  function handleClose() {
    onClose()
  }

  const timeError: string | null = (() => {
    if (startTime && endTime && endTime <= startTime) return 'End time must be after start time'
    if (startTime && endTime) {
      const hasOverlap = existingActivities.some((a) => {
        if (a.id === editActivity?.id) return false
        const aStart = a.startTime ?? (a.time || '')
        const aEnd = a.endTime
        if (!aStart || !aEnd) return false
        return startTime < aEnd && endTime > aStart
      })
      if (hasOverlap) return 'This time slot overlaps with another activity'
    }
    return null
  })()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setTitleError('Please enter an activity title')
      return
    }
    setSaving(true)
    const cost = parseFloat(estimatedCost) || 0
    // A selected Google place drives the displayed location; otherwise manual text.
    const resolvedLocation = selectedPlace
      ? selectedPlace.placeName
      : locationName.trim() || undefined
    const suggestedCategorySource: Activity['suggestedCategorySource'] = (() => {
      if (suggestedByGoogle) return 'google_place_type'
      if (userPickedCategory) return 'manual'
      // Not touched this session — preserve original for edits, omit for new
      return editActivity?.suggestedCategorySource
    })()

    const activityData: Omit<Activity, 'id'> = {
      type: CATEGORY_TO_TYPE[category],
      category,
      title: title.trim(),
      time: startTime,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      cost,
      estimatedCost: cost,
      locationName: resolvedLocation,
      bookingStatus,
      notes: notes.trim(),
      confirmed: bookingStatus === 'completed',
      updatedAt: new Date().toISOString(),
      // Phase 6 — place metadata (undefined values are pruned before saving).
      placeId: selectedPlace?.placeId,
      placeName: selectedPlace?.placeName,
      placeAddress: selectedPlace?.placeAddress,
      placeRating: selectedPlace?.placeRating,
      placeUserRatingsTotal: selectedPlace?.placeUserRatingsTotal,
      priceLevel: selectedPlace?.priceLevel,
      lat: selectedPlace?.lat,
      lng: selectedPlace?.lng,
      // Phase 14 extra — category auto-suggestion metadata
      suggestedCategorySource,
      detectedGoogleTypes: selectedPlace?.placeTypes,
    }
    await onSave(activityData)
    setSaving(false)
    onClose()
  }

  const isEdit = !!editActivity

  return (
    <Modal open={open} onClose={handleClose} title={isEdit ? 'Edit Activity' : 'Add Activity'} className="sm:max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Category picker */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Category</p>
          <div className="grid grid-cols-5 gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => {
                  setCategory(cat.key)
                  setSuggestedByGoogle(false)
                  setUserPickedCategory(true)
                }}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${
                  category === cat.key
                    ? 'bg-primary-500 text-white border-primary-500'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="text-lg leading-none">{activityCategoryIcon(cat.key)}</span>
                <span className="text-[10px] font-medium leading-tight text-center truncate w-full">
                  {cat.label}
                </span>
              </button>
            ))}
          </div>
          {suggestedByGoogle && (
            <p className="text-xs text-primary-600 mt-1.5">
              Category suggested from Google place type. You can change it.
            </p>
          )}
        </div>

        {/* Title */}
        <Input
          label="Title *"
          placeholder="e.g. Visit Gateway of India"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setTitleError('') }}
          error={titleError}
          autoFocus={!isEdit}
        />

        {/* Location — Google place search when available, else manual entry */}
        <PlacePicker
          available={mapsStatus.available}
          locationName={locationName}
          onLocationNameChange={setLocationName}
          selectedPlace={selectedPlace}
          onSelectPlace={(place) => {
            setSelectedPlace(place)
            setLocationName(place.placeName)
            // Auto-suggest category from Google place types
            if (place.placeTypes && place.placeTypes.length > 0) {
              const suggested = mapPlaceTypesToCategory(place.placeTypes)
              if (suggested !== 'other') {
                setCategory(suggested)
                setSuggestedByGoogle(true)
                setUserPickedCategory(false)
              } else {
                setSuggestedByGoogle(false)
              }
            } else {
              setSuggestedByGoogle(false)
            }
          }}
          onClearPlace={() => {
            setSelectedPlace(null)
            setSuggestedByGoogle(false)
          }}
        />

        {/* Times */}
        <div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Start time"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
            <Input
              label="End time"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              disabled={!startTime}
            />
          </div>
          {timeError && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <AlertTriangle size={12} className="text-amber-500 flex-shrink-0" />
              <p className="text-xs text-amber-600">{timeError}</p>
            </div>
          )}
        </div>

        {/* Estimated cost */}
        <Input
          label="Estimated cost (optional)"
          type="number"
          placeholder="0"
          min="0"
          step="0.01"
          value={estimatedCost}
          onChange={(e) => setEstimatedCost(e.target.value)}
        />

        {/* Booking status */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Status</p>
          <div className="flex gap-1.5 flex-wrap">
            {STATUSES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setBookingStatus(s.key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                  bookingStatus === s.key
                    ? s.activeCls
                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
          <textarea
            placeholder="Booking ref, address, reminders…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent focus:bg-white transition-all text-sm resize-none"
          />
        </div>

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={saving}>
            {saving ? (isEdit ? 'Saving…' : 'Adding…') : (isEdit ? 'Save' : 'Add')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
