'use client'

/**
 * DateChangeReflowModal — Phase 13 smart date-change detection + reflow.
 *
 * Shown when a trip's dates change and there are itinerary days outside the new
 * range. Offers 5 reflow options; the AI option calls /api/ai/itinerary-reflow.
 * NO Firestore writes happen until the user clicks "Apply".
 */

import { useState } from 'react'
import {
  AlertTriangle, ChevronDown, ChevronUp, Wand2, Trash2,
  MoveRight, CheckCircle2, Loader2, Info, ShieldCheck,
} from 'lucide-react'
import { getDatesInRange } from '@/lib/utils'
import {
  updateItineraryDay,
  deleteItineraryDay,
  addItineraryDay,
  updateTrip,
} from '@/lib/firestore'
import type { ItineraryDay, ItineraryReflowResponse } from '@/types'
import Button from '@/components/ui/Button'

// ── Types ─────────────────────────────────────────────────────────────────────

type ReflowOption =
  | 'keep'         // Save dates, leave days as-is (with warning)
  | 'remove_empty' // Remove empty out-of-range days only
  | 'smart'        // Auto-redistribute activities into valid days
  | 'ai'           // AI-assisted reflow (with preview)

interface Props {
  tripId: string
  tripName: string
  newStartDate: string
  newEndDate: string
  /** Original trip dates (before user edit). */
  oldStartDate: string
  oldEndDate: string
  /** All existing itinerary days. */
  allDays: ItineraryDay[]
  /** The out-of-range days (subset of allDays). */
  outOfRangeDays: ItineraryDay[]
  onDone: () => void
  onCancel: () => void
}

