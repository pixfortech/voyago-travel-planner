'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Check } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { createTrip } from '@/lib/firestore'
import AppShell from '@/components/layout/AppShell'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import type { TripType } from '@/types'

const TRIP_TYPES: { value: TripType; label: string; emoji: string }[] = [
  { value: 'solo', label: 'Solo', emoji: '🧳' },
  { value: 'couple', label: 'Couple', emoji: '💑' },
  { value: 'group', label: 'Group', emoji: '👥' },
  { value: 'family', label: 'Family', emoji: '👨‍👩‍👧' },
]

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD', 'SGD']

const STEPS = ['Basics', 'Dates & Budget', 'Review']

export default function NewTripPage() {
  const router = useRouter()
  const { user } = useApp()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [destination, setDestination] = useState('')
  const [type, setType] = useState<TripType>('solo')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [budget, setBudget] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  function validate(s: number) {
    const e: Record<string, string> = {}
    if (s === 0) {
      if (!name.trim()) e.name = 'Trip name is required'
      if (!destination.trim()) e.destination = 'Destination is required'
    }
    if (s === 1) {
      if (!startDate) e.startDate = 'Start date is required'
      if (!endDate) e.endDate = 'End date is required'
      if (startDate && endDate && endDate < startDate) e.endDate = 'End date must be after start date'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function next() {
    if (validate(step)) setStep((s) => s + 1)
  }

  async function handleSubmit() {
    if (!validate(1) || !user) return
    setSaving(true)
    try {
      const tripId = await createTrip(user.uid, {
        name: name.trim(),
        destination: destination.trim(),
        type,
        startDate,
        endDate,
        budget: parseFloat(budget) || 0,
        currency,
        notes: notes.trim(),
      })
      router.push(`/trips/${tripId}/itinerary`)
    } catch (err) {
      console.error(err)
      setSaving(false)
    }
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <AppShell title="New Trip" back="/dashboard" hideNav>
      {/* Step indicators */}
      <div className="flex items-center gap-1 mb-6">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1 flex-1">
            <div
              className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0 transition-all ${
                i < step
                  ? 'bg-primary-500 text-white'
                  : i === step
                  ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-300'
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {i < step ? <Check size={14} /> : i + 1}
            </div>
            <span className={`text-xs font-medium ${i === step ? 'text-primary-700' : 'text-gray-400'}`}>
              {s}
            </span>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 rounded-full ml-1 ${i < step ? 'bg-primary-400' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* Step 0: Basics */}
        {step === 0 && (
          <motion.div
            key="step0"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-5"
          >
            <div>
              <h2 className="text-xl font-black text-gray-900 mb-1">Trip basics</h2>
              <p className="text-sm text-gray-500">Tell us about your trip.</p>
            </div>

            <Input
              label="Trip name"
              placeholder="e.g. Tokyo Adventure 2025"
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors({}) }}
              error={errors.name}
              autoFocus
            />

            <Input
              label="Destination"
              placeholder="e.g. Tokyo, Japan"
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
                    <span className={`font-semibold text-sm ${type === t.value ? 'text-primary-700' : 'text-gray-700'}`}>
                      {t.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <Button onClick={next} className="w-full" size="lg">
              Continue →
            </Button>
          </motion.div>
        )}

        {/* Step 1: Dates & Budget */}
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-5"
          >
            <div>
              <h2 className="text-xl font-black text-gray-900 mb-1">Dates &amp; Budget</h2>
              <p className="text-sm text-gray-500">When are you going and what&apos;s your budget?</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Start date"
                type="date"
                min={today}
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setErrors({}) }}
                error={errors.startDate}
              />
              <Input
                label="End date"
                type="date"
                min={startDate || today}
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setErrors({}) }}
                error={errors.endDate}
              />
            </div>

            <div className="flex gap-3">
              <div className="w-28 flex-shrink-0">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
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

            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(0)} className="flex-1">
                ← Back
              </Button>
              <Button onClick={next} className="flex-1">
                Review →
              </Button>
            </div>
          </motion.div>
        )}

        {/* Step 2: Review */}
        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-5"
          >
            <div>
              <h2 className="text-xl font-black text-gray-900 mb-1">Review & Create</h2>
              <p className="text-sm text-gray-500">Everything look good?</p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 shadow-sm">
              {[
                { label: 'Trip name', value: name },
                { label: 'Destination', value: destination },
                { label: 'Type', value: type.charAt(0).toUpperCase() + type.slice(1) },
                { label: 'Dates', value: `${startDate} → ${endDate}` },
                { label: 'Budget', value: budget ? `${currency} ${budget}` : 'Not set' },
                ...(notes ? [{ label: 'Notes', value: notes }] : []),
              ].map((row) => (
                <div key={row.label} className="flex justify-between items-center px-4 py-3">
                  <span className="text-sm text-gray-400">{row.label}</span>
                  <span className="text-sm font-semibold text-gray-900 max-w-[60%] text-right truncate">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(1)} className="flex-1">
                ← Back
              </Button>
              <Button onClick={handleSubmit} className="flex-1" disabled={saving}>
                {saving ? 'Creating…' : '🚀 Create Trip'}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  )
}