interface ActivitySummary {
  id: string
  title: string
  time: string
  notes: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function isCompleted(date: string): boolean {
  return date < today()
}

function levelColor(option: ReflowOption, selected: ReflowOption): string {
  if (option !== selected) return 'border-gray-200 bg-white hover:border-gray-300'
  return 'border-primary-500 bg-primary-50'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DayCard({
  day,
  expanded,
  onToggle,
}: {
  day: ItineraryDay
  expanded: boolean
  onToggle: () => void
}) {
  const completed = isCompleted(day.date)
  return (
    <div className={`rounded-xl border text-sm ${completed ? 'border-amber-200 bg-amber-50' : 'border-rose-200 bg-rose-50'}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
      >
        {completed ? (
          <ShieldCheck size={14} className="text-amber-500 flex-shrink-0" />
        ) : (
          <AlertTriangle size={14} className="text-rose-500 flex-shrink-0" />
        )}
        <span className={`font-semibold flex-1 ${completed ? 'text-amber-800' : 'text-rose-800'}`}>
          Day {day.dayNumber} — {day.date}
          {completed && <span className="ml-1.5 text-xs font-medium text-amber-600">(completed)</span>}
        </span>
        <span className="text-xs text-gray-400">{day.activities.length} activit{day.activities.length === 1 ? 'y' : 'ies'}</span>
        {expanded ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
      </button>
      {expanded && day.activities.length > 0 && (
        <div className="px-3 pb-3 space-y-1.5">
          {day.activities.map((a) => (
            <div key={a.id} className="flex items-start gap-2 pl-5">
              <span className="text-[11px] text-gray-400 w-10 flex-shrink-0">{a.startTime ?? a.time ?? '—'}</span>
              <span className="text-xs text-gray-700 font-medium">{a.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DateChangeReflowModal({
  tripId,
  tripName,
  newStartDate,
  newEndDate,
  oldStartDate,
  oldEndDate,
  allDays,
  outOfRangeDays,
  onDone,
  onCancel,
}: Props) {
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [protectCompleted, setProtectCompleted] = useState(true)
  const [selected, setSelected] = useState<ReflowOption>('keep')
  const [applying, setApplying] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<ItineraryReflowResponse | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const todayStr = today()
  const validDates = getDatesInRange(newStartDate, newEndDate)

  const effectiveOutOfRange = protectCompleted
    ? outOfRangeDays.filter((d) => !isCompleted(d.date))
    : outOfRangeDays

  const completedOutOfRange = outOfRangeDays.filter((d) => isCompleted(d.date))
  const hasActivities = effectiveOutOfRange.some((d) => d.activities.length > 0)
  const emptyOutOfRange = effectiveOutOfRange.filter((d) => d.activities.length === 0)
  const nonEmptyOutOfRange = effectiveOutOfRange.filter((d) => d.activities.length > 0)

  function toggleDay(id: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Option 1: keep unchanged — just save the trip dates
  async function applyKeep() {
    await updateTrip(tripId, { startDate: newStartDate, endDate: newEndDate })
  }

  // Option 2: remove empty out-of-range days only
  async function applyRemoveEmpty() {
    await updateTrip(tripId, { startDate: newStartDate, endDate: newEndDate })
    const toDelete = (protectCompleted
      ? outOfRangeDays.filter((d) => !isCompleted(d.date))
      : outOfRangeDays
    ).filter((d) => d.activities.length === 0)
    await Promise.all(toDelete.map((d) => deleteItineraryDay(tripId, d.id)))
  }

  // Option 3: smart auto-arrange — redistribute activities then remove empty out-of-range days
  async function applySmart() {
    await updateTrip(tripId, { startDate: newStartDate, endDate: newEndDate })

    const daysToProcess = protectCompleted
      ? outOfRangeDays.filter((d) => !isCompleted(d.date))
      : outOfRangeDays

    // Gather all activities from out-of-range non-empty days
    const displaced: ActivitySummary[] = daysToProcess.flatMap((d) =>
      d.activities.map((a) => ({ id: a.id, title: a.title, time: a.time, notes: a.notes })),
    )

    // Build a map of valid days that already exist
    const validDayMap = new Map<string, ItineraryDay>(
      allDays
        .filter((d) => validDates.includes(d.date))
        .map((d) => [d.date, d]),
    )

    // Distribute displaced activities evenly across valid days
    let slotIndex = 0
    const updates = new Map<string, ActivitySummary[]>()
    for (const act of displaced) {
      const targetDate = validDates[slotIndex % validDates.length]
      const arr = updates.get(targetDate) ?? []
      arr.push(act)
      updates.set(targetDate, arr)
      slotIndex++
    }

    // Apply: update existing valid days with new activities appended
    for (const [date, newActs] of Array.from(updates.entries())) {
      const existingDay = validDayMap.get(date)
      if (existingDay) {
        // Append to the existing day
        const existing = allDays.find((d) => d.date === date)
        if (existing) {
          const mergedActivities = [
            ...existing.activities,
            ...newActs.map((a) => ({
              id: a.id,
              type: 'activity' as const,
              title: a.title,
              notes: a.notes,
              time: a.time,
              cost: 0,
              confirmed: false,
            })),
          ]
          await updateItineraryDay(tripId, existing.id, { activities: mergedActivities })
        }
      } else {
        // Create a new day in the valid range
        const dayNumber = validDates.indexOf(date) + 1
        const newDay: import('@/types').ItineraryDay = {
          id: `day-${dayNumber}-reflow`,
          tripId,
          date,
          dayNumber,
          activities: newActs.map((a) => ({
            id: a.id,
            type: 'activity' as const,
            title: a.title,
            notes: a.notes,
            time: a.time,
            cost: 0,
            confirmed: false,
          })),
        }
        await addItineraryDay(tripId, newDay)
      }
    }

    // Delete all out-of-range days (the activities were moved)
    await Promise.all(daysToProcess.map((d) => deleteItineraryDay(tripId, d.id)))
  }

  // Option 4: AI reflow — fetch preview first
  async function fetchAiPreview() {
    setAiLoading(true)
    setAiError(null)
    try {
      const input = {
        tripName,
        destination: '',
        oldStartDate,
        oldEndDate,
        newStartDate,
        newEndDate,
        today: todayStr,
        protectCompleted,
        outOfRangeDays: outOfRangeDays.map((d) => ({
          dayNumber: d.dayNumber,
          date: d.date,
          isCompleted: isCompleted(d.date),
          activities: d.activities.map((a) => ({
            id: a.id,
            title: a.title,
            time: a.time,
            notes: a.notes,
          })),
        })),
        validDates,
      }
      const res = await fetch('/api/ai/itinerary-reflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error('AI request failed')
      const data: ItineraryReflowResponse = await res.json()
      setAiResult(data)
    } catch {
      setAiError('Could not reach the AI service. Try the smart reflow option instead.')
    } finally {
      setAiLoading(false)
    }
  }

  // Apply the AI preview
  async function applyAiReflow() {
    if (!aiResult) return
    await updateTrip(tripId, { startDate: newStartDate, endDate: newEndDate })

    const daysByDate = new Map<string, ItineraryDay>(allDays.map((d) => [d.date, d]))

    // Move activities based on movedActivities
    for (const move of aiResult.result.movedActivities) {
      if (!move.toDayDate) continue
      const fromDay = allDays.find((d) => d.date === move.fromDayDate)
      const toDay = daysByDate.get(move.toDayDate)
      if (!fromDay) continue
      const actToMove = fromDay.activities.find((a) => a.id === move.activityId)
      if (!actToMove) continue
      if (toDay) {
        await updateItineraryDay(tripId, toDay.id, {
          activities: [...toDay.activities, actToMove],
        })
      }
    }

    // Delete out-of-range days (activities were moved)
    const daysToProcess = protectCompleted
      ? outOfRangeDays.filter((d) => !isCompleted(d.date))
      : outOfRangeDays
    await Promise.all(daysToProcess.map((d) => deleteItineraryDay(tripId, d.id)))
  }

  async function handleApply() {
    setApplying(true)
    try {
      if (selected === 'keep') await applyKeep()
      else if (selected === 'remove_empty') await applyRemoveEmpty()
      else if (selected === 'smart') await applySmart()
      else if (selected === 'ai' && aiResult) await applyAiReflow()
      else if (selected === 'ai' && !aiResult) {
        // If AI preview not fetched yet, fall back to keep
        await applyKeep()
      }
      setDone(true)
      onDone()
    } catch (err) {
      console.error('Reflow apply error', err)
      setApplying(false)
    }
  }

  if (done) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-0 sm:px-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={18} className="text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-black text-gray-900">Itinerary Days Out of Range</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {outOfRangeDays.length} day{outOfRangeDays.length !== 1 ? 's' : ''} fall outside your new date range ({newStartDate} – {newEndDate}).
                Choose what to do with them.
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Affected days list */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Affected Days</p>
            {outOfRangeDays.map((day) => (
              <DayCard
                key={day.id}
                day={day}
                expanded={expandedDays.has(day.id)}
                onToggle={() => toggleDay(day.id)}
              />
            ))}
          </div>

          {/* Protect completed toggle */}
          {completedOutOfRange.length > 0 && (
            <label className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={protectCompleted}
                onChange={(e) => setProtectCompleted(e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-800">Protect completed days</p>
                <p className="text-xs text-amber-600">
                  {completedOutOfRange.length} elapsed day{completedOutOfRange.length !== 1 ? 's' : ''} will be skipped in the reflow.
                </p>
              </div>
              <ShieldCheck size={16} className="text-amber-500 flex-shrink-0" />
            </label>
          )}

          {/* Reflow options */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Choose an option</p>

            {/* Option 1: Keep unchanged */}
            <button
              onClick={() => setSelected('keep')}
              className={`w-full text-left p-3.5 rounded-xl border-2 transition-all ${levelColor('keep', selected)}`}
            >
              <div className="flex items-center gap-2.5">
                <Info size={16} className={selected === 'keep' ? 'text-primary-600' : 'text-gray-400'} />
                <div>
                  <p className="text-sm font-bold text-gray-800">Keep as-is with warning</p>
                  <p className="text-xs text-gray-500">Save new dates; leave all days unchanged. Days may show as out-of-range in the itinerary.</p>
                </div>
              </div>
            </button>

            {/* Option 2: Remove empty days */}
            <button
              onClick={() => setSelected('remove_empty')}
              className={`w-full text-left p-3.5 rounded-xl border-2 transition-all ${levelColor('remove_empty', selected)}`}
            >
              <div className="flex items-center gap-2.5">
                <Trash2 size={16} className={selected === 'remove_empty' ? 'text-primary-600' : 'text-gray-400'} />
                <div>
                  <p className="text-sm font-bold text-gray-800">
                    Remove empty out-of-range days
                    <span className="ml-1.5 text-xs font-medium text-gray-400">({emptyOutOfRange.length} empty)</span>
                  </p>
                  <p className="text-xs text-gray-500">Delete days with no activities. Days with activities are left unchanged.</p>
                </div>
              </div>
            </button>

            {/* Option 3: Smart auto-arrange */}
            <button
              onClick={() => setSelected('smart')}
              className={`w-full text-left p-3.5 rounded-xl border-2 transition-all ${levelColor('smart', selected)}`}
            >
              <div className="flex items-center gap-2.5">
                <MoveRight size={16} className={selected === 'smart' ? 'text-primary-600' : 'text-gray-400'} />
                <div>
                  <p className="text-sm font-bold text-gray-800">
                    Smart auto-arrange
                    {hasActivities && (
                      <span className="ml-1.5 text-xs font-medium text-gray-400">
                        ({nonEmptyOutOfRange.reduce((n, d) => n + d.activities.length, 0)} activit{nonEmptyOutOfRange.reduce((n, d) => n + d.activities.length, 0) === 1 ? 'y' : 'ies'} to move)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">Redistribute all activities from out-of-range days evenly into the new date range, then delete empty out-of-range days.</p>
                </div>
              </div>
            </button>

            {/* Option 4: AI-assisted */}
            <div className={`rounded-xl border-2 transition-all ${levelColor('ai', selected)}`}>
              <button
                onClick={() => setSelected('ai')}
                className="w-full text-left p-3.5"
              >
                <div className="flex items-center gap-2.5">
                  <Wand2 size={16} className={selected === 'ai' ? 'text-primary-600' : 'text-gray-400'} />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-800">
                      AI-assisted reflow
                      <span className="ml-1.5 text-[10px] font-bold text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded-full uppercase tracking-wide">Smart</span>
                    </p>
                    <p className="text-xs text-gray-500">Claude analyses your itinerary and suggests an intelligent redistribution. Preview before applying.</p>
                  </div>
                </div>
              </button>

              {selected === 'ai' && (
                <div className="px-3.5 pb-3.5 pt-0 space-y-3">
                  {!aiResult && !aiLoading && !aiError && (
                    <button
                      onClick={fetchAiPreview}
                      className="w-full py-2 text-sm font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-xl transition-colors"
                    >
                      Generate AI Preview
                    </button>
                  )}
                  {aiLoading && (
                    <div className="flex items-center gap-2 justify-center py-2 text-xs text-primary-600">
                      <Loader2 size={14} className="animate-spin" />
                      Analysing itinerary…
                    </div>
                  )}
                  {aiError && (
                    <div className="text-xs text-rose-600 bg-rose-50 rounded-xl p-3">
                      {aiError}
                    </div>
                  )}
                  {aiResult && (
                    <div className="space-y-2">
                      {aiResult.isMock && (
                        <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
                          <Info size={11} />
                          Development mock — no AI key configured
                        </div>
                      )}
                      <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-700 leading-relaxed">
                        {aiResult.result.summary}
                      </div>
                      {aiResult.result.movedActivities.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Activities to move</p>
                          {aiResult.result.movedActivities.slice(0, 6).map((m, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                              <span className="font-medium flex-1 truncate">{m.activityTitle}</span>
                              <span className="text-gray-400">{m.fromDayDate}</span>
                              <MoveRight size={10} className="text-primary-500" />
                              <span className="text-primary-700 font-semibold">{m.toDayDate ?? 'removed'}</span>
                            </div>
                          ))}
                          {aiResult.result.movedActivities.length > 6 && (
                            <p className="text-[11px] text-gray-400">+{aiResult.result.movedActivities.length - 6} more…</p>
                          )}
                        </div>
                      )}
                      {aiResult.result.warnings.length > 0 && (
                        <div className="space-y-1">
                          {aiResult.result.warnings.map((w, i) => (
                            <div key={i} className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
                              <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
                              {w.message}
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={fetchAiPreview}
                        className="text-xs text-primary-600 hover:underline"
                      >
                        Regenerate
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <Button
            variant="secondary"
            onClick={onCancel}
            className="flex-1"
            disabled={applying}
          >
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            className="flex-1"
            disabled={applying || (selected === 'ai' && !aiResult)}
          >
            {applying ? (
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Applying…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <CheckCircle2 size={14} />
                Apply
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
